import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import postcss from 'postcss';
import { compile, VERSION as svelteVersion } from 'svelte/compiler';

const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/style-scope/', import.meta.url));
const npm = (cwd, args) => execFileSync('npm', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000,
});

async function packConsumer(t) {
  const directory = await mkdtemp(join(tmpdir(), 'viewstem-ui-style-scope-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const pack = (cwd, paths) => {
    const results = JSON.parse(npm(cwd, ['pack', ...paths, '--pack-destination', directory, '--ignore-scripts', '--json']));
    return results.map(({ filename }) => join(directory, filename));
  };
  const install = (...archives) => {
    npm(directory, ['install', ...archives, '--ignore-scripts', '--no-audit', '--no-fund']);
  };
  await writeFile(join(directory, 'package.json'), '{"private":true,"type":"module"}\n');
  install(...pack(workspace, ['./packages/core', './packages/dom', './packages/ui']), `svelte@${svelteVersion}`);

  const author = join(directory, 'acme-forms');
  const pluginEntry = join(author, 'load-postcss.mjs');
  await cp(join(fixtures, 'acme-forms'), author, { recursive: true });
  await writeFile(pluginEntry, "export { scopeUiCss } from '@viewstem/dom/styles/postcss';\n");
  const { scopeUiCss } = await import(pathToFileURL(pluginEntry).href);
  const source = await readFile(join(author, 'source.css'), 'utf8');
  const { css } = await postcss([scopeUiCss('acme-forms')]).process(source, { from: undefined });
  await writeFile(join(author, 'styles.css'), css);

  install(...pack(directory, ['./acme-forms']));
  await Promise.all([
    cp(join(fixtures, 'host.mjs'), join(directory, 'host.mjs')),
    cp(join(fixtures, 'SvelteHost.svelte'), join(directory, 'SvelteHost.svelte')),
    // The UI check builds Core, DOM and UI. Compile the Svelte entry from source in this consumer.
    cp(join(workspace, 'packages/svelte/src/lib'), join(directory, 'svelte-source'), { recursive: true }),
  ]);
  const { outputFiles, metafile } = await build({
    absWorkingDir: directory, entryPoints: ['host.mjs'], outfile: 'host.js',
    bundle: true, platform: 'browser', write: false, metafile: true,
    alias: { '@viewstem/svelte': './svelte-source/index.ts' },
    plugins: [{
      name: 'svelte-host',
      setup(builder) {
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
          const { js, warnings } = compile(await readFile(path, 'utf8'), { filename: path, generate: 'client' });
          assert.deepEqual(warnings, [], path);
          return { contents: js.code, loader: 'js' };
        });
      },
    }],
  });
  assert.ok(metafile.inputs['node_modules/@viewstem/ui/dist/browser.js']);
  assert.ok(metafile.inputs['node_modules/@viewstem/ui/dist/styles.css']);
  assert.ok(metafile.inputs['node_modules/@acme/forms/styles.css']);
  assert.ok(metafile.inputs['svelte-source/ViewstemView.svelte']);
  return outputFiles;
}

