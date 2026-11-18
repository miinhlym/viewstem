import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/public-consumer/', import.meta.url));
const tsc = join(workspace, 'node_modules/typescript/bin/tsc');
const execute = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });

test('independent consumers use the packed headless, DOM and mixed packages', { timeout: 90_000 }, async t => {
  const packRoot = await mkdtemp(join(tmpdir(), 'viewstem-packs-'));
  t.after(() => rm(packRoot, { recursive: true, force: true }));
  const packs = Object.fromEntries(['core', 'dom', 'ui', 'svelte'].map(name => {
    const [pack] = JSON.parse(execute('npm', ['pack', `./packages/${name}`, '--pack-destination', packRoot, '--ignore-scripts', '--json'], workspace));
    assert.ok(pack.files.some(file => file.path === 'LICENSE'));
    assert.ok(pack.files.every(file => !file.path.startsWith('src/') && !file.path.startsWith('test/')));
    return [name, join(packRoot, pack.filename)];
  }));

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
    await Promise.all([entry, ...extraFiles, 'tsconfig.json'].map(name => copyFile(join(fixtures, name), join(directory, name))));
    const types = JSON.parse(await readFile(join(directory, 'tsconfig.json'), 'utf8'));
    types.files = [entry];
    await writeFile(join(directory, 'tsconfig.json'), JSON.stringify(types));
    execute(process.execPath, [tsc, '-p', 'tsconfig.json'], directory);
    return { directory, require };
  }

  let browser;
  t.after(async () => { await browser?.close(); });
  async function runBrowser(t, installation, entry, packages) {
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
    const { metafile, outputFiles } = await build({ absWorkingDir: directory, entryPoints: [entry], write: false, bundle: true,
      platform: 'browser', format: 'iife', conditions: ['svelte', 'browser'], metafile: true, plugins });
    const inputs = Object.keys(metafile.inputs);
    const fromViewstem = inputs.filter(input => input.includes('@viewstem/'));
    assert.ok(fromViewstem.every(input => input.startsWith('node_modules/@viewstem/')));
    for (const name of packages) assert.ok(fromViewstem.some(input => input.startsWith(`node_modules/@viewstem/${name}/dist/`)), name);
    if (!packages.includes('svelte')) assert.ok(inputs.every(input => !input.includes('node_modules/svelte/')));

    browser ??= await chromium.launch();
    const page = await browser.newPage();
    t.after(() => page.close());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<main data-viewstem-ui></main>');
    await page.addScriptTag({ content: outputFiles[0].text });
    const result = await page.evaluate(() => window.testRun());
    assert.deepEqual(errors, []);
    return result;
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

  await t.test('a public third-party connector shares State and slots with official DOM and Svelte', async t => {
    const packages = ['core', 'dom', 'ui', 'svelte'];
    const installation = await install(t, packages, 'main.ts', ['common-set.ts', 'external-set.ts', 'external-connector.ts', 'Layout.svelte'], ['svelte@5.57.3']);
    assert.deepEqual(await runBrowser(t, installation, 'main.ts', packages), {
      answer: 42, title: 'After', labels: ['After', 'After'], kept: true, moved: 'compact', restored: ['beta', 'alpha'],
      preserved: true, mounts: ['alpha', 'alpha', 'beta', 'beta'], disposals: ['alpha', 'beta'], empty: true,
    });
  });
});
