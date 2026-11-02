import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'viewstem-svelte-ui-consumer-'));
const run = (command, args, cwd = directory) => execFileSync(command, args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const json = async path => JSON.parse(await readFile(join(directory, path), 'utf8'));
const consumerFile = (path, content) => writeFile(join(directory, path), content);
const viewstemNames = ['core', 'svelte', 'svelte-ui'];
const svelteVersion = '5.57.3';

let browser;
try {
  const packages = viewstemNames.map(name => JSON.parse(run('npm', [
    'pack', join(root, 'packages', name), '--pack-destination', directory, '--ignore-scripts', '--json',
  ], root))[0]);
  const ui = packages.at(-1);
  const paths = new Set(ui.files.map(({ path }) => path));
  for (const path of [
    'LICENSE', 'README.md', 'README.ko.md', 'dist/shadcn/vendor/sonner-runtime/LICENSE',
    'dist/index.js', 'dist/index.d.ts', 'dist/shadcn/index.js', 'dist/shadcn/index.d.ts',
    'dist/shadcn/styles.css', 'dist/shadcn/support.json', 'upstream/NOTICE.txt',
  ]) assert.ok(paths.has(path), `missing packed file ${path}`);
  for (const path of paths) {
    assert.ok(path.startsWith('dist/') || ['LICENSE', 'README.md', 'README.ko.md', 'package.json', 'upstream/NOTICE.txt'].includes(path), path);
    assert.doesNotMatch(path, /(?:^|\/)(?:\.type-cache|src|test|example|scripts|node_modules)\/|(?:^|\/)catalog\.json$/);
  }

  await consumerFile('package.json', JSON.stringify({ private: true, type: 'module' }));
  run('npm', [
    'install', ...packages.map(({ filename }) => join(directory, filename)), `svelte@${svelteVersion}`,
    '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline',
  ]);
  const lock = await json('package-lock.json');
  for (const { name, integrity, filename } of packages) {
    const installed = lock.packages[`node_modules/${name}`];
    assert.equal(installed.integrity, integrity);
    assert.equal(basename(installed.resolved), filename);
    assert.equal((await json(`node_modules/${name}/package.json`)).license, 'MIT');
    assert.equal(await readFile(join(directory, `node_modules/${name}/LICENSE`), 'utf8'), await readFile(join(root, 'LICENSE'), 'utf8'));
  }
  assert.equal(await readFile(join(directory, 'node_modules/@viewstem/svelte-ui/upstream/NOTICE.txt'), 'utf8'), await readFile(join(root, 'packages/svelte-ui/upstream/NOTICE.txt'), 'utf8'));
  assert.equal(await readFile(join(directory, 'node_modules/@viewstem/svelte-ui/dist/shadcn/vendor/sonner-runtime/LICENSE'), 'utf8'), await readFile(join(root, 'packages/svelte-ui/src/lib/shadcn/vendor/sonner-runtime/LICENSE'), 'utf8'));
  const installedUI = await json('node_modules/@viewstem/svelte-ui/package.json');
  const familyEntries = Object.entries(installedUI.exports).filter(([name, entry]) => name.startsWith('./shadcn/') && entry.types);
  assert.equal(familyEntries.length, 66);
  for (const [, entry] of familyEntries) {
    assert.ok(paths.has(entry.types.slice(2)), entry.types);
    assert.ok(paths.has(entry.svelte.slice(2)), entry.svelte);
  }

  await consumerFile('consumer.ts', await readFile(new URL('../test/types/consumer.ts', import.meta.url)));
  const familyExports = familyEntries.map(([name], i) => `export * as family${i} from '@viewstem/svelte-ui${name.slice(1)}';`);
  await consumerFile('families.ts', familyExports.join('\n'));
  // Consumer code is strict. Upstream third-party declaration diagnostics are outside this check.
  run(process.execPath, [
    join(root, 'node_modules/typescript/bin/tsc'), '--strict', '--skipLibCheck', '--noEmit',
    '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--lib', 'ES2022,DOM,DOM.Iterable',
    'consumer.ts', 'families.ts',
  ]);
  run(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import * as ui from '@viewstem/svelte-ui';
    import support from '@viewstem/svelte-ui/shadcn/support.json' with { type: 'json' };
    assert.deepEqual(Object.keys(ui), ['registerComponents']);
    assert.equal(support.families, 66);
    assert.equal(support.upstreamComponents, 386);
    const components = [];
    ui.registerComponents({ registerComponents: entries => components.push(...entries) }, [{ id: 'empty', components: [] }]);
    assert.equal(components.length, 0);
  `]);

  await consumerFile('button.mjs', `
    import { createRenderer } from '@viewstem/svelte';
    import { registerComponents } from '@viewstem/svelte-ui';
    import { button } from '@viewstem/svelte-ui/shadcn/button';
    import '@viewstem/svelte-ui/shadcn/styles.css';
    const renderer = createRenderer();
    registerComponents(renderer, [button]);
    const mounted = await renderer.mount({
      target: document.querySelector('main'),
      view: { render: { id: 'button', componentRef: 'shadcn.Button', inputs: { text: 'Packed Button', size: 'xs' } } },
    });
    await mounted.initialComplete;
    await mounted.whenRendered();
    document.body.dataset.ready = 'true';
    window.disposeConsumer = () => renderer.dispose();
  `);
  await consumerFile('all.mjs', `
    import { createRenderer } from '@viewstem/svelte';
    import { registerComponents } from '@viewstem/svelte-ui';
    import { shadcn } from '@viewstem/svelte-ui/shadcn';
    if (shadcn.length !== 66) throw Error('Incomplete family exports');
    const renderer = createRenderer();
    registerComponents(renderer, shadcn);
    if (renderer.registry.list('Component').length !== 357) throw Error('Incorrect JSON component count');
    await renderer.dispose();
    document.body.dataset.ready = 'true';
  `);

  const requireInstalled = createRequire(join(directory, 'package.json'));
  const { compile, compileModule } = requireInstalled('svelte/compiler');
  const plugin = {
    name: 'installed-svelte',
    setup(builder) {
      builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
        contents: compile(await readFile(path, 'utf8'), { filename: path, generate: 'client', css: 'injected' }).js.code,
        loader: 'js',
      }));
      builder.onLoad({ filter: /\.svelte\.js$/ }, async ({ path }) => ({
        contents: compileModule(await readFile(path, 'utf8'), { filename: path, generate: 'client' }).js.code,
        loader: 'js',
      }));
    },
  };
  const bundle = entry => build({
    absWorkingDir: directory,
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    outdir: 'out',
    minify: true,
    conditions: ['svelte', 'browser'],
    plugins: [plugin],
  });
  const selected = await bundle('button.mjs');
  const all = await bundle('all.mjs');
  const selectedPaths = Object.keys(selected.metafile.inputs);
  const allPaths = Object.keys(all.metafile.inputs);
  const heavy = [
    ['LayerChart', /\/layerchart\//],
    ['TanStack Table', /\/@tanstack\/(?:svelte-table|table-core)\//],
    ['Sonner', /\/(?:svelte-sonner|sonner-runtime)\//],
    ['Shiki', /\/(?:shiki|@shikijs)\//, false],
  ];
  for (const [name, pattern, expectedInFull = true] of heavy) {
    // Shiki is used by a copied upstream helper that the widget barrels do not import.
    if (expectedInFull) assert.ok(allPaths.some(path => pattern.test(path)), `full graph contains ${name}`);
    assert.ok(!selectedPaths.some(path => pattern.test(path)), `Button graph excludes ${name}`);
  }
  assert.deepEqual(
    selectedPaths.filter(path => /\/shadcn\/families\//.test(path)).map(path => basename(path)),
    ['button.js'],
  );
  const asset = (result, extension) => {
    const output = result.outputFiles.find(({ path }) => path.endsWith(extension));
    assert.ok(output, extension);
    return output;
  };

  browser = await chromium.launch({ headless: true });
  for (const [name, result] of [['Button', selected], ['all', all]]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack ?? error.message));
    // mode-watcher reads localStorage during import, so serve the fixture on an origin.
    const origin = 'http://viewstem-consumer.test/';
    await page.route(origin, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><main></main>' }));
    await page.goto(origin);
    if (name === 'Button') await page.addStyleTag({ content: asset(result, '.css').text });
    await page.evaluate(() => {
      window.addEventListener('unhandledrejection', event => {
        document.body.dataset.failure = JSON.stringify(event.reason, Object.getOwnPropertyNames(event.reason ?? {}));
      });
    });
    await page.addScriptTag({ type: 'module', content: asset(result, '.js').text });
    try {
      await page.waitForFunction(() => document.body.dataset.ready === 'true' || Boolean(document.body.dataset.failure));
    } catch (error) {
      throw new Error(`${name} ESM failed to start: ${errors.join('\n') || error.message}`, { cause: error });
    }
    assert.equal(await page.locator('body').getAttribute('data-failure'), null, `${name} ESM unhandled rejection`);
    if (name === 'Button') {
      const button = page.getByRole('button', { name: 'Packed Button' });
      assert.equal(await button.evaluate(element => getComputedStyle(element).height), '24px');
      await page.evaluate(() => window.disposeConsumer());
      assert.equal(await page.getByRole('button').count(), 0);
    }
    assert.deepEqual(errors, [], name);
    await page.close();
  }

  const size = output => ({ bytes: output.contents.byteLength, gzipBytes: gzipSync(output.contents).byteLength });
  console.log(JSON.stringify({
    node: process.version,
    chromium: browser.version(),
    svelte: svelteVersion,
    tarball: { integrity: ui.integrity, bytes: ui.size, unpackedBytes: ui.unpackedSize, files: paths.size },
    license: 'MIT; installed text in all three packages and upstream UI notices verified',
    familyExports: familyEntries.length,
    selected: { js: size(asset(selected, '.js')), css: size(asset(selected, '.css')), modules: selectedPaths.length },
    full: {
      js: size(asset(all, '.js')), modules: allPaths.length,
      engines: heavy.filter(([, pattern]) => allPaths.some(path => pattern.test(path))).map(([name]) => name),
    },
    excludedFromButton: heavy.map(([name]) => name),
    typecheck: 'passed (strict consumer with skipLibCheck)',
    esmBrowser: 'passed',
  }, null, 2));
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  try {
    await browser?.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
