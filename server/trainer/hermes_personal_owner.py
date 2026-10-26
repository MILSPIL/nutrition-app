"""Persistent, profile-bound native Hermes owner; the launcher supplies OS isolation.
Only the service coordinator calls this module. User RPCs must pass its admission
bridge before submit, so both Desktop and the website use the same queue/tools.
"""
import json
import asyncio
import os
import stat
import re
import uuid
import threading
import math
from datetime import datetime
from pathlib import Path

from hermes_personal_provider import IPC_SENTINEL, register_parent_provider

_process_owner = None
_process_owner_lock = threading.Lock()


_TOOL_NAMES = ("food_lookup", "read_confirmed_day", "read_plan", "read_trainer_context", "propose_food_draft", "propose_context_update")


def personal_config(connection):
    from agent.model_metadata import MINIMUM_CONTEXT_LENGTH
    model = connection.get("model")
    window = connection.get("contextWindow")
    if not isinstance(model, str) or not model or len(model) > 160 or any(c in model for c in "\0\r\n"):
        raise RuntimeError("personal_connection_invalid")
    if type(window) is not int or not MINIMUM_CONTEXT_LENGTH <= window <= 2000000 or connection.get("supportsTools") is not True:
        raise RuntimeError("personal_connection_invalid")
    return {
        "model": {"default": model, "provider": "scisense-shared", "api_mode": "chat_completions",
                  "base_url": "http://hermes.invalid/v1", "key_env": "SCISENSE_IPC_KEY"},
        "fallback_providers": [], "auth": {"adopt_external_logins": False},
        "platform_toolsets": {surface: ["scisense", "no_mcp"] for surface in ("gui", "cli", "api_server")},
        "agent": {"max_turns": 4, "image_input_mode": "native", "task_completion_guidance": False,
                  "parallel_tool_call_guidance": False, "disabled_toolsets": ["memory", "terminal", "file", "browser", "web", "delegate", "skills", "skill_manage", "cronjob", "session_search"]},
        "memory": {"memory_enabled": False, "user_profile_enabled": False, "nudge_interval": 0},
        "auxiliary": {"background_review": {"enabled": False}, "title_generation": {"enabled": False, "model_upgrade_enabled": False}, "transient_retries": 0},
        "compression": {"enabled": True}, "vision": {"replay_recent_images": 3},
        "model_overrides": {"scisense-shared": {model: {"supports_vision": connection.get("supportsVision") is True,
            "supports_tools": True, "context_window": window, "max_output_tokens": 4096}}},
        "telemetry": {"shared_metrics": {"enabled": False, "send": False}},
        "mcp_servers": {}, "plugins": {"enabled": False}, "tools": {"tool_search": {"enabled": "off"}},
    }



