"""Physical HTTPX transport attempts, native SDK retries and raw model proof."""
import asyncio
import json
import gzip
import unittest
from types import SimpleNamespace
import httpx
from openai import OpenAI, RateLimitError, APIConnectionError
from hermes_personal_egress import HTTPXEgressGuard
from hermes_personal_provider import BrokerRefusal

MODEL, BASE = "synthetic-model", "https://synthetic.invalid/v1"


class EgressTests(unittest.TestCase):
    def fixture(self, handler, **options):
        posts, grants = [], []
        def transport(request):
            posts.append(request)
            return handler(request)
        def authorize(value):
            grants.append(value); return {"accepted": True}
        guard = HTTPXEgressGuard(model=MODEL, authorize_post=authorize,
            credential_guard=SimpleNamespace(ensure_ready=lambda **_k: None), **options)
        guard.bind_runtime(BASE)
        return guard, httpx.MockTransport(transport), posts, grants

    @staticmethod
    def result(model=MODEL):
        return {"id": "synthetic", "object": "chat.completion", "created": 1, "model": model,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "synthetic"}, "finish_reason": "stop"}]}

    def test_real_sdk_retries_each_consume_a_physical_reservation(self):
        guard, transport, posts, grants = self.fixture(lambda _r: httpx.Response(429, json={"error": {"message": "synthetic quota", "type": "rate_limit_error"}}))
        with guard, httpx.Client(transport=transport) as http, OpenAI(api_key="synthetic-token", base_url=BASE, http_client=http, max_retries=2) as client:
            with self.assertRaises(RateLimitError):
                client.chat.completions.create(model=MODEL, messages=[{"role": "user", "content": "synthetic"}])
        self.assertEqual(len(posts), 3); self.assertEqual(len(grants), 3)
        self.assertTrue(all(set(grant) == {"kind", "model", "originHash"} for grant in grants))

    def test_extra_body_model_override_is_refused_before_sdk_transport(self):
        guard, transport, posts, grants = self.fixture(lambda _r: httpx.Response(200, json=self.result()))
        with guard, httpx.Client(transport=transport) as http, OpenAI(api_key="synthetic-token", base_url=BASE, http_client=http, max_retries=0) as client:
            with self.assertRaises(APIConnectionError) as caught:
                client.chat.completions.create(model=MODEL, messages=[], extra_body={"model": "another-model"})
            self.assertIsInstance(caught.exception.__cause__, BrokerRefusal)
            with self.assertRaisesRegex(BrokerRefusal, "connection_model_changed"):
                guard.proof()
        self.assertEqual(posts, []); self.assertEqual(grants, [])

    def test_raw_terminal_model_cannot_be_hidden_by_a_normalized_echo(self):
        guard, transport, posts, _grants = self.fixture(lambda _r: httpx.Response(200, json=self.result("another-model")))
        with guard, httpx.Client(transport=transport) as client:
            client.post(BASE + "/chat/completions", json={"model": MODEL})
            normalized_echo = {"model": MODEL}
            self.assertEqual(normalized_echo["model"], MODEL)
            with self.assertRaisesRegex(BrokerRefusal, "connection_model_changed"):
                guard.proof()
        self.assertEqual(len(posts), 1)

    def test_stream_terminal_response_and_pretty_json_have_physical_model_proof(self):
        sse = b'data: {"type":"response.completed","response":{"model":"synthetic-model"}}\n\n'
        for response in [httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=httpx.ByteStream(sse)),
                         httpx.Response(200, headers={"content-type": "application/json"}, stream=httpx.ByteStream(json.dumps(self.result(), indent=2).encode()))]:
            guard, transport, _, _ = self.fixture(lambda _r: response)
            with guard, httpx.Client(transport=transport) as client:
                client.post(BASE + "/responses", json={"model": MODEL})
                self.assertEqual(guard.proof(), {"model": MODEL, "physicalPostAttempts": 1, "reservedPostAttempts": 1, "rawTerminalModelVerified": True})

    def test_post_cap_and_redirect_fence_never_reach_another_host(self):
        guard, transport, posts, grants = self.fixture(lambda _r: httpx.Response(200, json=self.result()))
        with guard, httpx.Client(transport=transport) as client:
            for _ in range(3):
                client.post(BASE + "/chat/completions", json={"model": MODEL})
            with self.assertRaisesRegex(BrokerRefusal, "trainer_quota"):
                client.post(BASE + "/chat/completions", json={"model": MODEL})
        self.assertEqual(len(posts), 3); self.assertEqual(len(grants), 3)
        guard, transport, posts, _ = self.fixture(lambda _r: httpx.Response(307, headers={"location": "https://another.invalid/responses"}))
        with guard, httpx.Client(transport=transport, follow_redirects=True) as client:
            with self.assertRaisesRegex(BrokerRefusal, "model_payload_invalid"):
                client.post(BASE + "/responses", json={"model": MODEL})
        self.assertEqual(len(posts), 1)

    def test_independent_stage_timeouts_and_overall_deadline_survive_sdk_normalization(self):
        stages = []
        guard, transport, _, _ = self.fixture(lambda request: stages.append(request.extensions["timeout"]) or httpx.Response(200, json=self.result()),
            timeout_options={"timeout": {"connect": 2, "read": 8, "write": None, "pool": 1}}, clock=lambda: 0)
        with guard, httpx.Client(transport=transport) as client:
            client.post(BASE + "/responses", json={"model": MODEL})
        self.assertEqual(stages, [{"connect": 2, "read": 8, "write": 45, "pool": 1}])
        guard, transport, posts, _ = self.fixture(lambda _r: httpx.Response(200, json=self.result()), clock=lambda: 0)
        guard.clock = lambda: 46
        with guard, httpx.Client(transport=transport) as client:
            with self.assertRaisesRegex(BrokerRefusal, "trainer_timeout"):
                client.post(BASE + "/responses", json={"model": MODEL})
        self.assertEqual(posts, [])

    def test_async_physical_send_has_same_budget_and_model_observer(self):
        async def check():
            guard, transport, posts, grants = self.fixture(lambda _r: httpx.Response(200, json=self.result()))
            with guard:
                async with httpx.AsyncClient(transport=transport) as client:
                    await client.post(BASE + "/chat/completions", json={"model": MODEL})
                self.assertTrue(guard.proof()["rawTerminalModelVerified"])
            self.assertEqual(len(posts), 1); self.assertEqual(len(grants), 1)
        asyncio.run(check())

    def test_query_credentials_and_wrong_grant_state_are_refused_before_egress(self):
        guard, transport, posts, _ = self.fixture(lambda _r: httpx.Response(200, json=self.result()))
        with guard, httpx.Client(transport=transport) as client:
            with self.assertRaisesRegex(BrokerRefusal, "model_payload_invalid"):
                client.post(BASE + "/responses?api_key=synthetic-never-send", json={"model": MODEL})
        self.assertEqual(posts, [])
        guard, transport, posts, _ = self.fixture(lambda _r: httpx.Response(200, json=self.result()))
        def refused(**_kwargs):
            raise RuntimeError("connection_auth_required")
        guard.credential_guard = SimpleNamespace(ensure_ready=refused)
        with guard, httpx.Client(transport=transport) as client:
            with self.assertRaisesRegex(BrokerRefusal, "connection_auth_required"):
                client.post(BASE + "/responses", json={"model": MODEL})
        self.assertEqual(posts, [])

    def test_gzip_stream_observation_keeps_original_bytes_for_sdk_sync_and_async(self):
        payload = b'data: {"type":"response.completed","response":{"model":"synthetic-model"}}\n\n'
        compressed = gzip.compress(payload)
        def response():
            return httpx.Response(200, headers={"content-type": "text/event-stream", "content-encoding": "gzip"}, stream=httpx.ByteStream(compressed))
        guard, transport, _, _ = self.fixture(lambda _r: response())
        with guard, httpx.Client(transport=transport) as client:
            result = client.post(BASE + "/responses", json={"model": MODEL})
            self.assertEqual(result.content, payload)
            self.assertTrue(guard.proof()["rawTerminalModelVerified"])
        async def check():
            guard, transport, _, _ = self.fixture(lambda _r: response())
            with guard:
                async with httpx.AsyncClient(transport=transport) as client:
                    result = await client.post(BASE + "/responses", json={"model": MODEL})
                    self.assertEqual(result.content, payload)
                    self.assertTrue(guard.proof()["rawTerminalModelVerified"])
        asyncio.run(check())

    def test_delayed_reservation_is_counted_but_cannot_send_past_deadline(self):
        now, grants, posts = [0], [], []
        def authorize(value):
            grants.append(value); now[0] = 46; return {"accepted": True}
        guard = HTTPXEgressGuard(model=MODEL, authorize_post=authorize, credential_guard=SimpleNamespace(ensure_ready=lambda **_k: None), clock=lambda: now[0])
        guard.bind_runtime(BASE)
        with guard, httpx.Client(transport=httpx.MockTransport(lambda request: posts.append(request) or httpx.Response(200, json=self.result()))) as client:
            with self.assertRaisesRegex(BrokerRefusal, "trainer_timeout"):
                client.post(BASE + "/responses", json={"model": MODEL})
        self.assertEqual(len(grants), 1); self.assertEqual(posts, [])
        self.assertEqual(guard.posts, 1); self.assertEqual(guard.sends, 0)

    def test_previous_success_cannot_hide_unverified_or_unfinished_success(self):
        number = [0]
        def handler(_r):
            number[0] += 1
            return httpx.Response(200, json=self.result() if number[0] == 1 else {})
        guard, transport, _, _ = self.fixture(handler)
        with guard, httpx.Client(transport=transport) as client:
            client.post(BASE + "/responses", json={"model": MODEL})
            client.post(BASE + "/responses", json={"model": MODEL})
            with self.assertRaisesRegex(BrokerRefusal, "model_payload_invalid"):
                guard.proof()

    def test_abandoned_private_fragment_is_discarded_without_turning_into_proof(self):
        fragment = b'{"private":"synthetic-private-fragment'
        guard, transport, _, _ = self.fixture(lambda _r: httpx.Response(200, stream=httpx.ByteStream(fragment)))
        with guard, httpx.Client(transport=transport) as client:
            with client.stream("POST", BASE + "/responses", json={"model": MODEL}) as result:
                iterator = result.iter_raw(); next(iterator)
            self.assertEqual(guard.proofs[0].buffer, b"")
            with self.assertRaisesRegex(BrokerRefusal, "model_payload_invalid"):
                guard.proof()
        self.assertTrue(all(not proof.buffer for proof in guard.proofs))

    def test_continuous_stream_cannot_turn_late_terminal_into_valid_proof(self):
        now = [0]
        class SlowStream(httpx.SyncByteStream):
            def __iter__(self):
                now[0] = 10; yield b'data: {"model":"synthetic-model","object":"chat.completion.chunk","choices":[]}\n\n'
                now[0] = 46; yield b'data: {"type":"response.completed","response":{"model":"synthetic-model"}}\n\n'
        guard, transport, _, _ = self.fixture(lambda _r: httpx.Response(200, headers={"content-type":"text/event-stream"}, stream=SlowStream()), clock=lambda: now[0])
        with guard, httpx.Client(transport=transport) as client:
            with self.assertRaisesRegex(BrokerRefusal, "trainer_timeout"):
                client.post(BASE + "/responses", json={"model": MODEL})
            self.assertTrue(all(not proof.buffer for proof in guard.proofs))
            with self.assertRaisesRegex(BrokerRefusal, "trainer_timeout"):
                guard.proof()

    def test_read_error_after_terminal_cannot_be_rescued_by_stream_cleanup(self):
        class FailedStream(httpx.SyncByteStream):
            def __iter__(self):
                yield b'data: {"type":"response.completed","response":{"model":"synthetic-model"}}\n\n'
                raise httpx.ReadError("synthetic-private-error")
        guard, transport, _, _ = self.fixture(lambda _r: httpx.Response(200, headers={"content-type":"text/event-stream"}, stream=FailedStream()))
        with guard, httpx.Client(transport=transport) as client:
            with self.assertRaises(httpx.ReadError):
                client.post(BASE + "/responses", json={"model": MODEL})
            self.assertTrue(guard.proofs[0].abandoned)
            self.assertEqual(guard.proofs[0].buffer, b"")
            with self.assertRaisesRegex(BrokerRefusal, "model_payload_invalid"):
                guard.proof()

    def test_async_header_wait_is_bounded_by_total_deadline(self):
        async def check():
            ended, grants = [], []
            async def delayed(_request):
                try:
                    await asyncio.sleep(1)
                    return httpx.Response(200, json=self.result())
                finally:
                    ended.append(True)
            guard = HTTPXEgressGuard(model=MODEL, authorize_post=lambda value: grants.append(value) or {"accepted": True},
                credential_guard=SimpleNamespace(ensure_ready=lambda **_k: None), deadline_seconds=0.01)
            guard.bind_runtime(BASE)
            started = asyncio.get_running_loop().time()
            with guard:
                async with httpx.AsyncClient(transport=httpx.MockTransport(delayed)) as client:
                    with self.assertRaisesRegex(BrokerRefusal, "trainer_timeout"):
                        await client.post(BASE + "/responses", json={"model": MODEL})
                self.assertLess(asyncio.get_running_loop().time() - started, 0.5)
                self.assertEqual(ended, [True]); self.assertEqual(len(grants), 1)
                with self.assertRaisesRegex(BrokerRefusal, "trainer_timeout"):
                    guard.proof()
        asyncio.run(check())


if __name__ == "__main__":
    unittest.main()
