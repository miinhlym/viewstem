import { createServer } from 'node:http';
import { readFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from '../verification/node_modules/esbuild/lib/main.js';
import { chromium } from '../t2-url-races/node_modules/playwright/index.mjs';
import { report } from '../verification/report.mjs';
import { sources } from './run.mjs';
await build({ entryPoints: [new URL('browser-scenarios.mjs', import.meta.url).pathname, new URL('scenarios.mjs', import.meta.url).pathname], bundle: true,
  format: 'esm', platform: 'browser', outdir: new URL('.browser-build/', import.meta.url).pathname, splitting: false });
const files = await Promise.all(['browser-scenarios', 'scenarios'].map(async name => [name, await readFile(new URL(`.browser-build/${name}.js`, import.meta.url))]));
const server = createServer((req, res) => {
  res.setHeader('cache-control', 'no-store');
  const script = files.find(([name]) => req.url === `/${name}.js`);
  if (script) { res.setHeader('content-type', 'text/javascript'); res.end(script[1]); }
  else { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><title>T4 chart contract probe</title><style>body{font:14px system-ui;margin:20px;background:#eee}#gallery{display:grid;grid-template-columns:repeat(3,440px);gap:12px}section{background:white;padding:8px}h2{font-size:13px;margin:5px}</style><h1>T4 independent chart fixtures · Canvas / ECharts 6.1.0 SVG</h1><div id="gallery"></div>'); }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message)); page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = await page.evaluate(async () => {
    const { runScenarios } = await import('/scenarios.js');
    const { runBrowserScenarios } = await import('/browser-scenarios.js');
    const results = [], test = async (id, run) => {
      try { const evidence = await run(); results.push({ id, passed: true, ...(evidence ? { evidence } : {}) }); }
      catch (error) { results.push({ id, passed: false, error: { name: error.name, message: error.message, stack: error.stack } }); }
    };
    await runScenarios(test); await runBrowserScenarios(test); return results;
  });
  results.push({ id: 'DOM.no-browser-errors', passed: pageErrors.length === 0 && consoleErrors.length === 0 });
  const name = process.argv[2] ?? 'chromium.json', screenshotName = name.replace(/\.json$/, '.png');
  const screenshot = await page.screenshot({ path: new URL(`results/${screenshotName}`, import.meta.url).pathname, fullPage: true });
  await report({ base: import.meta.url, name, sources, results,
    scope: 'Independent contract probe plus existing StateProbe/compilePorts, custom small Canvas renderer and actual ECharts 6.1.0 SVG renderer in Chromium. No production core/StateStore/Svelte or full ECharts option conformance.',
    extra: { browser: await browser.version(), echarts: '6.1.0', pageErrors, consoleErrors, screenshot: { file: screenshotName, sha256: createHash('sha256').update(screenshot).digest('hex') },
      populations: { contract: results.filter(row => !row.id.startsWith('DOM.')).length, actualBrowser: results.filter(row => row.id.startsWith('DOM.')).length } } });
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  for (const [name] of files) await unlink(new URL(`.browser-build/${name}.js`, import.meta.url)).catch(() => {});
}
