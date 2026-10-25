"""Native selection/resolver/Codex SDK against synthetic HTTPX transport only."""
import base64
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx
import hermes_personal_payer as module
import hermes_personal_connection as connection
from hermes_personal_payer import NativePayer
from hermes_personal_provider import ParentProviderClient

MODEL = "synthetic-codex-model"


class NativePayerTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.TemporaryDirectory(prefix="payer-", dir=os.environ["SCISENSE_FIXTURE_ROOT"])
        self.home = Path(self.root.name).resolve(); self.home.chmod(0o700)
        self.env = patch.dict(os.environ, {"HERMES_HOME": str(self.home)})
        self.env.start()
        self.patches = [patch.object(module, "assert_tmpfs_home", return_value=self.home),
                        patch.object(connection, "assert_tmpfs_home", return_value=self.home)]
        for current in self.patches:
            current.start()
        self.calls, self.events, self.payer = [], [], None

    def tearDown(self):
        if self.payer:
            self.payer.close()
        for current in reversed(self.patches):
            current.stop()
        self.env.stop(); self.root.cleanup()

    def start(self, *, provider="openai-codex", model=MODEL):
        token = "synthetic." + base64.urlsafe_b64encode(json.dumps({"exp": 4102444800}).encode()).decode().rstrip("=") + ".signature"
        config = {"model": {"default": model, "provider": provider}, "auth": {"adopt_external_logins": False},
            "model_overrides": {provider: {model: {"supports_tools": True, "supports_vision": True, "context_window": 128000}}}}
        files = {"config.yaml": json.dumps(config).encode(), "auth.json": json.dumps({"version": 1, "providers": {"openai-codex": {"tokens": {"access_token": token, "refresh_token": "synthetic-refresh"}}}}).encode()}
        revision = [1]
        def callback(kind, value):
            self.events.append((kind, value))
            if kind == "budget":
                return {"accepted": True}
            self.assertEqual(value["options"]["expectedRevision"], revision[0]); revision[0] += 1
            return {"phase": "ready", "revision": revision[0]}
        self.payer = NativePayer(home=self.home, material={key: base64.b64encode(data).decode() for key, data in files.items()}, revision=1, callback=callback)
        return self.payer

    def transport(self, request):
        self.calls.append(request)
        self.assertEqual(request.method, "POST")
        self.assertTrue(str(request.url).endswith("/responses"))
        raw = request.read()
        if request.headers.get("content-encoding") == "zstd":
            from compression.zstd import decompress
            raw = decompress(raw)
        self.assertEqual(json.loads(raw)["model"], MODEL)
        item = {"id": "synthetic-message", "type": "message", "role": "assistant", "status": "completed", "phase": "final_answer",
                "content": [{"type": "output_text", "text": "Синтетична відповідь", "annotations": []}]}
        events = [{"type": "response.output_item.done", "output_index": 0, "item": item},
            {"type": "response.completed", "response": {"id": "synthetic-response", "object": "response", "model": MODEL, "status": "completed", "output": [item],
                "usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}}}]
        body = b"".join(b"data: " + json.dumps(event).encode() + b"\n\n" for event in events)
        return httpx.Response(200, headers={"Content-Type": "text/event-stream"}, content=body)

    def test_native_codex_selection_sdk_raw_proof_and_parent_provider_roundtrip(self):
        payer = self.start()
        with patch.object(httpx.HTTPTransport, "handle_request", lambda _transport, request: self.transport(request)):
            for stream in (False, True):
                client = ParentProviderClient(lambda payload, client_options: self._bridge(payer, payload, client_options), MODEL)
                value = client.chat.completions.create(model=MODEL, messages=[{"role": "user", "content": "synthetic"}], stream=stream)
                if stream:
                    self.assertEqual(list(value)[0].choices[0].delta.content, "Синтетична відповідь")
                else:
                    self.assertEqual(value.choices[0].message.content, "Синтетична відповідь")
        self.assertEqual(payer.identity["provider"], "openai-codex")
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(len([event for event in self.events if event[0] == "budget"]), 2)

    def _bridge(self, payer, payload, options):
        result = payer.invoke(payload, client_options=options, timeout_ms=20000)
        self.assertTrue(result["proof"]["rawTerminalModelVerified"])
        return iter(result["chunks"]) if payload.get("stream") else result["completion"]

    def test_auto_selection_is_refused_and_cannot_spend_through_fallback(self):
        with self.assertRaisesRegex(RuntimeError, "connection_auth_required"):
            self.start(provider="anthropic")
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
