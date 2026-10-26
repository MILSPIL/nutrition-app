"""Root-configured systemd socket service. No HTTP or runtime sudo surface.
The guardian never imports Hermes, credentials, profiles or model responses.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import select
import signal
import socket
import stat
import sqlite3
import struct
import subprocess
import time

MAX_BUFFER = 96 * 1024 * 1024
ROLES = {'y', 'w', 'payer'}


def checked(path, *, uid=0, directory=True, private=False):
    path = Path(path)
    info = path.lstat()
    if not path.is_absolute() or path.resolve() != path or info.st_uid != uid or info.st_mode & (0o077 if private else 0o022):
        raise RuntimeError('launcher_path_invalid')
    if directory:
        if not stat.S_ISDIR(info.st_mode):
            raise RuntimeError('launcher_path_invalid')
    elif not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise RuntimeError('launcher_path_invalid')
    return path


def tmpfs(path):
    selected = None
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        head, tail = line.split(' - ', 1)
        mount = head.split()[4]
        if str(path) == mount or str(path).startswith(mount.rstrip('/') + '/'):
            if selected is None or len(mount) > len(selected[0]):
                selected = (mount, tail.split()[0])
    if not selected or selected[1] != 'tmpfs':
        raise RuntimeError('launcher_tmpfs_required')


def assert_state_file(home):
    path = checked(Path(home) / 'state.db', uid=os.getuid(), directory=False, private=True)
    if path.stat().st_size < 100:
        raise RuntimeError('launcher_state_missing')
    with path.open('rb') as stream:
        if stream.read(16) != b'SQLite format 3\0':
            raise RuntimeError('launcher_state_invalid')
    # Generic SQLite integrity only; no native row/schema mutation or repair.
    connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=1)
    try:
        if connection.execute('PRAGMA quick_check').fetchone() != ('ok',):
            raise RuntimeError('launcher_state_invalid')
    finally:
        connection.close()


def configuration(path):
    checked(path, directory=False)
    checked(Path(path).parent)
    value = json.loads(Path(path).read_text())
    required = {'version', 'role', 'nodeUid', 'workerUid', 'source', 'pythonRoot', 'adapters', 'home', 'ephemeral', 'bpf', 'bwrapSha256', 'workerLockSha256'}
    if set(value) != required or value['version'] != 1 or value['role'] not in ROLES or type(value['nodeUid']) is not int or value['nodeUid'] <= 0 or value['workerUid'] != os.getuid() or value['nodeUid'] == os.getuid():
        raise RuntimeError('launcher_config_invalid')
    for name in ('source', 'pythonRoot', 'adapters'):
        checked(value[name])
    checked(value['bpf'], directory=False)
    library = checked(Path(value['adapters']) / 'worker-lock.so', directory=False)
    if hashlib.sha256(library.read_bytes()).hexdigest() != value['workerLockSha256']:
        raise RuntimeError('launcher_policy_changed')
    bwrap = checked('/usr/bin/bwrap', directory=False)
    if hashlib.sha256(bwrap.read_bytes()).hexdigest() != value['bwrapSha256']:
        raise RuntimeError('launcher_bwrap_changed')
    return value


def notify(state):
    target = os.environ.get('NOTIFY_SOCKET')
    if not target:
        raise RuntimeError('launcher_watchdog_required')
    if target.startswith('@'):
        target = '\0' + target[1:]
    with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as channel:
        channel.connect(target)
        channel.sendall(state.encode('ascii'))


def launch_command(cfg, ephemeral, bpf):
    source, adapters = Path(cfg['source']), Path(cfg['adapters'])
    home = Path(cfg['home']) if cfg['role'] != 'payer' else ephemeral / 'payer-home'
    if cfg['role'] == 'payer':
        home.mkdir(mode=0o700)
    else:
        checked(home, uid=os.getuid(), private=True)
        assert_state_file(home)
        # The migration must retain/map historical photos before this mount.
        if not (home / 'cache' / 'images').is_dir():
            raise RuntimeError('launcher_media_unprovisioned')
    temp, images = ephemeral / 'tmp', ephemeral / 'images'
    temp.mkdir(mode=0o700); images.mkdir(mode=0o700)
    args = ['/usr/bin/bwrap', '--unshare-user', '--unshare-ipc', '--unshare-pid', '--unshare-uts', '--unshare-cgroup',
            '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv', '--seccomp', str(bpf)]
    if cfg['role'] != 'payer':
        args += ['--unshare-net']
    for path in ('/usr', '/bin', '/lib', '/lib64', '/sbin'):
        if Path(path).exists():
            args += ['--ro-bind', path, path]
    for path in (cfg['pythonRoot'], cfg['source'], cfg['adapters']):
        args += ['--ro-bind', path, path]
    args += ['--bind', str(home), str(home), '--bind', str(temp), '/tmp', '--proc', '/proc', '--dev', '/dev']
    if cfg['role'] != 'payer':
        args += ['--bind', str(images), str(home / 'cache' / 'images')]
    else:
        for path in ('/etc/ssl/certs', '/etc/resolv.conf', '/etc/nsswitch.conf', '/etc/hosts'):
            if Path(path).exists():
                args += ['--ro-bind', path, path]
    environment = {'HOME': str(home), 'HERMES_HOME': str(home), 'CODEX_HOME': str(home / '.codex'),
                   'XDG_CONFIG_HOME': str(home / '.config'), 'XDG_CACHE_HOME': '/tmp/cache', 'TMPDIR': '/tmp',
                   'PATH': str(source / '.venv/bin') + ':/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
                   'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONPATH': str(source),
                   'SCISENSE_SECCOMP_LIBRARY': str(adapters / 'worker-lock.so'),
                   'SCISENSE_SECCOMP_SHA256': cfg['workerLockSha256'], 'SCISENSE_NATIVE_PROVISIONED': '1'}
    if cfg['role'] != 'payer':
        environment['SCISENSE_IPC_KEY'] = 'scisense-parent-ipc-not-a-provider-credential'
    for key, value in environment.items():
        args += ['--setenv', key, value]
    script = 'hermes_personal_payer_worker.py' if cfg['role'] == 'payer' else 'hermes_personal_worker.py'
    args += ['--chdir', str(source), '--', str(source / '.venv/bin/python'), str(adapters / script)]
    return args


def sweep(directory, now):
    # <=291s with the one-second loop. Watchdog kills a paused guardian and
    # systemd then removes its own RuntimeDirectory, including the raw bytes.
    for path in directory.iterdir():
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077:
            raise RuntimeError('launcher_media_invalid')
        if info.st_mtime <= now - 290:
            path.unlink()


def read_launch_ack(connection, invocation):
    initial = bytearray()
    while b'\n' not in initial:
        part = connection.recv(65536)
        if not part:
            raise RuntimeError('launcher_ack_invalid')
        initial.extend(part)
        end = initial.find(b'\n')
        if (end < 0 and len(initial) > 8192) or end > 8192:
            raise RuntimeError('launcher_ack_invalid')
    line, _, remainder = initial.partition(b'\n')
    if json.loads(line) != {'type': 'scisense-launch', 'invocation': invocation}:
        raise RuntimeError('launcher_ack_invalid')
    return remainder


def serve(cfg, connection):
    peer_pid, peer_uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize('3i')))
    if peer_uid != cfg['nodeUid'] or peer_pid <= 0:
        raise RuntimeError('launcher_peer_invalid')
    invocation = os.environ.get('INVOCATION_ID', '')
    cgroup = next((line[3:] for line in Path('/proc/self/cgroup').read_text().splitlines() if line.startswith('0::')), '')
    if not re.fullmatch('[a-f0-9]{32}', invocation) or not re.fullmatch(r'/scisense\.slice/scisense-' + cfg['role'] + r'@[A-Za-z0-9_.:!\\-]+\.service', cgroup):
        raise RuntimeError('launcher_cgroup_invalid')
    base = checked(cfg['ephemeral'], uid=os.getuid(), private=True)
    tmpfs(base)
    ephemeral = base / invocation
    ephemeral.mkdir(mode=0o700)
    connection.settimeout(3)
    connection.sendall((json.dumps({'type': 'scisense-service', 'version': 1, 'role': cfg['role'], 'invocation': invocation, 'cgroup': cgroup}) + '\n').encode())
    remainder = read_launch_ack(connection, invocation)
    child = None; pidfd = None; bpf = None
    try:
        bpf = os.open(cfg['bpf'], os.O_RDONLY | os.O_NOFOLLOW)
        args = launch_command(cfg, ephemeral, bpf)
        child = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                 env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}, pass_fds=(bpf,), start_new_session=True)
        # The direct child has not been waited/reaped, so its pid cannot be reused.
        pidfd = os.pidfd_open(child.pid)
        for descriptor in (connection.fileno(), child.stdin.fileno(), child.stdout.fileno()):
            os.set_blocking(descriptor, False)
        connection.setblocking(False)
        to_child, to_node = bytearray(remainder), bytearray()
        notify('READY=1\nWATCHDOG=1')
        beat, swept = time.monotonic(), time.monotonic()
        while True:
            now = time.monotonic()
            if now - beat >= 0.4:
                notify('WATCHDOG=1'); beat = now
            if now - swept >= 1:
                sweep(ephemeral / 'images', time.time()); swept = now
            polling = select.poll()
            # Always observe RDHUP, even when a stopped child's stdin fills.
            flags = select.POLLHUP | select.POLLERR | select.POLLRDHUP
            if len(to_child) < MAX_BUFFER:
                flags |= select.POLLIN
            if to_node:
                flags |= select.POLLOUT
            polling.register(connection, flags)
            polling.register(pidfd, select.POLLIN)
            polling.register(child.stdout, select.POLLIN if len(to_node) < MAX_BUFFER else 0)
            if to_child:
                polling.register(child.stdin, select.POLLOUT)
            for descriptor, events in polling.poll(100):
                if descriptor == pidfd or events & (select.POLLHUP | select.POLLERR | select.POLLRDHUP):
                    return
                try:
                    if descriptor == connection.fileno():
                        if events & select.POLLIN:
                            part = connection.recv(min(65536, MAX_BUFFER - len(to_child)))
                            if not part:
                                return
                            to_child.extend(part)
                        if events & select.POLLOUT:
                            del to_node[:connection.send(to_node)]
                    elif descriptor == child.stdout.fileno():
                        part = os.read(descriptor, min(65536, MAX_BUFFER - len(to_node)))
                        if not part:
                            return
                        to_node.extend(part)
                    elif descriptor == child.stdin.fileno():
                        del to_child[:os.write(descriptor, to_child)]
                except BlockingIOError:
                    pass
    finally:
        if pidfd is not None:
            try:
                signal.pidfd_send_signal(pidfd, signal.SIGKILL)
            except ProcessLookupError:
                pass
            os.close(pidfd)
        if child:
            try:
                child.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass  # PID1 KillMode=control-group is the independent final fence.
        if bpf is not None:
            os.close(bpf)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    cfg = configuration(parser.parse_args().config)
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(SystemExit(0)))
    with socket.socket(fileno=os.dup(0)) as connection:
        serve(cfg, connection)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # No native/protocol payload or host path is emitted to a journal.
        raise SystemExit(1)
