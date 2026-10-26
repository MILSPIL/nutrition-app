"""Synthetic SDK transport only; never an application launcher."""
import hashlib
import base64
import json
import os
from pathlib import Path
from urllib.parse import parse_qs
import re
import httpx
import hermes_personal_connection as connection
import hermes_personal_payer as payer

home = Path(os.environ['HERMES_HOME']).resolve()
if not home.is_relative_to(Path('/run/scisense-payer')) or home.name != 'payer-home':
    raise RuntimeError('synthetic_home_required')
# Keep the production Linux tmpfs/UID/empty-HOME assertion. Mock only HTTPX.
def observe(value):
    import sys
    print('SCISENSE-PERSONAL-OBSERVATION ' + json.dumps(value), file=sys.stderr, flush=True)


def current_token():
    return 'synthetic.' + base64.urlsafe_b64encode(json.dumps({'exp': 4102444800}, separators=(',', ':')).encode()).decode().rstrip('=') + '.signature'


def transport(_transport, request):
    assert request.method == 'POST'
    if str(request.url) == 'https://auth.openai.com/oauth/token':
        fields = parse_qs(request.read().decode())
        assert fields.get('grant_type') == ['refresh_token'] and fields.get('refresh_token') == ['synthetic-refresh']
        from hermes_cli.auth_constants import CODEX_OAUTH_CLIENT_ID
        assert fields.get('client_id') == [CODEX_OAUTH_CLIENT_ID]
        token = current_token()
        observe({'kind': 'oauth_refresh'})
        return httpx.Response(200, json={'access_token': token, 'refresh_token': 'synthetic-rotated-refresh', 'token_type': 'Bearer'})
    assert str(request.url).endswith('/responses')
    assert request.headers.get('authorization') == 'Bearer ' + current_token(), 'synthetic_current_credential_required'
    data = request.read()
    if request.headers.get('content-encoding') == 'zstd':
        from compression.zstd import decompress
        data = decompress(data)
    body = json.loads(data)
    items = body['input']
    last_user = max(index for index, item in enumerate(items) if item.get('role') == 'user')
    current = json.dumps(items[last_user])
    match = re.search(r'SCISENSE-INPUT-V1 ([A-Za-z0-9-]+)', current)
    assert match and ('fresh-snapshot' in current or 'schemaVersion' in current)
    ident = hashlib.sha256(match[1].encode()).hexdigest()[:16]
    finished = any(item.get('type') == 'function_call_output' for item in items[last_user:])
    ready_case = False
    phase = 'other'
    for part in items[last_user].get('content', []):
        if not isinstance(part, dict) or not isinstance(part.get('text'), str):
            continue
        marker = re.search(r'SCISENSE-INPUT-V1 [A-Za-z0-9-]+ [a-f0-9]{64}\n', part['text'])
        if marker and 'schemaVersion' in part['text'][marker.end():]:
            snapshot, _ = json.JSONDecoder().raw_decode(part['text'][marker.end():])
            ready_case = 'SYNTHETIC_READY_DRAFT' in snapshot.get('message', '')
            phase = 'owner_after_restart' if 'SYNTHETIC_AFTER_RESTART' in snapshot.get('message', '') else 'other'
    selected_after_change = False
    for part in items[last_user].get('content', []):
        if isinstance(part, dict) and isinstance(part.get('text'), str):
            marker = re.search(r'SCISENSE-INPUT-V1 [A-Za-z0-9-]+ [a-f0-9]{64}\n', part['text'])
            if marker and 'schemaVersion' in part['text'][marker.end():]:
                snapshot, _ = json.JSONDecoder().raw_decode(part['text'][marker.end():])
                selected_after_change = 'SYNTHETIC_MODEL_CHANGED' in snapshot.get('message', '')
    assert body['model'] == ('gpt-6-sol' if selected_after_change else 'synthetic-model')
    food_proposed = any(item.get('type') == 'function_call' and item.get('name') == 'propose_food_draft' for item in items[last_user:])
    if ready_case and finished and not food_proposed:
        draft = {'baseRevision': 0, 'dayRef': 'today', 'meal': 1, 'items': [{'itemId': '11111111-1111-4111-8111-111111111111',
            'name': 'Синтетична страва', 'quantity': {'value': 200, 'unit': 'g'}, 'preparation': 'cooked',
            'source': {'kind': 'estimate', 'estimateReason': 'recipe_estimate', 'assumptions': ['Синтетична оцінка для перевірки, не реальна їжа.'],
                'nutritionBasis': {'value': 100, 'unit': 'g'}, 'nutrients': {'p': 10, 'f': 3, 'c': 14, 'cal': 123}}}]}
        item = {'id': 'synthetic-draft-' + ident, 'call_id': 'synthetic-draft-tool-' + ident, 'type': 'function_call', 'name': 'propose_food_draft',
                'arguments': json.dumps(draft), 'status': 'completed'}
    elif finished:
        item = {'id': 'synthetic-message-' + ident, 'type': 'message', 'role': 'assistant', 'status': 'completed', 'phase': 'final_answer',
            'content': [{'type': 'output_text', 'text': 'Спільний native діалог збережений.', 'annotations': []}]}
    else:
        item = {'id': 'synthetic-function-' + ident, 'call_id': 'synthetic-tool-' + ident, 'type': 'function_call', 'name': 'read_confirmed_day',
                'arguments': '{"dayRef":"today"}', 'status': 'completed'}
    events = [{'type': 'response.output_item.done', 'output_index': 0, 'item': item},
        {'type': 'response.completed', 'response': {'id': 'synthetic-response-' + ident, 'object': 'response', 'model': body['model'],
            'status': 'completed', 'output': [item], 'usage': {'input_tokens': 10, 'output_tokens': 5, 'total_tokens': 15}}}]
    image_count = sum(1 for entry in items if isinstance(entry, dict) for part in entry.get('content', []) if isinstance(part, dict) and part.get('type') == 'input_image' and str(part.get('image_url', '')).startswith('data:image/png;base64,'))
    image_digests = [hashlib.sha256(base64.b64decode(part['image_url'].split(',', 1)[1], validate=True)).hexdigest() for entry in items if isinstance(entry, dict) for part in entry.get('content', []) if isinstance(part, dict) and part.get('type') == 'input_image' and str(part.get('image_url', '')).startswith('data:image/png;base64,')]
    observe({'kind': 'inference', 'phase': phase, 'turnHash': ident, 'imageDigests': image_digests, 'toolFinished': finished, 'imageCount': image_count, 'bodyBytes': len(data)})
    return httpx.Response(200, headers={'Content-Type': 'text/event-stream'}, content=b''.join(b'data: ' + json.dumps(event).encode() + b'\n\n' for event in events))


httpx.HTTPTransport.handle_request = transport
from hermes_personal_payer_entry import main
raise SystemExit(main())
