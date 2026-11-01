import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { preparePatch } from './prepare.mjs';
import { runCases } from './cases.mjs';
import { report } from '../verification/report.mjs';

const require = createRequire(new URL('../verification/package.json', import.meta.url));
const { build } = require('esbuild');
const browserRequire = createRequire(new URL('../t2-url-races/package.json', import.meta.url));
const { chromium } = browserRequire('playwright');
const prepared = await preparePatch();
const library = await import(prepared.entry.href);
const fixtures = JSON.parse(await readFile(new URL('../t1-values/fixtures/cel.json', import.meta.url), 'utf8'));
const node = await runCases(library, fixtures);
const bundle = await build({ stdin: { contents: `import * as library from ${JSON.stringify(prepared.entry.pathname)}; import {runCases} from './cases.mjs'; export const run = fixtures => runCases(library, fixtures);`, resolveDir: new URL('.', import.meta.url).pathname },
  bundle: true, platform: 'browser', format: 'esm', write: false });
const server = createServer((request, response) => {
  if (request.url === '/fixture.mjs') { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(bundle.outputFiles[0].text); }
  else { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>CEL patch fixture</title>'); }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(), pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const web = await page.evaluate(async fixtures => (await import('/fixture.mjs')).run(fixtures), fixtures);
  await report({ base: import.meta.url, name: process.argv[2] ?? 'node24.json', scope: 'Patched pinned cel-js in Node/Chromium, experimental bounded cost and millisecond date profile; not full CEL or security certification',
    results: [...node.map(item => ({ ...item, id: `node/${item.id}` })), ...web.map(item => ({ ...item, id: `chromium/${item.id}` })), { id: 'browser/no-uncaught-errors', passed: pageErrors.length === 0 }],
    sources: ['run.mjs', 'cases.mjs', 'guarded.mjs', 'prepare.mjs', 'cel-js-8.0.0.patch', 'upstream-sha256.json', 'patched-sha256.json', 'package.json', 'package-lock.json', 'node_modules/re2js/build/index.js', '../t1-values/fixtures/cel.json',
      '../t1-values/package.json', '../t1-values/package-lock.json', '../verification/report.mjs', '../verification/package.json', '../verification/package-lock.json', '../t2-url-races/package.json', '../t2-url-races/package-lock.json'],
    extra: { patchSha256: prepared.patchSha256, verifiedPatchedFiles: prepared.verifiedFiles, browser: browser.version(), pageErrors } });
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
