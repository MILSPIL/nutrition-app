"""Observe/count actual HTTPX sends, including SDK retries and redirects.
Only a trusted payer uses this guard. A profile cannot set model, URL, grant,
POST allowance or callbacks. No request/response text or headers are retained.
Sync blocking reads additionally REQUIRE the payer process outer watchdog;
stage timeouts and chunk checks alone are not a total wall-clock guarantee.
"""
import asyncio
import hashlib
import json
import zlib
import threading
import time
from urllib.parse import parse_qs, urlsplit
import httpx
from hermes_personal_provider import BrokerRefusal

_lock, _active = threading.Lock(), None


def _origin(url):
    value = urlsplit(str(url))
    if value.scheme != "https" or not value.hostname or value.username or value.password or value.fragment:
        raise BrokerRefusal("model_payload_invalid")
    return value.scheme + "://" + value.netloc.lower()


def request_json(request):
    raw = request.read()
    from hermes_personal_ipc import MAX_BYTES
    limit = MAX_BYTES
    if len(raw) > limit:
        raise BrokerRefusal("model_payload_invalid")
    encoding = request.headers.get("content-encoding", "identity").lower()
    if encoding == "zstd":
        # Hermes' native Codex HTTP client compresses JSON on the wire. Decode
        # a bounded single frame for observation; transport receives the SAME
        # original bytes. This source/launcher pins Python3.14.
        from compression.zstd import ZstdDecompressor
        decoder = ZstdDecompressor()
        raw = decoder.decompress(raw, max_length=limit + 1)
        if not decoder.eof or decoder.unused_data:
            raise BrokerRefusal("model_payload_invalid")
    elif encoding == "gzip":
        decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
        raw = decoder.decompress(raw, limit + 1)
        if not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
            raise BrokerRefusal("model_payload_invalid")
    elif encoding != "identity":
        raise BrokerRefusal("model_payload_invalid")
    if len(raw) > limit:
        raise BrokerRefusal("model_payload_invalid")
    return json.loads(raw)


class ModelProof:
    def __init__(self):
        self.buffer = bytearray()
        self.sse = False
        self.models, self.last_model, self.message_model = set(), None, None
        self.failed, self.success, self.finished, self.abandoned = False, None, False, False

    def _value(self, value):
        if not isinstance(value, dict):
            return
        if value.get("error") or value.get("type") == "error":
            self.failed = True
        model = value.get("model")
        if isinstance(model, str) and 0 < len(model) <= 160:
            self.last_model = model
        kind = value.get("type")
        if kind == "message_start":
            self.message_model = value.get("message", {}).get("model")
        terminal = None
        if kind in ("response.completed", "response.incomplete", "response.done"):
            terminal = value.get("response", {}).get("model")
        elif kind == "message_stop":
            terminal = self.message_model
        elif value.get("object") in ("chat.completion", "chat.completion.chunk"):
            if any(isinstance(choice, dict) and choice.get("finish_reason") is not None for choice in value.get("choices", [])):
                terminal = model or self.last_model
        elif value.get("type") == "message" and value.get("stop_reason") is not None:
            terminal = model
        elif value.get("object") == "response" and value.get("status") in ("completed", "incomplete"):
            terminal = model
        if isinstance(terminal, str) and 0 < len(terminal) <= 160:
            self.models.add(terminal)

    def feed(self, chunk):
        self.buffer.extend(chunk)
        if len(self.buffer) > 1024 * 1024:
            raise BrokerRefusal("model_payload_invalid")
        if not self.sse:
            return
        while b"\n" in self.buffer:
            line, _, self.buffer = self.buffer.partition(b"\n")
            line = line.strip()
            if not line or line.startswith((b"event:", b":", b"id:")):
                continue
            if line.startswith(b"data:"):
                line = line[5:].strip()
            if line == b"[DONE]":
                if self.last_model and not self.failed:
                    self.models.add(self.last_model)
                continue
            try:
                self._value(json.loads(line))
            except (ValueError, UnicodeError):
                pass

    def finish(self):
        if self.buffer:
            try:
                self._value(json.loads(self.buffer))
            except (ValueError, UnicodeError):
                pass
            self.buffer.clear()
        self.finished = True

    def discard(self, *, closed=False):
        self.buffer.clear()
        if self.abandoned:
            return
        if not self.finished:
            self.finished = closed and bool(self.models) and not self.failed
            self.abandoned = not self.finished
            if self.abandoned:
                self.failed = True


