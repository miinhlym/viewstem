import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prepareHeaders } from './header-profile.mjs';

const require = createRequire(new URL('../t2-url-races/package.json', import.meta.url));
const { chromium } = require('playwright');
const moduleSource = await readFile(new URL('header-profile.mjs', import.meta.url), 'utf8');
let requests = 0;
const server = createServer((req, res) => {
  if (req.url === '/echo') {
    requests++;
    res.writeHead(200, { 'content-type': 'application/json' });
    // Node's req.headers object can hide the token-valid __proto__ field.
    // Inspect received wire fields rather than inheriting that object's semantics.
    const fields = Object.create(null);
    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      fields[req.rawHeaders[index].toLowerCase()] = req.rawHeaders[index + 1];
    }
    res.end(JSON.stringify(fields));
  } else if (req.url === '/header-profile.mjs') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(moduleSource);
  } else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>Viewstem header contract</title>');
  }
});
function nodeSend(url, headers) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve(JSON.parse(raw)));
      res.on('error', reject);
    });
    req.setTimeout(5000, () => req.destroy(new Error('Fixture watchdog')));
    req.on('error', reject);
    req.end();
  });
}
// Enumerated separately from the implementation: omission in the guard must fail.
const names = [
  'Accept-Charset', 'Accept-Encoding', 'Access-Control-Request-Headers',
  'Access-Control-Request-Method', 'Connection', 'Content-Length', 'Cookie',
  'Cookie2', 'Date', 'DNT', 'Expect', 'Host', 'Keep-Alive', 'Origin', 'Referer',
  'Set-Cookie', 'TE', 'Trailer', 'Transfer-Encoding', 'Upgrade', 'Via',
  'User-Agent', 'X-HTTP-Method', 'X-HTTP-Method-Override', 'X-Method-Override',
  'Proxy-Authorization', 'Sec-Future-Header',
];
const cases = names.flatMap(name => [
  { id: `reject-${name}`, declarations: [{ [name]: 'fixture-only' }], code: 'INVALID_DEFINITION' },
  { id: `reject-null-${name}`, declarations: [{ [name.toUpperCase()]: null }], code: 'INVALID_DEFINITION' },
]);
cases.push(
  { id: 'reject-hidden-by-override', declarations: [{ Host: 'fixture-only' }, { host: null }], code: 'INVALID_DEFINITION' },
  { id: 'reject-casing-duplicate', declarations: [{ Accept: 'text/plain', accept: null }], code: 'INVALID_DEFINITION' },
  { id: 'reject-crlf', declarations: [{ 'X-Probe': 'fixture-secret\r\nInjected: 1' }], code: 'INVALID_DEFINITION' },
  { id: 'reject-invalid-name', declarations: [{ 'Bad Name': 'fixture-only' }], code: 'INVALID_DEFINITION' },
  { id: 'reject-unencoded-unicode', declarations: [{ 'X-Probe': '한글' }], code: 'INVALID_DEFINITION' },
  { id: 'reject-number-value', declarations: [{ 'X-Probe': 42 }], code: 'INVALID_DEFINITION' },
  { id: 'ordinary-headers', declarations: [{ Authorization: 'Bearer fixture-token', 'X-API-Key': 'fixture-key', 'Content-Type': 'application/json' }], expected: { authorization: 'Bearer fixture-token', 'x-api-key': 'fixture-key', 'content-type': 'application/json' } },
  { id: 'merge-remove-normalize', declarations: [{ 'X-Probe': 'old', 'X-Delete': 'old' }, { 'x-probe': ' \tnew\t ', 'x-delete': null, 'X-Empty': '' }], expected: { 'x-probe': 'new', 'x-empty': '' }, absent: ['x-delete'] },
  { id: 'token-valid-property-names', declarations: [JSON.parse('{"__proto__":"fixture","constructor":"fixture"}')], expected: { ['__proto__']: 'fixture', constructor: 'fixture' } },
);
const results = [];
let browser;
let browserVersion;
let stoppedAt = null;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  browserVersion = browser.version();
  const page = await browser.newPage();
  await page.goto(base);
  await page.evaluate(async () => { window.prepare = (await import('/header-profile.mjs')).prepareHeaders; });
  outer: for (const runtime of ['node:http', 'browser-fetch']) {
    for (const test of cases) {
      const before = requests;
      let outcome;
      if (runtime === 'node:http') {
        try { outcome = { kind: 'sent', headers: await nodeSend(`${base}/echo`, prepareHeaders(...test.declarations)) }; }
        catch (error) { outcome = { kind: 'rejected', code: error.code, message: error.message }; }
      } else {
        // JSON text avoids Playwright's object serializer dropping __proto__.
        outcome = JSON.parse(await page.evaluate(async serialized => {
          try {
            const declarations = JSON.parse(serialized);
            const headers = window.prepare(...declarations);
            const response = await fetch('/echo', { headers, credentials: 'omit', redirect: 'manual' });
            return JSON.stringify({ kind: 'sent', headers: await response.json() });
          } catch (error) { return JSON.stringify({ kind: 'rejected', code: error.code, message: error.message }); }
        }, JSON.stringify(test.declarations)));
      }
      const sentRequests = requests - before;
      let failure;
      try {
        if (test.code) {
          assert.deepEqual(outcome, { kind: 'rejected', code: test.code, message: 'Invalid HTTP header declaration' });
          assert.equal(sentRequests, 0);
        } else {
          assert.equal(outcome.kind, 'sent');
          assert.equal(sentRequests, 1);
          for (const [key, value] of Object.entries(test.expected)) assert.equal(outcome.headers[key], value, key);
          for (const key of test.absent ?? []) assert.equal(outcome.headers[key], undefined, key);
        }
      } catch (error) { failure = error.message; }
      results.push({ id: test.id, runtime, passed: !failure, sentRequests, ...(failure ? { failure, outcome } : {}) });
      if (failure) { stoppedAt = `${runtime}/${test.id}`; break outer; }
    }
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
const sourceSha256 = {};
for (const path of ['package.json', 'header-profile.mjs', 'header-tests.mjs', '../t2-url-races/package.json', '../t2-url-races/package-lock.json']) {
  sourceSha256[path] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
}
const report = {
  generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform,
  architecture: process.arch, browser: browserVersion, playwrightVersion: require('playwright/package.json').version,
  scope: 'Independent header guard with real loopback HTTP; not a production Viewstem executor',
  stopOnFirstProblem: true, stoppedAt, sourceSha256, results,
  summary: { executed: results.length, passed: results.filter(item => item.passed).length,
    failed: results.filter(item => !item.passed).length, sentRequests: requests },
};
await mkdir(new URL('results/', import.meta.url), { recursive: true });
const output = process.argv[2] ?? 'headers-node24.json';
await writeFile(new URL(`results/${output}`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, stoppedAt }));
if (stoppedAt) process.exitCode = 1;
