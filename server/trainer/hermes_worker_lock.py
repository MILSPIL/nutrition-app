"""Only the trusted Linux launcher opts in; absent in the Mac lab harness."""
import ctypes
import hashlib
import re
import os
from pathlib import Path
import stat
import sys
import time

_library = None
_turn = None
_deadline = None


def lock_worker():
    global _library
    value = os.environ.get('SCISENSE_SECCOMP_LIBRARY')
    if value is None:
        return
    path = Path(value)
    info = path.lstat()
    if sys.platform != 'linux' or path.resolve() != path or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o022:
        raise RuntimeError('worker_policy_invalid')
    expected = os.environ.get('SCISENSE_SECCOMP_SHA256', '')
    # Host-root ownership/pin was checked by guardian before userns. Host UID0
    # is deliberately unmapped here; require the pinned readonly mount instead.
    if not re.fullmatch('[a-f0-9]{64}', expected) or info.st_size > 1024 * 1024 or not os.statvfs(path).f_flag & os.ST_RDONLY or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise RuntimeError('worker_policy_invalid')
    _library = ctypes.CDLL(str(path))
    if _library.scisense_lock_worker() != 0:
        raise RuntimeError('worker_policy_invalid')


def arm_deadline(turn, deadline_unix_ms, timeout_ms):
    global _turn, _deadline
    if not isinstance(turn, str) or not 1 <= len(turn) <= 100 or type(deadline_unix_ms) is not int or type(timeout_ms) is not int or not 0 < timeout_ms <= 45000:
        raise RuntimeError('invalid_request')
    now = time.monotonic()
    remaining = min(timeout_ms, deadline_unix_ms - int(time.time() * 1000)) / 1000
    target = now + remaining
    if _turn == turn:
        target = min(target, _deadline)
    _turn, _deadline = turn, target
    milliseconds = int((target - now) * 1000)
    if milliseconds <= 0:
        raise RuntimeError('trainer_timeout')
    if _library is not None and _library.scisense_deadline_arm(milliseconds) != 0:
        raise RuntimeError('worker_policy_invalid')


def end_deadline(turn):
    global _turn, _deadline
    if turn != _turn:
        raise RuntimeError('invalid_request')
    if _library is not None and _library.scisense_deadline_disarm() != 0:
        raise RuntimeError('worker_policy_invalid')
    _turn, _deadline = None, None
