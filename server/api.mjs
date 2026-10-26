import { createServer } from 'node:http';
import { createHandler } from '../workers/meal-parser/src/index.js';
import { createFirebaseAuthenticator } from '../workers/meal-parser/src/auth.js';
import { MAX_BODY } from '../workers/meal-parser/src/schema.js';

// Bound incoming chunks without cancelling a Web stream backed by the HTTP socket.
export function readBody(req, signal, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    const timer = setTimeout(() => fail('upstream_timeout', 504), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', data); req.off('end', end); req.off('error', error);
      signal.removeEventListener('abort', abort);
    };
    const fail = (code, status) => {
      cleanup(); req.pause(); reject(Object.assign(Error(code), { status }));
    };
    const data = chunk => {
      size += chunk.length;
      if (size > MAX_BODY) return fail('media_too_large', 413);
      chunks.push(chunk);
    };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const error = () => fail('bad_request', 400);
    const abort = () => fail('upstream_timeout', 504);
    req.on('data', data); req.once('end', end); req.once('error', error);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

// OLS owns TLS/static files. This process exposes only the API on loopback.
export function createMealApi({ env, provider, keyResolver, deadlineMs = 65000, bodyTimeoutMs = 15000, maxConcurrent = 1, trainer = null }) {
  if (env?.ALLOWED_ORIGINS !== 'https://ntzg.pp.ua' ||
      !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(env?.FIREBASE_PROJECT || '') ||
      env.FIREBASE_PROJECT.startsWith('demo-') || !env.ALLOWED_UIDS ||
      !Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 2 ||
      !Number.isInteger(bodyTimeoutMs) || bodyTimeoutMs <= 0 || bodyTimeoutMs > 15000 ||
      !Number.isInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > 65000)
    throw Error('server_config_invalid');
  if(env.TRAINER_ENABLED==='true'&&(!trainer||typeof trainer.accepts!=='function'&&(!env.TRAINER_OWNER_UID||!env.ALLOWED_UIDS.split(',').includes(env.TRAINER_OWNER_UID))))throw Error('server_config_invalid');
  const handler = createHandler({
    authenticate: createFirebaseAuthenticator({ keyResolver }),
    provider, localTranscription: true,
  });
  const trainerAuthenticate = createFirebaseAuthenticator({ keyResolver });
  const active = new Set();
  const pending = new Set();
  let closing = false;
  const send = (res, status, data, headers = {}) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(typeof data === 'string' ? data : JSON.stringify(data));
  };
  const server = createServer({ requestTimeout: 15000, headersTimeout: 10000,
    keepAliveTimeout: 5000, maxHeaderSize: 20000 }, async (req, res) => {
    const reject = (status, code) => {
      // Do not retain a connection carrying a rejected or unread body.
      res.shouldKeepAlive = false;
      send(res, status, { error: code });
    };
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) return reject(404, 'not_found');
    const route = req.url.split('?')[0];
    if (route === '/meal-api/health' && req.method === 'GET')
      return send(res, closing ? 503 : 200, { ok: !closing, inferenceEnabled: env.LIVE_ENABLED === 'true' });
    const trainerRoute=trainer && env.TRAINER_ENABLED==='true' && route.startsWith('/meal-api/trainer/');
    if (!trainerRoute && !['/meal-api/transcribe', '/meal-api/analyze'].includes(route)) return reject(404, 'not_found');
    if (!(trainerRoute ? ['GET','PUT','POST','OPTIONS'] : ['POST','OPTIONS']).includes(req.method)) return reject(405, 'method_not_allowed');
    for (const name of ['origin', 'authorization', 'content-type']) {
      if (req.rawHeaders.filter((_, i) => i % 2 === 0).filter(x => x.toLowerCase() === name).length > 1)
        return reject(400, 'bad_request');
    }
    const sameOriginRead=trainerRoute&&req.method==='GET'&&!req.headers.origin&&req.headers['sec-fetch-site']==='same-origin';
    if (req.headers.origin !== env.ALLOWED_ORIGINS && !sameOriginRead) return reject(403, 'origin_forbidden');
    if (Number(req.headers['content-length']) > MAX_BODY) return reject(413, 'media_too_large');
    if (closing) return reject(503, 'unavailable');
    if (active.size >= maxConcurrent) return reject(429, 'rate_limited');
    const controller = new AbortController();
    active.add(controller);
    let complete;
    const completion = new Promise(resolve => { complete = resolve; });
    pending.add(completion);
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', abort);
    req.once('aborted', abort);
    const timer = setTimeout(() => {
      res.shouldKeepAlive = false;
      send(res, 504, { error: 'upstream_timeout' });
      controller.abort();
    }, deadlineMs);
    try {
      const url = env.ALLOWED_ORIGINS + route.replace('/meal-api', '');
      const headers = {
        Origin: req.headers.origin || env.ALLOWED_ORIGINS,
        Authorization: req.headers.authorization || '',
        'Content-Type': req.headers['content-type'] || '',
        ...(req.headers['content-length'] ? { 'Content-Length': req.headers['content-length'] } : {}),
      };
      // Authenticate before buffering even a chunk of an untrusted body. The handler
      // verifies again at inference time so this preflight cannot bypass its checks.
      if (trainerRoute) {
        if(req.method==='OPTIONS')return send(res,204,'',{'Access-Control-Allow-Origin':env.ALLOWED_ORIGINS,'Access-Control-Allow-Methods':'GET, PUT, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});
        const uid=await trainerAuthenticate(new Request(url,{headers}),env);
        if(!(env.ALLOWED_UIDS||'').split(',').includes(uid)||(typeof trainer.accepts==='function'?trainer.accepts(uid)!==true:uid!==env.TRAINER_OWNER_UID))throw Object.assign(Error('pilot_forbidden'),{status:403});
        if(req.method==='POST'&&route==='/meal-api/trainer/turns'&&env.LIVE_ENABLED!=='true')throw Object.assign(Error('live_disabled'),{status:503});
        let body;
        if(['POST','PUT'].includes(req.method)){if(headers['Content-Type']!=='application/json')throw Error('bad_request');const bytes=await readBody(req,controller.signal,bodyTimeoutMs);body=bytes.length?JSON.parse(bytes.toString('utf8')):{};}
        const response=await trainer.handle(uid,route.slice('/meal-api/trainer'.length),req.method,body,{signal:controller.signal,ownerToken:headers.Authorization.slice(7)});
        return send(res,response.status,await response.text(),{'Access-Control-Allow-Origin':env.ALLOWED_ORIGINS,...Object.fromEntries(response.headers)});
      }
      if (req.method === 'POST') await handler.authorize(new Request(url, { headers }), env);
      if (controller.signal.aborted) return;
      const request = new Request(url, {
        method: req.method, headers,
        ...(req.method === 'POST' ? { body: await readBody(req, controller.signal, bodyTimeoutMs) } : {}),
        signal: controller.signal,
      });
      const response = await handler.fetch(request, env);
      if (!controller.signal.aborted)
        send(res, response.status, await response.text(), Object.fromEntries(response.headers));
    } catch (error) {
      const publicErrors = {media_missing:404,data_auth_required:401,connection_auth_required:503,connection_unconfigured:503,media_quota:409,media_unsupported:409,media_conflict:409,media_unavailable:503,canonical_history_required:409,draft_conflict:409,draft_frozen:409,date_draft_conflict:409,notes_disabled:409,note_confirmation_required:409,save_unconfirmed:409,context_conflict:409,context_unavailable:503,invalid_quantity:400,invalid_food_note:400,note_conflict:409,turn_gone:410,conversation_gone:410,draft_too_large:413,invalid_request:400,invalid_date:400,invalid_image:400,message_too_large:413,context_too_large:413,not_found:404,turn_conflict:409,trainer_busy:409,history_conflict:409,composer_conflict:409,trainer_unavailable:503,unauthorized:401,pilot_forbidden:403,live_disabled:503,media_too_large:413,upstream_timeout:504};
      if (!controller.signal.aborted) reject(publicErrors[error.message] || 400, publicErrors[error.message] ? error.message : 'bad_request');
    } finally {
      clearTimeout(timer);
      res.off('close', abort);
      req.off('aborted', abort);
      active.delete(controller);
      pending.delete(completion);
      complete();
    }
  });
  server.maxConnections = 32;
  server.maxRequestsPerSocket = 100;
  return {
    async listen(port = 8787) {
      if (!Number.isInteger(port) || port < 0 || port > 65535 || (port !== 0 && port < 1024)) throw Error('port_invalid');
      await new Promise((resolve, reject) => {
        const fail = error => { server.off('listening', ready); reject(error); };
        const ready = () => { server.off('error', fail); resolve(); };
        server.once('error', fail); server.once('listening', ready);
        server.listen(port, '127.0.0.1');
      });
      return server.address();
    },
    async close() {
      closing = true;
      for (const controller of active) controller.abort();
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      await Promise.all(pending);
      await trainer?.close();
    },
  };
}
