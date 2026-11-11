import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = fileURLToPath(import.meta.url);
const [command, ...args] = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
}
const project = option('project');
if (!project || !isAbsolute(project) || !['prepare', 'check', 'build'].includes(command)) {
  console.error('Usage: consumer.mjs prepare --project ABS_EMPTY_DIR --tarballs ABS_DIR | check --project ABS [--scenario first-view|form|native] | build --project ABS');
  process.exit(2);
}
const run = (cmd, argv, cwd) => {
  try { return { ok: true, output: execFileSync(cmd, argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (error) { return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}${error.message ?? ''}` }; }
};
const write = (path, content) => writeFile(join(project, path), content);
// npm executes scripts through a POSIX shell; JSON strings are not shell quoting.
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const scenario = option('scenario');
if (scenario && !['first-view', 'form', 'native'].includes(scenario)) {
  console.error('Unknown scenario'); process.exit(2);
}
if (command === 'prepare') {
  const tarballs = option('tarballs');
  if (!tarballs || !isAbsolute(tarballs)) throw Error('--tarballs must be an absolute directory');
  if ((await readdir(project)).length) throw Error('Project directory must be empty');
  const names = await readdir(tarballs);
  const archives = [];
  for (const name of ['core', 'svelte', 'ui']) {
    const matches = names.filter(file => new RegExp(`^viewstem-${name}-\\d.*\\.tgz$`).test(file));
    if (matches.length !== 1) throw Error(`Expected exactly one ${name} tarball, found ${matches.length}`);
    archives.push(join(tarballs, matches[0]));
  }
  if (names.filter(file => /^viewstem-.*\.tgz$/.test(file)).length !== 3) throw Error('Expected exactly three Viewstem tarballs');
  await mkdir(join(project, 'src'));
  await write('package.json', JSON.stringify({ private: true, type: 'module', scripts: {
    check: `node ${shellQuote(script)} check --project ${shellQuote(project)}`,
    build: `node ${shellQuote(script)} build --project ${shellQuote(project)}`,
  } }, null, 2));
  await write('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, noEmit: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM', 'DOM.Iterable'] }, include: ['src/**/*'] }, null, 2));
  await write('src/app.ts', `export async function mountApp(target: HTMLElement, services: {save?: (name:string)=>Promise<void>} = {}): Promise<{dispose:()=>void|Promise<void>}> { throw new Error('Not implemented'); }\n`);
  await write('index.html', '<!doctype html><html><head><meta charset="utf-8"><title>Consumer</title></head><body><main id="app"></main><script type="module" src="/bundle.js"></script></body></html>');
  await write('bootstrap.ts', `import { mountApp } from './src/app';
const calls: string[] = [];
const lifecycle = { ready: false, error: '', calls, dispose: async () => {} };
Object.assign(window, { __consumer: lifecycle });
window.addEventListener('unhandledrejection', e => { lifecycle.error = String(e.reason?.stack || e.reason); });
try {
  const mounted = await mountApp(document.querySelector<HTMLElement>('#app')!, { save: async name => { calls.push(name); } });
  lifecycle.dispose = async () => { await mounted.dispose(); };
  lifecycle.ready = true;
} catch (error) { lifecycle.error = String((error as Error)?.stack || error); }
`);
  const installed = run('npm', ['install', ...archives, 'svelte@5.57.3', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], project);
  if (!installed.ok) throw Error(`Installation failed: ${installed.output}`);
  for (const name of ['core', 'svelte', 'ui']) {
    const manifest = JSON.parse(await readFile(join(project, 'node_modules/@viewstem', name, 'package.json'), 'utf8'));
    if (manifest.name !== `@viewstem/${name}`) throw Error(`Unexpected installed package ${manifest.name}`);
  }
  console.log(JSON.stringify({ ok: true, project, tarballs: archives }, null, 2));
  process.exit(0);
}

const result = { ok: false, scenario: scenario ?? null, typecheck: null, build: null, runtime: null, pageErrors: [], assertions: [] };
let server, browser;
try {
  const check = run(process.execPath, [join(root, 'node_modules/svelte-check/bin/svelte-check'), '--workspace', project, '--tsconfig', join(project, 'tsconfig.json')], project);
  result.typecheck = { ok: check.ok, output: check.output };
  const files = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
  const sources = (await files(join(project, 'src'))).filter(path => /\.(?:[cm]?[jt]s|svelte)$/.test(path));
  const forbidden = [];
  const exportsByPackage = Object.fromEntries(await Promise.all(['core', 'svelte', 'ui'].map(async name => {
    const manifest = JSON.parse(await readFile(join(project, 'node_modules/@viewstem', name, 'package.json'), 'utf8'));
    return [name, manifest.exports];
  })));
  for (const path of sources) {
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\(|import\s*)["'](@viewstem\/[^"']+)["']/g)) {
      const [, name, subpath] = /^@viewstem\/([^/]+)(.*)$/.exec(match[1]);
      const exports = exportsByPackage[name];
      if (!exports || !Object.hasOwn(exports, subpath ? `.${subpath}` : '.')) forbidden.push(`${path}: ${match[1]}`);
    }
  }
  const requireInstalled = createRequire(join(project, 'package.json'));
  const { compile, compileModule } = requireInstalled('svelte/compiler');
  const plugin = { name: 'installed-svelte', setup(builder) {
    builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({ contents: compile(await readFile(path, 'utf8'), { filename: path, generate: 'client', css: 'injected' }).js.code, loader: 'js' }));
    builder.onLoad({ filter: /\.svelte\.[jt]s$/ }, async ({ path }) => ({ contents: compileModule(await readFile(path, 'utf8'), { filename: path, generate: 'client' }).js.code, loader: 'js' }));
  } };
  let bundled;
  try {
    bundled = await build({ absWorkingDir: project, entryPoints: ['bootstrap.ts'], bundle: true, write: false, metafile: true, platform: 'browser', format: 'esm', target: 'es2022', outdir: 'out', conditions: ['svelte', 'browser'], plugins: [plugin], logLevel: 'silent' });
    const renderer = Object.keys(bundled.metafile.inputs).some(path => /node_modules\/@viewstem\/svelte\/dist\//.test(path));
    const ui = Object.keys(bundled.metafile.inputs).some(path => /node_modules\/@viewstem\/ui\/dist\//.test(path));
    const requiredImports = !scenario || ui;
    result.build = { ok: forbidden.length === 0 && requiredImports, forbiddenImports: forbidden, rendererIncluded: renderer, uiIncluded: ui, errors: [] };
  } catch (error) { result.build = { ok: false, forbiddenImports: forbidden, errors: [error.message] }; }
  if (scenario && result.build.ok) {
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
    const assertion = async (name, fn) => {
      try { const evidence = await fn(); result.assertions.push({ name, ok: true, evidence }); }
      catch (error) { result.assertions.push({ name, ok: false, evidence: error.message }); }
    };
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__consumer?.ready || window.__consumer?.error, { timeout: 10000 });
    const state = await page.evaluate(() => ({ ready: window.__consumer.ready, error: window.__consumer.error }));
    result.runtime = { ok: state.ready && !state.error, ...state };
    if (state.ready) {
      if (scenario === 'first-view') await assertion('Start button visible', async () => { await page.getByRole('button', { name: 'Start', exact: true }).waitFor({ state: 'visible', timeout: 5000 }); return 'visible'; });
      if (scenario === 'form') {
        await assertion('Save Ada and show status', async () => {
          await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Ada', { timeout: 5000 });
          await page.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 5000 });
          await page.getByText('Saved: Ada', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
          const calls = await page.evaluate(() => window.__consumer.calls);
          if (!calls.includes('Ada')) throw Error(`Save calls: ${JSON.stringify(calls)}`);
          return { calls, status: 'Saved: Ada' };
        });
      }
      if (scenario === 'native') await assertion('Calendar day grid visible', async () => {
        const grid = page.locator('#app [role="grid"], #app table').filter({ has: page.getByRole('button') });
        await grid.first().waitFor({ state: 'visible', timeout: 5000 });
        const count = await grid.first().getByRole('button').count();
        if (count < 7) throw Error(`Expected calendar day buttons, found ${count}`);
        return { dayButtons: count };
      });
      await assertion('Dispose removes owned UI', async () => { await page.evaluate(() => window.__consumer.dispose()); const remaining = await page.locator('#app').evaluate(el => el.children.length); if (remaining) throw Error(`${remaining} elements remain`); return { remaining }; });
    }
    const lateError = await page.evaluate(() => window.__consumer.error);
    if (lateError) { result.runtime.ok = false; result.runtime.error = lateError; }
  }
} catch (error) { result.runtime = { ok: false, error: error.stack ?? error.message }; }
finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
result.ok = Boolean(result.typecheck?.ok && result.build?.ok && (!scenario || (result.runtime?.ok && result.assertions.length && result.assertions.every(item => item.ok) && result.pageErrors.length === 0)));
await write('verification.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
