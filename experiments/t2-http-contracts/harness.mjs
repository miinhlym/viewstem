import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHttpProbe } from '../t2-http-boundary/http-probe.mjs';

export const path = value => ({ '@path': value });
const concat = (...args) => ({ '@call': 'concat', args });
// Synthetic credentials stay in memory. Reports contain only assertion outcomes.
export const credentials = Object.freeze({
  key: 'fixture-http-contract-key', token: 'fixture-http-contract-existing-token',
  email: 'fixture-http-contract-email', password: 'fixture-http-contract-password',
});
export const variants = ['public', 'api-key-header', 'api-key-params', 'bearer',
  'login-bearer', 'login-header', 'login-params'];
export const isLogin = variant => variant.startsWith('login-');

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('FIXTURE_TIMEOUT')), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

export async function setup(options = {}) {
  const received = [], authorized = [], resolved = [], timers = new Set(), sockets = new Set();
  let loginCount = 0;
  const trustedCaller = Object.freeze({ id: options.wrongCaller ? 'unauthorized-service-user' : 'authorized-service-user' });
  const servers = [];
  let apiOrigin, authOrigin;
  const handler = role => async (req, res) => {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const url = new URL(req.url, role === 'api' ? apiOrigin : authOrigin);
      const row = { role, method: req.method, pathname: url.pathname,
        params: Object.fromEntries(url.searchParams), headers: req.headers,
        body: body ? JSON.parse(body) : undefined };
      received.push(row);
      res.setHeader('content-type', 'application/json');
      if (url.pathname.endsWith('/login')) {
        const sequence = ++loginCount;
        if (options.loginFailure === 'http') { res.statusCode = 401; res.end('{}'); return; }
        const token = options.loginFailure === 'missing' ? undefined
          : options.loginFailure === 'non-string' ? 17 : `fixture-http-contract-login-token-${sequence}`;
        res.end(JSON.stringify({ data: { accessToken: token }, privateLoginField: 'fixture-private-login-only' }));
      } else if (url.pathname.endsWith('/echo')) {
        // The API owns this intentional echo. The executor must preserve it.
        res.end(JSON.stringify({ echoed: req.headers.authorization ?? req.headers['x-api-key']
          ?? req.headers['x-access-token'] ?? url.searchParams.get('api_key') ?? url.searchParams.get('access_token') }));
      } else {
        res.end(JSON.stringify({ ok: true, resource: url.pathname, term: url.searchParams.get('term') }));
      }
    } catch { res.destroy(); }
  };
  async function listen(role) {
    const server = createServer(handler(role));
    servers.push(server);
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await bounded(new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
    }));
    return `http://127.0.0.1:${server.address().port}`;
  }
  apiOrigin = await listen('api');
  authOrigin = await listen('auth');
  const allowedDestination = destination => {
    const url = new URL(destination);
    if (options.denyFinalQuery && url.searchParams.has('exfil')) return false;
    return (url.origin === apiOrigin && ['/v1/data', '/v1/echo', '/v1/current', '/v1/login'].includes(url.pathname))
      || (url.origin === authOrigin && url.pathname === '/auth/login');
  };
  const authorizer = context => {
    authorized.push(context);
    return options.permissiveAuthorize === true || (context.caller === trustedCaller
      && context.caller.id === 'authorized-service-user' && allowedDestination(context.destination));
  };
  const resolver = async (reference, context) => {
    resolved.push({ reference, ...context });
    if (context.caller !== trustedCaller || context.caller.id !== 'authorized-service-user'
        || !allowedDestination(context.destination)) throw { code: 'EXECUTION_BLOCKED' };
    const value = credentials[reference.replace('reference-', '')];
    if (value === undefined) throw { code: 'EXECUTION_BLOCKED' };
    assert(context.signal instanceof AbortSignal);
    assert.equal(context.signal.aborted, false);
    return value;
  };
  const execute = createHttpProbe({
    caller: trustedCaller, authorize: authorizer, resolveSecret: resolver,
    requestTimeoutMs: 2000,
    clock: {
      now: () => performance.now(),
      set(fn, ms) { const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms); timers.add(timer); return timer; },
      clear(timer) { clearTimeout(timer); timers.delete(timer); },
    },
  });
  function plan(variant) {
    const datasource = { kind: 'Http', baseUrl: `${apiOrigin}/v1`, headers: { Accept: 'application/json' } };
    if (variant === 'api-key-header') {
      datasource.secrets = { apiKey: 'reference-key' };
      datasource.headers['X-API-Key'] = path('/secrets/apiKey');
    } else if (variant === 'api-key-params') {
      datasource.secrets = { apiKey: 'reference-key' };
      datasource.params = { api_key: path('/secrets/apiKey') };
    } else if (variant === 'bearer') {
      datasource.secrets = { token: 'reference-token' };
      datasource.headers.Authorization = concat('Bearer ', path('/secrets/token'));
    } else if (isLogin(variant)) {
      datasource.secrets = { email: 'reference-email', password: 'reference-password' };
      datasource.auth = { kind: 'Login', request: {
        ...(variant === 'login-bearer' ? { baseUrl: `${authOrigin}/auth` } : {}),
        method: 'POST', path: 'login', headers: { 'Content-Type': 'application/json' },
        body: { email: path('/secrets/email'), password: path('/secrets/password') },
      }, token: path('/response/body/data/accessToken') };
      if (variant === 'login-bearer') datasource.headers.Authorization = concat('Bearer ', path('/auth/token'));
      else if (variant === 'login-header') datasource.headers['X-Access-Token'] = path('/auth/token');
      else datasource.params = { access_token: path('/auth/token') };
    }
    return { version: 1, requestId: `contract-${variant}`, datasource,
      request: { method: 'GET', path: '/data', params: { term: path('/ports/term') } }, inputs: { term: 'current-input' } };
  }
  let cleanup;
  return {
    plan, execute, received, authorized, resolved, trustedCaller, apiOrigin, authOrigin,
    evidence() { return { requests: received.length, loginRequests: loginCount,
      dataRequests: received.filter(row => !row.pathname.endsWith('/login')).length,
      authorizationCalls: authorized.length, secretResolutions: resolved.length, cleanup }; },
    async close() {
      await bounded(Promise.all(servers.map(server => new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
      }))));
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
      const ownedHandles = process._getActiveHandles().filter(handle => servers.includes(handle) || sockets.has(handle));
      cleanup = { listeningServers: servers.filter(server => server.listening).length,
        sockets: sockets.size, requestTimers: timers.size, activeOwnedHandles: ownedHandles.length };
      assert.deepEqual(cleanup, { listeningServers: 0, sockets: 0, requestTimers: 0, activeOwnedHandles: 0 });
    },
  };
}

