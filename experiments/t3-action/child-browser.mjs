import { createServer } from 'node:http';
import { readFile, unlink } from 'node:fs/promises';
import { build } from '../verification/node_modules/esbuild/lib/main.js';
import { chromium } from '../t2-url-races/node_modules/playwright/index.mjs';
import { report } from '../verification/report.mjs';

const bundle = new URL('.child-browser-bundle.js', import.meta.url);
await build({ stdin: { contents: `export { ActionProbe } from './action-probe.mjs'; export { StateProbe } from '../t3-state/state-probe.mjs'; export { queryFixture } from '../t3-state/ports-probe.mjs';`,
  resolveDir: new URL('.', import.meta.url).pathname }, bundle: true, platform: 'browser', format: 'esm', outfile: bundle.pathname });
const bytes = await readFile(bundle);
const server = createServer((req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', req.url === '/probe.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/probe.js' ? bytes : '<!doctype html><title>Action child contract probe</title>');
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = await page.evaluate(async () => {
    const { ActionProbe, StateProbe, queryFixture } = await import('/probe.js');
    const rows = [], check = (value, message) => { if (!value) throw Error(message); };
    const rejected = async (promise, code) => { let error; try { await promise; } catch (caught) { error = caught; } check(error?.code === code, `Expected ${code}, got ${error?.code}`); };
    const wait = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
    const test = async (id, run) => {
      let timer;
      try { await Promise.race([run(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('TEST_TIMEOUT')), 3000); })]); rows.push({ id, passed: true }); }
      catch (error) { rows.push({ id, passed: false, error: { message: error.message } }); }
      finally { clearTimeout(timer); }
    };
    const fixture = () => { const engine = new ActionProbe({ store: new StateProbe() }); return { engine, owner: engine.owner() }; };
    await test('K05/browser-async-mutual-recursion-and-independent-roots', async () => {
      const f = fixture(); let calls = 0;
      const action = target => ({ native: async ({ invokeAction }) => { calls++; await Promise.resolve(); if (calls < 4) await invokeAction({ actionRef: target }); } });
      f.engine.register([['a', action('b')], ['b', action('a')]]);
      await rejected(f.engine.invoke(f.owner, 'a'), 'ACTION_RECURSION'); check(calls === 2, 'recursion ran twice');
      const gate = wait(); let roots = 0;
      f.engine.register([['root', { native: async () => { roots++; await gate.promise; } }]]);
      const a = f.engine.invoke(f.owner, 'root'), b = f.engine.invoke(f.owner, 'root');
      check(roots === 2, 'independent calls both started'); gate.resolve(); await Promise.all([a, b]);
    });
    await test('A12-K16/browser-parent-cancellation-reaches-child', async () => {
      const f = fixture(), started = wait(), finish = wait(); let context;
      f.engine.register([
        ['leaf', { native: async c => { context = c; started.resolve(); await finish.promise; } }],
        ['parent', { native: async ({ invokeAction }) => { await Promise.resolve(); await invokeAction({ actionRef: 'leaf' }); } }],
      ]);
      const link = f.engine.connect(f.owner, { actionRef: 'parent' }), stopped = rejected(link.invoke(), 'CANCELLED');
      await started.promise; link.dispose(); await stopped; check(context.signal.aborted, 'child abort');
      await rejected(context.invokeAction({ actionRef: 'leaf' }), 'CANCELLED'); finish.resolve();
    });
    await test('K16/browser-reconnected-query-combines-child-signal', async () => {
      for (const method of ['refresh', 'retry']) {
        const f = fixture(); let requestSignal, request, child;
        const pending = signal => { requestSignal = signal; return new Promise((_, reject) => signal.addEventListener('abort', () => reject({ code: 'CANCELLED' }), { once: true })); };
        const q = queryFixture({ snapshot: () => ({}), refresh: pending, retry: pending }), ports = { q: { kind: 'Query', required: true } };
        f.engine.register([
          ['leaf', { ports, native: async ({ inputs }) => { request = rejected(inputs.q[method](), 'CANCELLED'); await request; } }],
          ['parent', { ports, native: ({ inputs, invokeAction }) => { child = rejected(invokeAction({ actionRef: 'leaf', inputs }), 'CANCELLED'); } }],
        ]);
        await f.engine.invoke(f.owner, 'parent', { q }); await child; await request; check(requestSignal.aborted, 'underlying ticket signal');
      }
    });
    await test('K01/browser-inline-cannot-register-nested-native', async () => {
      const f = fixture(); let calls = 0;
      f.engine.register([['parent', { native: async ({ invokeAction }) => {
        await invokeAction({ action: { steps: [{ kind: 'If', condition: true, then: [{ kind: 'Action', spec: { native: () => { calls++; } } }] }] } });
      } }]]);
      await rejected(f.engine.invoke(f.owner, 'parent'), 'INVALID_DEFINITION'); check(calls === 0, 'unregistered native execution');
    });
    await test('A12-A16/browser-synchronous-self-removal-late-rejection', async () => {
      const f = fixture(), finish = wait(); let link;
      f.engine.register([['self', { native: async () => { link.dispose(); await finish.promise; throw Error('late callback failure'); } }]]);
      link = f.engine.connect(f.owner, { actionRef: 'self' }); await rejected(link.invoke(), 'CANCELLED');
      finish.resolve(); await new Promise(resolve => setTimeout(resolve, 20));
      // The outer pageerror observer must remain empty after the late rejection.
    });
    return rows;
  });
  results.push({ id: 'browser/no-page-errors', passed: pageErrors.length === 0 });
  await report({ base: import.meta.url, name: 'child-chromium.json', scope: 'Chromium native child-call recursion, cancellation, combined Query signal, inline admission and unhandled-error check; actual Query scheduler is covered in Node suites', results,
    sources: ['child-browser.mjs', 'action-probe.mjs', '../t3-state/state-probe.mjs', '../t3-state/ports-probe.mjs', '../t3-state/immutable.mjs', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package-lock.json', '../t2-http-boundary/value-expressions.mjs', '../verification/report.mjs', '../verification/errors.mjs'],
    extra: { browser: await browser.version(), pageErrors } });
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await unlink(bundle).catch(() => {}); }
