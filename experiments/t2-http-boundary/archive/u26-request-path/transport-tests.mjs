import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createHttpProbe } from './http-probe.mjs';

const require = createRequire(new URL('../t2-url-races/package.json', import.meta.url));
const { chromium } = require('playwright');
const modules = Object.fromEntries(await Promise.all(['http-probe.mjs', 'header-profile.mjs'].map(async name => [name, await readFile(new URL(name, import.meta.url), 'utf8')])));
const received = [];
let redirectHits = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://fixture.invalid');
  const module = modules[url.pathname.slice(1)];
  if (module) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(module); return; }
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>HTTP transport conformance</title>'); return; }
  let body = '';
  for await (const chunk of req) body += chunk;
  const record = { path: url.pathname, method: req.method, body, query: [...url.searchParams], contentType: req.headers['content-type'] ?? null };
  if (url.pathname === '/v1/headers') record.customHeaders = Object.fromEntries(
    Object.entries(req.headers).filter(([name]) => ['x-custom', 'x-remove'].includes(name)));
  received.push(record);
  if (url.pathname === '/redirect-target') redirectHits++;
  if (url.pathname === '/v1/hold') return;
  if (url.pathname === '/v1/hold-body') { res.writeHead(200, { 'content-type': 'application/json' }); res.flushHeaders(); return; }
  const responses = {
    '/v1/json-null': [200, 'application/json', 'null'],
    '/v1/vendor-json': [200, 'application/problem+json', '{"detail":"fixture"}'],
    '/v1/text': [200, 'Text/Plain; Charset=UTF-8', '한글 café'],
    '/v1/invalid-json': [200, 'application/json', '{invalid'],
    '/v1/nonfinite-json': [200, 'application/json', '{"n":1e999}'],
    '/v1/binary': [200, 'application/octet-stream', 'binary'],
    '/v1/204': [204, 'application/octet-stream', ''],
    '/v1/205': [205, 'application/octet-stream', ''],
    '/v1/redirect': [302, 'text/plain', 'redirect'],
    '/v1/http-error': [503, 'application/json', '{"internal":"fixture-server-detail"}'],
  };
  const [status, contentType, responseBody] = responses[url.pathname] ?? [200, 'application/json', JSON.stringify(record)];
  res.writeHead(status, { 'content-type': contentType, ...(status === 302 ? { location: '/redirect-target' } : {}) });
  res.end(responseBody);
});
const cases = [];
for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
  cases.push({ id: `T01-method-${method}`, request: { method, path: '/echo' }, echo: { method, path: '/v1/echo', body: '', query: [], contentType: null }, head: method === 'HEAD' });
}
for (const [id, body, headers, expectedBody, contentType] of [
  ['null', null, undefined, 'null', 'application/json'],
  ['json-object', { text: '한글', items: [true, null, 1.25] }, undefined, '{"text":"한글","items":[true,null,1.25]}', 'application/json'],
  ['utf8-string', '한글 café', undefined, '한글 café', 'text/plain;charset=UTF-8'],
  ['empty-string', '', undefined, '', 'text/plain;charset=UTF-8'],
  ['explicit-json-string', '한글', { 'Content-Type': 'application/json' }, '"한글"', 'application/json'],
  ['vendor-json', { ok: true }, { 'Content-Type': 'application/vnd.fixture+json' }, '{"ok":true}', 'application/vnd.fixture+json'],
  ['form', { repeated: ['a b', '한글'], empty: '', omitted: null, emptyList: [] }, { 'Content-Type': 'application/x-www-form-urlencoded' }, 'repeated=a+b&repeated=%ED%95%9C%EA%B8%80&empty=', 'application/x-www-form-urlencoded'],
]) cases.push({ id: `T02-body-${id}`, request: { method: 'POST', path: '/echo', body, ...(headers ? { headers } : {}) }, echo: { method: 'POST', path: '/v1/echo', body: expectedBody, query: [], contentType } });
cases.push({ id: 'T03-params-merge', datasource: { params: { removed: 'old', same: 'old' } }, request: { method: 'GET', path: '/echo', params: { removed: null, same: 'new', empty: '', list: ['한글', true, -0], none: [] } }, echo: { method: 'GET', path: '/v1/echo', body: '', contentType: null, query: [['same', 'new'], ['empty', ''], ['list', '한글'], ['list', 'true'], ['list', '0']] } });
for (const [path, expectedBody] of [['json-null', null], ['vendor-json', { detail: 'fixture' }], ['text', '한글 café'], ['204', null], ['205', null]]) {
  cases.push({ id: `T04-response-${path}`, request: { method: 'GET', path }, expectedBody });
}
for (const path of ['invalid-json', 'nonfinite-json', 'binary', 'redirect', 'http-error']) cases.push({ id: `T05-response-error-${path}`, request: { method: 'GET', path }, error: 'HTTP_ERROR' });
for (const [id, request] of [
  ['get-body', { method: 'GET', path: '/echo', body: null }],
  ['head-body', { method: 'HEAD', path: '/echo', body: 'body' }],
  ['binary-body', { method: 'POST', path: '/echo', body: 'body', headers: { 'Content-Type': 'application/octet-stream' } }],
  ['nested-params', { method: 'GET', path: '/echo', params: { x: { nested: 'value' } } }],
]) cases.push({ id: `T06-invalid-request-${id}`, request, error: 'INVALID_DEFINITION', noSend: true });
for (const path of ['hold', 'hold-body']) cases.push({ id: `T07-native-timeout-${path}`, request: { method: 'GET', path }, error: 'TIMEOUT', timeout: 200 });
for (const [name, items, pointer, selected] of [
  ['array-index', ['a', 'b'], '/ports/items/0', 'a'],
  ['object-length', { length: 2 }, '/ports/items/length', 2],
]) cases.push({ id: `T08-pointer-${name}`, inputs: { items },
  request: { method: 'POST', path: '/echo', body: { selected: { '@path': pointer } } },
  echo: { path: '/v1/echo', method: 'POST', body: JSON.stringify({ selected }), query: [], contentType: 'application/json' } });
