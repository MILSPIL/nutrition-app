"""Trusted native Hermes model producer, never imported into a profile.
The parent supplies only encrypted-store restoration and a physical POST
reservation callback. All auth, provider selection and SDK conversion is native.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import time
import uuid
from hermes_personal_provider import BrokerRefusal, _payload
from hermes_personal_connection import NativeCredentialBridge, assert_tmpfs_home
from hermes_personal_egress import HTTPXEgressGuard
from types import SimpleNamespace



_MODEL_METADATA_SHA256 = "375c9c972dccdbcb25c18f1cddd2c5ec8a2c895c50e56c0a6fc40dc5a481e0a9"


def _seed_public_model_metadata(home):
    # Public pinned build input. Native Hermes consumes its ordinary cache;
    # the fresh payer HOME never depends on metadata left by another process.
    data = Path(__file__).with_name("codex-model-metadata.json").read_bytes()
    if len(data) > 65536 or hashlib.sha256(data).hexdigest() != _MODEL_METADATA_SHA256:
        raise RuntimeError("model_payload_invalid")
    descriptor = os.open(home / "models_dev_cache.json", os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(data); output.flush(); os.fsync(output.fileno())



def _effective_context_window(model, capabilities):
    from agent.model_metadata import _resolve_codex_oauth_context_length_with_source
    window, _source = _resolve_codex_oauth_context_length_with_source(model, access_token="")
    # API metadata supplies modalities, not the subscription's route limit.
    # Unknown future aliases stay at the minimum verified adapter window.
    return min(capabilities.context_window, window if type(window) is int and window > 0 else 64000)


def _plain(value):
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json", exclude_none=True)
    if isinstance(value, SimpleNamespace):
        return {key: _plain(item) for key, item in vars(value).items()}
    if isinstance(value, dict):
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    return value


def _completion(value):
    result = _plain(value)
    result.setdefault("id", "hermes-payer-" + uuid.uuid4().hex)
    result.setdefault("object", "chat.completion")
    result.setdefault("created", int(time.time()))
    return result


def _completion_chunk(value):
    value = _completion(value)
    value["object"] = "chat.completion.chunk"
    for choice in value["choices"]:
        choice["delta"] = choice.pop("message")
        calls = choice["delta"].get("tool_calls")
        if calls:
            choice["delta"]["tool_calls"] = [{"index": index, **call} for index, call in enumerate(calls)]
    return value


class NativePayer:
    def __init__(self, *, home, material, revision, callback):
        self.home = assert_tmpfs_home(home)
        if not isinstance(material, dict) or set(material) - {"auth.json", "config.yaml", ".env"}:
            raise RuntimeError("connection_material_invalid")
        total = 0
        for name, encoded in material.items():
            data = base64.b64decode(encoded, validate=True)
            total += len(data)
            if total > 1024 * 1024:
                raise RuntimeError("connection_material_invalid")
            descriptor = os.open(self.home / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, "wb") as target:
                target.write(data)
        _seed_public_model_metadata(self.home)
        self.callback, self.closed, self.selection_changed = callback, False, False
        from hermes_cli.inventory import load_picker_context
        from hermes_cli.config import load_config_readonly
        from agent.models_dev import get_model_capabilities
        picker = load_picker_context()
        # This activation has verified the native Codex HTTPX/auth seams only.
        # Other providers can refresh via urllib/subprocess outside those seams;
        # reject BEFORE resolving any credential until their native lane is tested.
        if picker.current_provider != "openai-codex" or not picker.current_model:
            raise BrokerRefusal("connection_auth_required")
        self.provider, self.model = picker.current_provider, picker.current_model
        self.base = picker.current_base_url
        capabilities = get_model_capabilities(self.provider, self.model, allow_network=False, config=load_config_readonly())
        if capabilities is None or capabilities.supports_tools is not True or capabilities.context_window < 64000:
            raise BrokerRefusal("model_payload_invalid")
        from agent.codex_responses_adapter import _wire_model_identity
        self.wire_model = _wire_model_identity(self.model) if self.provider == "openai-codex" else self.model
        self.identity = {"wireModel": self.wire_model, "instanceId": uuid.uuid4().hex, "provider": self.provider, "model": self.model,
            "contextWindow": _effective_context_window(self.model, capabilities), "supportsTools": True, "supportsVision": capabilities.supports_vision is True}
        self.bridge = NativeCredentialBridge(home=self.home, revision=revision,
            begin_refresh=lambda ident, options: callback("credentials", {"action": "beginRefresh", "refreshId": ident, "options": options}),
            checkpoint=lambda files, options: callback("credentials", {"action": "checkpoint", "files": {name: base64.b64encode(data).decode() for name, data in files.items()}, "options": options}),
            require_reauth=lambda options: callback("credentials", {"action": "requireReauth", "options": options})).install()


    def model_options(self):
        if self.closed or self.selection_changed:
            raise BrokerRefusal("connection_model_changed")
        from hermes_cli.config import load_config_readonly
        from agent.models_dev import get_model_capabilities
        from hermes_cli.codex_models import get_codex_model_ids
        from hermes_cli.inventory import _row
        from hermes_cli.providers import get_label
        config = load_config_readonly()
        models = sorted(set(get_codex_model_ids(access_token=None) + [self.model]))
        compatible = []
        for model in models:
            if not isinstance(model, str) or not model or len(model) > 160 or any(c in model for c in "\0\r\n"):
                continue
            capabilities = get_model_capabilities(self.provider, model, allow_network=False, config=config)
            if capabilities and capabilities.supports_tools is True and capabilities.supports_vision is True and 64000 <= _effective_context_window(model, capabilities) <= 2000000:
                compatible.append(model)
        # Native cached catalog only: opening the picker never refreshes auth,
        # probes an endpoint, warms prices or launches a background request.
        return {"provider": self.provider, "model": self.model, "providers": [
            _row(self.provider, get_label(self.provider), True, models=compatible, total_models=len(compatible))]}

    def select_model(self, provider, model):
        if provider != self.provider or provider != "openai-codex" or model not in self.model_options()["providers"][0]["models"]:
            raise BrokerRefusal("model_selection_refused")
        if model == self.model:
            return {"ok": True, "provider": provider, "model": model, "changed": False}
        from hermes_cli.model_switch import ModelSwitchResult, apply_model_selection
        from hermes_cli.config import _CONFIG_LOCK, atomic_config_replace, get_config_path, read_user_config_raw
        from agent.models_dev import get_model_capabilities
        self.bridge.ensure_ready()
        self.selection_changed = True
        try:
            # Credential/provider routing stays native and unchanged. Only an
            # explicit compatible model from that connection's catalog is saved.
            with _CONFIG_LOCK:
                path = get_config_path()
                config = read_user_config_raw(path)
                capabilities = get_model_capabilities(provider, model, allow_network=False, config=config)
                if not capabilities or capabilities.supports_tools is not True or capabilities.supports_vision is not True:
                    raise BrokerRefusal("model_selection_refused")
                config["model"] = apply_model_selection(config.get("model"), ModelSwitchResult(success=True,
                    new_model=model, target_provider=provider, base_url=self.base or "", api_mode="codex_responses"))
                # Preserve this selection's verified capabilities in the same
                # atomic native config commit and therefore encrypted snapshot.
                overrides = config.setdefault("model_overrides", {}).setdefault(provider, {})
                entry = dict(overrides.get(model) or {})
                entry.update(supports_tools=True, supports_vision=True, context_window=_effective_context_window(model, capabilities))
                if getattr(capabilities, "max_output_tokens", None):
                    entry["max_output_tokens"] = capabilities.max_output_tokens
                overrides[model] = entry
                atomic_config_replace(path, config)
            self.bridge.checkpoint_current()
        except BaseException:
            self.bridge.blocked = True
            raise
        # The parent physically retires this producer and every profile before
        # a new instance resolves the committed native selection.
        return {"ok": True, "provider": provider, "model": model, "changed": True}

    def invoke(self, payload, *, client_options, timeout_ms):
        if self.closed or self.selection_changed or type(timeout_ms) is not int or not 0 < timeout_ms <= 45000:
            raise BrokerRefusal("trainer_timeout")
        payload = _payload(payload, self.model)
        # The native Codex adapter uses this same explicit wire identity. It is
        # not the model field fabricated by a normalized ChatCompletion shim.
        wire_model = self.wire_model
        client = None
        guard = HTTPXEgressGuard(model=wire_model, credential_guard=self.bridge,
            authorize_post=lambda proof: self.callback("budget", {"proof": proof}),
            deadline_seconds=timeout_ms / 1000, timeout_options=client_options)
        stage = "resolver"
        def diagnostic(code):
            # Only fixed codes, counts and booleans cross this diagnostic seam.
            # No prompt, response, model string, URL, header or grant is retained.
            try:
                self.callback("diagnostic", {"code": code, "stage": stage, "posts": guard.sends,
                    "responses": [{"success": p.success, "status": p.status, "sse": p.sse, "finished": p.finished,
                        "abandoned": p.abandoned, "failed": p.failed, "hasModels": bool(p.models),
                        "modelMatches": p.models == {guard.model}, "terminalSeen": p.terminal_seen,
                        "terminalModelSeen": p.terminal_model_seen} for p in guard.proofs]})
            except Exception:
                pass
        try:
            with guard:
                from hermes_cli.runtime_provider import resolve_runtime_provider, resolve_requested_provider, expand_direct_api_alias
                from agent.auxiliary_client import resolve_provider_client
                runtime = resolve_runtime_provider(requested=self.provider, target_model=self.model,
                    explicit_base_url=self.base or None)
                expanded, _ = expand_direct_api_alias(resolve_requested_provider(self.provider), self.base or None)
                route_matches = runtime.get("provider") == expanded or runtime.get("provider") == "custom" and runtime.get("requested_provider") == expanded
                if not route_matches or runtime.get("api_mode") not in {"codex_responses", "chat_completions", "anthropic_messages"}:
                    raise BrokerRefusal("connection_model_changed")
                from agent.codex_responses_adapter import _wire_model_identity
                guard.model = _wire_model_identity(self.model) if runtime["api_mode"] == "codex_responses" else self.model
                guard.bind_runtime(runtime["base_url"])
                self.bridge.ensure_ready()
                client, selected = resolve_provider_client(self.provider, model=self.model, async_mode=False,
                    explicit_base_url=runtime.get("base_url"), explicit_api_key=runtime.get("api_key"),
                    api_mode=runtime["api_mode"], main_runtime=runtime)
                if client is None or selected != self.model:
                    raise BrokerRefusal("connection_model_changed")
                # The SDK client must use the endpoint resolved for this grant.
                actual_base = str(getattr(client, "base_url", "") or "").rstrip("/")
                if actual_base and actual_base != runtime["base_url"].rstrip("/"):
                    raise BrokerRefusal("connection_model_changed")
                values = dict(payload)
                if client_options and "timeout" in client_options:
                    import httpx
                    timeout = client_options["timeout"]
                    values["timeout"] = httpx.Timeout(**timeout) if isinstance(timeout, dict) else timeout
                stage = "sdk"
                response = client.chat.completions.create(**values)
                stage = "completion"
                if payload.get("stream") and isinstance(response, SimpleNamespace):
                    result = {"chunks": [_completion_chunk(response)]}
                elif payload.get("stream"):
                    chunks, size = [], 0
                    try:
                        for chunk in response:
                            value = _plain(chunk)
                            size += len(json.dumps(value).encode())
                            if size > 12 * 1024 * 1024:
                                raise BrokerRefusal("model_payload_invalid")
                            chunks.append(value)
                    finally:
                        close = getattr(response, "close", None)
                        if close:
                            close()
                    result = {"chunks": chunks}
                else:
                    result = {"completion": _completion(response)}
                stage = "proof"
                result["proof"] = {**guard.proof(), "selectedModel": self.model, "selectedProvider": self.provider, "apiMode": runtime["api_mode"]}
                return result
        except BrokerRefusal as error:
            diagnostic(str(error))
            raise
        except Exception as error:
            if guard.last_refusal:
                diagnostic(guard.last_refusal)
                raise BrokerRefusal(guard.last_refusal) from None
            status = getattr(error, "status_code", None)
            code = "connection_auth_required" if status in (401, 403) else "trainer_quota" if status == 429 else "trainer_unavailable"
            diagnostic(code)
            raise BrokerRefusal(code) from None
        finally:
            if client is not None:
                client.close()

    def close(self):
        self.closed = True
        self.bridge.close()
