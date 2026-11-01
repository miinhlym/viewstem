import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { cases, mutations } from './scenarios.mjs';
import { sourceHashes, saveReport, summarize, finish } from './run.mjs';

const require = process.env.VIEWSTEM_TEST_MODULES
  ? createRequire(join(process.env.VIEWSTEM_TEST_MODULES, '__viewstem_probe__.cjs'))
  : createRequire(import.meta.url);
const { chromium } = require('playwright');
const playwrightVersion = require('playwright/package.json').version;
const allowed = new Set(['url-probe.mjs', 'endpoints.mjs', 'scenarios.mjs']);
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  if (allowed.has(name)) {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
    res.end(await readFile(new URL(name, import.meta.url)));
  } else if (name === 'favicon.ico') { res.writeHead(204); res.end(); }
  else {
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    res.end('<!doctype html><title>Viewstem URL boundary experiment</title><p>Disposable local test document.</p>');
  }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const pageErrors = [];
  async function run(args) {
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
      await page.goto(base);
      return await page.evaluate(async ({ id, mutation, seed }) => {
        const { runCase, runSeed } = await import('/scenarios.mjs');
        const { browserEndpoint } = await import('/endpoints.mjs');
        return seed === undefined ? runCase(id, browserEndpoint, mutation) : runSeed(seed, browserEndpoint);
      }, args);
    } finally { await page.close(); }
  }
  const results = [];
  for (const test of cases) results.push(await run({ id: test.id }));
  const controls = [];
  for (const [mutation, id] of mutations) {
    const outcome = await run({ id, mutation: { [mutation]: true } });
    controls.push({ mutation, id, detected: !outcome.passed && outcome.code === 'ASSERTION', outcome });
  }
  const seeds = [];
  for (let seed = 1; seed <= 20; ++seed) seeds.push(await run({ seed }));
  const summary = summarize(results, controls, seeds);
  await saveReport(new URL(process.env.URL_RESULT ?? 'results/chromium.json', import.meta.url), {
    generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch,
    playwrightVersion, browser: await browser.version(), endpoint: 'real Chromium location/History',
    sourceSha256: await sourceHashes(), summary, pageErrors, results, controls, seeds,
  });
  finish(summary);
  if (pageErrors.length) { console.error(pageErrors); process.exitCode = 1; }
  for (const item of [...results, ...seeds].filter(item => !item.passed)) console.error(JSON.stringify(item));
  for (const item of controls.filter(item => !item.detected)) console.error(JSON.stringify(item));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
