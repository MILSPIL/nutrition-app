"""Synthetic compatibility probe. Runs the actual pinned Hermes API and agent loop.
Only the model's HTTP endpoint and the six application tools are fixtures.
Run via the lab launcher with a fresh HERMES_HOME and OS network/file deny policy.
"""
import asyncio, base64, faulthandler, hashlib, io, json, os, secrets, socket, sys, threading, time, random
from pathlib import Path

PIN = "3f2afed3eb813cb00bd381d29b084d0e01de048f"
TOOLS = ["food_lookup", "read_confirmed_day", "read_plan", "read_trainer_context", "propose_food_draft", "propose_context_update"]
lab = Path(os.environ["SCISENSE_LAB"])
home = Path(os.environ["HERMES_HOME"])
assert home.is_relative_to(lab) and "synthetic" in home.name
mode = os.environ.get("SCISENSE_PROBE_MODE", "complete")
source = lab / "source"
sys.path.insert(0, str(source))

async def main():
    config = {
        "model":{"default":"claude-sonnet-5-5","provider":"custom","base_url":"http://127.0.0.1:18741","api_mode":"anthropic_messages","key_env":"SCISENSE_FAKE_PROVIDER_KEY"},
        "fallback_providers":[], "platform_toolsets":{"api_server":["scisense","no_mcp"],"cli":["scisense","no_mcp"]},
        "agent":{"max_turns":3,"image_input_mode":"native","disabled_toolsets":["memory","terminal","file","browser","web","delegate","skills","skill_manage","cronjob","session_search"]},
        "memory":{"memory_enabled":False,"user_profile_enabled":False,"nudge_interval":0,"provider":""},
        "auxiliary":{"background_review":{"enabled":False},"title_generation":{"enabled":False,"model_upgrade_enabled":False},"transient_retries":0}, "compression":{"enabled":False},
        "model_overrides":{"custom":{"claude-sonnet-5-5":{"supports_vision":True,"supports_tools":True,"context_window":200000}}},
        "telemetry":{"shared_metrics":{"enabled":False,"send":False}},
        "mcp_servers":{}, "plugins":{"enabled":False}, "tools":{"tool_search":{"enabled":"off"}},
    }
    home.mkdir(parents=True,exist_ok=True)
    (home/'config.yaml').write_text(json.dumps(config))
    curated = {
        'memories/USER.md':'SYNTHETIC_USER_CANARY_20261024',
        'memories/MEMORY.md':'SYNTHETIC_MEMORY_CANARY_20261024',
        'home/yura-context.md':'SYNTHETIC_CONTEXT_CANARY_20261024',
        'memories/scisense-confirmed.md':'SYNTHETIC_CONFIRMED_CANARY_20261024',
        'skills/trainer/SKILL.md':'SYNTHETIC_SKILL_CANARY_20261024',
    }
    for name, text in curated.items():
        target = home / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
    snapshot = '\n'.join((home/name).read_text() for name in curated)
    (home/'SOUL.md').write_text('Synthetic SciSense trainer. SYNTHETIC_SOUL_CANARY_20261024. Never change records without confirmation.')
    hashes_before = {name:hashlib.sha256((home/name).read_bytes()).hexdigest() for name in [*curated, 'SOUL.md']}
    from hermes_privacy import enable_secure_deletion, finish_media_cleanup
    from aiohttp import web, ClientSession
    from PIL import Image, PngImagePlugin
    from tools.registry import registry
    from toolsets import create_custom_toolset
    from gateway.config import Platform, PlatformConfig, GatewayConfig
    from gateway.run import GatewayRunner
    from gateway.platforms.api_server import APIServerAdapter
    from gateway.run_runtime import initialize_gateway_runtime
    from gateway.runtime_ownership import process_ownership

    requests, tool_calls = [], []
    png = io.BytesIO()
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("canary", "SCISENSE_SYNTHETIC_MEDIA_20261024")
    Image.frombytes("RGB", (128,128), random.Random(20261024).randbytes(128*128*3)).save(png, format="PNG", pnginfo=metadata)
    media_bytes = png.getvalue()
    media_base64 = base64.b64encode(media_bytes).decode()

    def handler(name):
        def invoke(args, **kwargs):
            tool_calls.append({"name": name, "args": args})
            if name == "food_lookup":
                return json.dumps({"results": [{"id": "synthetic-potato-cooked", "nutrients": {"p":2,"f":3,"c":20,"cal":115}, "basis": {"value":100,"unit":"g"}}]})
            if name == "read_trainer_context":
                return json.dumps({"revision": 1, "text": "SYNTHETIC_CONTEXT_CANARY_20261024"})
            return json.dumps({"ok": True, "proposalOnly": True})
        return invoke
    for name in TOOLS:
        registry.register(name=name, toolset="scisense", schema={"name":name,"description":"Synthetic SciSense fixture: " + name,"parameters":{"type":"object","properties":{"query":{"type":"string"},"items":{"type":"array","items":{"type":"object"}}}}}, handler=handler(name), check_fn=lambda:True)
    create_custom_toolset("scisense", "SciSense synthetic tools", TOOLS)

    async def model(request):
        data = await request.json()
        requests.append(data)
        (lab/'synthetic-provider-requests.json').write_text(json.dumps(requests,ensure_ascii=False,indent=2))
        if mode == 'cancel':
            await asyncio.sleep(.5)
            content = [{"type":"text","text":"CANCELLED_RESPONSE_MUST_NOT_COMMIT"}]
        elif len(requests) == 1:
            content = [{"type":"tool_use","id":"tool-food","name":"food_lookup","input":{"query":"cooked potato"}}, {"type":"tool_use","id":"tool-context","name":"read_trainer_context","input":{}}, {"type":"tool_use","id":"tool-forbidden","name":"terminal","input":{"command":"printf SCISENSE_FORBIDDEN_EXECUTION"}}, {"type":"tool_use","id":"tool-memory","name":"memory","input":{"action":"add","target":"user","content":"UNAPPROVED_MEMORY_CANARY"}}]
        elif len(requests) == 2:
            content = [{"type":"tool_use","id":"tool-draft","name":"propose_food_draft","input":{"items":[{"itemId":"synthetic-item","name":"Картопля","quantity":{"value":200,"unit":"g"}}]}}]
        else:
            content = [{"type":"text","text":"Синтетична чернетка готова. Підтвердження не виконано."}]
        reason = "tool_use" if content[0]["type"] == "tool_use" else "end_turn"
        reply = {"id":"msg-synthetic-"+str(len(requests)),"type":"message","role":"assistant","model":data["model"],"content":content,"stop_reason":reason,"stop_sequence":None,"usage":{"input_tokens":100,"output_tokens":20}}
        if not data.get("stream"):
            return web.json_response(reply)
        response = web.StreamResponse(headers={"Content-Type":"text/event-stream"})
        await response.prepare(request)
        async def emit(kind, value):
            await response.write(("event: "+kind+"\ndata: "+json.dumps(value,ensure_ascii=False)+"\n\n").encode())
        await emit("message_start", {"type":"message_start","message":{**reply,"content":[],"stop_reason":None,"usage":{"input_tokens":100,"output_tokens":0}}})
        for index, block in enumerate(content):
            start = {**block, **({"input":{}} if block["type"]=="tool_use" else {"text":""})}
            await emit("content_block_start", {"type":"content_block_start","index":index,"content_block":start})
            delta = {"type":"input_json_delta","partial_json":json.dumps(block["input"])} if block["type"]=="tool_use" else {"type":"text_delta","text":block["text"]}
            await emit("content_block_delta", {"type":"content_block_delta","index":index,"delta":delta})
            await emit("content_block_stop", {"type":"content_block_stop","index":index})
        await emit("message_delta", {"type":"message_delta","delta":{"stop_reason":reason,"stop_sequence":None},"usage":{"output_tokens":20}})
        await emit("message_stop", {"type":"message_stop"})
        await response.write_eof()
        return response
    mock_ready, mock_stop = threading.Event(), threading.Event()
    async def serve_mock():
        app = web.Application()
        app.router.add_post('/v1/messages', model)
        async def models(request):
            return web.json_response({'data':[{'id':'claude-sonnet-5-5','context_window':200000,'max_output_tokens':4096}]})
        app.router.add_get('/v1/models', models)
        app.router.add_get('/models', models)
        runner = web.AppRunner(app)
        await runner.setup()
        try:
            await web.TCPSite(runner,'127.0.0.1',18741).start()
            mock_ready.set()
            while not mock_stop.is_set():
                await asyncio.sleep(.05)
        finally:
            await runner.cleanup()
    mock_thread = threading.Thread(target=lambda:asyncio.run(serve_mock()), daemon=True)
    mock_thread.start()
    assert mock_ready.wait(5), 'mock provider did not start'
    key = secrets.token_hex(32)
    platform_config = PlatformConfig(enabled=True,extra={'host':'127.0.0.1','port':18742,'key':key,'model_name':'scisense'})
    process_ownership.reserve([home])
    runner = GatewayRunner(GatewayConfig(platforms={Platform.API_SERVER: platform_config}, multiplex_profiles=False, stt_enabled=False, max_concurrent_sessions=1, loop_watchdog=False))
    started = time.monotonic()
    try:
        await initialize_gateway_runtime(runner)
        enable_secure_deletion(runner.session_authority.db)
        adapter = APIServerAdapter(platform_config)
        adapter.gateway_runner = runner
        adapter.set_message_handler(runner._handle_message)
        runner.adapters[Platform.API_SERVER] = adapter
        assert await adapter.connect(), 'actual Hermes canonical API startup failed'
        authority = runner.session_authority
        assert authority is not None and adapter.gateway_runner is runner, 'canonical session authority missing'
        assert await adapter._ensure_session_db_async() is authority.db, 'API DELETE uses a different writer'
        assert authority.db._execute_write(lambda conn: conn.execute('PRAGMA secure_delete').fetchone()[0]) == 1
        async with ClientSession(headers={'Authorization':'Bearer '+key}) as client:
            async def req(method, path, body=None, headers=None):
                async with client.request(method,'http://127.0.0.1:18742'+path,json=body,headers=headers) as res:
                    return res.status, await res.json()
            status, capabilities = await req('GET','/v1/capabilities')
            assert status == 200 and capabilities['runtime']['mode'] == 'server_agent'
            features = capabilities['features']
            assert all(features.get(name) is True for name in ('run_submission','run_status','run_stop','session_resources'))
            assert features['runs_idempotency']['supported'] and features['runs_idempotency']['durable']
            assert capabilities['endpoints']['run_stop'] == {'method':'POST','path':'/v1/runs/{run_id}/stop'}
            assert capabilities['endpoints']['session_delete'] == {'method':'DELETE','path':'/api/sessions/{session_id}'}
            payload = {'input':[{'role':'user','content':[{'type':'text','text':'Синтетична картопля 200 г'},{'type':'image_url','image_url':{'url':'data:image/png;base64,'+media_base64}}]}],'instructions':snapshot+' Оброби їжу лише як чернетку.','conversation_history':[{'role':'user','content':'AUTHORITATIVE_HISTORY_CANARY'},{'role':'assistant','content':'Підтверджено лише синтетичну історію.'}]}
            status, result = await req('POST','/v1/runs',payload,{'Idempotency-Key':'synthetic-turn-001'})
            print(json.dumps({'runStartStatus':status,'runStart':result},ensure_ascii=False),flush=True)
            assert status in (200,201,202), result
            run_id = result['id'] if 'id' in result else result['run_id']
            if mode == 'cancel':
                for _ in range(100):
                    if requests:
                        break
                    await asyncio.sleep(.02)
                stop_status, stop = await req('POST','/v1/runs/'+run_id+'/stop',{})
                assert stop_status in (200,202), stop
            for _ in range(450):
                status, result = await req('GET','/v1/runs/'+run_id)
                if result.get('status') in ('completed','failed','cancelled'):
                    break
                await asyncio.sleep(.1)
            print(json.dumps({'runResult':result},ensure_ascii=False),flush=True)
            session_id = result.get('session_id',run_id)
            admissions = authority.db._read_all('SELECT status FROM session_admissions WHERE target_session_id=?', (session_id,))
            assert admissions, 'canonical session admission was not persisted'
            admission_statuses = [row['status'] for row in admissions]
            # Replay must return the same run without a fourth provider request.
            requests_before_replay = len(requests)
            replay_status, replay = await req('POST','/v1/runs',payload,{'Idempotency-Key':'synthetic-turn-001'})
            replay_ok = replay.get('run_id') == run_id and len(requests) == requests_before_replay
            print(json.dumps({'replay':replay,'requests':len(requests)}),flush=True)
            # The application must keep its durable result before asking Hermes to delete.
            (lab/('synthetic-result-'+mode+'.json')).write_text(json.dumps(result,ensure_ascii=False))
            for _ in range(100):
                delete_status, deleted = await req('DELETE','/api/sessions/'+session_id)
                if delete_status != 409:
                    break
                await asyncio.sleep(.02)
            # Native DELETE is insufficient on this pin. Finish only after all writer handles stop.
            assert delete_status == 200 and deleted.get('deleted') is True
            await runner.stop()
            from hermes_state_registry import close_all_under
            close_all_under(home)
            cleanup = finish_media_cleanup(home, [{'sha256':hashlib.sha256(media_bytes).hexdigest(),'suffix':'.png'}], ownership=process_ownership, database=authority.db, session_id=session_id)
            # SQLite overflow pages can split the image; also look for distributed fragments.
            needles = [media_bytes, media_base64.encode(), b'SCISENSE_SYNTHETIC_MEDIA_20261024']
            for data in (media_bytes, media_base64.encode()):
                needles.extend(data[i:i+256] for i in range(256,len(data)-256,1024))
            leaks = []
            for candidate in home.rglob('*'):
                if candidate.is_file():
                    data = candidate.read_bytes()
                    if any(needle in data for needle in needles):
                        leaks.append(str(candidate.relative_to(home)))
            image_blocks = [part for data in requests for message in data.get('messages',[]) for part in (message.get('content',[]) if isinstance(message.get('content'),list) else []) if part.get('type')=='image']

            print(json.dumps({'deleteStatus':delete_status,'deleted':deleted}),flush=True)
            curated_seen = {name:any(marker in json.dumps(data) for data in requests) for name,marker in curated.items()}
            summary = {'secureDeleteOnSharedWriter':True, 'privacyCleanup':cleanup, 'canonicalAuthority':True, 'admissionStatuses':admission_statuses, 'capabilitiesVerified':True, 'curatedFilesSeen':curated_seen, 'pin':PIN,'mode':mode,'actualHermes':True,'contextFilesUnchanged':all(hashlib.sha256((home/name).read_bytes()).hexdigest()==value for name,value in hashes_before.items()),'mockProviderRequests':len(requests),'tools':sorted({t['name'] for data in requests for t in data.get('tools',[])}),'toolCalls':tool_calls,'elapsedSeconds':round(time.monotonic()-started,3),'runStatus':result.get('status'),'deleteStatus':delete_status,'mediaSeen':any(part.get('source',{}).get('type')=='base64' and part['source'].get('data')==media_base64 for part in image_blocks),'mediaLeaks':leaks,'replaySameRun':replay_ok,'forbiddenToolsRejected':all(any("Tool '"+name+"' does not exist" in json.dumps(data) for data in requests) for name in ('terminal','memory')),'historySeen':any('AUTHORITATIVE_HISTORY_CANARY' in json.dumps(data) for data in requests),'soulSeen':any('SYNTHETIC_SOUL_CANARY' in json.dumps(data) for data in requests),'snapshotSeen':any('SYNTHETIC_USER_CANARY' in json.dumps(data) for data in requests)}
            (lab/('probe-summary-'+mode+'.json')).write_text(json.dumps(summary,ensure_ascii=False,indent=2))
            (lab/'synthetic-provider-requests.json').write_text(json.dumps(requests,ensure_ascii=False,indent=2))
            print(json.dumps(summary,ensure_ascii=False),flush=True)
            assert result.get('status') == ('cancelled' if mode == 'cancel' else 'completed'), 'unexpected terminal run status'
            assert summary['contextFilesUnchanged']
            assert delete_status == 200 and deleted.get('deleted') is True
            assert set(summary['tools']) == set(TOOLS), 'actual tools differ from the six-tool allowlist'
            assert summary['historySeen'] and summary['soulSeen'] and all(curated_seen.values())
            assert summary['mediaSeen'], 'structured photo did not reach the mock provider'
            if mode == 'complete':
                assert summary['forbiddenToolsRejected'], 'forbidden tool was not rejected'
                assert len(requests) == 3 and len(tool_calls) == 3
            else:
                assert len(requests) == 1 and not tool_calls
            assert summary['replaySameRun']
            assert not summary['mediaLeaks'], 'media persisted after DELETE session'
    finally:
        await runner.stop()
        process_ownership.release(home)
        mock_stop.set()
        await asyncio.to_thread(mock_thread.join, 5)

if __name__ == '__main__':
    faulthandler.dump_traceback_later(15, repeat=True)
    asyncio.run(main())