for (const [name, items, pointer] of [
  ['array-length', ['a', 'b'], '/ports/items/length'],
  ['leading-zero', ['a', 'b'], '/ports/items/01'],
  ['nested-array-length', [['a']], '/ports/items/0/length'],
]) cases.push({ id: `T08-pointer-denial-${name}`, inputs: { items },
  request: { method: 'POST', path: '/echo', body: { selected: { '@path': pointer } } },
  error: 'REFERENCE_NOT_FOUND', noSend: true });


for (const [name, value] of [['array', ['a', 'b']], ['null', null], ['string', 'ab'], ['number', 0], ['boolean', false]]) {
  cases.push({ id: `T09-params-container-${name}`, inputs: { filters: value },
    request: { method: 'GET', path: '/echo', params: { '@path': '/ports/filters' } },
    error: 'INVALID_DEFINITION', noSend: true });
}
cases.push(
  { id: 'T09-common-array-cannot-be-hidden', datasource: { params: ['a', 'b'] },
    request: { method: 'GET', path: '/echo', params: { '0': null, '1': null } }, error: 'INVALID_DEFINITION', noSend: true },
  { id: 'T09-login-array', datasource: { auth: { kind: 'Login', request: { method: 'POST', path: '/login', params: ['a'] }, token: { '@path': '/response/body/token' } } },
    request: { method: 'GET', path: '/echo' }, error: 'INVALID_DEFINITION', noSend: true },
  { id: 'T09-object-merge', inputs: { common: { tag: ['old'], remove: 'old' }, request: { tag: ['a', 'b'], remove: null, empty: '' } },
    datasource: { params: { '@path': '/ports/common' } }, request: { method: 'GET', path: '/echo', params: { '@path': '/ports/request' } },
    echo: { path: '/v1/echo', method: 'GET', body: '', query: [['tag', 'a'], ['tag', 'b'], ['empty', '']], contentType: null } },
);


