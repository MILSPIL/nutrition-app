"""Behavior tests; the caller must use an isolated HOME and pinned native source."""
import json
import unittest
from types import SimpleNamespace
from hermes_personal_provider import register_parent_provider, ParentProviderClient, BrokerRefusal

MODEL = "synthetic-model"


class PersonalProviderTests(unittest.TestCase):
    def test_real_native_client_seam_returns_ipc_client_without_standard_fallback(self):
        from agent.agent_runtime_helpers import _provider_supplied_client
        calls = []
        profile = register_parent_provider(lambda value, **_options: calls.append(value) or self.response(), MODEL,
            supports_vision=True, supports_tools=True)
        client = _provider_supplied_client(SimpleNamespace(provider=profile.name), {"base_url": profile.base_url})
        self.assertIsInstance(client, ParentProviderClient)
        response = client.chat.completions.create(model=MODEL, messages=[{"role": "user", "content": "test"}])
        self.assertEqual(response.choices[0].message.content, "synthetic reply")
        self.assertEqual(len(calls), 1)

    @staticmethod
    def response():
        return {"id": "synthetic-completion", "object": "chat.completion", "created": 1, "model": MODEL,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "synthetic reply"}, "finish_reason": "stop"}]}

    def test_broken_factory_still_returns_refusing_client_so_no_network_fallback(self):
        from agent.agent_runtime_helpers import _provider_supplied_client
        profile = register_parent_provider(None, MODEL, supports_vision=False, supports_tools=True)
        client = _provider_supplied_client(SimpleNamespace(provider=profile.name), {"base_url": profile.base_url})
        self.assertIsNotNone(client)
        with self.assertRaisesRegex(BrokerRefusal, "trainer_unavailable"):
            client.chat.completions.create(model=MODEL, messages=[])

    def test_another_model_url_headers_or_invalid_payload_never_reach_payer(self):
        calls = []
        client = ParentProviderClient(lambda value, **_options: calls.append(value) or self.response(), MODEL)
        for override in [{"model": "another-model"}, {"base_url": "https://unapproved.example"},
                         {"api_key": "never-forward"}, {"extra_headers": {"Authorization": "never-forward"}},
                         {"messages": "not-a-list"}, {"temperature": float("nan")}, {"stream": "true"}]:
            with self.assertRaises(BrokerRefusal):
                client.chat.completions.create(**{"model": MODEL, "messages": [], **override})
        self.assertEqual(calls, [])

    def test_real_openai_chunk_objects_preserve_tool_calls_and_partial_failure_has_no_fallback(self):
        closed = []
        def chunks():
            try:
                yield {"id": "s", "object": "chat.completion.chunk", "created": 1, "model": MODEL,
                    "choices": [{"index": 0, "delta": {"tool_calls": [{"index": 0, "id": "tool-1", "type": "function", "function": {"name": "food_lookup", "arguments": "{}"}}]}, "finish_reason": None}]}
                raise RuntimeError("Bearer never-print-this-token")
            finally:
                closed.append(True)
        client = ParentProviderClient(lambda _value, **_options: chunks(), MODEL)
        stream = client.chat.completions.create(model=MODEL, messages=[], stream=True)
        chunk = next(stream)
        self.assertEqual(chunk.choices[0].delta.tool_calls[0].function.name, "food_lookup")
        with self.assertRaisesRegex(BrokerRefusal, "^trainer_unavailable$"):
            next(stream)
        self.assertEqual(closed, [True])

    def test_payload_is_detached_and_iterator_close_failure_is_redacted(self):
        messages = [{"role": "user", "content": "original"}]
        seen = []
        client = ParentProviderClient(lambda value, **_options: seen.append(value) or self.response(), MODEL)
        client.chat.completions.create(model=MODEL, messages=messages)
        messages[0]["content"] = "changed"
        self.assertEqual(seen[0]["messages"][0]["content"], "original")
        class BrokenStream:
            def __iter__(self):
                return iter([])
            def close(self):
                raise RuntimeError("Bearer never-print")
        client = ParentProviderClient(lambda _value, **_options: BrokenStream(), MODEL)
        with self.assertRaisesRegex(BrokerRefusal, "^trainer_unavailable$"):
            list(client.chat.completions.create(model=MODEL, messages=[], stream=True))

    def test_sdk_transport_timeouts_stay_separate_from_model_payload(self):
        import httpx
        seen = []
        def bridge(value, **options):
            seen.append((value, options))
            return self.response()
        client = ParentProviderClient(bridge, MODEL)
        client.chat.completions.create(model=MODEL, messages=[], timeout=httpx.Timeout(8, connect=2))
        self.assertNotIn("timeout", seen[0][0])
        self.assertEqual(seen[0][1]["client_options"]["timeout"], {"connect": 2, "read": 8, "write": 8, "pool": 8})
        for timeout in [float("nan"), -1, "unbounded"]:
            with self.assertRaises(BrokerRefusal):
                client.chat.completions.create(model=MODEL, messages=[], timeout=timeout)

    def test_native_sentinels_are_removed_without_changing_explicit_null(self):
        from openai import NOT_GIVEN, omit
        seen = []
        client = ParentProviderClient(lambda value, **_options: seen.append(value) or self.response(), MODEL)
        client.chat.completions.create(model=MODEL, messages=[], temperature=NOT_GIVEN, stop=omit, seed=None)
        self.assertNotIn("temperature", seen[0]); self.assertNotIn("stop", seen[0]); self.assertIsNone(seen[0]["seed"])
        json.dumps(seen[0], allow_nan=False)


if __name__ == "__main__":
    unittest.main()
