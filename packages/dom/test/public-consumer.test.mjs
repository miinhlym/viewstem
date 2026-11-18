import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/public-consumer/', import.meta.url));
const tsc = join(workspace, 'node_modules/typescript/bin/tsc');
const execute = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });

test('independent consumers use the packed headless, DOM and mixed packages', { timeout: 120_000 }, async t => {
  const packRoot = await mkdtemp(join(tmpdir(), 'viewstem-packs-'));
  t.after(() => rm(packRoot, { recursive: true, force: true }));
  const inputs = ['core', 'dom', 'ui', 'svelte'].map(name => `./packages/${name}`);
  const packed = JSON.parse(execute('npm', ['pack', ...inputs, '--pack-destination', packRoot, '--ignore-scripts', '--json'], workspace));
  const packs = Object.fromEntries(packed.map(pack => {
    assert.ok(pack.files.some(file => file.path === 'LICENSE'));
    assert.ok(pack.files.every(file => !file.path.startsWith('src/') && !file.path.startsWith('test/')));
    return [pack.name.slice('@viewstem/'.length), join(packRoot, pack.filename)];
  }));

  async function prepareFixture(directory, entry, extraFiles) {
    await Promise.all([entry, ...extraFiles, 'tsconfig.json'].map(async name => {
      const destination = join(directory, name);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(fixtures, name), destination);
    }));
    const types = JSON.parse(await readFile(join(directory, 'tsconfig.json'), 'utf8'));
    types.files = [entry];
    await writeFile(join(directory, 'tsconfig.json'), JSON.stringify(types));
    execute(process.execPath, [tsc, '-p', 'tsconfig.json'], directory);
  }

  async function install(t, packages, entry, extraFiles = [], peer = []) {
    const base = await mkdtemp(join(tmpdir(), 'viewstem-independent-'));
    t.after(() => rm(base, { recursive: true, force: true }));
    const directory = await realpath(base);
    const manifest = join(directory, 'package.json');
    await writeFile(manifest, JSON.stringify({ type: 'module', private: true }));
    execute('npm', ['install', ...packages.map(name => packs[name]), ...peer, '--ignore-scripts', '--no-audit', '--no-fund'], directory);
    const lock = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'));
    const installed = Object.keys(lock.packages).filter(path => path.startsWith('node_modules/@viewstem/')).sort();
    assert.deepEqual(installed, packages.map(name => `node_modules/@viewstem/${name}`).sort());
    if (!peer.length) assert.equal(Object.hasOwn(lock.packages, 'node_modules/svelte'), false);
    const require = createRequire(manifest);
    const resolved = JSON.parse(execute(process.execPath, ['--input-type=module', '-e',
      `console.log(JSON.stringify(${JSON.stringify(packages)}.map(name => import.meta.resolve('@viewstem/' + name))))`,
    ], directory));
    for (const [index, name] of packages.entries()) {
      const entryPoint = await realpath(fileURLToPath(resolved[index]));
      assert.ok(entryPoint.startsWith(join(directory, 'node_modules', '@viewstem', name, 'dist') + '/'));
    }
    await prepareFixture(directory, entry, extraFiles);
    return { directory, require };
  }

  let browser;
  t.after(async () => { await browser?.close(); });
  async function openBrowser(t, installation, entry, packages, { html = '<main data-viewstem-ui></main>', format = 'iife' } = {}) {
    const { directory, require } = installation;
    const plugins = [];
    if (packages.includes('svelte')) {
      const { compile } = require('svelte/compiler');
      plugins.push({ name: 'consumer-svelte', setup(builder) {
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
          const result = compile(await readFile(path, 'utf8'), { filename: path, generate: 'client', css: 'injected' });
          assert.deepEqual(result.warnings, [], `Svelte warnings for ${path}`);
          return { contents: result.js.code, loader: 'js' };
        });
      } });
    }
    const { metafile, outputFiles } = await build({ absWorkingDir: directory, entryPoints: [`./${entry}`], outfile: 'bundle.js',
      write: false, bundle: true, platform: 'browser', format, conditions: ['svelte', 'browser'], metafile: true, plugins });
    const inputs = Object.keys(metafile.inputs);
    const fromViewstem = inputs.filter(input => input.includes('@viewstem/'));
    assert.ok(fromViewstem.every(input => input.startsWith('node_modules/@viewstem/')));
    for (const name of packages) assert.ok(fromViewstem.some(input => input.startsWith(`node_modules/@viewstem/${name}/dist/`)), name);
    if (!packages.includes('svelte')) assert.ok(inputs.every(input => !input.includes('node_modules/svelte/')));

    browser ??= await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
    await page.setContent(html);
    for (const asset of outputFiles.filter(file => file.path.endsWith('.css'))) await page.addStyleTag({ content: asset.text });
    const script = outputFiles.find(file => file.path.endsWith('.js'));
    await page.addScriptTag({ content: script.text, ...(format === 'esm' && { type: 'module' }) });
    return page;
  }

  async function runBrowser(t, installation, entry, packages) {
    const page = await openBrowser(t, installation, entry, packages);
    return page.evaluate(() => window.testRun());
  }

  await t.test('Core-only Node install runs an Action and rejects a missing host capability', async t => {
    const { directory } = await install(t, ['core'], 'headless.ts', ['common-set.ts']);
    execute(process.execPath, [tsc, '-p', 'tsconfig.json', '--noEmit', 'false', '--outDir', 'build'], directory);
    const result = JSON.parse(execute(process.execPath, ['build/headless.js'], directory));
    assert.equal(result.answer, 42);
    assert.equal(result.originalCount, 4);
    assert.equal(result.newCount, 2);
    assert.deepEqual(result.authorized, ['answer', 'count', 'count', 'navigate', 'answer']);
    assert.equal(result.cancelled, 'CANCELLED');
    assert.equal(result.aborted, true);
    assert.equal(result.document, 'undefined');
    assert.equal(result.routing.code, 'REFERENCE_NOT_FOUND');
    assert.equal(result.routing.location, '/capabilities/routing');
  });

  await t.test('DOM-only install registers and uses the UI set without Svelte', async t => {
    const packages = ['core', 'dom', 'ui'];
    const installation = await install(t, packages, 'dom-only.ts');
    assert.deepEqual(await runBrowser(t, installation, 'dom-only.ts', packages), { text: 'DOM only', empty: true });
  });

  const mixedPackages = ['core', 'dom', 'ui', 'svelte'];
  const mixedInstallation = await install(t, mixedPackages, 'main.ts',
    ['common-set.ts', 'external-set.ts', 'external-connector.ts', 'Layout.svelte'], ['svelte@5.57.3']);
  await t.test('a public third-party connector shares State and slots with official DOM and Svelte', async t => {
    assert.deepEqual(await runBrowser(t, mixedInstallation, 'main.ts', mixedPackages), {
      answer: 42, title: 'After', labels: ['After', 'After'], kept: true, moved: 'compact', restored: ['beta', 'alpha'],
      preserved: true, mounts: ['alpha', 'alpha', 'beta', 'beta'], disposals: ['alpha', 'beta'], empty: true,
    });
  });

  await t.test('both mounting guides show the runnable mixed counter and its preparation error', async t => {
    const app = 'mixed-counter';
    const entry = `${app}/src/main.ts`;
    const files = [`${app}/index.html`, `${app}/src/counter-contract.ts`, `${app}/src/Counter.svelte`, entry];
    const error = {
      code: 'REFERENCE_NOT_FOUND', message: 'Unknown State "coutn".',
      location: '/render/slots/default/0/inputs/count/@path', input: 'count',
    };
    const { directory } = mixedInstallation;
    await prepareFixture(directory, entry, files.slice(0, -1));
    const snippets = await Promise.all(files.map(file => readFile(join(directory, file), 'utf8')));
    for (const locale of ['docs', 'ko/docs']) {
      const guide = await readFile(join(workspace, 'apps/docs/src/content/docs', locale, 'svelte/guides/mount-in-svelte.md'), 'utf8');
      const mixed = guide.split('<a id="mix-default-ui"></a>')[1];
      assert.ok(mixed);
      const blocks = [...mixed.matchAll(/^```(?:html|ts|svelte)\n([\s\S]+?)\n```/gm)].map(match => match[1]);
      assert.deepEqual(blocks, snippets.map(snippet => snippet.trimEnd()));
      const shownError = mixed.match(/^```json\n([\s\S]+?)\n```/m);
      assert.ok(shownError);
      assert.deepEqual(JSON.parse(shownError[1]), error);
    }
    const config = join(directory, 'tsconfig.json');
    const types = JSON.parse(await readFile(config, 'utf8'));
    types.compilerOptions.module = 'ESNext';
    types.compilerOptions.moduleResolution = 'Bundler';
    types.include = [`${app}/src/**/*.svelte`];
    await writeFile(config, JSON.stringify(types));
    execute(process.execPath, [join(workspace, 'node_modules/svelte-check/bin/svelte-check'), '--tsconfig', './tsconfig.json', '--fail-on-warnings'], directory);
    const boot = `${app}/boot.mjs`;
    await writeFile(join(directory, boot), `import { renderer, screen, source } from './src/main.ts';
window.counter = { renderer, screen, source, view: await screen.ready };`);
    const html = snippets[0].replace('<script type="module" src="/src/main.ts"></script>', '');
    const page = await openBrowser(t, mixedInstallation, boot, mixedPackages, { html, format: 'esm' });
    await page.waitForFunction(() => window.counter !== undefined);

    const count = page.getByRole('status', { name: 'Count' });
    const button = page.getByRole('button', { name: '+1' });
    assert.equal((await count.textContent()).trim(), '0');
    await button.click();
    await count.filter({ hasText: /^\s*1\s*$/ }).waitFor();
    await button.press('Enter');
    await count.filter({ hasText: /^\s*2\s*$/ }).waitFor();
    const errors = await page.evaluate(async () => {
      const { renderer, view, source } = window.counter;
      const cell = view.getState('count');
      const current = document.querySelector('#app output');
      const invalid = structuredClone(source);
      invalid.render.slots.default[0].inputs.count = { '@path': '/states/coutn' };
      const target = document.body.appendChild(document.createElement('div'));
      const diagnostics = [];
      const broken = renderer.mount({ target, source: invalid, onError: diagnostic => diagnostics.push(diagnostic) });
      const [ready, render, update] = await Promise.allSettled([
        broken.ready, broken.whenRendered(), view.updateDefinition(invalid, { states: { count: 99 } }),
      ]);
      const preserved = cell === view.getState('count') && cell.read() === 2 && current === document.querySelector('#app output');
      target.remove();
      return { ready: ready.reason, render: render.reason, update: update.reason, diagnostics, preserved };
    });
    assert.deepEqual(errors, { ready: error, render: error, update: error, diagnostics: [{ phase: 'prepare', error }], preserved: true });
    await button.click();
    await count.filter({ hasText: /^\s*3\s*$/ }).waitFor();
    await page.evaluate(async () => {
      await window.counter.screen.unmount();
      await window.counter.renderer.dispose();
    });
    assert.equal(await page.locator('#app').innerHTML(), '');
  });
});
