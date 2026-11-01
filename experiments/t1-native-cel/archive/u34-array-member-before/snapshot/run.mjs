import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { preparePatch } from '../t1-cel-patch/prepare.mjs';
import { runCases } from './cases.mjs';
import { report } from '../verification/report.mjs';

const require = createRequire(new URL('../verification/package.json', import.meta.url));
const { build } = require('esbuild');
const browserRequire = createRequire(new URL('../t2-url-races/package.json', import.meta.url));
const { chromium } = browserRequire('playwright');
const prepared = await preparePatch(), { Environment } = await import(prepared.entry.href);
const node = await runCases(Environment);
const bundle = await build({ stdin: { contents: `import {Environment} from ${JSON.stringify(prepared.entry.pathname)}; import {runCases} from './cases.mjs'; export const run = () => runCases(Environment);`, resolveDir: new URL('.', import.meta.url).pathname }, bundle: true, platform: 'browser', format: 'esm', write: false });
const server = createServer((request, response) => {
  if (request.url === '/fixture.mjs') { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(bundle.outputFiles[0].text); }
  else { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>Typed native CEL fixture</title>'); }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(), pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const web = await page.evaluate(async () => (await import('/fixture.mjs')).run());
  await report({ base: import.meta.url, name: process.argv[2] ?? 'node24.json', scope: 'Pinned patched CEL plus private typed native adapter, real protected State snapshots in Node/Chromium; partial fixture schemas, not core/SDK/full JSON Schema or CEL conformance',
    results: [...node.map(row => ({ ...row, id: `node/${row.id}` })), ...web.map(row => ({ ...row, id: `chromium/${row.id}` })), { id: 'chromium/no-page-errors', passed: pageErrors.length === 0 }],
    sources: ['run.mjs', 'adapter.mjs', 'cases.mjs', 'README.md', 'coverage.json', '../t1-cel-patch/prepare.mjs', '../t1-cel-patch/cel-js-8.0.0.patch', '../t1-cel-patch/upstream-sha256.json', '../t1-cel-patch/patched-sha256.json', '../t1-cel-patch/package.json', '../t1-cel-patch/package-lock.json', '../t1-cel-patch/node_modules/re2js/build/index.js', '../t3-state/state-probe.mjs', '../t3-state/immutable.mjs', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package.json', '../t1-values/package-lock.json', '../verification/report.mjs', '../verification/errors.mjs', '../verification/package.json', '../verification/package-lock.json', '../t2-url-races/package.json', '../t2-url-races/package-lock.json'],
    extra: { patchSha256: prepared.patchSha256, verifiedPatchedFiles: prepared.verifiedFiles, browser: browser.version(), pageErrors, populations: { node: node.length, chromium: web.length, browserErrorCheck: 1 }, supportedSchemas: 'direct scalar/nullable, closed declared objects, homogeneous arrays, typed Set/Map, explicit date/time/datetime', limitations: ['No arbitrary JSON Schema conversion or Dart evidence', 'probe functions and opaque names are private fixture extensions', 'Trusted zero-argument producers are synchronous, not sandboxed', 'Payload size/depth/cycle admission complements patched AST budget; host callback wall-clock cost is not metered', 'State snapshot input is ready data; Variable scheduling/missing/pending/error propagation is not included'] } });
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
