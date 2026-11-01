import { createServer, request, validateHeaderName, validateHeaderValue } from 'node:http';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Reuse the already pinned test-only browser dependency; this is not an HTTP executor.
const require = createRequire(new URL('../t2-url-races/package.json', import.meta.url));
const { chromium } = require('playwright');
const received = [];
const server = createServer((req, res) => {
  if (req.url === '/echo') {
    const entry = { host: req.headers.host, probe: req.headers['x-viewstem-probe'] ?? null };
    received.push(entry);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(entry));
  } else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>Viewstem HTTP boundary probe</title>');
  }
});

function nodeGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ outcome: 'sent', status: res.statusCode, body: JSON.parse(body) }); }
        catch (error) { reject(error); }
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error('Fixture transport watchdog')));
    req.on('error', reject);
    req.end();
  });
}

const cases = [
  { id: 'H01-node-custom-header', runtime: 'node:http', header: 'X-Viewstem-Probe', value: 'fixture-only', field: 'probe' },
  { id: 'H02-node-host-header', runtime: 'node:http', header: 'Host', value: 'viewstem-probe.invalid', field: 'host' },
  { id: 'H03-browser-custom-header', runtime: 'browser-fetch', header: 'X-Viewstem-Probe', value: 'fixture-only', field: 'probe' },
  { id: 'H04-browser-host-header', runtime: 'browser-fetch', header: 'Host', value: 'viewstem-probe.invalid', field: 'host', allowExplicitRejection: true },
];
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
  for (const test of cases) {
    validateHeaderName(test.header);
    validateHeaderValue(test.header, test.value);
    const headers = { [test.header]: test.value };
    const before = received.length;
    const outcome = test.runtime === 'node:http'
      ? await nodeGet(`${base}/echo`, headers)
      : await page.evaluate(async headers => {
        try {
          const response = await fetch('/echo', {
            method: 'GET', headers, credentials: 'omit', redirect: 'manual',
          });
          return { outcome: 'sent', status: response.status, body: await response.json() };
        } catch (error) { return { outcome: 'rejected', error: error.name }; }
      }, headers);
    const sentRequests = received.length - before;
    const preserved = outcome.outcome === 'sent' && outcome.status === 200 && outcome.body[test.field] === test.value;
    const rejectedBeforeSending = test.allowExplicitRejection === true && outcome.outcome === 'rejected' && sentRequests === 0;
    const passed = preserved || rejectedBeforeSending;
    results.push({ ...test, expected: test.allowExplicitRejection
      ? 'Preserve the explicit header or reject before sending; no silent successful rewrite'
      : 'Preserve the explicit header in the successful request',
      actual: outcome, sentRequests, passed });
    console.log(`${test.id}: ${passed ? 'PASS' : 'FAIL'}`);
    if (!passed) { stoppedAt = test.id; break; }
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

const sourceSha256 = {};
for (const path of ['package.json', 'run.mjs', '../t2-url-races/package.json', '../t2-url-races/package-lock.json']) {
  sourceSha256[path] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
}
const report = {
  generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform,
  architecture: process.arch, browser: browserVersion, playwrightVersion: require('playwright/package.json').version,
  scope: 'Real loopback HTTP and browser transport boundary; no Viewstem executor implementation',
  stopOnFirstProblem: true, stoppedAt, sourceSha256, results,
  summary: { executed: results.length, passed: results.filter(result => result.passed).length,
    failed: results.filter(result => !result.passed).length },
  notRun: ['Login isolation and token validation', 'Whole-plan timeout and cancellation',
    'Secret and login-response non-disclosure', 'Minimal SDK type contracts', 'Other remaining conformance work'],
};
await mkdir(new URL('results/', import.meta.url), { recursive: true });
await writeFile(new URL('results/latest.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, stoppedAt }));
if (stoppedAt) process.exitCode = 1;
