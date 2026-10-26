import json
import socket
import unittest
import tempfile
from pathlib import Path
import os
import sqlite3
from hermes_service_guardian import read_launch_ack, assert_state_file


class AckTests(unittest.TestCase):
    def test_large_setup_coalesced_with_short_ack_is_preserved(self):
        invocation = 'a' * 32
        setup = b'{"syntheticCredentials":"' + b'x' * 20000 + b'"}\n'
        left, right = socket.socketpair()
        try:
            left.settimeout(1); right.settimeout(1)
            left.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 65536)
            right.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 65536)
            right.sendall(json.dumps({'type': 'scisense-launch', 'invocation': invocation}).encode() + b'\n' + setup)
            self.assertEqual(read_launch_ack(left, invocation), setup)
        finally:
            left.close(); right.close()

    def test_long_first_line_is_not_misread_as_valid_ack(self):
        left, right = socket.socketpair()
        try:
            left.settimeout(1); right.settimeout(1)
            right.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 65536)
            right.sendall(b'x' * 9000 + b'\n')
            with self.assertRaisesRegex(RuntimeError, 'launcher_ack_invalid'):
                read_launch_ack(left, 'a' * 32)
        finally:
            left.close(); right.close()

    def test_wrong_invocation_is_refused(self):
        left, right = socket.socketpair()
        try:
            left.settimeout(1); right.settimeout(1)
            left.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 65536)
            right.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 65536)
            right.sendall(json.dumps({'type': 'scisense-launch', 'invocation': 'b' * 32}).encode() + b'\n')
            with self.assertRaisesRegex(RuntimeError, 'launcher_ack_invalid'):
                read_launch_ack(left, 'a' * 32)
        finally:
            left.close(); right.close()


class StateTests(unittest.TestCase):
    def test_missing_empty_and_corrupt_database_never_gets_recreated(self):
        with tempfile.TemporaryDirectory() as value:
            home = Path(value).resolve()
            for content in (None, b'', b'SQLite format 3\0' + b'bad' * 100):
                path = home / 'state.db'
                path.unlink(missing_ok=True)
                if content is not None:
                    path.write_bytes(content); path.chmod(0o600)
                with self.assertRaises(Exception):
                    assert_state_file(home)
                self.assertEqual(path.read_bytes() if path.exists() else None, content)
                self.assertEqual(sorted(p.name for p in home.iterdir()), [] if content is None else ['state.db'])

    def test_healthy_database_is_only_read(self):
        with tempfile.TemporaryDirectory() as value:
            home = Path(value).resolve(); path = home / 'state.db'
            with sqlite3.connect(path) as db:
                db.execute('CREATE TABLE canary (value INTEGER)')
            path.chmod(0o600); before = path.read_bytes()
            assert_state_file(home)
            self.assertEqual(path.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
