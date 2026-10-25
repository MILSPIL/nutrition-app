"""Synthetic SDK transport only; never an application launcher."""
import hashlib
import json
import os
from pathlib import Path
import re
import httpx
import hermes_personal_connection as connection
import hermes_personal_payer as payer

root = Path(os.environ['SCISENSE_FIXTURE_ROOT']).resolve()
home = Path(os.environ['HERMES_HOME']).resolve()
if root not in home.parents or not home.name.startswith('synthetic-payer-'):
    raise RuntimeError('synthetic_home_required')
# macOS has no Linux tmpfs. Production has no bypass flag; this test replaces
# only the assertion, after the OS canaries, in an isolated fake-credential home.
connection.assert_tmpfs_home = payer.assert_tmpfs_home = lambda candidate: home if Path(candidate).resolve() == home else (_ for _ in ()).throw(RuntimeError('synthetic_home_required'))


def transport(_transport, request):
    assert request.method == 'POST' and str(request.url).endswith('/responses')
    data = request.read()
    if request.headers.get('content-encoding') == 'zstd':
        from compression.zstd import decompress
        data = decompress(data)
    body = json.loads(data)
    assert body['model'] == 'synthetic-model'
    items = body['input']
    last_user = max(index for index, item in enumerate(items) if item.get('role') == 'user')
    current = json.dumps(items[last_user])
    match = re.search(r'SCISENSE-INPUT-V1 ([A-Za-z0-9-]+)', current)
    assert match and ('fresh-snapshot' in current or 'schemaVersion' in current)
    ident = hashlib.sha256(match[1].encode()).hexdigest()[:16]
    finished = any(item.get('type') == 'function_call_output' for item in items[last_user:])
    if finished:
        item = {'id': 'synthetic-message-' + ident, 'type': 'message', 'role': 'assistant', 'status': 'completed', 'phase': 'final_answer',
            'content': [{'type': 'output_text', 'text': 'Спільний native діалог збережений.', 'annotations': []}]}
    else:
        item = {'id': 'synthetic-function-' + ident, 'call_id': 'synthetic-tool-' + ident, 'type': 'function_call', 'name': 'read_confirmed_day',
                'arguments': '{"dayRef":"today"}', 'status': 'completed'}
    events = [{'type': 'response.output_item.done', 'output_index': 0, 'item': item},
        {'type': 'response.completed', 'response': {'id': 'synthetic-response-' + ident, 'object': 'response', 'model': 'synthetic-model',
            'status': 'completed', 'output': [item], 'usage': {'input_tokens': 10, 'output_tokens': 5, 'total_tokens': 15}}}]
    with (root / 'synthetic-physical-posts.jsonl').open('a') as log:
        log.write(json.dumps({'turnHash': ident, 'toolFinished': finished}) + '\n')
    return httpx.Response(200, headers={'Content-Type': 'text/event-stream'}, content=b''.join(b'data: ' + json.dumps(event).encode() + b'\n\n' for event in events))


httpx.HTTPTransport.handle_request = transport
from hermes_personal_payer_worker import main
raise SystemExit(main())
