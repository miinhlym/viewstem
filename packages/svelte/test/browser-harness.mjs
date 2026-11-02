import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';
import { chromium } from 'playwright';

/** A consumer build: resolve package exports/dist, then compile shipped .svelte files. */
export async function startBrowserHarness() {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./browser-fixture.mjs', import.meta.url))],
    bundle: true, platform: 'browser', format: 'iife', globalName: 'Fixture', write: false,
    conditions: ['svelte', 'browser'],
    plugins: [{ name: 'test-svelte-consumer', setup(builder) {
      builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
        const result = compile(await readFile(path, 'utf8'), { filename: path, generate: 'client', css: 'injected', dev: true });
        return { contents: result.js.code, loader: 'js' };
      });
    } }],
  });
  const server = createServer((request, response) => {
    if (request.url === '/bundle.js') { response.setHeader('content-type', 'text/javascript'); response.end(bundle.outputFiles[0].text); }
    else if (request.url === '/favicon.ico') { response.statusCode = 204; response.end(); }
    else { response.setHeader('content-type', 'text/html'); response.end('<!doctype html><html><head><meta charset="utf-8"><title>Svelte consumer acceptance</title></head><body><script>window.unhandled=[];window.addEventListener("unhandledrejection",event=>window.unhandled.push(String(event.reason?.code??event.reason)));</script><script src="/bundle.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch (error) { await new Promise(resolve => server.close(resolve)); throw error; }
  return {
    browser,
    async page() {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => typeof Fixture !== 'undefined');
      return { page, errors };
    },
    async close() { await browser.close(); await new Promise(resolve => server.close(resolve)); },
  };
}
