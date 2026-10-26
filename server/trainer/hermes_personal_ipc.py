"""Bounded line IPC between one profile process and its trusted coordinator."""
import json
import os
import queue
import threading
import uuid

# Native replay retains 3..5 recent 5MiB photos (including the current turn).
# Base64 + a <=512KB fresh snapshot fit under this fixed, bounded 48MiB frame.
MAX_BYTES = 48 * 1024 * 1024


class Peer:
    def __init__(self, input_fd=0, output_fd=1):
        self.input_fd, self.output_fd = input_fd, output_fd
        self.pending, self.commands = {}, queue.Queue(maxsize=32)
        self.lock, self.write_lock = threading.RLock(), threading.Lock()
        self.closed = threading.Event()
        self.reader = threading.Thread(target=self._read, name="personal-ipc-reader", daemon=True)

    def start(self):
        self.reader.start()

    def send(self, value):
        encoded = (json.dumps(value, ensure_ascii=False, allow_nan=False) + "\n").encode()
        if len(encoded) > MAX_BYTES:
            raise RuntimeError("model_payload_invalid")
        with self.write_lock:
            if self.closed.is_set():
                raise RuntimeError("execution_unknown")
            offset = 0
            while offset < len(encoded):
                written = os.write(self.output_fd, encoded[offset:])
                if written <= 0:
                    raise RuntimeError("execution_unknown")
                offset += written

    def close(self):
        self.closed.set()
        with self.lock:
            for waiter in self.pending.values():
                waiter.put_nowait({"error": "execution_unknown"}) if waiter.empty() else None
        try:
            self.commands.put_nowait({"type": "orphan"})
        except queue.Full:
            pass

    def _read(self):
        buffer = bytearray()
        try:
            while not self.closed.is_set():
                chunk = os.read(self.input_fd, 65536)
                if not chunk:
                    return
                buffer.extend(chunk)
                while b"\n" in buffer:
                    line, _, buffer = buffer.partition(b"\n")
                    if not line or len(line) > MAX_BYTES:
                        return
                    value = json.loads(line)
                    if not isinstance(value, dict):
                        return
                    if value.get("type") == "reply":
                        with self.lock:
                            waiter = self.pending.get(value.get("id"))
                        if waiter is not None and waiter.empty():
                            waiter.put_nowait(value)
                    else:
                        self.commands.put_nowait(value)
                if len(buffer) > MAX_BYTES:
                    return
        except (OSError, ValueError, TypeError, queue.Full):
            pass
        finally:
            self.close()

    def ask(self, kind, payload, timeout=45):
        ident, waiter = uuid.uuid4().hex, queue.Queue(maxsize=1)
        with self.lock:
            if self.closed.is_set() or len(self.pending) >= 16:
                raise RuntimeError("trainer_unavailable")
            self.pending[ident] = waiter
        try:
            self.send({"type": kind, "id": ident, "timeoutMs": max(1, int(timeout * 1000)), **payload})
            try:
                reply = waiter.get(timeout=timeout)
            except queue.Empty:
                try:
                    self.send({"type": "cancel", "id": ident})
                except (OSError, RuntimeError):
                    pass
                raise RuntimeError("trainer_timeout") from None
            if reply.get("error"):
                from hermes_personal_provider import BrokerRefusal
                raise BrokerRefusal(reply["error"])
            return reply.get("result")
        finally:
            with self.lock:
                self.pending.pop(ident, None)
