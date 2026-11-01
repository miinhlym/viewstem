import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { runDateCases } from './date-integration-cases.mjs';
import { report } from './report.mjs';

const require = createRequire(new URL('../t2-url-races/package.json', import.meta.url));
const { chromium } = require('playwright');
const bundle = await build({ entryPoints: [new URL('./date-integration-cases.mjs', import.meta.url).pathname], bundle: true, platform: 'browser', format: 'esm', write: false });
const received = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://fixture.invalid');
  if (url.pathname === '/bundle.mjs') { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(bundle.outputFiles[0].text); return; }
  if (url.pathname === '/echo' || url.pathname === '/invalid-date') {
    let body = ''; for await (const chunk of request) body += chunk;
    const data = { method: request.method, body, query: [...url.searchParams] }; received.push(data);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(url.pathname === '/invalid-date' ? '2026-04-31' : data)); return;
  }
  response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>Date boundary fixture</title>');
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const node = await runDateCases(base);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(), page = await context.newPage(), pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(base);
  const web = await page.evaluate(async base => (await import('/bundle.mjs')).runDateCases(base, 'browser'), base);
  const results = [...node.results.map(item => ({ ...item, id: `node/${item.id}` })), ...web.results.map(item => ({ ...item, id: `chromium/${item.id}` })),
    { id: 'browser/no-uncaught-errors', passed: pageErrors.length === 0 },
    { id: 'transport/real-request-count', passed: received.length === node.sent + web.sent }];
  await report({ base: import.meta.url, name: process.argv[2] ?? 'date-integration-node24.json', scope: 'Real loopback HTTP and memory/Chromium History with schema boundary; no production Store/renderer', results,
    sources: ['date-integration.mjs', 'date-integration-cases.mjs', 'report.mjs', 'package.json', 'package-lock.json',
      '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package.json', '../t1-values/package-lock.json',
      '../t2-url-races/url-probe.mjs', '../t2-url-races/endpoints.mjs', '../t2-url-races/package.json', '../t2-url-races/package-lock.json',
      '../t2-http-boundary/http-probe.mjs', '../t2-http-boundary/header-profile.mjs', '../t2-http-boundary/value-expressions.mjs'],
    extra: { browser: browser.version(), playwright: require('playwright/package.json').version, realRequests: received.length, pageErrors } });
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