class _ObservedSync(httpx.SyncByteStream):
    def __init__(self, original, proof, decoder, check):
        self.original, self.proof, self.decoder, self.check = original, proof, decoder, check
    def __iter__(self):
        try:
            iterator = iter(self.original)
            while True:
                self.check()
                try:
                    chunk = next(iterator)
                except StopIteration:
                    break
                self.check()
                self.proof.feed(self.decoder.decode(chunk))
                yield chunk
            self.proof.feed(self.decoder.flush()); self.proof.finish()
        except BaseException:
            self.proof.discard(); self.original.close(); self.decoder = None
            raise
    def close(self):
        try:
            self.original.close()
        finally:
            self.proof.discard(closed=True)
            self.decoder = None


class _ObservedAsync(httpx.AsyncByteStream):
    def __init__(self, original, proof, decoder, check):
        self.original, self.proof, self.decoder, self.check = original, proof, decoder, check
    async def __aiter__(self):
        try:
            iterator = self.original.__aiter__()
            while True:
                self.check()
                try:
                    try:
                        async with asyncio.timeout(self.check()):
                            chunk = await iterator.__anext__()
                    except TimeoutError:
                        self.check()
                        raise BrokerRefusal("trainer_timeout") from None
                except StopAsyncIteration:
                    break
                self.check()
                self.proof.feed(self.decoder.decode(chunk))
                yield chunk
            self.proof.feed(self.decoder.flush()); self.proof.finish()
        except BaseException:
            self.proof.discard(); await self.original.aclose(); self.decoder = None
            raise
    async def aclose(self):
        try:
            await self.original.aclose()
        finally:
            self.proof.discard(closed=True)
            self.decoder = None


