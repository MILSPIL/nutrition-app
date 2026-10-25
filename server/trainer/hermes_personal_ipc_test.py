"""Failure paths in the bounded profile-to-parent pipe, without native imports."""
import json
import os
from pathlib import Path
import threading
import unittest
from hermes_personal_ipc import Peer


class PeerTests(unittest.TestCase):
    def setUp(self):
        self.input_read, self.input_write = os.pipe()
        self.output_read, self.output_write = os.pipe()
        self.peer = Peer(self.input_read, self.output_write)

    def tearDown(self):
        self.peer.close()
        os.close(self.input_write)
        if self.peer.reader.is_alive():
            self.peer.reader.join(1)
        for descriptor in (self.input_read, self.output_read, self.output_write):
            os.close(descriptor)

    def test_timeout_emits_cancel_and_removes_waiter_without_resubmit(self):
        with self.assertRaisesRegex(RuntimeError, "trainer_timeout"):
            self.peer.ask("model", {"payload": {"model": "synthetic"}}, timeout=0.01)
        packets = [json.loads(line) for line in os.read(self.output_read, 8192).splitlines()]
        self.assertEqual([packet["type"] for packet in packets], ["model", "cancel"])
        self.assertEqual(packets[0]["id"], packets[1]["id"])
        self.assertEqual(packets[0]["timeoutMs"], 10)
        self.assertEqual(self.peer.pending, {})

    def test_orphaned_pipe_wakes_parent_waiter_as_unknown(self):
        self.peer.start(); errors = []
        def request():
            try:
                self.peer.ask("tool", {"name": "synthetic"})
            except RuntimeError as error:
                errors.append(str(error))
        thread = threading.Thread(target=request); thread.start()
        json.loads(os.read(self.output_read, 8192).splitlines()[0])
        self.peer.close(); thread.join(1)
        self.assertFalse(thread.is_alive())
        self.assertEqual(errors, ["execution_unknown"])
        self.assertEqual(self.peer.pending, {})

    def test_malformed_input_closes_protocol_without_retaining_private_text(self):
        self.peer.start()
        os.write(self.input_write, b'Bearer synthetic-private-never-publish\n')
        self.assertTrue(self.peer.closed.wait(1))
        self.assertEqual(self.peer.commands.get(timeout=1), {"type": "orphan"})


if __name__ == "__main__":
    unittest.main()
