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
            if kind == "diagnostic":
                return {"recorded": True}
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

    def test_native_codex_unbuffered_sse_stream_retains_physical_proof(self):
        payer = self.start()
        class FragmentedStream(httpx.SyncByteStream):
            def __init__(self, body): self.body = body
            def __iter__(self):
                for start in range(0, len(self.body), 17): yield self.body[start:start + 17]
        def transport(_transport, request):
            response = self.transport(request)
            return httpx.Response(200, headers=response.headers, stream=FragmentedStream(response.content))
        with patch.object(httpx.HTTPTransport, "handle_request", transport):
            client = ParentProviderClient(lambda payload, client_options: self._bridge(payer, payload, client_options), MODEL)
            for stream in (False, True):
                value = client.chat.completions.create(model=MODEL, messages=[{"role": "user", "content": "synthetic"}], stream=stream)
                self.assertEqual(list(value)[0].choices[0].delta.content if stream else value.choices[0].message.content, "Синтетична відповідь")
        self.assertEqual(len(self.calls), 2)

    def test_native_codex_sse_without_event_stream_header_retains_raw_model_proof(self):
        payer = self.start()
        class FragmentedStream(httpx.SyncByteStream):
            def __init__(self, body): self.body = body
            def __iter__(self):
                for start in range(0, len(self.body), 2): yield self.body[start:start + 2]
        def transport(_transport, request):
            response = self.transport(request)
            return httpx.Response(200, stream=FragmentedStream(response.content))
        with patch.object(httpx.HTTPTransport, "handle_request", transport):
            result = payer.invoke({"model": MODEL, "messages": [{"role": "user", "content": "synthetic"}]}, client_options={}, timeout_ms=10000)
        self.assertEqual(result["completion"]["choices"][0]["message"]["content"], "Синтетична відповідь")
        self.assertTrue(result["proof"]["rawTerminalModelVerified"])
        self.assertEqual(len(self.calls), 1)

    def _bridge(self, payer, payload, options):
        result = payer.invoke(payload, client_options=options, timeout_ms=20000)
        self.assertTrue(result["proof"]["rawTerminalModelVerified"])
        return iter(result["chunks"]) if payload.get("stream") else result["completion"]

    def test_unverified_response_reports_metadata_without_prompt_or_provider_text(self):
        payer = self.start()
        def transport(_transport, request):
            response = self.transport(request)
            return httpx.Response(200, headers=response.headers, content=response.content.replace(json.dumps(MODEL).encode(), b'null'))
        with patch.object(httpx.HTTPTransport, "handle_request", transport):
            with self.assertRaisesRegex(RuntimeError, "^model_payload_invalid$"):
                payer.invoke({"model": MODEL, "messages": [{"role": "user", "content": "synthetic private prompt"}]}, client_options={}, timeout_ms=10000)
        diagnostic = [value for kind, value in self.events if kind == "diagnostic"][-1]
        self.assertEqual(diagnostic["stage"], "proof")
        self.assertTrue(diagnostic["responses"][0]["terminalSeen"])
        self.assertFalse(diagnostic["responses"][0]["terminalModelSeen"])
        self.assertNotIn("prompt", json.dumps(diagnostic))
        self.assertNotIn(MODEL, json.dumps(diagnostic))

    def test_auto_selection_is_refused_and_cannot_spend_through_fallback(self):
        with self.assertRaisesRegex(RuntimeError, "connection_auth_required"):
            self.start(provider="anthropic")
        self.assertEqual(self.calls, [])


    def test_native_model_picker_and_selection_never_call_a_provider(self):
        payer = self.start()
        from types import SimpleNamespace
        compatible = SimpleNamespace(supports_tools=True, supports_vision=True, context_window=128000)
        with patch("hermes_cli.codex_models.get_codex_model_ids", return_value=[MODEL, "synthetic-next"]), patch("agent.models_dev.get_model_capabilities", return_value=compatible):
            options = payer.model_options()
            self.assertEqual(options["providers"][0]["models"], [MODEL, "synthetic-next"])
            self.assertEqual(payer.select_model("openai-codex", "synthetic-next")["changed"], True)
        self.assertEqual(self.calls, [])
        checkpoints = [value for kind, value in self.events if kind == "credentials"]
        self.assertEqual(len(checkpoints), 1)
        from ruamel.yaml import YAML
        config = YAML(typ="safe").load(base64.b64decode(checkpoints[0]["files"]["config.yaml"]))
        self.assertEqual(config["model"]["default"], "synthetic-next")
        self.assertEqual(config["model"]["provider"], "openai-codex")
        self.assertIn("auth.json", checkpoints[0]["files"])
        with self.assertRaises(RuntimeError):
            payer.invoke({}, client_options={}, timeout_ms=1000)

    def test_unsupported_selection_cannot_change_routing_or_checkpoint(self):
        payer = self.start()
        before = (self.home / "config.yaml").read_bytes()
        for provider, model in (("anthropic", MODEL), ("openai-codex", "synthetic-unlisted")):
            with self.assertRaisesRegex(RuntimeError, "model_selection_refused"):
                payer.select_model(provider, model)
        self.assertEqual((self.home / "config.yaml").read_bytes(), before)
        self.assertEqual(self.events, [])

    def test_api_only_model_metadata_is_not_a_codex_subscription_catalog(self):
        payer = self.start()
        from types import SimpleNamespace
        compatible = SimpleNamespace(supports_tools=True, supports_vision=True, context_window=128000)
        with patch("agent.models_dev.list_provider_models", return_value=["synthetic-api-only-pro"]) as public_catalog, patch("hermes_cli.codex_models.get_codex_model_ids", return_value=[MODEL]) as codex_catalog, patch("agent.models_dev.get_model_capabilities", return_value=compatible):
            self.assertEqual(payer.model_options()["providers"][0]["models"], [MODEL])
            with self.assertRaisesRegex(RuntimeError, "model_selection_refused"):
                payer.select_model("openai-codex", "synthetic-api-only-pro")
            public_catalog.assert_not_called()
            codex_catalog.assert_called_with(access_token=None)
        self.assertEqual(self.calls, [])

    def test_real_native_cold_catalog_and_selected_metadata_survive_a_fresh_home(self):
        payer = self.start()
        self.assertIn("gpt-6-sol", payer.model_options()["providers"][0]["models"])
        payer.select_model("openai-codex", "gpt-6-sol")
        from ruamel.yaml import YAML
        selected_config = YAML(typ="safe").load((self.home / "config.yaml").read_text())
        self.assertEqual(selected_config["model_overrides"]["openai-codex"]["gpt-6-sol"]["context_window"], 272000)
        checkpoint = [value for kind, value in self.events if kind == "credentials"][-1]
        revision = payer.bridge.revision
        payer.close()
        fresh = self.home / "fresh-home"; fresh.mkdir(mode=0o700)
        with patch.object(module, "assert_tmpfs_home", return_value=fresh), patch.object(connection, "assert_tmpfs_home", return_value=fresh), patch.dict(os.environ, {"HERMES_HOME": str(fresh)}), patch("agent.models_dev._models_dev_cache", {}):
            self.payer = NativePayer(home=fresh, material=checkpoint["files"], revision=revision,
                callback=lambda *_args: self.fail("a metadata read cannot call a provider or checkpoint"))
            self.assertEqual(self.payer.identity["model"], "gpt-6-sol")
            self.assertTrue(self.payer.identity["supportsVision"])
            self.assertEqual(self.payer.identity["contextWindow"], 272000)
            self.assertIn("gpt-6-sol", self.payer.model_options()["providers"][0]["models"])
        self.assertEqual(self.calls, [])

    def test_selection_checkpoint_failure_blocks_the_current_producer(self):
        payer = self.start()
        from types import SimpleNamespace
        compatible = SimpleNamespace(supports_tools=True, supports_vision=True, context_window=128000)
        with patch("hermes_cli.codex_models.get_codex_model_ids", return_value=["synthetic-next"]), patch("agent.models_dev.get_model_capabilities", return_value=compatible), patch.object(payer.bridge, "checkpoint", side_effect=OSError("synthetic storage fault")):
            with self.assertRaises(OSError):
                payer.select_model("openai-codex", "synthetic-next")
        self.assertTrue(payer.bridge.blocked)
        with self.assertRaises(RuntimeError):
            payer.invoke({}, client_options={}, timeout_ms=1000)
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
