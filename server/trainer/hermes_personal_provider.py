"""Out-of-tree Hermes provider: native model I/O travels over parent-owned IPC.
No API credential or remote URL exists in this profile. The payer uses Hermes'
own resolver/SDK; changing its selected model does not move anyone's history.
"""
import json
import math
from hermes_personal_ipc import MAX_BYTES
from types import SimpleNamespace

IPC_SENTINEL = "scisense-parent-ipc-not-a-provider-credential"
_PROVIDER = "scisense-shared"
_ERRORS = {"trainer_unavailable", "trainer_timeout", "trainer_quota", "connection_auth_required",
           "connection_model_changed", "model_payload_invalid", "execution_unknown"}
_ALLOWED = {"model", "messages", "tools", "tool_choice", "parallel_tool_calls", "max_tokens",
            "max_completion_tokens", "temperature", "top_p", "seed", "stop", "stream", "stream_options",
            "reasoning_effort", "verbosity", "service_tier", "extra_body", "prompt_cache_key",
            "prompt_cache_retention", "response_format", "frequency_penalty", "presence_penalty",
            "logit_bias", "logprobs", "top_logprobs", "n", "user", "store", "metadata", "modalities"}


class BrokerRefusal(RuntimeError):
    def __init__(self, code):
        super().__init__(code if isinstance(code, str) and code in _ERRORS else "trainer_unavailable")


def _payload(values, selected_model):
    from openai import NOT_GIVEN, Omit
    values = {key: value for key, value in values.items() if value is not NOT_GIVEN and not isinstance(value, Omit)}
    if set(values) - _ALLOWED or values.get("model") != selected_model or not isinstance(values.get("messages"), list):
        raise BrokerRefusal("connection_model_changed" if values.get("model") != selected_model else "model_payload_invalid")
    if "stream" in values and not isinstance(values["stream"], bool):
        raise BrokerRefusal("model_payload_invalid")
    try:
        encoded = json.dumps(values, ensure_ascii=False, allow_nan=False)
        if len(encoded.encode()) > MAX_BYTES:
            raise ValueError()
    except (TypeError, ValueError):
        raise BrokerRefusal("model_payload_invalid") from None
    return json.loads(encoded)


def _client_options(values):
    from openai import NOT_GIVEN, Omit
    import httpx
    if "timeout" not in values:
        return {}
    timeout = values.pop("timeout")
    if timeout is NOT_GIVEN or isinstance(timeout, Omit):
        return {}
    if timeout is None:
        return {"timeout": None}
    if isinstance(timeout, httpx.Timeout):
        parts = timeout.as_dict()
    elif isinstance(timeout, (int, float)) and not isinstance(timeout, bool):
        parts = {key: timeout for key in ("connect", "read", "write", "pool")}
    else:
        raise BrokerRefusal("model_payload_invalid")
    if any(value is not None and (not isinstance(value, (int, float)) or isinstance(value, bool) or
                                  not math.isfinite(value) or value < 0) for value in parts.values()):
        raise BrokerRefusal("model_payload_invalid")
    return {"timeout": parts}


class ParentProviderClient:
    def __init__(self, bridge, model):
        self._bridge, self._model = bridge, model
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **values):
        # SDK transport deadlines are not fields of the model request body.
        # Preserve their separate stages for the parent, which also bounds the turn.
        options = _client_options(values)
        payload = _payload(values, self._model)
        try:
            result = self._bridge(payload, client_options=options)
        except BrokerRefusal:
            raise
        except Exception:
            raise BrokerRefusal("trainer_unavailable") from None
        if payload.get("stream"):
            return self._chunks(result)
        from openai.types.chat import ChatCompletion
        try:
            return ChatCompletion.model_validate(result)
        except Exception:
            raise BrokerRefusal("model_payload_invalid") from None

    @staticmethod
    def _chunks(result):
        from openai.types.chat import ChatCompletionChunk
        try:
            for value in result:
                yield ChatCompletionChunk.model_validate(value)
        except BrokerRefusal:
            raise
        except Exception:
            # No credential, response body or upstream error text enters the chat.
            raise BrokerRefusal("trainer_unavailable") from None
        finally:
            close = getattr(result, "close", None)
            if close:
                try:
                    close()
                except Exception:
                    raise BrokerRefusal("trainer_unavailable") from None

    def close(self):
        # The parent owns the shared pipe. Closing one SDK view cannot close it.
        pass


class UnavailableProviderClient:
    def __init__(self):
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._refuse))

    @staticmethod
    def _refuse(**_values):
        raise BrokerRefusal("trainer_unavailable")

    def close(self):
        pass


def register_parent_provider(bridge, model, *, supports_vision, supports_tools):
    from providers import register_provider
    from providers.base import ProviderProfile

    class ParentProfile(ProviderProfile):
        def create_client(self, **_kwargs):
            # Native Hermes catches constructor exceptions and falls back to an
            # ordinary network SDK. Always return a client, including on error.
            try:
                if not callable(bridge) or not isinstance(model, str) or not model or supports_tools is not True:
                    return UnavailableProviderClient()
                return ParentProviderClient(bridge, model)
            except Exception:
                return UnavailableProviderClient()

    profile = ParentProfile(name=_PROVIDER, display_name="Hermes", api_mode="chat_completions",
        env_vars=("SCISENSE_IPC_KEY",), base_url="http://hermes.invalid/v1", supports_health_check=False,
        supports_model_listing=False, supports_vision=supports_vision is True)
    register_provider(profile)
    return profile