cases.push(
  { id: 'T10-header-object-reference', inputs: { headers: { 'X-Custom': 'ordinary-value' } },
    request: { method: 'GET', path: '/headers', headers: { '@path': '/ports/headers' } },
    echo: { path: '/v1/headers', method: 'GET', body: '', query: [], contentType: null, customHeaders: { 'x-custom': 'ordinary-value' } } },
  { id: 'T10-dynamic-header-merge', inputs: { common: { 'X-Custom': 'old', 'X-Remove': 'old' }, request: { 'x-custom': ' new ', 'x-remove': null } },
    datasource: { headers: { '@path': '/ports/common' } }, request: { method: 'GET', path: '/headers', headers: { '@path': '/ports/request' } },
    echo: { path: '/v1/headers', method: 'GET', body: '', query: [], contentType: null, customHeaders: { 'x-custom': 'new' } } },
);
for (const name of ['Host', 'Cookie', 'Sec-Future', 'Proxy-Authorization', 'X-HTTP-Method-Override']) for (const value of ['fixture-only', null]) {
  cases.push({ id: `T10-dynamic-forbidden-${name}-${value === null ? 'null' : 'string'}`, inputs: { headers: { [name.toUpperCase()]: value } },
    request: { method: 'GET', path: '/headers', headers: { '@path': '/ports/headers' } }, error: 'INVALID_DEFINITION', noSend: true });
}
for (const [name, headers] of [['array', []], ['duplicate-case', { Accept: 'text/plain', accept: null }]]) {
  cases.push({ id: `T10-invalid-resolved-headers-${name}`, inputs: { headers },
    request: { method: 'GET', path: '/headers', headers: { '@path': '/ports/headers' } }, error: 'INVALID_DEFINITION', noSend: true });
}
cases.push(
  { id: 'T10-static-forbidden-still-before-login', inputs: { headers: { 'X-Custom': 'a' } },
    datasource: { headers: { '@path': '/ports/headers' }, auth: { kind: 'Login', request: { method: 'POST', path: '/login' }, token: { '@path': '/response/body/token' } } },
    request: { method: 'GET', path: '/headers', headers: { Host: null } }, error: 'INVALID_DEFINITION', noSend: true },
  { id: 'T10-dynamic-login-forbidden', inputs: { headers: { hOsT: null } },
    datasource: { auth: { kind: 'Login', request: { method: 'POST', path: '/login', headers: { '@path': '/ports/headers' } }, token: { '@path': '/response/body/token' } } },
    request: { method: 'GET', path: '/headers' }, error: 'INVALID_DEFINITION', noSend: true },
  { id: 'T10-dynamic-forbidden-cannot-be-hidden', inputs: { common: { Host: 'fixture-only' }, request: { HOST: null } },
    datasource: { headers: { '@path': '/ports/common' } }, request: { method: 'GET', path: '/headers', headers: { '@path': '/ports/request' } },
    error: 'INVALID_DEFINITION', noSend: true },
);

const results = [];
let browser;
let browserVersion;
let stoppedAt = null;
const pageErrors = [];
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true }); browserVersion = browser.version();
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin);
  await page.evaluate(async () => { window.createHttpProbe = (await import('/http-probe.mjs')).createHttpProbe; });
  outer: for (const runtime of ['node-fetch', 'browser-fetch']) {
    for (const test of cases) {
      const plan = { version: 1, requestId: test.id, datasource: { kind: 'Http', baseUrl: `${origin}/v1`, ...test.datasource }, request: test.request, inputs: test.inputs ?? {} };
      const before = received.length;
      const redirectsBefore = redirectHits;
      let outcome;
      if (runtime === 'node-fetch') {
        const execute = createHttpProbe({ requestTimeoutMs: test.timeout ?? 5000, authorize: ({ destination }) => new URL(destination).origin === origin });
        try { outcome = { value: await execute(plan) }; } catch (error) { outcome = { error }; }
      } else {
        outcome = JSON.parse(await page.evaluate(async serialized => {
          const { plan, timeout } = JSON.parse(serialized);
          const execute = window.createHttpProbe({ requestTimeoutMs: timeout ?? 5000, authorize: ({ destination }) => new URL(destination).origin === location.origin });
          try { return JSON.stringify({ value: await execute(plan) }); }
          catch (error) { return JSON.stringify({ error }); }
        }, JSON.stringify({ plan, timeout: test.timeout })));
      }
      let failure;
      try {
        if (test.error) {
          assert.equal(outcome.error?.code, test.error);
          assert.deepEqual(Object.keys(outcome.error).sort(), ['code', 'message']);
          assert.equal(JSON.stringify(outcome.error).includes('fixture-server-detail'), false);
        } else {
          assert.equal(outcome.error, undefined);
          assert.deepEqual(outcome.value.body, test.head ? null : test.echo ?? test.expectedBody);
          if (test.echo) assert.deepEqual(received.at(-1), test.echo);
        }
        if (test.noSend) assert.equal(received.length - before, 0);
        assert.equal(redirectHits, redirectsBefore);
        assert.deepEqual(pageErrors, []);
      } catch (error) { failure = error.message; }
      results.push({ id: test.id, runtime, passed: !failure, sentRequests: received.length - before, ...(failure ? { failure, outcome } : {}) });
      if (failure) { stoppedAt = `${runtime}/${test.id}`; break outer; }
    }
  }
} finally {
  await browser?.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
const sourceSha256 = {};
for (const path of ['package.json', 'transport-tests.mjs', 'http-probe.mjs', 'header-profile.mjs', '../t2-url-races/package.json', '../t2-url-races/package-lock.json']) {
  sourceSha256[path] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
}
const report = {
  generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch,
  browser: browserVersion, playwrightVersion: require('playwright/package.json').version,
  scope: 'Shared independent executor in Node and Chromium over loopback HTTP, including native timers; no core integration',
  stopOnFirstProblem: true, stoppedAt, sourceSha256, results, pageErrors,
  summary: { executed: results.length, passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length },
};
await writeFile(new URL(`results/${process.argv[2] ?? 'transport-node24.json'}`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, stoppedAt }));
if (stoppedAt) process.exitCode = 1;
