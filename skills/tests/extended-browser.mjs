import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const scenarios = [{
  id: 'form-refresh', language: 'ko', expectedSkill: true, kind: 'browser',
  prompt: '기존 폼을 수정해줘. Name 입력과 Save 버튼, 입력 상태 및 저장 완료 표시를 유지해. services.load(): Promise<string>을 이용한 Query의 현재 값을 "Loaded: 값"으로 표시하고, services.save(name)이 성공한 뒤에만 그 Query를 재조회해. 저장이 실패하면 기존 Query 값을 유지하고 재조회하지 말고 화면에 "Save failed"를 표시해. 초기 load는 "Initial"을 반환하고 성공적으로 저장하면 다음 load는 저장된 이름을 반환해. "Reject"는 저장이 실패하는 입력이야. mountApp(target, services)와 반환 dispose 계약을 유지하고 반환 객체에 해당 View의 Query 핸들 query도 포함해. 제공된 검사 명령을 실행해.',
  assessment: ['declarative State and input event', 'save action and Query refresh only after success', 'failure is visible without refresh', 'dispose cleans owned UI'],
}, {
  id: 'repeat', language: 'en', expectedSkill: true, kind: 'browser',
  prompt: 'Build a Viewstem screen with a keyed repeat over the supplied items A and B. Each row shows a textbox with accessible name equal to its id and a Commit button. Each row must own a Viewstem draft State and bind its textbox bidirectionally to that State; drafts must survive reordering and filtering of surviving items. Commit starts an Action that awaits services.wait(): Promise<void> and then writes the row id to a Viewstem State. If the row is removed before wait resolves, that stale Action must not write. mountApp(target, services) must return { setItems(items: {id:string}[]): void|Promise<void>, getDraft(id: string): StateHandle<string>, committed: StateHandle<string>, dispose(): void|Promise<void> }; setItems updates the Viewstem items State. Initially items are [{id:"A"},{id:"B"}], and committed starts empty. Run the available checks.',
  assessment: ['stable repeat keys preserve row UI state on reorder', 'removed row cannot write from delayed Action', 'dispose cleans owned UI'],
}, {
  id: 'completion', language: 'en', expectedSkill: true, kind: 'browser',
  prompt: 'Mount a Viewstem screen with an independent visible Ready label and a Query named profile backed by services.load(): Promise<string>, which rejects. Diagnose the initial completion report: call services.report(report) with the actual report, including queryErrors. Return {initialComplete, whenRendered, query, dispose}, using the mounted View’s completion promise, DOM completion function, and profile Query handle. After completion, wait for DOM completion before checking the Ready label. Explain whether initial completion or DOM completion guarantees browser paint. Do not add dependencies; run the available checks.',
  assessment: ['fulfilled initialComplete is inspected for Query errors', 'whenRendered establishes DOM completion', 'paint is not claimed by either completion signal', 'dispose cleans owned UI'],
}, {
  id: 'renderer-error', language: 'en', expectedSkill: true, kind: 'browser', protectedFiles: ['src/FailingDisplay.svelte'],
  prompt: 'Use the supplied FailingDisplay.svelte adapter unchanged in a Viewstem screen. Register it with an input named value. Initially show its good value and an Update button. Update must use a Viewstem Action to set a Viewstem State value from good to bad; the adapter then throws while rendering bad. Forward renderer onError diagnostics to services.report(diagnostic). Return {value: StateHandle<string>, dispose} so the host can inspect the committed State. Distinguish the successful State write from the failed render in your response. Use public APIs and run the available checks.',
  assessment: ['core State write survives renderer failure', 'renderer onError reports render phase', 'failing DOM is removed without uncaught page error', 'dispose cleans owned UI'],
}, {
  id: 'late-response', language: 'en', expectedSkill: true, kind: 'browser',
  prompt: 'Mount a Viewstem View with an initial Query for id A, using services.load(id): Promise<string> as its data source. The host will replace the View with id B while A is pending; both requests may resolve even after cancellation. Display the current Query data, never a stale response. Return {replace(id: string): Promise<void>, getQuery(): QueryHandle<string>, dispose()} using the View replacement lifecycle; replace waits only for structural replacement, not Query completion. The host controls service responses and resolves B to Current B before resolving A to Stale A. Use public APIs and run the available checks.',
  assessment: ['View replacement cancels old ownership', 'late old response cannot overwrite current Query or DOM', 'dispose cleans owned UI'],
}];
const findScenario = scenario => {
  const id = typeof scenario === 'string' ? scenario : scenario?.id;
  const found = scenarios.find(item => item.id === id);
  if (!found) throw Error(`Unknown scenario: ${id}`);
  return found;
};
export async function prepare({ project, scenario }) {
  const selected = findScenario(scenario);
  if (!isAbsolute(project)) throw Error('project must be absolute');
  await mkdir(join(project, 'src'), { recursive: true });
  if (selected.id === 'renderer-error') await writeFile(join(project, 'src/FailingDisplay.svelte'), await readFile(new URL('./fixtures-browser/FailingDisplay.svelte', import.meta.url)));
  await writeFile(join(project, 'src/app.ts'), selected.id === 'form-refresh' ? await readFile(new URL('./fixtures-browser/form-refresh.ts', import.meta.url)) : selected.id === 'repeat' ? `export async function mountApp(target: HTMLElement, services: { wait: () => Promise<void> }): Promise<{ setItems(items: {id:string}[]): void | Promise<void>; getDraft(id: string): {read(): string | undefined}; committed: {read(): string | undefined}; dispose(): void | Promise<void> }> { throw new Error('Not implemented'); }\n` : selected.id === 'completion' ? `export async function mountApp(target: HTMLElement, services: {load(): Promise<string>; report(report: unknown): void}) { throw new Error('Not implemented'); }\n` : selected.id === 'renderer-error' ? `export async function mountApp(target: HTMLElement, services: {report(diagnostic: unknown): void}) { throw new Error('Not implemented'); }\n` : `export async function mountApp(target: HTMLElement, services: {load(id: string): Promise<string>}) { throw new Error('Not implemented'); }\n`);
  await writeFile(join(project, 'bootstrap.ts'), selected.id === 'form-refresh' ? `import { mountApp } from './src/app';
const state = { ready: false, error: '', calls: [] as string[], value: 'Initial', app: null as null | {dispose(): void | Promise<void>; query?: { getSnapshot(): { data?: unknown } }} };
Object.assign(window, { __extended: state });
window.addEventListener('unhandledrejection', event => { state.error = String(event.reason?.stack || event.reason); });
try {
  state.app = await mountApp(document.querySelector<HTMLElement>('#app')!, {
    async load() { state.calls.push('load'); return state.value; },
    async save(name: string) { state.calls.push('save:' + name); if (name === 'Reject') throw Error('save failed'); state.value = name; },
  });
  state.ready = true;
} catch (error) { state.error = String((error as Error)?.stack || error); }
` : selected.id === 'repeat' ? `import { mountApp } from './src/app';
const state = { ready: false, error: '', calls: [] as string[], app: null as null | Awaited<ReturnType<typeof mountApp>>, release: () => {} };
Object.assign(window, { __extended: state });
window.addEventListener('unhandledrejection', event => { state.error = String(event.reason?.stack || event.reason); });
try {
  state.app = await mountApp(document.querySelector<HTMLElement>('#app')!, { wait: () => { state.calls.push('wait'); return new Promise<void>(resolve => { state.release = resolve; }); } });
  state.ready = true;
} catch (error) { state.error = String((error as Error)?.stack || error); }
` : selected.id === 'completion' ? `import { mountApp } from './src/app';
const state = { ready: false, error: '', reports: [] as unknown[], calls: [] as string[], app: null as any };
Object.assign(window, { __extended: state });
window.addEventListener('unhandledrejection', event => { state.error = String(event.reason?.stack || event.reason); });
try {
  state.app = await mountApp(document.querySelector<HTMLElement>('#app')!, {
    async load() { state.calls.push('load'); throw Error('offline'); },
    report(report: unknown) { state.reports.push(report); },
  });
  state.ready = true;
} catch (error) { state.error = String((error as Error)?.stack || error); }
` : selected.id === 'renderer-error' ? `import { mountApp } from './src/app';
const state = { ready: false, error: '', reports: [] as unknown[], app: null as any };
Object.assign(window, { __extended: state });
window.addEventListener('unhandledrejection', event => { state.error = String(event.reason?.stack || event.reason); });
try {
  state.app = await mountApp(document.querySelector<HTMLElement>('#app')!, { report(diagnostic: unknown) { state.reports.push(diagnostic); } });
  state.ready = true;
} catch (error) { state.error = String((error as Error)?.stack || error); }
` : `import { mountApp } from './src/app';
const pending: Record<string, (value: string) => void> = {};
const state = { ready: false, error: '', calls: [] as string[], app: null as any, resolve(id: string, value: string) { if (!pending[id]) throw Error('No pending request: ' + id); pending[id](value); delete pending[id]; } };
Object.assign(window, { __extended: state });
window.addEventListener('unhandledrejection', event => { state.error = String(event.reason?.stack || event.reason); });
try {
  state.app = await mountApp(document.querySelector<HTMLElement>('#app')!, { load(id: string) { state.calls.push(id); return new Promise<string>(resolve => { pending[id] = resolve; }); } });
  state.ready = true;
} catch (error) { state.error = String((error as Error)?.stack || error); }
`);
  await writeFile(join(project, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="app"></main><script type="module" src="/bundle.js"></script></body></html>');
}
export async function check({ project, scenario, finalResponse, mode = 'check' }) {
  const selected = findScenario(scenario);
  if (!isAbsolute(project) || !['check', 'build'].includes(mode)) throw Error('Invalid project or mode');
  const result = { ok: false, typecheck: null, build: null, runtime: null, assertions: [], pageErrors: [] };
  let browser, server;
  try {
    try {
      const output = execFileSync(process.execPath, [join(root, 'node_modules/svelte-check/bin/svelte-check'), '--workspace', project, '--tsconfig', join(project, 'tsconfig.json')], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      result.typecheck = { ok: true, output };
    } catch (error) { result.typecheck = { ok: false, output: String(error.stdout ?? '') + String(error.stderr ?? '') }; }
    let bundled;
    try {
      const { compile, compileModule } = createRequire(join(project, 'package.json'))('svelte/compiler');
      const plugin = { name: 'installed-svelte', setup(builder) {
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({ contents: compile(await readFile(path, 'utf8'), { filename: path, generate: 'client', css: 'injected' }).js.code, loader: 'js' }));
        builder.onLoad({ filter: /\.svelte\.[jt]s$/ }, async ({ path }) => ({ contents: compileModule(await readFile(path, 'utf8'), { filename: path, generate: 'client' }).js.code, loader: 'js' }));
      } };
      bundled = await build({ absWorkingDir: project, entryPoints: ['bootstrap.ts'], bundle: true, write: false, metafile: true, platform: 'browser', format: 'esm', target: 'es2022', outdir: 'out', conditions: ['svelte', 'browser'], plugins: [plugin], logLevel: 'silent' });
      const renderer = Object.keys(bundled.metafile.inputs).some(path => /node_modules\/@viewstem\/svelte\/dist\//.test(path));
      result.build = { ok: mode === 'build' || renderer, rendererIncluded: renderer, errors: [] };
    } catch (error) { result.build = { ok: false, errors: [error.message] }; }
    if (mode === 'check' && result.build.ok) {
      const js = bundled.outputFiles.find(file => file.path.endsWith('.js'));
      const css = bundled.outputFiles.find(file => file.path.endsWith('.css'));
      const html = await readFile(join(project, 'index.html'), 'utf8');
      server = createServer((req, res) => {
        if (req.url === '/bundle.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js.contents); }
        else if (req.url === '/bundle.css' && css) { res.writeHead(200, { 'content-type': 'text/css' }); res.end(css.contents); }
        else if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(css ? html.replace('</head>', '<link rel="stylesheet" href="/bundle.css"></head>') : html); }
        else { res.writeHead(404); res.end(); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      page.on('pageerror', error => result.pageErrors.push(error.stack ?? error.message));
      const assertion = async (name, fn) => { try { result.assertions.push({ name, ok: true, evidence: await fn() }); } catch (error) { result.assertions.push({ name, ok: false, evidence: error.message }); } };
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.__extended?.ready || window.__extended?.error, null, { timeout: 10000 });
      const state = await page.evaluate(() => ({ ready: window.__extended.ready, error: window.__extended.error }));
      result.runtime = { ok: state.ready && !state.error, ...state };
      if (state.ready) {
        if (selected.id === 'form-refresh') {
        await assertion('load and successful save refresh', async () => {
          await page.getByText('Loaded: Initial', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
          const before = await page.evaluate(() => window.__extended.calls.slice());
          const initialQuery = await page.evaluate(() => window.__extended.app.query?.getSnapshot().data);
          if (initialQuery !== 'Initial') throw Error(`Query data: ${JSON.stringify(initialQuery)}`);
          await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Ada');
          await page.getByRole('button', { name: 'Save', exact: true }).click();
          await page.getByText('Loaded: Ada', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
          await page.getByText('Saved: Ada', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
          const calls = await page.evaluate(() => window.__extended.calls.slice());
          const data = await page.evaluate(() => window.__extended.app.query?.getSnapshot().data);
          if (data !== 'Ada') throw Error(`Query data: ${JSON.stringify(data)}`);
          if (before.filter(x => x === 'load').length !== 1 || calls.join(',') !== 'load,save:Ada,load') throw Error(JSON.stringify(calls));
          return { calls };
        });
        await assertion('failed save does not refresh', async () => {
          await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Reject');
          await page.getByRole('button', { name: 'Save', exact: true }).click();
          await page.getByText('Save failed', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
          await page.getByText('Loaded: Ada', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
          const calls = await page.evaluate(() => window.__extended.calls.slice());
          if (calls.join(',') !== 'load,save:Ada,load,save:Reject') throw Error(JSON.stringify(calls));
          return { calls };
        });
        } else if (selected.id === 'repeat') {
          await assertion('keyed reorder preserves draft', async () => {
            await page.getByRole('textbox', {name:'A', exact:true}).fill('draft-A', { timeout: 5000 });
            await page.getByRole('textbox', {name:'B', exact:true}).fill('draft-B');
            await page.waitForFunction(() => window.__extended.app.getDraft('A').read() === 'draft-A' && window.__extended.app.getDraft('B').read() === 'draft-B', null, {timeout:5000});
            await page.evaluate(() => window.__extended.app.setItems([{id:'B'}, {id:'A'}]));
            await page.waitForFunction(() => Array.from(document.querySelectorAll('#app input')).map(el => el.getAttribute('aria-label')).join(',') === 'B,A', null, {timeout:5000});
            const value = await page.getByRole('textbox', {name:'A', exact:true}).inputValue();
            const state = await page.evaluate(() => ({a:window.__extended.app.getDraft('A').read(), b:window.__extended.app.getDraft('B').read()}));
            if (value !== 'draft-A' || state.a !== 'draft-A' || state.b !== 'draft-B') throw Error(`drafts: ${JSON.stringify({value,state})}`);
            return { order:['B','A'], value };
          });
          await assertion('removed row cannot commit after wait', async () => {
            await page.getByRole('button', {name:'Commit', exact:true}).last().click({timeout:5000});
            await page.waitForFunction(() => window.__extended.calls.includes('wait'), null, {timeout:5000});
            await page.evaluate(() => window.__extended.app.setItems([{id:'B'}]));
            await page.getByRole('textbox', {name:'A', exact:true}).waitFor({state:'detached',timeout:5000});
            await page.evaluate(() => window.__extended.release());
            await page.waitForTimeout(100);
            const values = await page.evaluate(() => ({committed:window.__extended.app.committed.read(), draft:window.__extended.app.getDraft('B').read()}));
            const committed = values.committed;
            if (values.draft !== 'draft-B' || await page.getByRole('textbox', {name:'B', exact:true}).inputValue() !== 'draft-B') throw Error(`B draft: ${JSON.stringify(values.draft)}`);
            if (committed !== '') throw Error(`stale commit: ${JSON.stringify(committed)}`);
            return { committed };
          });
        } else if (selected.id === 'completion') {
          await assertion('initial Query failure reported', async () => {
            const data = await page.evaluate(async () => {
              const app = window.__extended.app;
              const limit = () => new Promise((_, reject) => setTimeout(() => reject(Error('completion timed out')), 5000));
              const report = await Promise.race([app.initialComplete, limit()]);
              await Promise.race([app.whenRendered(), limit()]);
              return { report, query: app.query.getSnapshot(), reports: window.__extended.reports, calls: window.__extended.calls };
            });
            if (data.calls.join(',') !== 'load' || data.query.status !== 'error' || !data.report.queryErrors?.some(item => item.query === 'profile') || !data.reports.some(report => report?.queryErrors?.some(item => item.query === 'profile'))) throw Error(JSON.stringify(data));
            await page.getByText('Ready', {exact:true}).waitFor({state:'visible',timeout:5000});
            return { queryStatus: data.query.status, queryErrors: data.report.queryErrors, reported: data.reports.length, dom: 'Ready visible after whenRendered' };
          });
        } else if (selected.id === 'renderer-error') {
          await assertion('State write survives failed render', async () => {
            await page.getByText('good', {exact:true}).waitFor({state:'visible', timeout:5000});
            await page.getByRole('button', {name:'Update',exact:true}).click({timeout:5000});
            await page.waitForFunction(() => window.__extended.reports.some(item => item?.phase === 'render'), null, {timeout:5000});
            const data = await page.evaluate(() => ({value:window.__extended.app.value.read(), reports:window.__extended.reports}));
            if (data.value !== 'bad' || !data.reports.some(item => item.phase === 'render' && item.error)) throw Error(JSON.stringify(data));
            await page.getByText('good', {exact:true}).waitFor({state:'detached',timeout:5000});
            return {value:data.value, phase:'render', previousDisplayRemoved:true};
          });
        } else if (selected.id === 'late-response') {
          await assertion('late old response does not replace current View data', async () => {
            await page.waitForFunction(() => window.__extended.calls.includes('A'), null, {timeout:5000});
            await page.evaluate(() => Promise.race([window.__extended.app.replace('B'), new Promise((_, reject) => setTimeout(() => reject(Error('replace timed out')), 5000))]));
            await page.waitForFunction(() => window.__extended.calls.includes('B'), null, {timeout:5000});
            await page.evaluate(() => window.__extended.resolve('B','Current B'));
            await page.getByText('Current B', {exact:true}).waitFor({state:'visible',timeout:5000});
            await page.evaluate(() => window.__extended.resolve('A','Stale A'));
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const data = await page.evaluate(() => ({snapshot:window.__extended.app.getQuery().getSnapshot(), calls:window.__extended.calls}));
            if (data.snapshot.data !== 'Current B') throw Error(JSON.stringify(data));
            if (await page.getByText('Stale A', {exact:true}).count()) throw Error('Stale A rendered');
            await page.getByText('Current B', {exact:true}).waitFor({state:'visible',timeout:5000});
            return {calls:data.calls, queryData:data.snapshot.data};
          });
        }
        if (selected.id === 'repeat') await page.evaluate(() => window.__extended.release());
        await assertion('dispose removes owned UI', async () => { await page.evaluate(() => Promise.race([window.__extended.app.dispose(), new Promise((_, reject) => setTimeout(() => reject(Error('dispose timed out')), 5000))])); const remaining = await page.locator('#app').evaluate(el => el.children.length); if (remaining) throw Error(`${remaining} elements remain`); return { remaining }; });
      }
      const error = await page.evaluate(() => window.__extended.error);
      if (error) { result.runtime.ok = false; result.runtime.error = error; }
    }
  } catch (error) { result.runtime = { ok: false, error: error.stack ?? error.message }; }
  finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); }
  result.ok = Boolean(result.typecheck?.ok && result.build?.ok && (mode === 'build' || (result.runtime?.ok && result.assertions.length && result.assertions.every(item => item.ok) && !result.pageErrors.length)));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, ...args] = process.argv.slice(2);
  const option = name => args[args.indexOf(`--${name}`) + 1];
  try { const result = await check({ project: option('project'), scenario: option('scenario'), mode }); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}
