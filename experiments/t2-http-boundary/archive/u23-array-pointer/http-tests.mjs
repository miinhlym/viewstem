import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createHttpProbe } from './http-probe.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
class Clock {
  time = 0;
  timers = new Map();
  next = 0;
  now = () => this.time;
  set = (fn, ms) => { const id = ++this.next; this.timers.set(id, { at: this.time + ms, fn, ms }); return id; };
  clear = id => this.timers.delete(id);
  advance(ms) {
    const target = this.time + ms;
    for (;;) {
      const next = [...this.timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].fn();
    }
    this.time = target;
  }
}
const fixtureSecret = 'fixture-secret-not-a-real-credential';
const loginPrivate = 'fixture-private-login-field';
const publicCaller = Object.freeze({ user: 'fixture-trusted-user' });
const ref = path => ({ '@path': path });
const bearer = { '@call': 'concat', args: ['Bearer ', ref('/auth/token')] };

async function fixture(config = {}) {
  const seen = [];
  const waiting = [];
  const releases = [];
  let token = 0;
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const url = new URL(req.url, 'http://fixture.invalid');
    seen.push({ path: url.pathname, query: [...url.searchParams], headers: req.headers, body, method: req.method });
    for (const waiter of waiting) if (seen.length >= waiter.count) waiter.resolve();
    const isLogin = url.pathname.endsWith('/login');
    const behavior = isLogin ? config.login ?? {} : config.data ?? {};
    if (behavior.hold) {
      const gate = deferred();
      releases.push(gate.resolve);
      await gate.promise;
    }
    const payload = isLogin ? { token: `fixture-token-${++token}`, private: loginPrivate }
      : behavior.echoHeader ? { echoedCredential: req.headers[behavior.echoHeader] } : { ok: true };
    res.writeHead(behavior.status ?? 200, {
      'content-type': behavior.type ?? 'application/json',
      ...(behavior.redirect ? { location: '/redirect-target' } : {}),
      ...behavior.headers,
    });
    if (behavior.holdBody) {
      res.flushHeaders();
      const gate = deferred();
      releases.push(gate.resolve);
      await gate.promise;
    }
    if (!res.destroyed) res.end(own(behavior, 'raw') ? behavior.raw : JSON.stringify(own(behavior, 'json') ? behavior.json : payload));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const origin = new URL(baseUrl).origin;
  const clock = new Clock();
  const secretCalls = [];
  const environment = {
    clock, caller: publicCaller,
    authorize: ({ caller, destination }) => caller === publicCaller && new URL(destination).origin === origin && new URL(destination).pathname.startsWith('/v1/'),
    resolveSecret: async (reference, context) => { secretCalls.push({ reference, ...context }); return fixtureSecret; },
  };
  const basePlan = () => ({ version: 1, requestId: 'fixture-call', datasource: { kind: 'Http', baseUrl }, request: { method: 'GET', path: '/data' }, inputs: { name: 'fixture-input' } });
  function loginPlan() {
    const plan = basePlan();
    plan.datasource.secrets = { password: 'fixture-reference' };
    plan.datasource.auth = {
      kind: 'Login', request: { method: 'POST', path: '/login', body: { password: ref('/secrets/password'), name: ref('/ports/name') } },
      token: ref('/response/body/token'),
    };
    plan.datasource.headers = { Authorization: bearer, 'X-Outer': 'outer' };
    plan.datasource.params = { outer: 'value' };
    return plan;
  }
  return {
    baseUrl, seen, clock, secretCalls, environment, basePlan, loginPlan, evidence: {},
    execute: options => createHttpProbe({ ...environment, ...options }),
    async waitFor(count) {
      if (seen.length >= count) return;
      let watchdog;
      try {
        await Promise.race([new Promise(resolve => waiting.push({ count, resolve })), new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error('Fixture did not receive request')), 5000); })]);
      } finally { clearTimeout(watchdog); }
    },
    release() { for (const release of releases.splice(0)) release(); },
    async close() {
      for (const release of releases.splice(0)) release();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const settle = promise => promise.then(value => ({ value }), error => ({ error }));
function errorIs(outcome, code) {
  assert.equal(outcome.error?.code, code);
  assert.deepEqual(Object.keys(outcome.error).sort(), ['code', 'message']);
  const serialized = JSON.stringify(outcome);
  for (const marker of [fixtureSecret, loginPrivate, 'fixture-token-', 'fixture-input']) assert.equal(serialized.includes(marker), false);
}
const cases = [];
const test = (id, config, run) => cases.push({ id, config, run });

test('P01-public-methods-and-current-definition', {}, async f => {
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const plan = f.basePlan(); plan.request.method = method;
    const result = await f.execute()(plan);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, method === 'HEAD' ? null : { ok: true });
  }
  assert.deepEqual(f.seen.map(item => item.method), ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
});
test('P02-secret-without-login', {}, async f => {
  const plan = f.basePlan(); plan.datasource.secrets = { key: 'fixture-reference' };
  plan.datasource.headers = { 'X-API-Key': ref('/secrets/key') };
  const result = await f.execute()(plan);
  assert.equal(f.seen[0].headers['x-api-key'], fixtureSecret);
  assert.equal(f.secretCalls[0].caller, publicCaller);
  assert.equal(f.secretCalls[0].destination, `${f.baseUrl}/data`);
  assert.equal(JSON.stringify(result).includes(fixtureSecret), false);
});
test('P03-login-isolation-and-request-overrides', {}, async f => {
  const plan = f.loginPlan();
  plan.request.headers = { 'x-outer': null, Authorization: 'fixture-request-override' };
  plan.request.params = { outer: null, empty: '', list: [true, 0, 'a b'] };
  const result = await f.execute()(plan);
  assert.deepEqual(result.body, { ok: true });
  const [login, api] = f.seen;
  assert.equal(login.path, '/v1/login');
  assert.equal(login.headers.authorization, undefined);
  assert.equal(login.headers['x-outer'], undefined);
  assert.deepEqual(login.query, []);
  assert.deepEqual(JSON.parse(login.body), { password: fixtureSecret, name: 'fixture-input' });
  assert.equal(api.headers.authorization, 'fixture-request-override');
  assert.equal(api.headers['x-outer'], undefined);
  assert.deepEqual(api.query, [['empty', ''], ['list', 'true'], ['list', '0'], ['list', 'a b']]);
  assert.equal(JSON.stringify(result).includes(loginPrivate), false);
});
test('P04-concurrent-login-no-sharing', {}, async f => {
  const execute = f.execute();
  await Promise.all([execute(f.loginPlan()), execute(f.loginPlan()), execute(f.loginPlan())]);
  assert.equal(f.seen.filter(item => item.path.endsWith('/login')).length, 3);
  assert.equal(new Set(f.seen.filter(item => item.path.endsWith('/data')).map(item => item.headers.authorization)).size, 3);
  await execute(f.loginPlan());
  assert.equal(f.seen.filter(item => item.path.endsWith('/login')).length, 4);
});
for (const [name, json] of [['missing', {}], ['number', { token: 42 }], ['empty', { token: '' }], ['control', { token: 'bad\r\ntoken' }]]) {
  test(`P05-invalid-token-${name}`, { login: { json } }, async f => {
    const outcome = await settle(f.execute()(f.loginPlan()));
    errorIs(outcome, name === 'missing' ? 'REFERENCE_NOT_FOUND' : 'HTTP_ERROR');
    assert.equal(f.seen.length, 1);
  });
}
for (const [name, login] of [['failure', { status: 401, raw: fixtureSecret }], ['redirect', { status: 302, redirect: true }]]) {
  test(`P06-login-${name}`, { login }, async f => { errorIs(await settle(f.execute()(f.loginPlan())), 'HTTP_ERROR'); assert.equal(f.seen.length, 1); });
}
test('P07-authority-not-from-plan', {}, async f => {
  const plan = f.loginPlan(); plan.caller = publicCaller;
  errorIs(await settle(f.execute({ caller: { user: 'untrusted' } })(plan)), 'EXECUTION_BLOCKED');
  assert.equal(f.seen.length, 0); assert.equal(f.secretCalls.length, 0);
  plan.datasource.auth.request.path = '/unauthorized';
  errorIs(await settle(f.execute({ authorize: () => false })(plan)), 'EXECUTION_BLOCKED');
  assert.equal(f.seen.length, 0);
});
for (const location of ['datasource', 'request', 'login']) {
  test(`P08-reserved-name-before-login-${location}`, {}, async f => {
    const plan = f.loginPlan();
    const target = location === 'login' ? plan.datasource.auth.request : plan[location];
    target.headers = { Host: null };
    errorIs(await settle(f.execute()(plan)), 'INVALID_DEFINITION');
    assert.equal(f.seen.length, 0); assert.equal(f.secretCalls.length, 0);
  });
}
test('P09-timeout-during-login', { login: { hold: true } }, async f => {
  const pending = settle(f.execute({ requestTimeoutMs: 1000 })(f.loginPlan()));
  await f.waitFor(1); f.clock.advance(1000);
  errorIs(await pending, 'TIMEOUT'); f.release();
  assert.equal(f.seen.length, 1); assert.equal(f.clock.timers.size, 0);
});
test('P10-one-budget-login-plus-api', { login: { hold: true }, data: { hold: true } }, async f => {
  const pending = settle(f.execute({ requestTimeoutMs: 1000 })(f.loginPlan()));
  await f.waitFor(1); f.clock.advance(700); f.release();
  await f.waitFor(2); f.clock.advance(300);
  errorIs(await pending, 'TIMEOUT'); assert.equal(f.clock.timers.size, 0);
});
test('P11-cancel-before-start', {}, async f => {
  const controller = new AbortController(); controller.abort(new Error(fixtureSecret));
  errorIs(await settle(f.execute()(f.loginPlan(), { signal: controller.signal })), 'CANCELLED');
  assert.equal(f.seen.length, 0); assert.equal(f.secretCalls.length, 0);
});
for (const stage of ['login', 'data']) {
  test(`P12-cancel-${stage}`, { [stage]: { hold: true } }, async f => {
    const controller = new AbortController();
    const pending = settle(f.execute()(f.loginPlan(), { signal: controller.signal }));
    await f.waitFor(stage === 'login' ? 1 : 2); controller.abort();
    errorIs(await pending, 'CANCELLED'); assert.equal(f.clock.timers.size, 0);
  });
}
test('P13-ignore-abort-late-login-no-api', { login: { hold: true } }, async f => {
  const controller = new AbortController();
  const transported = deferred();
  let transportCalls = 0;
  const transport = async (url, options) => {
    transportCalls++;
    const response = await fetch(url, { ...options, signal: undefined });
    transported.resolve();
    return response;
  };
  const pending = settle(f.execute({ transport })(f.loginPlan(), { signal: controller.signal }));
  await f.waitFor(1); controller.abort(); errorIs(await pending, 'CANCELLED');
  f.release(); await transported.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(transportCalls, 1); assert.equal(f.seen.length, 1);
});
test('P14-cancel-during-secret-resolution', {}, async f => {
  const controller = new AbortController(); const started = deferred(); const gate = deferred();
  const pending = settle(f.execute({ resolveSecret: async () => { started.resolve(); await gate.promise; return fixtureSecret; } })(f.loginPlan(), { signal: controller.signal }));
  await started.promise; controller.abort(); errorIs(await pending, 'CANCELLED');
  gate.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.seen.length, 0);
});
test('P15-timeout-in-response-body', { data: { holdBody: true } }, async f => {
  const pending = settle(f.execute({ requestTimeoutMs: 1000 })(f.basePlan()));
  await f.waitFor(1); f.clock.advance(1000);
  errorIs(await pending, 'TIMEOUT');
});
test('P16-large-timeout-is-chunked', { data: { hold: true } }, async f => {
  const timeout = 2147483648;
  const pending = settle(f.execute({ requestTimeoutMs: timeout })(f.basePlan()));
  await f.waitFor(1); f.clock.advance(timeout - 1);
  assert.equal(f.clock.timers.size, 1); assert.equal([...f.clock.timers.values()][0].ms, 1);
  f.clock.advance(1); errorIs(await pending, 'TIMEOUT');
});
test('P17-body-encodings', {}, async f => {
  for (const [value, contentType, expected] of [[undefined, undefined, ''], [null, undefined, 'null'], ['abc', undefined, 'abc'], ['abc', 'application/json', '"abc"'], [{ a: ['', '한글'], skip: null }, 'application/x-www-form-urlencoded', 'a=&a=%ED%95%9C%EA%B8%80']]) {
    const plan = f.basePlan(); plan.request.method = 'POST';
    if (value !== undefined) plan.request.body = value;
    if (contentType) plan.request.headers = { 'Content-Type': contentType };
    await f.execute()(plan); assert.equal(f.seen.at(-1).body, expected);
  }
});
for (const [name, data] of [['redirect', { status: 302, redirect: true }], ['failure', { status: 500, raw: fixtureSecret }], ['invalid-json', { raw: '{invalid' }], ['non-finite-json', { raw: '{"value":1e309}' }], ['binary', { type: 'application/octet-stream', raw: 'binary' }]]) {
  test(`P18-response-${name}`, { data }, async f => { errorIs(await settle(f.execute()(f.basePlan())), 'HTTP_ERROR'); assert.equal(f.seen.length, 1); });
}
for (const status of [204, 205]) {
  test(`P19-empty-response-${status}`, { data: { status, type: 'application/octet-stream', raw: '' } }, async f => { assert.equal((await f.execute()(f.basePlan())).body, null); });
}
test('P20-transport-error-sanitized', {}, async f => {
  errorIs(await settle(f.execute({ transport: async () => { const error = new Error(fixtureSecret); error.stack = loginPrivate; throw error; } })(f.basePlan())), 'HTTP_ERROR');
  assert.equal(f.seen.length, 0);
});
test('P21-upstream-reflected-secret', { data: { echoHeader: 'x-api-key' } }, async f => {
  const plan = f.basePlan();
  plan.datasource.secrets = { key: 'fixture-reference' };
  plan.datasource.headers = { 'X-API-Key': ref('/secrets/key') };
  const outcome = await settle(f.execute()(plan));
  assert.equal(f.seen.length, 1);
  assert.equal(f.seen[0].headers['x-api-key'], fixtureSecret);
  // U21: API response content belongs to the API. No default secret substring filter.
  assert.equal(outcome.error, undefined);
  assert.deepEqual(outcome.value.body, { echoedCredential: fixtureSecret });
  assert.deepEqual(Object.keys(outcome.value).sort(), ['body', 'headers', 'status']);
  assert.equal(JSON.stringify(outcome.value.headers).includes(fixtureSecret), false);
});
test('P22-api-response-headers-belong-to-api', { data: { headers: { 'x-api-output': fixtureSecret } } }, async f => {
  const plan = f.basePlan(); plan.datasource.secrets = { key: 'fixture-reference' };
  plan.datasource.headers = { 'X-API-Key': ref('/secrets/key') };
  const result = await f.execute()(plan);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(result.headers['x-api-output'], fixtureSecret);
  assert.equal(f.seen[0].headers['x-api-key'], fixtureSecret);
});
test('P23-internal-login-data-not-added-or-logged', { login: { headers: { 'x-login-private': loginPrivate } } }, async f => {
  const plan = f.loginPlan();
  const before = structuredClone(plan);
  const logs = [];
  const originals = Object.fromEntries(['log', 'warn', 'error', 'debug', 'info'].map(key => [key, console[key]]));
  let result;
  try {
    for (const key of Object.keys(originals)) console[key] = (...args) => logs.push(args);
    result = await f.execute()(plan);
  } finally { for (const [key, fn] of Object.entries(originals)) console[key] = fn; }
  assert.deepEqual(Object.keys(result).sort(), ['body', 'headers', 'status']);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(result.headers['x-login-private'], undefined);
  for (const marker of [fixtureSecret, loginPrivate, 'fixture-token-']) {
    assert.equal(JSON.stringify(result).includes(marker), false);
    assert.equal(JSON.stringify(logs).includes(marker), false);
  }
  assert.deepEqual(plan, before);
});
for (const source of ['authorize', 'resolveSecret']) {
  test(`P24-${source}-error-sanitized`, {}, async f => {
    const error = new Error(fixtureSecret, { cause: new Error(loginPrivate) });
    error.code = 'EXECUTION_BLOCKED'; error.request = { token: 'fixture-token-private' };
    const outcome = await settle(f.execute({ [source]: async () => { throw error; } })(f.loginPlan()));
    errorIs(outcome, 'EXECUTION_BLOCKED');
    assert.equal(f.seen.length, 0);
  });
}
test('P25-denied-secret-reference-no-transport', {}, async f => {
  const plan = f.loginPlan(); plan.datasource.secrets.password = 'fixture-forbidden-reference';
  let resolverCalls = 0;
  const resolveSecret = async (reference, { caller, destination }) => {
    resolverCalls++;
    assert.equal(caller, publicCaller); assert.equal(destination, `${f.baseUrl}/login`);
    if (reference !== 'fixture-reference') throw { code: 'EXECUTION_BLOCKED', message: fixtureSecret };
    return fixtureSecret;
  };
  errorIs(await settle(f.execute({ resolveSecret })(plan)), 'EXECUTION_BLOCKED');
  assert.equal(resolverCalls, 1); assert.equal(f.seen.length, 0);
});
for (const stage of ['login', 'data']) {
  test(`P26-denied-destination-${stage}`, {}, async f => {
    const plan = f.loginPlan();
    const target = stage === 'login' ? plan.datasource.auth.request : plan.request;
    target.baseUrl = 'https://not-authorized.invalid';
    let forbiddenTransports = 0;
    const transport = (url, options) => {
      // Any guard failure is observed without connecting to an external service.
      if (new URL(url).origin !== new URL(f.baseUrl).origin) {
        forbiddenTransports++;
        throw new Error('Fixture blocked external transport');
      }
      return fetch(url, options);
    };
    errorIs(await settle(f.execute({ transport })(plan)), 'EXECUTION_BLOCKED');
    assert.equal(forbiddenTransports, 0);
    assert.equal(f.seen.length, stage === 'login' ? 0 : 1);
    assert.equal(f.secretCalls.length, stage === 'login' ? 0 : 1);
  });
}
test('P27-denied-path-on-allowed-origin', {}, async f => {
  const plan = f.basePlan(); plan.request.path = '/private';
  plan.datasource.secrets = { key: 'fixture-reference' };
  plan.datasource.headers = { 'X-API-Key': ref('/secrets/key') };
  const authorize = ({ caller, destination }) => caller === publicCaller && destination === `${f.baseUrl}/data`;
  errorIs(await settle(f.execute({ authorize })(plan)), 'EXECUTION_BLOCKED');
  assert.equal(f.secretCalls.length, 0); assert.equal(f.seen.length, 0);
});
test('P28-final-query-policy-denial', {}, async f => {
  const plan = f.basePlan(); plan.request.params = { tenant: 'forbidden' };
  const authorize = ({ destination }) => destination === `${f.baseUrl}/data`;
  errorIs(await settle(f.execute({ authorize })(plan)), 'EXECUTION_BLOCKED');
  assert.equal(f.seen.length, 0);
});
for (const [stage, forbiddenPath] of [
  ['login-request', '/auth/token'],
  ['data-request', '/response/body/private'],
  ['token-extraction', '/ports/name'],
]) {
  test(`P29-context-denial-${stage}`, {}, async f => {
    const plan = f.loginPlan();
    if (stage === 'token-extraction') plan.datasource.auth.token = ref(forbiddenPath);
    else if (stage === 'login-request') plan.datasource.auth.request.headers = { 'X-Invalid': ref(forbiddenPath) };
    else plan.request.headers = { 'X-Invalid': ref(forbiddenPath) };
    errorIs(await settle(f.execute()(plan)), 'REFERENCE_NOT_FOUND');
    assert.equal(f.seen.length, stage === 'login-request' ? 0 : 1);
  });
}
test('P30-token-extraction-cannot-read-secrets', {}, async f => {
  const plan = f.loginPlan();
  // auth.token has the Login response context, not the request's secrets context.
  plan.datasource.auth.token = ref('/secrets/password');
  const outcome = await settle(f.execute()(plan));
  f.evidence = {
    expected: 'Reject forbidden token-extraction context; no second secret lookup or data request',
    outcome: outcome.error ? { kind: 'error', code: outcome.error.code } : { kind: 'success', status: outcome.value.status },
    secretLookupCount: f.secretCalls.length,
    emptyDestinationLookupCount: f.secretCalls.filter(call => call.destination === '').length,
    loginRequests: f.seen.filter(item => item.path.endsWith('/login')).length,
    dataRequests: f.seen.filter(item => item.path.endsWith('/data')).length,
    dataAuthorizationUsedSecretInsteadOfLoginToken: f.seen.some(item => item.path.endsWith('/data') && item.headers.authorization === `Bearer ${fixtureSecret}`),
  };
  errorIs(outcome, 'REFERENCE_NOT_FOUND');
  assert.equal(f.secretCalls.length, 1);
  assert.equal(f.seen.length, 1);
});
for (const root of ['secrets/password', 'ports/name', 'states/name', 'auth/token', 'responseLike/body/token']) {
  test(`P31-token-nested-context-denial-${root.split('/')[0]}`, {}, async f => {
    const plan = f.loginPlan();
    plan.datasource.auth.token = { '@call': 'concat', args: ['prefix-', ref(`/${root}`)] };
    errorIs(await settle(f.execute()(plan)), 'REFERENCE_NOT_FOUND');
    assert.equal(f.secretCalls.length, 1);
    assert.equal(f.secretCalls.every(call => call.destination === `${f.baseUrl}/login`), true);
    assert.equal(f.seen.length, 1);
  });
}
for (const [name, path] of [['relative', 'response/body/token'], ['fragment', '#/response/body/token'], ['bad-escape', '/response/body/to~2ken'], ['non-string', 42]]) {
  test(`P32-token-invalid-pointer-${name}`, {}, async f => {
    const plan = f.loginPlan(); plan.datasource.auth.token = ref(path);
    errorIs(await settle(f.execute()(plan)), 'INVALID_EXPRESSION');
    assert.equal(f.secretCalls.length, 1); assert.equal(f.seen.length, 1);
  });
}
for (const [name, login, expression, token] of [
  ['escaped-key', { json: { 'a/b': { '~token': 'fixture-escaped-token' } } }, ref('/response/body/a~1b/~0token'), 'fixture-escaped-token'],
  ['response-header', { headers: { 'x-login-token': 'fixture-header-token' } }, ref('/response/headers/x-login-token'), 'fixture-header-token'],
  ['nested-function', {}, { '@call': 'concat', args: [ref('/response/body/token'), '-suffix'] }, 'fixture-token-1-suffix'],
  ['response-field-named-secrets', { json: { secrets: { password: 'fixture-response-token' } } }, ref('/response/body/secrets/password'), 'fixture-response-token'],
  ['returned-string-is-data', { json: { token: '@path:/secrets/password' } }, ref('/response/body/token'), '@path:/secrets/password'],
]) {
  test(`P33-token-response-read-${name}`, { login }, async f => {
    const plan = f.loginPlan(); plan.datasource.auth.token = expression;
    const result = await f.execute()(plan);
    assert.deepEqual(result.body, { ok: true });
    assert.equal(f.seen[1].headers.authorization, `Bearer ${token}`);
    assert.equal(f.secretCalls.length, 1);
    assert.equal(f.secretCalls[0].destination, `${f.baseUrl}/login`);
  });
}
for (const [name, thrown] of [
  ['undefined', undefined], ['null', null], ['string', fixtureSecret], ['number', 42],
  ['plain-object', { message: fixtureSecret, stack: loginPrivate, cause: { token: 'fixture-token-private' } }],
  ['unknown-code', { code: 'VENDOR_FAILURE', message: fixtureSecret }],
  ['non-string-code', { code: { detail: fixtureSecret }, message: loginPrivate }],
]) {
  test(`P34-resolver-opaque-error-${name}`, {}, async f => {
    const resolveSecret = async () => { throw thrown; };
    errorIs(await settle(f.execute({ resolveSecret })(f.loginPlan())), 'HTTP_ERROR');
    assert.equal(f.seen.length, 0);
  });
}
test('P35-resolver-error-code-accessor-throws', {}, async f => {
  // Host callbacks may reject with arbitrary exception objects. Reading their
  // metadata must not bypass the executor's public error/credential boundary.
  const exception = new Error('Fixture resolver failure');
  Object.defineProperty(exception, 'code', { get() { throw new Error(fixtureSecret); } });
  const resolveSecret = async () => { throw exception; };
  const outcome = await settle(f.execute({ resolveSecret })(f.loginPlan()));
  f.evidence = {
    expected: 'Sanitized HTTP_ERROR without internal values or native exception/stack',
    actualCode: outcome.error?.code ?? null,
    nativeErrorReturned: outcome.error instanceof Error,
    publicMessageContainsInternalSecret: outcome.error?.message?.includes(fixtureSecret) === true,
    publicStackContainsInternalSecret: outcome.error?.stack?.includes(fixtureSecret) === true,
    requests: f.seen.length,
  };
  errorIs(outcome, 'HTTP_ERROR');
  assert.equal(f.seen.length, 0);
});
for (const variant of ['own-getter', 'inherited-getter', 'proxy-get', 'proxy-descriptor-throws', 'revoked-proxy', 'code-coercion', 'symbol-code', 'poison-other-fields']) {
  test(`P36-error-metadata-${variant}`, {}, async f => {
    let executedUntrustedCode = 0;
    const explode = () => { executedUntrustedCode++; throw new Error(fixtureSecret); };
    let thrown;
    let expectedCode = 'HTTP_ERROR';
    if (variant === 'own-getter') thrown = Object.defineProperty({}, 'code', { get: explode });
    if (variant === 'inherited-getter') thrown = Object.create(Object.defineProperty({}, 'code', { get: explode }));
    if (variant === 'proxy-get') {
      thrown = new Proxy({ code: 'EXECUTION_BLOCKED' }, { get: explode });
      expectedCode = 'EXECUTION_BLOCKED';
    }
    if (variant === 'proxy-descriptor-throws') thrown = new Proxy({}, { getOwnPropertyDescriptor: explode });
    if (variant === 'revoked-proxy') { const pair = Proxy.revocable({}, {}); pair.revoke(); thrown = pair.proxy; }
    if (variant === 'code-coercion') thrown = { code: { [Symbol.toPrimitive]: explode, toString: explode, toJSON: explode } };
    if (variant === 'symbol-code') thrown = { code: Symbol(fixtureSecret) };
    if (variant === 'poison-other-fields') {
      thrown = { code: 'EXECUTION_BLOCKED' }; expectedCode = 'EXECUTION_BLOCKED';
      for (const key of ['message', 'stack', 'cause', 'toJSON']) Object.defineProperty(thrown, key, { get: explode });
    }
    errorIs(await settle(f.execute({ resolveSecret: async () => { throw thrown; } })(f.loginPlan())), expectedCode);
    assert.equal(executedUntrustedCode, variant === 'proxy-descriptor-throws' ? 1 : 0);
    assert.equal(f.seen.length, 0);
  });
}
for (const source of ['authorize', 'transport']) {
  test(`P37-error-boundary-${source}`, {}, async f => {
    const thrown = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error(fixtureSecret); } });
    errorIs(await settle(f.execute({ [source]: async () => { throw thrown; } })(f.basePlan())), 'HTTP_ERROR');
    assert.equal(f.seen.length, 0);
  });
}
for (const terminal of ['CANCELLED', 'TIMEOUT']) {
  test(`P38-late-opaque-error-preserves-${terminal}`, {}, async f => {
    const started = deferred(); const gate = deferred(); const controller = new AbortController();
    const thrown = Object.defineProperty({}, 'code', { get() { throw new Error(fixtureSecret); } });
    const execute = f.execute({ requestTimeoutMs: 1000, resolveSecret: async () => { started.resolve(); await gate.promise; throw thrown; } });
    const pending = settle(execute(f.loginPlan(), { signal: controller.signal }));
    await started.promise;
    if (terminal === 'CANCELLED') controller.abort(); else f.clock.advance(1000);
    errorIs(await pending, terminal);
    gate.resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.seen.length, 0); assert.equal(f.clock.timers.size, 0);
  });
}
for (const [name, items, path, expected] of [
  ['array-index', ['first', 'second'], '/ports/items/1', 'second'],
  ['object-field-named-length', { length: 'ordinary-field' }, '/ports/items/length', 'ordinary-field'],
]) {
  test(`P39-pointer-valid-${name}`, {}, async f => {
    const plan = f.basePlan(); plan.inputs.items = items;
    plan.request = { method: 'POST', path: '/data', body: { selected: ref(path) } };
    const result = await f.execute()(plan);
    assert.deepEqual(result.body, { ok: true });
    assert.deepEqual(JSON.parse(f.seen[0].body), { selected: expected });
  });
}
for (const segment of ['-', '01', '-1', '1.0', '2']) {
  test(`P40-pointer-invalid-array-index-${segment}`, {}, async f => {
    const plan = f.basePlan(); plan.inputs.items = ['first', 'second'];
    plan.request = { method: 'POST', path: '/data', body: { selected: ref(`/ports/items/${segment}`) } };
    const outcome = await settle(f.execute()(plan));
    assert.ok(['REFERENCE_NOT_FOUND', 'INVALID_EXPRESSION', 'TYPE_MISMATCH'].includes(outcome.error?.code));
    errorIs(outcome, outcome.error.code);
    assert.equal(f.seen.length, 0);
  });
}
test('P41-array-length-is-not-a-json-pointer-element', {}, async f => {
  const plan = f.basePlan(); plan.inputs.items = ['first', 'second'];
  plan.request = { method: 'POST', path: '/data', body: { selected: ref('/ports/items/length') } };
  const outcome = await settle(f.execute()(plan));
  f.evidence = {
    expected: 'Array traversal accepts existing integer elements only; reject length before transport',
    outcome: outcome.error ? { kind: 'error', code: outcome.error.code } : { kind: 'success', status: outcome.value.status },
    requests: f.seen.length,
    submittedBody: f.seen[0] ? JSON.parse(f.seen[0].body) : null,
  };
  assert.ok(['REFERENCE_NOT_FOUND', 'INVALID_EXPRESSION', 'TYPE_MISMATCH'].includes(outcome.error?.code), 'Array length metadata must not be exposed as a JSON Pointer element');
  assert.equal(f.seen.length, 0);
});

const results = [];
let stoppedAt = null;
for (const item of cases) {
  const f = await fixture(item.config);
  let failure;
  try { await item.run(f); }
  catch (error) { failure = { name: error.name, message: error.message }; }
  finally { await f.close(); }
  results.push({ id: item.id, passed: !failure, requestCount: f.seen.length,
    ...(Object.keys(f.evidence).length ? { evidence: f.evidence } : {}), ...(failure ? { failure } : {}) });
  if (failure) { stoppedAt = item.id; break; }
}
const sourceSha256 = {};
for (const path of ['package.json', 'http-probe.mjs', 'http-tests.mjs', 'header-profile.mjs']) {
  sourceSha256[path] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
}
const report = {
  generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch,
  scope: 'Independent Node fetch executor over real loopback HTTP with controlled whole-plan clock; no core integration',
  stopOnFirstProblem: true, stoppedAt, sourceSha256, results,
  summary: { executed: results.length, passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length },
  notRun: ['Browser response/body compatibility', 'Service authorization and secret store integration', 'Minimal SDK types', 'Core/renderer integration'],
};
await writeFile(new URL(`results/${process.argv[2] ?? 'http-node24.json'}`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, stoppedAt }));
if (stoppedAt) process.exitCode = 1;
