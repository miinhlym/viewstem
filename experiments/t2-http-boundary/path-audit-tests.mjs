import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createHttpProbe } from './http-probe.mjs';
import { runPathAudit } from './path-audit-cases.mjs';

const require = createRequire(new URL('../t2-url-races/package.json', import.meta.url));
const { chromium } = require('playwright');
const files = ['http-probe.mjs', 'value-expressions.mjs', 'header-profile.mjs', 'path-audit-cases.mjs'];
const modules = Object.fromEntries(await Promise.all(files.map(async name => [name, await readFile(new URL(name, import.meta.url), 'utf8')])));
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://fixture.invalid').pathname.slice(1);
  if (Object.hasOwn(modules, name)) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(modules[name]); }
  else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>Path contract audit</title>'); }
});
const node = await runPathAudit(createHttpProbe);
let browser, browserResult, browserVersion;
const pageErrors = [];
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true }); browserVersion = browser.version();
  const page = await browser.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  browserResult = await page.evaluate(async () => {
    const { createHttpProbe } = await import('/http-probe.mjs');
    const { runPathAudit } = await import('/path-audit-cases.mjs');
    return runPathAudit(createHttpProbe);
  });
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
const results = [...node.results.map(r => ({ runtime: 'node', ...r })), ...browserResult.results.map(r => ({ runtime: 'chromium', ...r }))];
const sourceSha256 = {};
for (const path of ['package.json', ...files, 'path-audit-tests.mjs', '../t2-url-races/package.json', '../t2-url-races/package-lock.json']) {
  sourceSha256[path] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
}
const report = {
  generatedAt: new Date().toISOString(), runtime: process.version, browser: browserVersion, platform: process.platform, architecture: process.arch,
  playwrightVersion: require('playwright/package.json').version,
  scope: 'All 17 implemented HTTP/Login dynamic locations plus expression/path contracts; synthetic transport in Node and real Chromium, not core/renderer integration',
  coverage: node.coverage, stopOnFirstProblem: false, sourceSha256, results, pageErrors,
  summary: { executed: results.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length },
};
await writeFile(new URL(`results/${process.argv[2] ?? 'path-audit-node24.json'}`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, fields: report.coverage.length, failures: results.filter(r => !r.passed), pageErrors }));
if (report.summary.failed || pageErrors.length) process.exitCode = 1;
