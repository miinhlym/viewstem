import { createServer } from 'node:http';
import { readFile, unlink } from 'node:fs/promises';
import { build } from '../verification/node_modules/esbuild/lib/main.js';
import { chromium } from '../t2-url-races/node_modules/playwright/index.mjs';
import { report } from '../verification/report.mjs';
import { sources } from './run.mjs';

const bundle = new URL('.browser-bundle.js', import.meta.url);
await build({ entryPoints: [new URL('scenarios.mjs', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'browser', outfile: bundle.pathname });
const bundleBytes = await readFile(bundle);
const server = createServer((req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.url === '/probe.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundleBytes); }
  else { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>Disposable UI contract probe</title><div id="probe"></div>'); }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = await page.evaluate(async () => {
    const { runScenarios, runDOMScenarios } = await import('/probe.js');
    const results = [], test = async (id, run) => {
      try { const evidence = await run(); results.push({ id, passed: true, ...(evidence ? { evidence } : {}) }); }
      catch (error) { results.push({ id, passed: false, error: { name: error.name, message: error.message, stack: error.stack } }); }
    };
    await runScenarios(test); await runDOMScenarios(test, document.querySelector('#probe'));
    return results;
  });
  results.push({ id: 'DOM.no-page-errors', passed: pageErrors.length === 0 });
  await report({ base: import.meta.url, name: process.argv[2] ?? 'chromium.json', scope: 'Same independent UI/ActionProbe in Chromium plus actual DOM event/slot/geometry checks; no production core/Svelte renderer.',
    results, sources, extra: { browser: await browser.version(), pageErrors,
      populations: { model: results.filter(row => !row.id.startsWith('DOM.')).length,
        actualDOM: results.filter(row => row.id.startsWith('DOM.') && row.id !== 'DOM.no-page-errors').length, browserErrorCheck: 1 } } });
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve)); await unlink(bundle).catch(() => {});
}
