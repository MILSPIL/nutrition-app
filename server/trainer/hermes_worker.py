"""Single-turn canonical Hermes worker. IPC is the only model/tool transport.
The launcher must enforce OS file/network isolation before this module loads.
No real provider credential or arbitrary model URL is accepted by the protocol.
"""
import asyncio, base64, hashlib, json, os, queue, sys, threading, time, uuid, socket
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

wire = sys.stdout
sys.stdout = sys.stderr  # Third-party output must never become protocol messages.
wire_lock = threading.Lock()
pending, pending_lock, commands = {}, threading.Lock(), queue.Queue()
MAX_LINE = 20 * 1024 * 1024
phase = "setup"
input_buffer = bytearray()

def read_line():
    # A daemon blocked on BufferedReader triggers SIGABRT during Python shutdown.
    # Raw descriptor reads hold no interpreter-owned buffered I/O lock.
    global input_buffer
    while b"\n" not in input_buffer:
        chunk = os.read(0, 65536)
        if not chunk:
            return b""
        input_buffer.extend(chunk)
        if len(input_buffer) > MAX_LINE:
            raise ValueError("ipc_limit")
    line, _, rest = input_buffer.partition(b"\n")
    input_buffer = bytearray(rest)
    return bytes(line)


def emit(value):
    with wire_lock:
        wire.write(json.dumps(value, ensure_ascii=False) + '\n')
        wire.flush()

def read_wire():
    while True:
        line = read_line()
        if not line or len(line) > MAX_LINE:
            commands.put({'type': 'orphan'})
            return
        try:
            data = json.loads(line)
            if data.get('type') == 'reply':
                with pending_lock:
                    item = pending.get(data.get('id'))
                if item:
                    item['reply'] = data
                    item['event'].set()
            else:
                commands.put(data)
        except (ValueError, TypeError):
            commands.put({'type': 'orphan'})
            return

def ask(kind, value):
    ident = uuid.uuid4().hex
    item = {'event': threading.Event()}
    with pending_lock:
        pending[ident] = item
    try:
        emit({'type': kind, 'id': ident, **value})
        if not item['event'].wait(46):
            raise RuntimeError('ipc_timeout')
        reply = item['reply']
        if reply.get('error'):
            raise RuntimeError('gateway_refused')
        return reply
    finally:
        with pending_lock:
            pending.pop(ident, None)

class Relay(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, code, body, kind='application/json'):
        self.send_response(code)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.path not in ('/v1/models', '/models'):
            return self.respond(404, b'{}')
        self.respond(200, json.dumps({'data': [{'id': 'claude-sonnet-5-5', 'context_window': 200000, 'max_output_tokens': 4096}]}).encode())

    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if self.path != '/v1/messages' or not 0 < size <= MAX_LINE:
                return self.respond(400, b'{}')
            payload = json.loads(self.rfile.read(size))
            reply = ask('model', {'payload': payload})
            self.respond(reply['status'], base64.b64decode(reply['data']), reply['contentType'])
        except Exception:
            self.respond(400, b'{"type":"error","error":{"type":"invalid_request_error","message":"gateway_refused"}}')