def publish_personal_config(target, connection):
    expected = personal_config(connection)
    if target.exists():
        info = target.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise RuntimeError("personal_config_invalid")
        try:
            previous = json.loads(target.read_text())
            model = previous["model"]["default"]
            metadata = previous["model_overrides"]["scisense-shared"][model]
            original = personal_config({"model": model, "contextWindow": metadata["context_window"],
                "supportsTools": metadata["supports_tools"], "supportsVision": metadata["supports_vision"]})
        except (ValueError, KeyError, TypeError):
            raise RuntimeError("personal_config_invalid") from None
        if previous != original:
            raise RuntimeError("personal_config_invalid")
        if previous == expected:
            return
    temporary = target.with_name(".personal-config-" + uuid.uuid4().hex)
    try:
        descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "w") as output:
            json.dump(expected, output); output.flush(); os.fsync(output.fileno())
        os.replace(temporary, target)
        directory = os.open(target.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def _private_directory(home):
    home = Path(home)
    info = home.lstat()
    if not stat.S_ISDIR(info.st_mode) or home.resolve() != home or info.st_mode & 0o077 or info.st_uid != os.getuid():
        raise RuntimeError("personal_home_invalid")
    configured_home = os.environ.get("HERMES_HOME")
    if not configured_home or not Path(configured_home).is_absolute() or Path(configured_home).resolve() != home:
        raise RuntimeError("personal_home_mismatch")
    # Native Hermes may persist a REFERENCE to our public IPC sentinel. Accept
    # only that exact borrowed row; no actual grant or provider secret is valid.
    if os.environ.get("SCISENSE_IPC_KEY") != IPC_SENTINEL or os.path.lexists(home / ".env"):
        raise RuntimeError("personal_credentials_forbidden")
    auth = home / "auth.json"
    if os.path.lexists(auth):
        from agent.credential_persistence import fingerprint_secret_value
        descriptor = os.open(auth, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_uid != os.getuid() or info.st_size > 65536:
                raise RuntimeError("personal_credentials_forbidden")
            try:
                store = json.loads(stream.read(65537))
            except (ValueError, UnicodeError):
                raise RuntimeError("personal_credentials_forbidden") from None
        if not isinstance(store, dict) or set(store) - {"version", "providers", "credential_pool", "updated_at", "active_provider"} or store.get("providers") or store.get("active_provider") not in (None, "scisense-shared"):
            raise RuntimeError("personal_credentials_forbidden")
        if type(store.get("version")) is not int or store["version"] != 1 or not isinstance(store.get("providers"), dict) or store["providers"] != {}:
            raise RuntimeError("personal_credentials_forbidden")
        if "updated_at" in store:
            value = store["updated_at"]
            try:
                if not isinstance(value, str) or len(value) > 64 or datetime.fromisoformat(value).tzinfo is None:
                    raise ValueError()
            except (ValueError, TypeError):
                raise RuntimeError("personal_credentials_forbidden") from None
        pools = store.get("credential_pool", {})
        if not isinstance(pools, dict) or set(pools) - {"scisense-shared"}:
            raise RuntimeError("personal_credentials_forbidden")
        entries = pools.get("scisense-shared", [])
        if not isinstance(entries, list) or len(entries) > 1:
            raise RuntimeError("personal_credentials_forbidden")
        scalar_types = {"id": str, "label": str, "auth_type": str, "source": str, "base_url": str,
            "secret_fingerprint": str, "priority": int, "request_count": int,
            "last_status": str, "last_status_at": (float, int, str), "status_cleared_at": (float, int)}
        null_only = {"last_error_code", "last_error_reason", "last_error_message", "last_error_reset_at"}
        for entry in entries:
            if not isinstance(entry, dict) or set(entry) - set(scalar_types) - null_only - {"model_cooldowns"}:
                raise RuntimeError("personal_credentials_forbidden")
            for key, value in entry.items():
                if key in null_only:
                    valid = value is None
                elif key == "model_cooldowns":
                    valid = value is None or value == {}
                elif value is None:
                    valid = key in {"last_status", "last_status_at", "status_cleared_at"}
                else:
                    expected = scalar_types[key]
                    valid = not isinstance(value, bool) and isinstance(value, expected)
                    if valid and isinstance(value, str):
                        valid = len(value) <= 160 and not any(c in value for c in "\0\r\n")
                    if valid and isinstance(value, (float, int)):
                        valid = math.isfinite(value) and value >= 0
                if not valid:
                    raise RuntimeError("personal_credentials_forbidden")
            if entry.get("last_status") not in (None, "ok") or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", entry.get("id", "")):
                raise RuntimeError("personal_credentials_forbidden")
            if not isinstance(entry, dict) or entry.get("source") != "env:SCISENSE_IPC_KEY" or entry.get("label") != "SCISENSE_IPC_KEY" or entry.get("base_url") != "http://hermes.invalid/v1" or entry.get("auth_type") != "api_key" or entry.get("secret_fingerprint") != fingerprint_secret_value(IPC_SENTINEL):
                raise RuntimeError("personal_credentials_forbidden")

    return home


class EventTransport:
    def __init__(self, callback):
        self.callback, self.closed = callback, False
        self.auth_identity = None

    def write(self, value):
        if not self.closed:
            self.callback(json.loads(value) if isinstance(value, str) else value)

    async def write_async(self, value):
        self.write(value)

    def is_closed(self):
        return self.closed


def verify_provisioned_native_state(home):
    from hermes_state_reconcile import schema_drift_reason
    if schema_drift_reason(home / "state.db") is not None:
        raise RuntimeError("personal_state_invalid")
    from hermes_state import SessionDB
    existing = SessionDB(home / "state.db", read_only=True)
    try:
        existing.list_sessions_rich(limit=1)
        existing.get_messages("scisense-readonly-validation")
    finally:
        existing.close()


class PersonalOwner:
    def __init__(self, *, home, connection, model_bridge, tool_handler, tool_schemas, on_event):
        self.home = _private_directory(home)
        self.connection = dict(connection)
        self.config = personal_config(connection)
        self.model_bridge, self.tool_handler = model_bridge, tool_handler
        if set(tool_schemas) != set(_TOOL_NAMES) or any(tool_schemas[name].get("name") != name for name in _TOOL_NAMES):
            raise RuntimeError("personal_tools_invalid")
        self.tool_schemas, self.on_event = tool_schemas, on_event
        self.runner, self.authority, self.connections = None, None, {}
        self.photos = None
        self.context = None
        self.closed = False
        self._close_task = None
        self._claimed = False

    async def start(self):
        if self.closed or self.runner is not None:
            raise RuntimeError("personal_owner_started")
        if os.environ.get("SCISENSE_NATIVE_PROVISIONED") == "1":
            verify_provisioned_native_state(self.home)
        from gateway.config import GatewayConfig
        from gateway.run import GatewayRunner
        from gateway.run_runtime import initialize_gateway_runtime
        from gateway.runtime_ownership import process_ownership
        from tools.registry import registry
        from toolsets import create_custom_toolset
        # Provider/tool registries are process-global. This worker serves exactly
        # one owner for its ENTIRE lifetime, including failed startup/shutdown.
        global _process_owner
        with _process_owner_lock:
            if _process_owner is not None or process_ownership.homes:
                raise RuntimeError("personal_owner_conflict")
            _process_owner = self
            self._claimed = True
        try:
            process_ownership.reserve([self.home])
        except BaseException:
            self.closed = True
            raise
        publish_personal_config(self.home / "config.yaml", self.connection)
        register_parent_provider(self.model_bridge, self.connection["model"],
            supports_vision=self.connection.get("supportsVision") is True, supports_tools=True)
        for name in _TOOL_NAMES:
            def handler(args, _name=name, **_kwargs):
                return json.dumps(self.tool_handler(_name, args), ensure_ascii=False, allow_nan=False)
            registry.register(name=name, toolset="scisense", schema=self.tool_schemas[name], handler=handler, check_fn=lambda: True)
        create_custom_toolset("scisense", "SciSense", list(_TOOL_NAMES))
        try:
            from hermes_personal_context import ProfileContext
            self.context = ProfileContext(self.home)
            from hermes_personal_media import retain_profile_photos, clean_photo_transcripts
            retain_profile_photos(self.home)
            clean_photo_transcripts(self)
            self.runner = GatewayRunner(GatewayConfig(platforms={}, multiplex_profiles=False, stt_enabled=False,
                max_concurrent_sessions=1, loop_watchdog=False))
            await initialize_gateway_runtime(self.runner)
            self.authority = self.runner.session_authority
            if self.authority.profile_id != str(self.home):
                raise RuntimeError("personal_home_mismatch")
            from hermes_personal_media import ProfilePhotos
            from gateway.platforms.base import get_image_cache_dir
            from gateway.session_ingress_media import native_inputs_store
            from hermes_dir_acl import make_user_dir
            retained = native_inputs_store()
            make_user_dir(retained, mode=0o700, parents=True, exist_ok=True)
            self.photos = ProfilePhotos(get_image_cache_dir(), retained)
            return {"profileId": self.authority.profile_id, "instanceId": self.authority.instance_id,
                    "authorityEpoch": self.authority.epoch}
        except BaseException:
            await self.close()
            raise

    def channel(self, channel):
        if self.closed or self.authority is None:
            raise RuntimeError("trainer_unavailable")
        if not isinstance(channel, str) or not re.fullmatch(r"(?:web|desktop)(?::[A-Za-z0-9_-]{1,80})?", channel):
            raise RuntimeError("personal_channel_invalid")
        if channel not in self.connections and len(self.connections) >= 8:
            raise RuntimeError("personal_channel_limit")
        if channel not in self.connections:
            from gateway.session_controls import AuthorityConnection
            transport = EventTransport(lambda event: self.on_event(channel, event))
            identity = {"provider": "scisense", "user_id": "personal-owner", "profile_id": self.authority.profile_id,
                "instance_id": self.authority.instance_id, "capabilities": ["session:create", "session:read", "session:submit", "session:control", "session:respond"]}
            self.connections[channel] = (AuthorityConnection(self.authority, transport, identity), transport)
        return self.connections[channel][0]

    def read_context(self):
        if self.closed or self.context is None:
            raise RuntimeError("context_unavailable")
        return self.context.read()

    def commit_context(self, proposal):
        if self.closed or self.context is None:
            raise RuntimeError("context_unavailable")
        return self.context.commit(proposal)

    def stage_images(self, input_id, images):
        if self.closed or self.photos is None:
            raise RuntimeError("trainer_unavailable")
        if self.connection.get("supportsVision") is not True:
            raise RuntimeError("media_unsupported")
        return self.photos.stage(input_id, images)

    def read_photo(self, reference, variant):
        if self.closed or self.photos is None:
            raise RuntimeError("trainer_unavailable")
        return self.photos.read(reference, variant)

    def delete_photo(self, reference):
        if self.closed or self.photos is None:
            raise RuntimeError("trainer_unavailable")
        return self.photos.delete(reference)

    def clear_staged(self, input_id):
        if self.closed or self.photos is None:
            raise RuntimeError("trainer_unavailable")
        return self.photos.clear(input_id)

    def execution_binding(self):
        # Native ContextVar identifies the actual admitted turn, including aux
        # SDK/tool threads. Never label an old recovery callback with whichever
        # app input happens to be active in the parent at that moment.
        from gateway.session_cli_turn import _cli_turn
        from hermes_state_runtime import get_session_admission
        current = _cli_turn.get()
        if self.closed or self.authority is None or not current:
            raise RuntimeError("execution_unknown")
        row = get_session_admission(self.authority.db, admission_id=current[0])
        subjects = {connection.actor.subject for connection, _transport in list(self.connections.values())}
        if not row or row['principal_id'] not in subjects or row['status'] != 'started' or row['owner_epoch'] != self.authority.epoch or type(row['generation']) is not int or row['generation'] < 1:
            raise RuntimeError("execution_unknown")
        api_text = row['payload'].get('cli_turn_v1', {}).get('api_text', '')
        match = re.match(r'SCISENSE-INPUT-V1 ([A-Za-z0-9-]{16,80}) ([a-f0-9]{64})\n', api_text)
        if not match or match[1] != row['request_id']:
            raise RuntimeError("execution_unknown")
        return {"profileId": str(self.home), "sessionId": row['target_session_id'], "inputId": row['request_id'],
                "admissionId": row['admission_id'], "authorityEpoch": row['owner_epoch'], "generation": row['generation'],
                "sequence": row['seq'], "inputProof": match[2]}

    async def lookup(self, channel, session_id, input_id, input_proof):
        # Read native UNIQUE(principal, target, request) directly through its
        # official store helper. It does not submit, wake or retry anything.
        if not isinstance(input_proof, str) or not re.fullmatch(r'[a-f0-9]{64}', input_proof):
            raise RuntimeError("invalid_request")
        from hermes_state_runtime import find_session_admission
        from dataclasses import asdict
        from gateway.session_results import admission_result
        connection = self.channel(channel)
        row = await asyncio.to_thread(find_session_admission, self.authority.db,
            principal_id=connection.actor.subject, session_id=session_id, request_id=input_id)
        if row is None:
            return None
        expected = 'SCISENSE-INPUT-V1 ' + input_id + ' ' + input_proof + '\n'
        if not row['payload'].get('cli_turn_v1', {}).get('api_text', '').startswith(expected):
            return None
        result = asdict(self.authority._receipt(row))
        if result['status'] == 'terminal':
            saved = await asyncio.to_thread(admission_result, self.authority.db, row['admission_id'])
            if saved is not None:
                result.update(result=saved['result'], usage=saved.get('usage') or {})
        return result

    async def rpc(self, channel, method, params):
        # Internal coordinator API, never exposed as an unchecked browser proxy.
        response = await self.channel(channel).dispatch({"jsonrpc": "2.0", "id": uuid.uuid4().hex,
                                                         "method": method, "params": dict(params)})
        if "error" in response:
            reason = response["error"].get("data", {}).get("reason", "trainer_unavailable")
            error = RuntimeError(reason if isinstance(reason, str) and len(reason) <= 64 and reason.isascii() and reason.replace("_", "").isalnum() else "trainer_unavailable")
            # This is a native ERROR, not proof that admission did not commit.
            error.native_error = True
            raise error
        return response.get("result")

    async def bot(self, channel):
        # Native create is atomic resolve/adopt-before-mint for a titled Bot Chat.
        # Always resolve its name; a cached ID would break after compression.
        return await self.rpc(channel, "session.create", {"request_id": uuid.uuid4().hex, "source": "gui",
            "title": "Bot Chat", "hidden": True, "cwd": str(self.home), "toolsets": ["scisense", "no_mcp"],
            "follow_profile_config": True})

    async def close_channel(self, channel):
        current = self.connections.pop(channel, None)
        if current is None:
            return
        connection, transport = current
        try:
            await connection.close()
        finally:
            transport.closed = True

    async def close(self):
        if self._close_task is None:
            self._close_task = asyncio.create_task(self._close())
        return await asyncio.shield(self._close_task)

    async def _close(self):
        self.closed = True
        failed_channels = False
        channels = list(self.connections.values())
        self.connections.clear()
        for connection, transport in channels:
            try:
                await connection.close()
            except Exception:
                failed_channels = True
            finally:
                transport.closed = True
        if self._claimed and self.runner is not None:
            try:
                await self.runner.stop()
            except BaseException:
                # Keep the ownership fence and DB handles: the launcher must
                # prove process exit before a replacement may become writer.
                raise RuntimeError("owner_shutdown_incomplete") from None
        # Native stop can return normally with live writers. It decides which
        # DBs can close; never override that decision or release its fence here.
        # The coordinator must wait for physical process exit before replacement.
        if failed_channels:
            raise RuntimeError("owner_channel_close_failed")
        return {"requiresProcessExit": self._claimed}
