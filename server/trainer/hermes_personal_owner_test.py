"""Actual native owner, two channels, persistence and restricted tool execution."""
import asyncio
import json
import os
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
from hermes_personal_owner import PersonalOwner

MODEL = "synthetic-model"
CONNECTION = {"model": MODEL, "contextWindow": 128000, "supportsTools": True, "supportsVision": True}
SCHEMAS = json.loads(Path(os.environ["SCISENSE_TEST_SCHEMAS"]).read_text())


class PersistentOwnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_grants_and_foreign_pool_cannot_enter_personal_profile(self):
        from hermes_personal_owner import _private_directory
        home = Path(os.environ["HERMES_HOME"]).resolve()
        auth = home / "auth.json"
        original = auth.read_bytes() if auth.exists() else None
        try:
            from agent.credential_persistence import fingerprint_secret_value
            from hermes_personal_provider import IPC_SENTINEL
            sentinel = {"id": "synthetic", "source": "env:SCISENSE_IPC_KEY", "label": "SCISENSE_IPC_KEY",
                "auth_type": "api_key", "base_url": "http://hermes.invalid/v1", "secret_fingerprint": fingerprint_secret_value(IPC_SENTINEL)}
            cases = [
                {"providers": {}, "version": {"access_token": "synthetic-not-allowed"}},
                {"providers": {}, "version": 1, "updated_at": {"access_token": "synthetic-not-allowed"}},
                {"providers": [], "version": 1},
                {"providers": {}, "credential_pool": {"scisense-shared": [{**sentinel, "extra_metadata": {"access_token": "synthetic-not-allowed"}}]}},
                {"providers": {}, "credential_pool": {"scisense-shared": [{**sentinel, "request_count": {"access_token": "synthetic-not-allowed"}}]}},
                {"providers": {}, "credential_pool": {"scisense-shared": [{**sentinel, "model_cooldowns": {"secret": "synthetic-not-allowed"}}]}},
                {"providers": {"openai-codex": {"tokens": {"access_token": "synthetic-not-allowed"}}}},
                {"providers": {}, "credential_pool": {"openai-codex": []}},
                {"providers": {}, "credential_pool": {"scisense-shared": [{"source": "manual", "access_token": "synthetic-not-allowed"}]}},
            ]
            for value in cases:
                value.setdefault("version", 1)
                auth.write_text(json.dumps(value)); auth.chmod(0o600)
                with self.assertRaisesRegex(RuntimeError, "personal_credentials_forbidden"):
                    _private_directory(home)
        finally:
            if original is None:
                auth.unlink(missing_ok=True)
            else:
                auth.write_bytes(original)

    async def test_shutdown_never_releases_process_fence_even_if_native_stop_returns_with_live_writer(self):
        from gateway.runtime_ownership import process_ownership
        home = Path(os.environ["HERMES_HOME"]).resolve()
        events = []
        async def broken_channel():
            events.append("channel"); raise RuntimeError("synthetic channel error")
        async def stopped():
            events.append("stop")
        async def stop_failed():
            events.append("stop-failed"); raise RuntimeError("synthetic stop error")
        def owner():
            return PersonalOwner(home=home, connection=CONNECTION, model_bridge=lambda *_a, **_k: None,
                tool_handler=lambda *_a: None, tool_schemas=SCHEMAS, on_event=lambda *_a: None)
        first = owner()
        first.runner = SimpleNamespace(stop=stopped, live_writer=True)
        first._claimed = True
        transport = SimpleNamespace(closed=False)
        first.connections["desktop:one"] = (SimpleNamespace(close=broken_channel), transport)
        with patch("hermes_state_registry.close_all_under", side_effect=lambda *_a: events.append("db-close")), patch.object(process_ownership, "release", side_effect=lambda *_a: events.append("release")):
            with self.assertRaisesRegex(RuntimeError, "owner_channel_close_failed"):
                await first.close()
        self.assertEqual(events, ["channel", "stop"])
        self.assertTrue(transport.closed)
        events.clear()
        second = owner(); second.runner = SimpleNamespace(stop=stop_failed); second._claimed = True
        with patch("hermes_state_registry.close_all_under", side_effect=lambda *_a: events.append("db-close")), patch.object(process_ownership, "release", side_effect=lambda *_a: events.append("release")):
            with self.assertRaisesRegex(RuntimeError, "owner_shutdown_incomplete"):
                await second.close()
            with self.assertRaisesRegex(RuntimeError, "owner_shutdown_incomplete"):
                await second.close()
        self.assertEqual(events, ["stop-failed"])

    async def test_unstarted_owner_cannot_release_or_mutate_active_process(self):
        from gateway.runtime_ownership import process_ownership
        home = Path(os.environ["HERMES_HOME"]).resolve()
        owner = PersonalOwner(home=home, connection=CONNECTION, model_bridge=lambda *_a, **_k: None,
            tool_handler=lambda *_a: None, tool_schemas=SCHEMAS, on_event=lambda *_a: None)
        with patch("hermes_personal_owner._process_owner", object()), patch("hermes_personal_owner.register_parent_provider") as register, patch.object(process_ownership, "reserve") as reserve, patch.object(process_ownership, "release") as release, patch("hermes_state_registry.close_all_under") as close_db:
            with self.assertRaisesRegex(RuntimeError, "personal_owner_conflict"):
                await owner.start()
            self.assertEqual(await owner.close(), {"requiresProcessExit": False})
            register.assert_not_called(); reserve.assert_not_called(); release.assert_not_called(); close_db.assert_not_called()

    async def test_z_two_channels_and_fresh_process_restart_preserve_native_messages(self):
        home = Path(os.environ["HERMES_HOME"]).resolve()
        calls, tools, events = [], [], []
        def completion(payload, **_client_options):
            calls.append(payload)
            if len(calls) > 3:
                raise RuntimeError("trainer_quota")
            tool_done = any(message.get("role") == "tool" for message in payload["messages"])
            message = {"role": "assistant", "content": "Синтетичний підсумок збережено у спільній історії."}
            reason = "stop"
            if not tool_done:
                message = {"role": "assistant", "content": None, "tool_calls": [{"id": "synthetic-tool-call", "type": "function", "function": {"name": "read_confirmed_day", "arguments": '{"dayRef":"today"}'}}]}
                reason = "tool_calls"
            value = {"id": "synthetic-completion", "object": "chat.completion", "created": 1, "model": MODEL,
                "choices": [{"index": 0, "message": message, "finish_reason": reason}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}
            if payload.get("stream"):
                delta = dict(message)
                if "tool_calls" in delta:
                    delta["tool_calls"] = [{"index": index, **call} for index, call in enumerate(delta["tool_calls"])]
                return iter([{**value, "object": "chat.completion.chunk", "choices": [{"index": 0, "delta": delta, "finish_reason": reason}]}])
            return value
        def tool(name, arguments):
            tools.append((name, arguments))
            return {"targetDate": "2026-10-25", "totals": {"cal": 123, "p": 10, "f": 3, "c": 14}}
        def owner():
            return PersonalOwner(home=home, connection=CONNECTION, model_bridge=completion,
                tool_handler=tool, tool_schemas=SCHEMAS, on_event=lambda channel, event: events.append((channel, event)))
        first = owner()
        try:
            await first.start()
            if os.environ.get("SCISENSE_OWNER_STAGE") == "reopen":
                expected = json.loads(Path(os.environ["SCISENSE_TEST_EXPECTED"]).read_text())
                reopened = await first.bot("desktop:two")
                self.assertEqual(reopened["session_id"], expected["sid"])
                self.assertEqual(reopened["messages"], expected["messages"])
                self.assertEqual(calls, [])
                return
            web = await first.bot("web")
            desktop = await first.bot("desktop:one")
            self.assertEqual(web["session_id"], desktop["session_id"])
            sid = web["session_id"]
            receipt = await first.rpc("web", "prompt.submit", {"session_id": sid,
                "submission_id": "persistent-owner-synthetic-input", "text": "Покажи синтетичний підсумок.",
                "api_text": "Покажи синтетичний підсумок. Synthetic context only; use read_confirmed_day."})
            for _ in range(300):
                current = await first.rpc("web", "prompt.receipt", {"session_id": sid, "admission_id": receipt["admission_id"], "include_result": True})
                if current["status"] in ("terminal", "unknown"):
                    break
                await asyncio.sleep(0.05)
            self.assertEqual(current["status"], "terminal", current)
            history = await first.rpc("desktop:one", "session.resume", {"session_id": sid})
            messages = history["messages"]
            self.assertTrue(any("Синтетичний підсумок" in str(message) for message in messages), {"messages": messages, "receipt": current, "modelCalls": len(calls), "tools": tools})
            self.assertEqual(len(calls), 2)
            self.assertEqual(tools, [("read_confirmed_day", {"dayRef": "today"})])
            with self.assertRaisesRegex(RuntimeError, "profile_mismatch"):
                await first.rpc("desktop:one", "session.resume", {"session_id": sid, "profile": "another-profile"})
            await first.bot("desktop:two")
            await first.close_channel("desktop:one")
            other = await first.bot("desktop:two")
            self.assertEqual(other["session_id"], sid)
            Path(os.environ["SCISENSE_TEST_EXPECTED"]).write_text(json.dumps({"sid": sid, "messages": messages}))
            with self.assertRaisesRegex(RuntimeError, "personal_owner_conflict"):
                await owner().start()
        finally:
            await first.close()


if __name__ == "__main__":
    unittest.main()