export function checkSecretBoundary(result, plan) {
  assert.deepEqual(Object.keys(result).sort(), ['body', 'headers', 'status']);
  const serialized = JSON.stringify(result);
  for (const value of [...Object.values(credentials), 'fixture-private-login-only', 'fixture-http-contract-login-token-']) {
    assert.equal(serialized.includes(value), false);
  }
  assert.equal(JSON.stringify(plan).includes('fixture-http-contract-'), false);
}

export function checkTransmission(fixture, variant, result) {
  const { received, authorized, resolved, trustedCaller, apiOrigin, authOrigin } = fixture;
  assert.equal(result.status, 200);
  const login = received.find(row => row.pathname.endsWith('/login'));
  const data = received.find(row => !row.pathname.endsWith('/login'));
  assert.equal(received.length, isLogin(variant) ? 2 : 1);
  assert.equal(data.role, 'api'); assert.equal(data.method, 'GET'); assert.equal(data.pathname, '/v1/data');
  assert.equal(data.params.term, 'current-input'); assert.equal(data.headers.accept, 'application/json');
  const token = 'fixture-http-contract-login-token-1';
  const expected = variant === 'api-key-header' ? credentials.key
    : variant === 'bearer' ? `Bearer ${credentials.token}`
    : variant === 'login-bearer' ? `Bearer ${token}` : variant === 'login-header' ? token : undefined;
  assert.equal(data.headers['x-api-key'], variant === 'api-key-header' ? expected : undefined);
  assert.equal(data.headers.authorization, ['bearer', 'login-bearer'].includes(variant) ? expected : undefined);
  assert.equal(data.headers['x-access-token'], variant === 'login-header' ? expected : undefined);
  assert.equal(data.params.api_key, variant === 'api-key-params' ? credentials.key : undefined);
  assert.equal(data.params.access_token, variant === 'login-params' ? token : undefined);
  assert.equal(data.body, undefined);
  assert.equal(authorized.length, received.length * 2);
  assert(authorized.every(context => context.caller === trustedCaller));
  assert(resolved.every(context => context.caller === trustedCaller && context.destination === (isLogin(variant)
    ? variant === 'login-bearer' ? `${authOrigin}/auth/login` : `${apiOrigin}/v1/login`
    : `${apiOrigin}/v1/data`)));
  assert.equal(resolved.length, variant === 'public' ? 0 : isLogin(variant) ? 2 : 1);
  if (login) {
    assert.equal(login.role, variant === 'login-bearer' ? 'auth' : 'api');
    assert.equal(login.method, 'POST');
    assert.deepEqual(login.body, { email: credentials.email, password: credentials.password });
    assert.equal(login.headers['content-type'], 'application/json');
    assert.equal(login.headers.authorization, undefined); assert.equal(login.headers['x-access-token'], undefined);
    assert.equal(login.headers['x-api-key'], undefined); assert.deepEqual(login.params, {});
    // Node fetch adds its own Accept: */*. Datasource Accept is not inherited.
    assert.notEqual(login.headers.accept, 'application/json');
  }
}
