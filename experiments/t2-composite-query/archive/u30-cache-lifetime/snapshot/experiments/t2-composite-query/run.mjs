import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setup } from './harness.mjs';
import { cases, staticCases } from './scenarios.mjs';
const results = [], mutations = [], unhandled = [];
const onUnhandled = error => unhandled.push({ code: error?.code, message: error?.message });
process.on('unhandledRejection', onUnhandled);
async function run(test, mutation = {}) {
  let f, error;
  try { f = setup(test.options, mutation); await test.run(f); }
  catch (e) { error = e; }
  finally { try { await f?.close(); } catch (e) { error ??= e; } }
  return { id: test.id, passed: !error, ...(error ? { error: { code: error.code, message: error.message, stack: error.stack } } : {}), ...f?.evidence() };
}
for (const test of cases) results.push(await run(test));
for (const test of staticCases) {
  try { await test.run(); results.push({ id: test.id, passed: true }); }
  catch (e) { results.push({ id: test.id, passed: false, error: { code: e.code, message: e.message } }); }
}
for (const [mutation, id] of [['ignoreCacheInputs', 'C02-reuse-only-unchanged-child-query'],
  ['cachePartial', 'C07-failed-partial-run-does-not-commit-cache'], ['commitObsolete', 'C06-obsolete-run-cannot-seed-current-cache']]) {
  const result = await run(cases.find(c => c.id === id), { [mutation]: true });
  mutations.push({ mutation, witness: id, detected: result.error?.code === 'ERR_ASSERTION', result });
}
process.off('unhandledRejection', onUnhandled);
const sourceSha256 = {};
for (const path of ['package.json', 'composite-probe.mjs', 'harness.mjs', 'scenarios.mjs', 'run.mjs',
  '../t2-query-races/query-probe.mjs', '../t2-query-races/harness.mjs', '../t2-query-polling/polling-probe.mjs',
  '../t2-http-boundary/value-expressions.mjs']) {
  sourceSha256[path] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
}
const report = { generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch,
  scope: 'Bounded composite Query graph/transform/cache experiment with existing Query scheduler and completion polling; fake transport/clock, not production core',
  sourceSha256, results, mutations, unhandled,
  summary: { executed: results.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
    mutations: mutations.length, detected: mutations.filter(m => m.detected).length } };
const path = new URL(`results/${process.argv[2] ?? 'node24.json'}`, import.meta.url);
await mkdir(new URL('.', path), { recursive: true });
await writeFile(path, JSON.stringify(report, (_, value) => value === undefined ? { $missing: true } : value, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, failures: results.filter(r => !r.passed).map(({ id, error }) => ({ id, error })),
  undetected: mutations.filter(m => !m.detected).map(m => m.mutation), unhandled }));
if (report.summary.failed || report.summary.detected !== mutations.length || unhandled.length) process.exitCode = 1;
