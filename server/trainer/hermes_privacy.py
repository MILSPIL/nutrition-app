"""Privacy completion for the pinned canonical, single-turn Hermes worker.

This is not a general Hermes cleanup tool. The caller holds exclusive profile
ownership, finishes native session deletion, stops its worker and closes its DB
handles before cleanup. Do not run a WAL reset against a serving gateway.
"""
from contextlib import closing
import hashlib
import os
from pathlib import Path
import re
import sqlite3
import stat


def enable_secure_deletion(db):
    """Set the pragma on Hermes' actual shared writer before any media admission."""
    value = db._execute_write(lambda conn: conn.execute('PRAGMA secure_delete=ON').fetchone()[0])
    if value != 1:
        raise RuntimeError('Hermes secure deletion was not enabled')


def finish_media_cleanup(profile, media, *, ownership, database, session_id):
    """Clean only named staging objects after the canonical worker has stopped.

    Native DELETE owns sessions/native-inputs. No transcript or context is removed
    by this wrapper. Failed cleanup must keep the application's cleanup job pending.
    """
    profile = Path(profile)
    if profile != profile.resolve() or not ownership.owns(profile):
        raise RuntimeError('Exclusive profile ownership required')
    if database._conn is not None:
        raise RuntimeError('The Hermes writer must be closed before cleanup')
    db_path = profile / 'state.db'
    if db_path.is_symlink() or not stat.S_ISREG(db_path.stat().st_mode):
        raise RuntimeError('Unsafe Hermes database path')
    # No media filesystem mutation until native deletion is independently visible.
    with closing(sqlite3.connect(f'{db_path.as_uri()}?mode=rw', uri=True, timeout=1)) as conn:
        if conn.execute('SELECT 1 FROM sessions WHERE id=?', (session_id,)).fetchone():
            raise RuntimeError('Native session deletion has not completed')
        if conn.execute("SELECT 1 FROM session_admissions WHERE status <> 'terminal' LIMIT 1").fetchone():
            raise RuntimeError('A Hermes admission is still active')
        result = conn.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()
        if result is None or result[0] != 0:
            raise RuntimeError('Hermes cleanup checkpoint is busy')
        if conn.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise RuntimeError('Hermes database integrity check failed')
    removed = []
    cache = profile / 'cache/images'
    if cache.resolve() != cache:
        raise RuntimeError('Unsafe image cache path')
    for image in media:
        digest, suffix = image['sha256'], image['suffix']
        if not re.fullmatch(r'[a-f0-9]{64}', digest) or suffix not in ('.png','.jpg','.gif','.webp'):
            raise RuntimeError('Invalid owned media reference')
        path = cache / ('api_' + digest[:32] + suffix)
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        except FileNotFoundError:
            continue
        try:
            before = os.fstat(fd)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
                raise RuntimeError('Unsafe media staging object')
            with os.fdopen(fd, 'rb', closefd=False) as stream:
                actual = hashlib.file_digest(stream, 'sha256').hexdigest()
            after = path.lstat()
            if actual != digest or (before.st_dev,before.st_ino) != (after.st_dev,after.st_ino):
                raise RuntimeError('Owned media changed during cleanup')
            path.unlink()
            removed.append(path.name)
        finally:
            os.close(fd)
    return {'checkpointBusy':result[0], 'removedStagingFiles':len(removed)}


def release_exited_turn_lease(profile, *, ownership, database, authority_epoch,
                              before, exited_worker, current_namespace):
    """Release only a terminal interrupted turn whose original namespace exited.

    Node keeps this proof only after its exact bwrap child closes. Across a Node
    restart there is no proof: the canonical lease must expire normally instead.
    The pinned API's exact-holder release still guards against replacement races.
    """
    if not exited_worker:
        return False
    session_id = before['target_session_id']
    namespace = exited_worker.get('pidNamespace')
    if (not ownership.owns(Path(profile)) or not re.fullmatch(r'\d+', namespace or '')
            or namespace == current_namespace
            or exited_worker.get('runId') != session_id
            or exited_worker.get('sessionId') != session_id
            or before['owner_epoch'] >= authority_epoch
            or before['status'] != 'unknown'):
        raise RuntimeError('recovery_ownership_invalid')
    with database._read_ctx() as conn:
        after = conn.execute('SELECT * FROM session_admissions WHERE admission_id=?',
                             (before['admission_id'],)).fetchone()
        if (after is None or any(after[key] != before[key] for key in
                ('target_session_id', 'generation', 'owner_epoch'))
                or after['status'] != 'terminal' or after['outcome'] != 'interrupted'
                or conn.execute("SELECT 1 FROM session_admissions WHERE status<>'terminal' LIMIT 1").fetchone()):
            raise RuntimeError('recovery_generation_invalid')
        conversation = database._session_turn_lease_key_on_conn(conn, session_id)
        lease = conn.execute('SELECT holder FROM session_turn_leases WHERE conversation_id=?', (conversation,)).fetchone()
    if lease is None:
        return True
    holder = lease['holder']
    token = re.search(r'(?:^|:)pidns=(\d+)(?::|$)', holder)
    if not token or token.group(1) != namespace or ':turn=' + session_id + ':' not in holder:
        raise RuntimeError('recovery_holder_invalid')
    database.release_session_turn_lease(session_id, holder)
    with database._read_ctx() as conn:
        if conn.execute('SELECT 1 FROM session_turn_leases WHERE conversation_id=?', (conversation,)).fetchone():
            raise RuntimeError('recovery_holder_changed')
    return True