class HTTPXEgressGuard:
    def __init__(self, *, model, authorize_post, credential_guard, deadline_seconds=45, timeout_options=None, clock=time.monotonic):
        if httpx.__version__ != "0.28.1":
            raise BrokerRefusal("trainer_unavailable")
        if not isinstance(model, str) or not model or len(model) > 160 or not callable(authorize_post) or not 0 < deadline_seconds <= 45:
            raise BrokerRefusal("model_payload_invalid")
        self.model, self.authorize_post, self.credential_guard = model, authorize_post, credential_guard
        self.clock, self.deadline = clock, clock() + deadline_seconds
        self.timeout_options, self.base = timeout_options or {}, None
        self.posts, self.sends, self.proofs, self.last_refusal = 0, 0, [], None
        self.request_lock = threading.RLock()

    def bind_runtime(self, base_url):
        value = urlsplit(base_url)
        if value.query or self.base is not None:
            raise BrokerRefusal("model_payload_invalid")
        self.base = (_origin(base_url), value.path.rstrip("/"))

    def _authorize(self, request):
        with self.request_lock:
            remaining = self.deadline - self.clock()
            if remaining <= 0:
                raise BrokerRefusal("trainer_timeout")
            value, origin = urlsplit(str(request.url)), _origin(request.url)
            if any(any(word in key.lower() for word in ("key", "token", "authorization", "password")) for key in parse_qs(value.query)):
                raise BrokerRefusal("model_payload_invalid")
            oauth = request.method == "POST" and str(request.url) == "https://auth.openai.com/oauth/token"
            inference = request.method == "POST" and self.base and origin == self.base[0] and value.path in {
                self.base[1] + "/responses", self.base[1] + "/chat/completions", self.base[1] + "/messages"}
            self.credential_guard.ensure_ready(oauth_refresh=oauth)
            if request.method == "GET":
                if not self.base or origin != self.base[0]:
                    raise BrokerRefusal("model_payload_invalid")
                return None
            if not oauth and not inference or self.posts >= 3:
                raise BrokerRefusal("trainer_quota" if self.posts >= 3 else "model_payload_invalid")
            if inference:
                try:
                    payload = request_json(request)
                except (ValueError, UnicodeError, httpx.RequestNotRead, zlib.error):
                    raise BrokerRefusal("model_payload_invalid") from None
                if not isinstance(payload, dict) or payload.get("model") != self.model:
                    raise BrokerRefusal("connection_model_changed")
            else:
                if parse_qs(request.read().decode()).get("grant_type") != ["refresh_token"]:
                    raise BrokerRefusal("model_payload_invalid")
            # Reserve durably BEFORE the physical transport. Failed/uncertain
            # sends are not refunded or automatically repeated under a new ID.
            receipt = self.authorize_post({"kind": "oauth_refresh" if oauth else "inference", "model": self.model,
                "originHash": hashlib.sha256(origin.encode()).hexdigest()})
            if not isinstance(receipt, dict) or receipt.get("accepted") is not True:
                raise BrokerRefusal("trainer_quota")
            self.posts += 1
            proof = ModelProof() if inference else None
            if proof:
                self.proofs.append(proof)
            return proof

    def check_deadline(self):
        remaining = self.deadline - self.clock()
        if remaining <= 0:
            self.last_refusal = "trainer_timeout"
            raise BrokerRefusal("trainer_timeout")
        return remaining

    def _before_send(self, request):
        remaining = self.check_deadline()
        stages = self.timeout_options.get("timeout", request.extensions.get("timeout", {})) or {}
        request.extensions["timeout"] = {name: min(remaining, stages.get(name)) if stages.get(name) is not None else remaining for name in ("connect", "read", "write", "pool")}

    def _checked(self, request):
        try:
            return self._authorize(request)
        except BrokerRefusal as error:
            self.last_refusal = str(error)
            raise
        except RuntimeError as error:
            if str(error) == "connection_auth_required":
                self.last_refusal = "connection_auth_required"
                raise BrokerRefusal("connection_auth_required") from None
            raise

    def _observe(self, response, proof):
        self.check_deadline()
        if proof is None:
            return response
        proof.success = 200 <= response.status_code < 300
        if not proof.success:
            return response
        proof.sse = "text/event-stream" in response.headers.get("content-type", "").lower()
        if response.is_stream_consumed:
            proof.feed(response.content); proof.finish()
        else:
            # HTTPX's boundary is raw compressed bytes. A separate native
            # decoder observes plaintext without changing the SDK's byte flow.
            decoder = httpx.Response(response.status_code, headers=response.headers)._get_content_decoder()
            if isinstance(response.stream, httpx.SyncByteStream):
                response.stream = _ObservedSync(response.stream, proof, decoder, self.check_deadline)
            else:
                response.stream = _ObservedAsync(response.stream, proof, decoder, self.check_deadline)
        return response

    def __enter__(self):
        global _active
        with _lock:
            if _active is not None:
                raise BrokerRefusal("trainer_unavailable")
            _active = self
        self.sync, self.async_ = httpx.Client._send_single_request, httpx.AsyncClient._send_single_request
        def sync(client, request):
            proof = self._checked(request)
            try:
                self._before_send(request)
                if request.method == "POST": self.sends += 1
                response = self.sync(client, request)
            except BaseException:
                if proof: proof.success = False; proof.discard()
                raise
            try:
                return self._observe(response, proof)
            except BaseException:
                if proof: proof.discard()
                response.close()
                raise
        async def asynchronous(client, request):
            # All supported native clients use buffered JSON/form request bodies.
            await request.aread()
            proof = self._checked(request)
            try:
                self._before_send(request)
                if request.method == "POST": self.sends += 1
                try:
                    async with asyncio.timeout(self.check_deadline()):
                        response = await self.async_(client, request)
                except TimeoutError:
                    self.last_refusal = "trainer_timeout"
                    raise BrokerRefusal("trainer_timeout") from None
            except BaseException:
                if proof: proof.success = False; proof.discard()
                raise
            try:
                return self._observe(response, proof)
            except BaseException:
                if proof: proof.discard()
                await response.aclose()
                raise
        self.sync_hook, self.async_hook = sync, asynchronous
        httpx.Client._send_single_request, httpx.AsyncClient._send_single_request = sync, asynchronous
        return self

    def proof(self):
        if self.last_refusal:
            raise BrokerRefusal(self.last_refusal)
        self.check_deadline()
        successful = [proof for proof in self.proofs if proof.success is True]
        if not successful or any(proof.success is None for proof in self.proofs):
            raise BrokerRefusal("model_payload_invalid")
        for proof in successful:
            if not proof.finished or proof.abandoned or proof.failed or proof.models != {self.model}:
                raise BrokerRefusal("connection_model_changed" if proof.models and proof.models != {self.model} else "model_payload_invalid")
        return {"model": self.model, "physicalPostAttempts": self.sends, "reservedPostAttempts": self.posts, "rawTerminalModelVerified": True}

    def __exit__(self, *_):
        global _active
        for proof in self.proofs:
            proof.discard()
        if httpx.Client._send_single_request is self.sync_hook:
            httpx.Client._send_single_request = self.sync
        if httpx.AsyncClient._send_single_request is self.async_hook:
            httpx.AsyncClient._send_single_request = self.async_
        with _lock:
            if _active is self:
                _active = None
