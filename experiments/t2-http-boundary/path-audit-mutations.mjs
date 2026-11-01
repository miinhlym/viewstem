import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { runPathAudit } from './path-audit-cases.mjs';

const files = ['http-probe.mjs', 'value-expressions.mjs', 'header-profile.mjs'];
const source = Object.fromEntries(await Promise.all(files.map(async name => [name, await readFile(new URL(name, import.meta.url), 'utf8')])));
const mutations = [
  ['skip-base-evaluation', 'http-probe.mjs', 'await evaluate(defaults.baseUrl, addressScope)', 'defaults.baseUrl', 'field/datasource.baseUrl'],
  ['skip-method-evaluation', 'http-probe.mjs', 'const method = await field(request.method);', 'const method = request.method;', 'field/request.method'],
  ['allow-mixed-path', 'value-expressions.mjs', "keys.length === 1 && own(value, '@path')", "own(value, '@path')", 'shape/request.body'],
  ['skip-key-escape', 'value-expressions.mjs', "key.startsWith('@@') ? key.slice(1) : key", 'key', 'escape-once'],
  ['expose-inputs-to-token', 'http-probe.mjs', 'values: { response }', 'values: { response, ports: plan.inputs }', 'token-scope/ports'],
  ['skip-forbidden-name', 'header-profile.mjs', ' || reservedNames.has(lower)', '', 'resolved-header-guard/{"Host":"fixture"}'],
];
const folder = await mkdtemp(join(tmpdir(), 'viewstem-path-mutations-'));
const results = [];
try {
  for (const [id, file, old, replacement, witness] of mutations) {
    assert.equal(source[file].split(old).length, 2, `Unique mutation anchor: ${id}`);
    const dir = join(folder, id); await mkdir(dir);
    for (const name of files) await writeFile(join(dir, name), name === file ? source[name].replace(old, replacement) : source[name]);
    const { createHttpProbe } = await import(pathToFileURL(join(dir, 'http-probe.mjs')));
    const audit = await runPathAudit(createHttpProbe);
    const caught = audit.results.find(r => r.id === witness)?.passed === false;
    results.push({ id, passed: caught, witness, rejectedBy: audit.results.filter(r => !r.passed).map(r => r.id) });
  }
} finally { await rm(folder, { recursive: true, force: true }); }
const sourceSha256 = {};
for (const path of ['package.json', ...files, 'path-audit-cases.mjs', 'path-audit-mutations.mjs']) {
  sourceSha256[path] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
}
const report = { generatedAt: new Date().toISOString(), runtime: process.version, scope: 'Six isolated mutations, synthetic transport only; production files unchanged', sourceSha256, results,
  summary: { executed: results.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length } };
await writeFile(new URL('results/path-mutations-node24.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, missed: results.filter(r => !r.passed) }));
if (report.summary.failed) process.exitCode = 1;
