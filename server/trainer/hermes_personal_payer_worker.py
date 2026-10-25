"""Private trusted-payer IPC. No public HTTP surface or profile tools."""
import os
from pathlib import Path
import re
import sys
from hermes_personal_ipc import Peer
sys.stdout = sys.stderr


def main():
    peer, payer = Peer(), None
    peer.start()
    allowed = {"trainer_unavailable", "trainer_timeout", "trainer_quota", "connection_auth_required", "connection_model_changed", "model_payload_invalid"}
    try:
        setup = peer.commands.get()
        if setup.get("type") != "setup" or set(setup) - {"type", "id", "files", "revision"}:
            raise RuntimeError("invalid_request")
        from hermes_personal_payer import NativePayer
        payer = NativePayer(home=Path(os.environ["HERMES_HOME"]), material=setup["files"], revision=setup["revision"],
            callback=lambda kind, data: peer.ask(kind, data))
        peer.send({"type": "result", "id": setup["id"], "result": payer.identity})
        while not peer.closed.is_set():
            value = peer.commands.get()
            if value.get("type") in ("close", "orphan"):
                break
            ident = value.get("id")
            if not isinstance(ident, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", ident):
                raise RuntimeError("invalid_request")
            try:
                if value.get("type") != "invoke" or set(value) - {"id", "type", "payload", "clientOptions", "timeoutMs"}:
                    raise RuntimeError("invalid_request")
                result = payer.invoke(value["payload"], client_options=value.get("clientOptions", {}), timeout_ms=value["timeoutMs"])
                peer.send({"type": "result", "id": ident, "result": result})
            except Exception as error:
                code = str(error)
                peer.send({"type": "result", "id": ident, "error": code if code in allowed else "trainer_unavailable"})
        return 0
    except Exception:
        # Native exception bodies can include credentials. Protocol failure is
        # intentionally opaque; setup timeout/physical exit is handled above.
        return 1
    finally:
        if payer:
            payer.close()
        peer.close()


if __name__ == "__main__":
    raise SystemExit(main())