test('packed UI and an external set style only their own DOM across displays', { timeout: 120_000 }, async t => {
  const files = await packConsumer(t);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ colorScheme: 'light' });
  page.setDefaultTimeout(5_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const controls = '<header>Host header</header><input class="input"><button class="btn">Host button</button>';
  await page.setContent(`<!doctype html><html lang="en"><head><title>Style scope</title></head><body>
    <aside id="outside">${controls}</aside>
    <main id="foreign"></main><main id="mount"></main><main id="svelte"></main>
    <section id="legacy"><aside id="legacy-controls">${controls}</aside><main id="mirror"></main></section>
    </body></html>`);
  const style = (selector, ...properties) => page.locator(selector).evaluate((element, names) => {
    const computed = getComputedStyle(element);
    return names.map(name => computed.getPropertyValue(name));
  }, properties);
  const headerStyle = selector => style(selector, 'display', 'padding-inline-start');
  const inputStyle = selector => style(selector, 'appearance', 'border-top-width', 'padding-inline-start');
  const buttonBox = selector => style(selector, 'border-top-width', 'padding-inline-start');
  const buttonPaint = selector => style(selector, 'background-color', 'border-top-left-radius');
  const controlsStyle = selector => Promise.all([
    headerStyle(`${selector} > header`), inputStyle(`${selector} > input`),
    buttonBox(`${selector} > button`), buttonPaint(`${selector} > button`),
    style(`${selector} > button`, 'box-sizing'),
  ]);
  const outsideBefore = await controlsStyle('#outside');
  const legacyBefore = await controlsStyle('#legacy-controls');
  const legacyHostBefore = await style('#legacy', 'background-color', 'color');

  await page.addStyleTag({ content: files.find(file => file.path.endsWith('.css')).text });
  await page.addScriptTag({ content: files.find(file => file.path.endsWith('.js')).text });
  await page.evaluate(() => window.styleFixture.mountForeignOnly());
  assert.equal(await page.locator('[data-vs-ui-owner="viewstem-ui"]').count(), 0);
  assert.deepEqual(await controlsStyle('#outside'), outsideBefore);
  assert.deepEqual(await buttonPaint('#foreign > button'), ['rgb(0, 90, 110)', '3px']);

  await page.evaluate(() => window.styleFixture.mount());
  assert.equal(await page.locator('[data-viewstem-ui]').count(), 0);
  const card = '[data-vs-part="card"]';
  const official = 'button[data-vs-component="Button"]';
  const foreign = 'button[data-acme="button"]';
  const primaryCard = `#mount ${card}`;
  const officialButton = `${primaryCard} > ${official}`;
  const foreignButton = `${primaryCard} > ${foreign}`;
  const primaryShell = `${primaryCard} > section[data-acme]`;
  assert.equal(await page.locator(primaryCard).getAttribute('data-vs-ui-owner'), 'viewstem-ui');
  assert.equal(await page.locator(foreignButton).getAttribute('data-vs-ui-owner'), 'acme-forms');
  assert.ok(await page.locator(officialButton).evaluate(element => element.classList.contains('btn')));
  assert.ok(await page.locator(foreignButton).evaluate(element => element.classList.contains('btn')));
  const lightCard = await style(primaryCard, 'display', 'background-color');
  assert.equal(lightCard[0], 'flex');
  assert.notEqual(lightCard[1], 'rgba(0, 0, 0, 0)');
  const lightButton = await buttonPaint(officialButton);
  const acmeButton = await buttonPaint(foreignButton);
  assert.deepEqual(acmeButton, ['rgb(0, 90, 110)', '3px']);
  assert.deepEqual(await style(officialButton, 'box-sizing'), ['border-box']);
  assert.deepEqual(await style(foreignButton, 'box-sizing'), ['content-box']);
  assert.notEqual(lightButton[0], acmeButton[0]);
  assert.notEqual(lightButton[0], 'rgba(0, 0, 0, 0)');
  assert.deepEqual(await buttonBox(foreignButton), outsideBefore[2]);
  assert.deepEqual(await inputStyle(`${primaryCard} > input[data-acme]`), outsideBefore[1]);
  assert.deepEqual(await headerStyle(`${primaryCard} > header[data-acme]`), outsideBefore[0]);
  assert.deepEqual(await headerStyle(`${primaryCard} > header[data-vs-part="card-header"]`), ['grid', '24px']);
  assert.deepEqual(await headerStyle(`${primaryShell} > header[data-acme]`), ['flow-root', '11px']);
  assert.deepEqual(await headerStyle(`${primaryShell} > header[data-vs-part="card-header"]`), outsideBefore[0]);
  assert.deepEqual(await style(`${primaryShell} > ${official}`, 'display'), ['inline-flex']);
  assert.deepEqual(await buttonPaint(`${primaryShell} > ${official}`), lightButton);

  await page.evaluate(() => window.styleFixture.mountSvelte());
  assert.equal(await page.locator('[data-viewstem-ui]').count(), 0);
  const svelteCard = `#svelte ${card}`;
  assert.deepEqual(await style(svelteCard, 'display', 'background-color'), lightCard);
  assert.deepEqual(await buttonPaint(`${svelteCard} > ${official}`), lightButton);
  assert.deepEqual(await buttonPaint(`${svelteCard} > ${foreign}`), acmeButton);
  assert.deepEqual(await inputStyle(`${svelteCard} > input[data-acme]`), outsideBefore[1]);
  assert.deepEqual(await headerStyle(`${svelteCard} > header[data-acme]`), outsideBefore[0]);

  await page.evaluate(() => window.styleFixture.attachMirror());
  const mirrorCard = `#mirror ${card}`;
  const darkCard = await style(mirrorCard, 'display', 'background-color');
  assert.equal(darkCard[0], 'flex');
  assert.notEqual(darkCard[1], lightCard[1]);
  assert.equal((await buttonPaint(`${mirrorCard} > ${official}`))[0], 'rgb(24, 79, 146)');
  assert.deepEqual(await buttonPaint(`${mirrorCard} > ${foreign}`), acmeButton);
  assert.deepEqual(await inputStyle(`${mirrorCard} > input[data-acme]`), outsideBefore[1]);
  assert.deepEqual(await headerStyle(`${mirrorCard} > header[data-acme]`), outsideBefore[0]);
  assert.deepEqual(await controlsStyle('#legacy-controls'), legacyBefore);
  assert.deepEqual(await style('#legacy', 'background-color', 'color'), legacyHostBefore);
  assert.deepEqual(await controlsStyle('#outside'), outsideBefore);
  await page.locator('#legacy').evaluate(element => {
    element.style.removeProperty('--viewstem-primary');
    element.style.setProperty('--primary', 'rgb(144, 42, 62)');
  });
  await page.waitForFunction(selector =>
    getComputedStyle(document.querySelector(selector)).backgroundColor === 'rgb(144, 42, 62)',
  `${mirrorCard} > ${official}`);
  assert.deepEqual(await buttonPaint(`${mirrorCard} > ${foreign}`), acmeButton);
  assert.deepEqual(await controlsStyle('#legacy-controls'), legacyBefore);

  await page.evaluate(() => window.styleFixture.detachMirror());
  assert.equal(await page.locator(mirrorCard).count(), 0);
  assert.equal(await page.locator('style').count(), 1);
  assert.deepEqual(await style(primaryCard, 'display', 'background-color'), lightCard);
  assert.deepEqual(await buttonPaint(officialButton), lightButton);
  assert.deepEqual(await buttonPaint(foreignButton), acmeButton);
  await page.evaluate(() => window.styleFixture.dispose());
  assert.equal(await page.locator(svelteCard).count(), 0);
  assert.deepEqual(await page.evaluate(() => window.styleFixture.errors), []);
  assert.deepEqual(pageErrors, []);
});
