"""Streaming encrypted canonical-state snapshot, never credential restoration.
The controller stops/drains ingress and proves physical exit. Native maintenance
ownership fences snapshot reads. Restore publishes only to the SAME absent HOME;
full database state/receipts survive, app ledgers and grants remain external.
"""
from contextlib import contextmanager
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import tarfile
import tempfile
import stat
import uuid
from hermes_personal_migration import PIN, _uid, _home, _private, encoded, publish_new

MAGIC = b'SCISENSE-CANONICAL-1\n'
CHUNK = 1024 * 1024
MAX_DB = 400 * 1024 * 1024
MAX_MEDIA = 256 * 1024 * 1024
MAX_CONTEXT_FILE = 500000
# Archive overhead only. Rendered ProfileContext remains limited to400000.
MAX_CONTEXT = 400000 + MAX_CONTEXT_FILE + 32000
MAX_FILES = 50000
MAX_ARCHIVE = MAX_DB + MAX_MEDIA + MAX_CONTEXT + 100 * 1024 * 1024


def _error(code):
    raise RuntimeError(code)


def _aad(uid, home):
    _uid(uid); _home(str(home))
    return encoded(['scisense-canonical-native-v1', PIN, uid, str(home)])


def _key(key):
    if not isinstance(key, bytes) or len(key) != 32:
        _error('snapshot_key_invalid')


