"""One persistent native owner per isolated process. No provider credentials.
Only the trusted coordinator may use this protocol; it performs admission,
queueing, tool leases and verified-UID routing before sending any command.
"""
import asyncio
import os
import re
import sys
from pathlib import Path
from hermes_personal_ipc import Peer

# Native logs cannot be confused with protocol packets.
sys.stdout = sys.stderr
_ALLOWED_ERRORS = {"trainer_unavailable", "trainer_timeout", "trainer_quota", "connection_auth_required",
    "connection_model_changed", "model_payload_invalid", "execution_unknown", "personal_owner_conflict",
    "personal_channel_limit", "personal_channel_invalid", "profile_mismatch", "not_found",
    "owner_shutdown_incomplete", "owner_channel_close_failed", "invalid_request", "conflict"}


def safe_error(error):
    text = str(error)
    return text if text in _ALLOWED_ERRORS else "trainer_unavailable"


async def serve(peer):
    setup = await asyncio.to_thread(peer.commands.get)
    if not isinstance(setup, dict) or setup.get("type") != "setup" or set(setup) - {"type", "id", "connection", "toolSchemas"}:
        raise RuntimeError("invalid_request")
    from hermes_personal_owner import PersonalOwner
    def model(payload, *, client_options):
        value = peer.ask("model", {"payload": payload, "clientOptions": client_options})
        if payload.get("stream"):
            if not isinstance(value, dict) or not isinstance(value.get("chunks"), list):
                raise RuntimeError("model_payload_invalid")
            return iter(value["chunks"])
        return value["completion"]
    owner = PersonalOwner(home=Path(os.environ["HERMES_HOME"]), connection=setup.get("connection", {}),
        model_bridge=model, tool_handler=lambda name, arguments: peer.ask("tool", {"name": name, "arguments": arguments}),
        tool_schemas=setup.get("toolSchemas", {}), on_event=lambda channel, event: peer.send({"type": "event", "channel": channel, "event": event}))
    tasks = set()
    async def command(value):
        ident = value.get("id")
        if not isinstance(ident, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", ident):
            peer.close(); return
        try:
            kind = value.get("type")
            if kind == "bot" and set(value) <= {"id", "type", "channel"}:
                result = await owner.bot(value.get("channel"))
            elif kind == "rpc" and set(value) <= {"id", "type", "channel", "method", "params"}:
                if not isinstance(value.get("method"), str) or not isinstance(value.get("params"), dict):
                    raise RuntimeError("invalid_request")
                result = await owner.rpc(value.get("channel"), value["method"], value["params"])
            elif kind == "detach" and set(value) <= {"id", "type", "channel"}:
                await owner.close_channel(value.get("channel")); result = {"detached": True}
            else:
                raise RuntimeError("invalid_request")
            peer.send({"type": "result", "id": ident, "result": result})
        except Exception as error:
            peer.send({"type": "result", "id": ident, "error": safe_error(error)})
    try:
        identity = await owner.start()
        peer.send({"type": "result", "id": setup.get("id"), "result": identity})
        while not peer.closed.is_set():
            value = await asyncio.to_thread(peer.commands.get)
            if value.get("type") in ("orphan", "close"):
                break
            if len(tasks) >= 16:
                raise RuntimeError("trainer_unavailable")
            task = asyncio.create_task(command(value))
            tasks.add(task)
            task.add_done_callback(tasks.discard)
    finally:
        # No DB close or lock release here. The parent waits for process exit,
        # and retains unknown receipts if a worker fails to drain.
        await owner.close()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


def main():
    peer = Peer()
    peer.start()
    try:
        asyncio.run(serve(peer))
        return 0
    except Exception as error:
        try:
            peer.send({"type": "fatal", "error": safe_error(error)})
        except Exception:
            pass
        return 1
    finally:
        peer.close()


if __name__ == "__main__":
    raise SystemExit(main())
