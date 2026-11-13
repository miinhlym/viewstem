import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = new URL('../../../', import.meta.url);
const consumer = process.env.VIEWSTEM_DOCS_CONSUMER_DIR;
const resolveDir = consumer ? resolve(consumer) : fileURLToPath(root);
const content = new URL('../src/content/docs/', import.meta.url);
const origin = 'http://ui-docs.test';
const browser = await chromium.launch();

try {
  for (const [locale, quickLabel, mountLabel] of [['docs', 'Hello, Viewstem', 'Save'], ['ko/docs', 'Hello, Viewstem', '저장']]) {
    for (const [route, label, target] of [
      ['quickstart/index.md', quickLabel, 'viewstem'],
      ['ui/guides/mount-in-browser.md', mountLabel, 'app'],
    ]) {
      const markdown = await readFile(new URL(`${locale}/${route}`, content), 'utf8');
      const source = [...markdown.matchAll(/^\x60{3}js\n([\s\S]*?)^\x60{3}$/gm)]
        .map(match => match[1]).find(code => code.includes('const screen = renderer.mount'));
      assert.ok(source, route);
      assert.doesNotMatch(source, /@viewstem\/core|\.attach\(|\.whenSettled\(/);
      const close = route.startsWith('quickstart/') ? 'async () => { await screen.unmount(); await renderer.dispose(); }' : 'unmount';
      const { outputFiles, metafile } = await build({
        absWorkingDir: resolveDir,
        stdin: {
          contents: `${source}\nwindow.closeView = ${close};`,
          resolveDir,
        },
        outdir: '.', bundle: true, write: false, format: 'esm', platform: 'browser', metafile: true,
      });
      if (consumer) assert.ok(Object.hasOwn(metafile.inputs, 'node_modules/@viewstem/ui/dist/index.js'));
      assert.ok(!Object.keys(metafile.inputs).some(input => /node_modules\/(?:svelte|react|vue)\//.test(input)));
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.route(`${origin}/**`, route => {
          const pathname = new URL(route.request().url()).pathname;
          if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="${target}"></div><link rel="stylesheet" href="/stdin.css"><script type="module" src="/stdin.js"></script>` });
          const asset = outputFiles.find(file => file.path.endsWith(pathname));
          return asset ? route.fulfill({ contentType: pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: asset.text }) : route.abort();
        });
        await page.goto(origin);
        await page.getByRole('button', { name: label, exact: true }).waitFor({ timeout: 10000 });
        await page.waitForFunction(() => typeof window.closeView === 'function');
        await page.evaluate(() => window.closeView());
        assert.equal(await page.locator(`#${target} > *`).count(), 0);
        assert.deepEqual(errors, []);
        console.log(`${locale}/${route}: mounted and disposed the documented UI`);
      } finally { await page.close(); }
    }
  }
} finally { await browser.close(); }
