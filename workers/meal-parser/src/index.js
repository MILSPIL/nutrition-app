import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_PROJECT = 'nutrition-tracker-ua';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const ItemSchema = z.object({
  dictated: z.string(),
  name: z.string(),
  matchedName: z.string().nullable(),
  letter: z.string(),
  gramsDictated: z.number(),
  weightState: z.enum(['raw', 'cooked', 'unknown']),
  p: z.number(),
  f: z.number(),
  c: z.number(),
  cal: z.number(),
  estimated: z.boolean(),
  note: z.string().nullable()
});

const ParseSchema = z.object({
  items: z.array(ItemSchema),
  unparsed: z.array(z.string())
});

const buildSystemPrompt = (catalog) => `Ти розбираєш надиктований українською текст про з'їдену їжу (можливі помилки голосового розпізнавання) і повертаєш структурований список продуктів.

КАТАЛОГ продуктів поточного прийому їжі. Поля: letter (літера категорії), category, products (name, raw = стандартна порція в грамах СИРОГО, coef = вага готового / вага сирого, p/f/c/cal на 100 г сирого):
${JSON.stringify(catalog)}

Правила:
1. Продукт мапиться на каталог, якщо є розумний збіг ("варена картопля" -> "картопля"). Тоді matchedName = ТОЧНА назва з каталогу, letter = його літера, p/f/c/cal переписуй з каталогу, estimated = false.
2. weightState: "cooked" якщо названа вага готової страви ("вареного рису 170 г"), "raw" якщо сирої або продукт не готують (помідор, хліб), "unknown" якщо незрозуміло. Ваги НЕ перераховуй, віддавай як надиктовано в gramsDictated.
3. Нема в каталозі: matchedName = null, estimated = true, оціни p/f/c/cal на 100 г у стані як надиктовано, обери найближчу літеру каталогу за профілем макросів, у name дай чисту коротку назву.
4. Смаження без згадки олії: додай окремий item з name "олія", gramsDictated 10, estimated true, note "додано автоматично: смаження".
5. Побутові міри переводь у грами: чайна ложка цукру ~8 г, столова ~25 г, склянка рідини ~250 г. Сумнів між чайною і столовою - бери меншу, estimated = true, поясни в note.
6. Обірвані чи незрозумілі шматки клади в unparsed дослівно. НІЧОГО не вигадуй.
7. dictated = шматок вихідного тексту про цей продукт, дослівно.`;

const json = (body, status, cors) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });

const corsHeaders = (origin, env) => {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',');
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  // Недозволеному origin заголовок не віддаємо взагалі
  if (allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
};

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get('Origin') || '', env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, cors);
    }

    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      return json({ error: 'unauthorized' }, 401, cors);
    }
    try {
      await jwtVerify(token, JWKS, {
        issuer: `https://securetoken.google.com/${FIREBASE_PROJECT}`,
        audience: FIREBASE_PROJECT
      });
    } catch (e) {
      return json({ error: 'unauthorized' }, 401, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'bad_request' }, 400, cors);
    }
    if (!body || typeof body !== 'object' || !body.text || !Array.isArray(body.catalog)) {
      return json({ error: 'bad_request' }, 400, cors);
    }

    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const response = await client.messages.parse({
        model: 'claude-opus-5',
        max_tokens: 16000,
        system: buildSystemPrompt(body.catalog),
        messages: [{ role: 'user', content: body.text }],
        output_config: { format: zodOutputFormat(ParseSchema) }
      });

      if (!response.parsed_output) {
        return json({ error: 'parse_failed' }, 502, cors);
      }
      return json(response.parsed_output, 200, cors);
    } catch (e) {
      return json({ error: 'upstream_failed' }, 502, cors);
    }
  }
};
