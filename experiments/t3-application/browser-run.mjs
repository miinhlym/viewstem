import { createServer } from 'node:http';
import { readFile, unlink } from 'node:fs/promises';
import { build } from '../verification/node_modules/esbuild/lib/main.js';
import { chromium } from '../t2-url-races/node_modules/playwright/index.mjs';
import { ApplicationProbe } from './application-probe.mjs';
import { registry, staticView, controlled } from './scenarios.mjs';
import { deferred, observe, flush } from '../t2-query-races/harness.mjs';
import { harness, report } from '../verification/report.mjs';
import { sources } from './run.mjs';

const bundle = new URL('.browser-bundle.mjs', import.meta.url);
await build({ stdin: { contents: `import { mountDOM } from '../t3-ui/ui-probe.mjs';
export function paint(projection) {
  const target = document.querySelector('#app'); mountDOM({ roots: projection.roots }, target);
  const queries = document.querySelector('#queries'); queries.replaceChildren();
  for (const value of Object.values(projection.queries)) {
    const item = document.createElement('span'); item.dataset.query = value.name; item.textContent = value.status; queries.append(item);
  }
  target.dataset.generation = String(projection.generation);
}`, resolveDir: new URL('.', import.meta.url).pathname }, bundle: true, format: 'esm', platform: 'browser', outfile: bundle.pathname });
const bytes = await readFile(bundle);
const server = createServer((req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.url === '/bridge.js') { res.setHeader('content-type', 'text/javascript'); res.end(bytes); }
  else { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>Disposable application projection probe</title><div id="app"></div><div id="queries"></div>'); }
});
const equal = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`ASSERT ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage(), pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const fresh = () => page.goto(`http://127.0.0.1:${server.address().port}`);
  const paint = projection => page.evaluate(async projection => { const { paint } = await import('/bridge.js'); paint(projection); }, projection);
  const dom = () => page.evaluate(() => ({ text: document.querySelector('#app').textContent,
    generation: document.querySelector('#app').dataset.generation, queries: [...document.querySelectorAll('[data-query]')].map(x => [x.dataset.query, x.textContent]) }));
  const { results, test } = harness(), observations = [];
  await test('DOM.K23.initial-waits-for-real-DOM-application-ack', async () => {
    await fresh(); const gate = deferred(), runtime = new ApplicationProbe({ registry: registry(), renderer: async (projection, context) => {
      await gate.promise; if (!context.isCurrent()) return; await paint(projection); runtime.trace.push({ kind: 'actual-dom-painted', generation: projection.generation });
    } });
    const { initial } = await runtime.mount({ view: staticView('visible-after-ack') }), outcome = observe(initial); await flush();
    equal(outcome.status, 'pending'); equal((await dom()).text, ''); gate.resolve(); await outcome.settled;
    equal(outcome.status, 'fulfilled'); equal((await dom()).text, 'visible-after-ack');
    const order = runtime.trace.map(row => row.kind); equal(order, ['commit', 'projection', 'actual-dom-painted', 'renderer-ack']);
    observations.push({ id: 'DOM.K23.initial-waits-for-real-DOM-application-ack', dom: await dom(), order });
    runtime.views.forEach(view => view.dispose());
  });
  await test('DOM.N03.first-query-visible-while-second-pending', async () => {
    await fresh(); const { runtime, transport } = controlled([], { renderer: async (projection, context) => { if (context.isCurrent()) await paint(projection); } });
    const use = term => ({ queryRef: 'q', inputs: { term } });
    const { view, initial } = await runtime.mount({ view: { ...staticView('prepared-ui'), queries: { first: use('first'), second: use('second') } } }), outcome = observe(initial);
    await page.waitForFunction(() => document.querySelector('#app').textContent === 'prepared-ui'); equal(outcome.status, 'pending');
    transport.respond(1, ['fast']); await page.waitForFunction(() => document.querySelector('[data-query="first"]')?.textContent === 'success');
    equal(outcome.status, 'pending'); equal((await dom()).queries, [['first', 'success'], ['second', 'running']]);
    const intermediate = await dom();
    transport.respond(2, ['slow']); await outcome.settled; equal(outcome.status, 'fulfilled'); equal((await dom()).queries, [['first', 'success'], ['second', 'success']]); view.dispose();
    observations.push({ id: 'DOM.N03.first-query-visible-while-second-pending', intermediate, final: await dom() });
  });
  await test('DOM.K23.obsolete-ack-cannot-paint-after-replacement', async () => {
    await fresh(); const gate = deferred(); let discarded = 0;
    const runtime = new ApplicationProbe({ registry: registry(), renderer: async (projection, context) => {
      if (projection.generation === 1) await gate.promise;
      if (!context.isCurrent()) { ++discarded; return; } await paint(projection);
    } });
    const { view, initial } = await runtime.mount({ view: staticView('old') }), first = observe(initial);
    const next = await view.replace({ view: staticView('new') }); await next.initial; await first.settled; equal(first.code, 'CANCELLED');
    equal((await dom()).text, 'new'); gate.resolve(); await flush(); equal((await dom()).text, 'new'); equal(discarded, 1); view.dispose();
    observations.push({ id: 'DOM.K23.obsolete-ack-cannot-paint-after-replacement', dom: await dom(), discarded });
  });
  await test('DOM.no-page-errors', () => equal(pageErrors, []));
  await report({ base: import.meta.url, name: process.argv[2] ?? 'chromium.json', sources, results,
    scope: 'Node private application + T2 Query protocol projected through the existing UI DOM adapter into actual Chromium; explicit host paint acknowledgement.',
    extra: { browser: await browser.version(), pageErrors, observations, populations: { actualDOM: 3, browserErrorCheck: 1 } } });
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await unlink(bundle).catch(() => {}); }