async def main(setup):
    global phase
    home, source = Path(os.environ['HERMES_HOME']), Path(setup['source'])
    if setup['isolation'] == 'macos-seatbelt':
        file_denied = network_denied = False
        try:
            Path(setup['readDenyCanary']).read_bytes()
        except PermissionError:
            file_denied = True
        sock = socket.socket()
        sock.settimeout(1)
        try:
            sock.connect(('203.0.113.1', 443))
        except PermissionError:
            network_denied = True
        finally:
            sock.close()
        assert file_denied and network_denied, 'isolation_failed'
        emit({'type': 'isolation', 'fileDenied': True, 'networkDenied': True})
    expected = json.loads(Path(__file__).with_name('hermes-config.json').read_text())
    assert json.loads((home / 'config.yaml').read_text()) == expected, 'runtime_config_mismatch'
    assert setup['mode'] in ('start', 'recover', 'cleanup')
    sys.path.insert(0, str(source))
    from hermes_privacy import enable_secure_deletion, finish_media_cleanup
    from aiohttp import ClientSession
    from tools.registry import registry
    from toolsets import create_custom_toolset
    from gateway.config import Platform, PlatformConfig, GatewayConfig
    from gateway.run import GatewayRunner
    from gateway.platforms.api_server import APIServerAdapter
    from gateway.run_runtime import initialize_gateway_runtime
    from gateway.runtime_ownership import process_ownership
    from hermes_state_registry import close_all_under

    names = ['food_lookup', 'read_confirmed_day', 'read_plan', 'read_trainer_context', 'propose_food_draft', 'propose_context_update']
    for name in names:
        def handler(args, _name=name, **_):
            return json.dumps(ask('tool', {'name': _name, 'arguments': args})['result'], ensure_ascii=False)
        registry.register(name=name, toolset='scisense', schema=setup['toolSchemas'][name], handler=handler, check_fn=lambda: True)
    create_custom_toolset('scisense', 'SciSense tools', names)
    relay = ThreadingHTTPServer(('127.0.0.1', 18751), Relay)
    relay.daemon_threads = True
    relay_thread = threading.Thread(target=relay.serve_forever, daemon=True)
    relay_thread.start()
    platform = PlatformConfig(enabled=True, extra={'host': '127.0.0.1', 'port': 18752, 'key': setup['apiKey'], 'model_name': 'scisense'})
    process_ownership.reserve([home])
    runner = GatewayRunner(GatewayConfig(platforms={Platform.API_SERVER: platform}, multiplex_profiles=False, stt_enabled=False, max_concurrent_sessions=1, loop_watchdog=False))
    run_id, session_id, terminal = setup.get('runId'), setup.get('sessionId'), False
    try:
        await initialize_gateway_runtime(runner)
        enable_secure_deletion(runner.session_authority.db)
        adapter = APIServerAdapter(platform)
        adapter.gateway_runner = runner
        adapter.set_message_handler(runner._handle_message)
        runner.adapters[Platform.API_SERVER] = adapter
        assert await adapter.connect()
        assert await adapter._ensure_session_db_async() is runner.session_authority.db
        assert adapter._run_idempotency_store.durable
        async with ClientSession(headers={'Authorization': 'Bearer ' + setup['apiKey']}) as client:
            async def request(method, path, body=None, headers=None):
                async with client.request(method, 'http://127.0.0.1:18752' + path, json=body, headers=headers) as res:
                    return res.status, await res.json()

            async def resolve_if_unknown(allowed):
                if not run_id:
                    return
                status, current = await request('GET', '/v1/runs/' + run_id)
                if status == 200 and current.get('status') == 'unknown' and allowed:
                    status, _ = await request('POST', '/v1/runs/' + run_id + '/resolve-unknown', {'admission_id': current['admission_id'], 'execution_generation': current['execution_generation']})
                    assert status == 200, 'reconcile_failed'

            if setup['mode'] == 'start':
                content = [{'type': 'text', 'text': setup['input']['text']}]
                content += [{'type': 'image_url', 'image_url': {'url': 'data:' + image['type'] + ';base64,' + image['data']}} for image in setup['images']]
                snapshot = dict(setup['snapshot'])
                history = snapshot.pop('history', [])
                history = [{'role': m['role'], 'content': json.dumps({'scisenseHistoryId': m['id'], 'content': m['content']}, ensure_ascii=False, separators=(',', ':'))} for m in history]
                body = {'input': [{'role': 'user', 'content': content}], 'instructions': json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')), 'conversation_history': history}
                status, data = await request('POST', '/v1/runs', body, {'Idempotency-Key': setup['turnId']})
                assert status in (200, 201, 202), 'admission_failed'
                run_id = data.get('run_id') or data['id']
                session_id = run_id
            elif not run_id:
                # Read-only lookup covers a lost native admission ACK; never resubmit a POST.
                scope = hashlib.sha256(('default\0' + setup['apiKey']).encode()).hexdigest()
                store = adapter._run_idempotency_store
                with store._lock:
                    row = store._conn.execute('SELECT run_id FROM run_idempotency WHERE scope=? AND idempotency_key=?', (scope, setup['turnId'])).fetchone()
                if row:
                    run_id = session_id = row[0]
            if run_id:
                emit({'type': 'run', 'runId': run_id, 'sessionId': session_id})
            else:
                emit({'type': 'status', 'state': 'not_executed'})
                terminal = True
            delivered = False
            while True:
                if setup['mode'] == 'cleanup':
                    command = {'type': 'cleanup', 'id': setup['commandId']}
                    setup['mode'] = 'recover'
                else:
                    try:
                        command = commands.get_nowait()
                    except queue.Empty:
                        command = None
                if command:
                    kind = command.get('type')
                    if kind in ('stop', 'orphan'):
                        await resolve_if_unknown(command.get('reconcile') is True)
                        if run_id and not terminal:
                            await request('POST', '/v1/runs/' + run_id + '/stop', {})
                        stopped = not run_id or terminal
                        if not stopped:
                            for _ in range(100):
                                status, status_data = await request('GET', '/v1/runs/' + run_id)
                                if status == 200 and status_data.get('status') in ('completed', 'failed', 'cancelled', 'interrupted'):
                                    stopped = True
                                    break
                                await asyncio.sleep(.02)
                        emit({'type': 'stopped', 'id': command.get('id'), 'stopped': stopped})
                        if kind == 'orphan':
                            break  # Keep native status/media for Node's durable recovery.
                    elif kind == 'cleanup':
                        phase = 'native_delete'
                        await resolve_if_unknown(command.get('reconcile') is True)
                        if run_id and len(setup['cleanupMedia']) != len(setup.get('input', {}).get('media', [])):
                            raise RuntimeError('cleanup_metadata_missing')
                        if run_id:
                            for _ in range(100):
                                status, deleted = await request('DELETE', '/api/sessions/' + session_id)
                                if status != 409:
                                    break
                                await asyncio.sleep(.02)
                            assert status in (200, 404) and (status == 404 or deleted.get('deleted')), 'delete_pending'
                        phase = 'runner_stop'
                        authority = runner.session_authority
                        await runner.stop()
                        close_all_under(home)
                        phase = 'media_cleanup'
                        media = setup['cleanupMedia']
                        proof = finish_media_cleanup(home, media, ownership=process_ownership, database=authority.db, session_id=session_id or 'never-admitted')
                        phase = 'cleanup_done'
                        emit({'type': 'cleaned', 'id': command['id'], 'cleaned': True, 'proof': proof})
                        break
                if run_id and not delivered:
                    status, data = await request('GET', '/v1/runs/' + run_id)
                    if status == 404:
                        delivered = True
                        emit({'type': 'status', 'state': 'unknown'})
                    elif status == 200 and data.get('status') == 'unknown':
                        delivered = True
                        emit({'type': 'status', 'state': 'unknown'})
                    elif status == 200 and data.get('status') in ('completed', 'failed', 'cancelled', 'interrupted'):
                        terminal = delivered = True
                        state = data['status']
                        if state == 'completed':
                            emit({'type': 'result', 'result': {'text': data.get('output', '')}})
                        else:
                            emit({'type': 'status', 'state': 'failed' if state == 'interrupted' else state})
                await asyncio.sleep(.02)
    finally:
        await runner.stop()
        close_all_under(home)
        process_ownership.release(home)
        relay.shutdown()
        relay.server_close()

if __name__ == '__main__':
    os.umask(0o077)
    try:
        setup = json.loads(read_line())
        threading.Thread(target=read_wire, daemon=True).start()
        asyncio.run(main(setup))
    except Exception as error:
        emit({'type': 'failure', 'error': 'hermes_worker_failed', 'phase': phase, 'kind': type(error).__name__})
        sys.exit(1)