def _open_private(path):
    path = _private(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077:
            _error('snapshot_file_invalid')
        return os.fdopen(fd, 'rb')
    except BaseException:
        os.close(fd)
        raise


def _hash_file(path):
    h = hashlib.sha256()
    with _open_private(path) as stream:
        for chunk in iter(lambda: stream.read(CHUNK), b''):
            h.update(chunk)
    return h.hexdigest()


@contextmanager
def _native_cache(work):
    # Even read-only Native schema checks write a reference-only cache. This
    # offline operator has no concurrent workers and uses a disposable HOME.
    previous = os.environ.get('HERMES_HOME')
    home = work / 'native-cache'; home.mkdir(mode=0o700)
    os.environ['HERMES_HOME'] = str(home)
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop('HERMES_HOME', None)
        else:
            os.environ['HERMES_HOME'] = previous


def _allowed(name, size):
    if not isinstance(name, str) or not name or '\\' in name or '\0' in name or type(size) is not int or size < 0:
        _error('snapshot_member_invalid')
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or str(path) != name or not all(re.fullmatch(r'[A-Za-z0-9_.-]+', part) for part in path.parts):
        _error('snapshot_member_invalid')
    if name == 'state.db':
        if not 0 < size <= MAX_DB:
            _error('snapshot_size_limit')
        return 'database'
    if name.startswith('personal-context/') and path.suffix in ('.json', '.md', '.txt') and not re.search('auth|config|secret|token|hook|cron|telegram', path.name, re.I):
        if size > MAX_CONTEXT_FILE:
            _error('snapshot_size_limit')
        return 'context'
    if name.startswith('cache/documents/native-inputs/') and path.suffix in ('.png', '.jpg', '.jpeg', '.webp', '.json') and path.name not in ('auth.json', 'credentials.json'):
        if size > 5 * 1024 * 1024:
            _error('snapshot_size_limit')
        return 'media'
    _error('snapshot_member_invalid')


def _private_tree(root):
    _private(root, directory=True)
    for directory, names, files in os.walk(root, followlinks=False):
        for name in names:
            _private(Path(directory) / name, directory=True)
        for name in files:
            yield _private(Path(directory) / name)


def _mkdir(path, root):
    relative = path.relative_to(root)
    parent = root
    for name in relative.parts:
        parent = parent / name
        if not parent.exists():
            parent.mkdir(mode=0o700)
        _private(parent, directory=True)


def _sync_tree(root):
    for directory, _names, files in os.walk(root, topdown=False):
        for name in files:
            fd = os.open(Path(directory) / name, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def capture(home, uid, output, key):
    """Consistent offline snapshot. Controller may nest exclusive_maintenance
    around this call to keep the source fenced until cutover acknowledgement.
    """
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from gateway.runtime_ownership import exclusive_maintenance
    from hermes_cli.backup_sqlite import _safe_copy_db
    from hermes_cli.backup_restore import _restore_epoch
    from hermes_personal_context import ProfileContext
    home = _private(Path(home), directory=True); output = Path(output)
    _private(output.parent, directory=True); _key(key)
    if output == home or output.is_relative_to(home):
        _error('snapshot_output_inside_source')
    if output.exists() or output.is_symlink():
        _error('snapshot_output_exists')
    aad = _aad(uid, home)
    with exclusive_maintenance([home], purpose='scisense-canonical-snapshot'):
        ProfileContext(home, read_only=True).read()
        database_files = {}
        for suffix in ('', '-wal', '-shm'):
            path = home / ('state.db' + suffix)
            if not suffix or path.exists() or path.is_symlink():
                info = _private(path).stat()
                database_files[suffix] = (info.st_dev, info.st_ino, info.st_size)
        original = home / 'state.db'
        if sum(row[2] for row in database_files.values()) > MAX_DB:
            _error('snapshot_size_limit')
        with tempfile.TemporaryDirectory(prefix='.canonical-capture-', dir=home.parent) as directory:
            work = Path(directory); snapshot = work / 'state.db'
            if not _safe_copy_db(original, snapshot):
                _error('snapshot_native_copy_failed')
            from hermes_cli.backup import verify_sqlite_integrity
            from hermes_personal_owner import verify_provisioned_native_state
            with _native_cache(work):
                if verify_sqlite_integrity(snapshot).get('valid') is not True:
                    _error('snapshot_native_integrity_failed')
                verify_provisioned_native_state(work)
            epoch = _restore_epoch(snapshot)
            if epoch < 1:
                _error('snapshot_not_canonical')
            sources = [('state.db', snapshot)]
            for relative in ('personal-context', 'cache/documents/native-inputs'):
                root = home / relative
                if root.exists() or root.is_symlink():
                    sources.extend((path.relative_to(home).as_posix(), path) for path in _private_tree(root))
            rows, totals = [], {'database': 0, 'context': 0, 'media': 0}
            for name, path in sorted(sources):
                size = path.stat().st_size; kind = _allowed(name, size); totals[kind] += size
                rows.append({'path': name, 'bytes': size, 'sha256': _hash_file(path)})
            if len(rows) > MAX_FILES or totals['media'] > MAX_MEDIA or totals['context'] > MAX_CONTEXT:
                _error('snapshot_size_limit')
            manifest = {'version': 1, 'kind': 'canonical-native', 'pin': PIN, 'uid': uid, 'home': str(home), 'nativeEpoch': epoch, 'files': rows}
            nonce = os.urandom(12); encryptor = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
            encryptor.authenticate_additional_data(aad)
            temporary = output.with_name(output.name + '.' + uuid.uuid4().hex + '.tmp')
            try:
                fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(MAGIC + nonce)
                    class Sink:
                        def write(self, data):
                            stream.write(encryptor.update(data)); return len(data)
                        def flush(self):
                            stream.flush()
                    with tarfile.open(fileobj=Sink(), mode='w|', format=tarfile.GNU_FORMAT) as archive:
                        data = encoded(manifest)
                        if len(data) > 8 * 1024 * 1024:
                            _error('snapshot_size_limit')
                        info = tarfile.TarInfo('snapshot.json'); info.size = len(data); info.mode = 0o600
                        archive.addfile(info, io.BytesIO(data))
                        for row, (_name, path) in zip(rows, sorted(sources)):
                            info = tarfile.TarInfo(row['path']); info.size = row['bytes']; info.mode = 0o600
                            with _open_private(path) as source:
                                archive.addfile(info, source)
                            if _hash_file(path) != row['sha256']:
                                _error('snapshot_source_changed')
                    stream.write(encryptor.finalize()); stream.write(encryptor.tag); stream.flush(); os.fsync(stream.fileno())
                for suffix, identity in database_files.items():
                    after = _private(home / ('state.db' + suffix)).stat()
                    if identity != (after.st_dev, after.st_ino, after.st_size):
                        _error('snapshot_source_changed')
                if temporary.stat().st_size > MAX_ARCHIVE:
                    _error('snapshot_size_limit')
                os.link(temporary, output); temporary.unlink()
                fd = os.open(output.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
                return {'sha256': _hash_file(output), 'nativeEpoch': epoch, 'files': len(rows), 'bytes': output.stat().st_size}
            finally:
                temporary.unlink(missing_ok=True)


def restore(snapshot, uid, home, key, *, expected_sha256, minimum_epoch):
    """Restore fresh full state to the same absent canonical HOME. Physical
    process exit, a current tail receipt and stopped ingress are caller gates.
    An older disaster-recovery snapshot needs a separate RPO decision.
    """
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from hermes_cli.backup_restore import _safe_restore_db, _restore_epoch
    from hermes_personal_owner import verify_provisioned_native_state
    home = Path(_home(str(home))); _private(home.parent, directory=True); snapshot = _private(Path(snapshot)); _key(key)
    if home.exists() or home.is_symlink():
        _error('snapshot_destination_exists')
    if not isinstance(expected_sha256, str) or not re.fullmatch('[a-f0-9]{64}', expected_sha256) or type(minimum_epoch) is not int or minimum_epoch < 1:
        _error('snapshot_receipt_required')
    if not len(MAGIC) + 28 < snapshot.stat().st_size <= MAX_ARCHIVE:
        _error('snapshot_digest_invalid')
    with tempfile.TemporaryDirectory(prefix='.canonical-restore-', dir=home.parent) as directory:
        work = Path(directory); payload = work / 'payload'; payload.mkdir(mode=0o700)
        with tempfile.TemporaryFile(dir=work) as plaintext, _open_private(snapshot) as source:
            prefix = source.read(len(MAGIC) + 12)
            if len(prefix) != len(MAGIC) + 12 or not prefix.startswith(MAGIC):
                _error('snapshot_format_invalid')
            source.seek(-16, os.SEEK_END); tag = source.read(16); end = source.tell() - 16
            cipher_hash = hashlib.sha256(prefix)
            decryptor = Cipher(algorithms.AES(key), modes.GCM(prefix[-12:], tag)).decryptor()
            decryptor.authenticate_additional_data(_aad(uid, home)); source.seek(len(prefix))
            remaining = end - len(prefix)
            if remaining <= 0:
                _error('snapshot_format_invalid')
            try:
                while remaining:
                    chunk = source.read(min(CHUNK, remaining))
                    if not chunk:
                        _error('snapshot_format_invalid')
                    remaining -= len(chunk); cipher_hash.update(chunk); plaintext.write(decryptor.update(chunk))
                plaintext.write(decryptor.finalize())
            except Exception:
                _error('snapshot_authentication_failed')
            cipher_hash.update(tag)
            if cipher_hash.hexdigest() != expected_sha256:
                _error('snapshot_digest_invalid')
            plaintext.seek(0)
            with tarfile.open(fileobj=plaintext, mode='r|') as archive:
                member = archive.next()
                if not member or member.name != 'snapshot.json' or not member.isfile() or member.size > 8 * 1024 * 1024 or member.pax_headers:
                    _error('snapshot_manifest_invalid')
                with archive.extractfile(member) as content:
                    manifest = json.load(content)
                if (not isinstance(manifest, dict) or set(manifest) != {'version', 'kind', 'pin', 'uid', 'home', 'nativeEpoch', 'files'} or type(manifest['version']) is not int or manifest['version'] != 1 or manifest['kind'] != 'canonical-native' or manifest['pin'] != PIN or manifest['uid'] != uid or manifest['home'] != str(home) or type(manifest['nativeEpoch']) is not int or manifest['nativeEpoch'] < minimum_epoch or not isinstance(manifest['files'], list) or not 1 <= len(manifest['files']) <= MAX_FILES):
                    _error('snapshot_manifest_invalid')
                expected = {}; totals = {'database': 0, 'context': 0, 'media': 0}
                for row in manifest['files']:
                    if not isinstance(row, dict) or set(row) != {'path', 'bytes', 'sha256'} or not isinstance(row['sha256'], str) or not re.fullmatch('[a-f0-9]{64}', row['sha256']) or not isinstance(row['path'], str) or row['path'] in expected:
                        _error('snapshot_manifest_invalid')
                    totals[_allowed(row['path'], row['bytes'])] += row['bytes']; expected[row['path']] = row
                if not {'state.db', 'personal-context/memory.json'}.issubset(expected) or totals['media'] > MAX_MEDIA or totals['context'] > MAX_CONTEXT:
                    _error('snapshot_size_limit')
                seen = set()
                while member := archive.next():
                    if not member.isfile() or member.name not in expected or member.name in seen or member.pax_headers or member.mode & 0o7000:
                        _error('snapshot_member_invalid')
                    row = expected[member.name]
                    if member.size != row['bytes']:
                        _error('snapshot_member_invalid')
                    seen.add(member.name); target = payload / member.name; _mkdir(target.parent, payload)
                    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600); h = hashlib.sha256()
                    with os.fdopen(fd, 'wb') as output, archive.extractfile(member) as content:
                        for chunk in iter(lambda: content.read(CHUNK), b''):
                            h.update(chunk); output.write(chunk)
                        output.flush(); os.fsync(output.fileno())
                    if h.hexdigest() != row['sha256']:
                        _error('snapshot_member_digest_invalid')
                if seen != set(expected):
                    _error('snapshot_incomplete')
        if _restore_epoch(payload / 'state.db') != manifest['nativeEpoch']:
            _error('snapshot_epoch_invalid')
        stage = work / 'restored'; stage.mkdir(mode=0o700)
        with _native_cache(work):
            if not _safe_restore_db(payload / 'state.db', stage / 'state.db'):
                _error('snapshot_native_restore_failed')
            verify_provisioned_native_state(stage)
        for name in ('personal-context', 'cache'):
            if (payload / name).exists():
                (payload / name).rename(stage / name)
        _mkdir(stage / 'cache/images', stage)
        _mkdir(stage / 'personal-context/sources', stage)
        _sync_tree(stage)
        publish_new(stage, home)
        fd = os.open(home.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
        return {'restored': True, 'nativeEpoch': manifest['nativeEpoch'], 'files': len(expected), 'appLedgersRestored': False, 'credentialsRestored': False}
