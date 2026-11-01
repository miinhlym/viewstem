import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cases, setup, mutationWitnesses } from './scenarios.mjs';
import { nativeSmoke } from './native-smoke.mjs';

const results = [], mutations = [], unhandled = [];
const onUnhandled = error => unhandled.push({ code: error?.code, message: String(error?.message ?? error) });
process.on('unhandledRejection', onUnhandled);
async function run(test, mutation = {}) {
  let fixture, error;
  try { fixture = setup(test.options, mutation); await test.run(fixture); }
  catch (cause) { error = cause; }
  finally {
    try { await fixture?.close(); } catch (cause) { error ??= cause; }
  }
  return { id: test.id, passed: !error,
    ...(error ? { error: { code: error.code, message: error.message, stack: error.stack } } : {}), trace: fixture?.trace };
}
for (const test of cases) results.push(await run(test));
for (const [switchName, witness] of mutationWitnesses) {
  const result = await run(cases.find(test => test.id === witness), { [switchName]: true });
  mutations.push({ switchName, witness, detected: !result.passed && result.error?.code === 'ERR_ASSERTION', result });
}
let native;
try { native = await nativeSmoke(); }
catch (error) { native = { id: 'N01-native-timer-real-http', passed: false, error: { code: error.code, message: error.message, stack: error.stack } }; }
process.off('unhandledRejection', onUnhandled);
const sourceSha256 = {};
for (const path of ['package.json', 'polling-probe.mjs', 'scenarios.mjs', 'native-smoke.mjs', 'run.mjs',
  '../t2-query-races/query-probe.mjs', '../t2-query-races/harness.mjs', '../t2-query-races/package.json',
  '../t2-http-boundary/http-probe.mjs', '../t2-http-boundary/value-expressions.mjs',
  '../t2-http-boundary/header-profile.mjs', '../t2-http-boundary/package.json']) {
  sourceSha256[path] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
}
const report = {
  generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch,
  scope: 'Completion-driven polling adapter attached to existing private Query prototype; deterministic controlled transport plus one native-timer/real-loopback-HTTP smoke, no core/renderer implementation',
  sourceSha256, stopOnFirstProblem: false,
  summary: { executed: results.length, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length,
    mutations: mutations.length, detected: mutations.filter(r => r.detected).length, nativeSmokes: 1, nativePassed: native.passed ? 1 : 0 },
  results, mutations, native, unhandled,
};
const output = new URL(`results/${process.argv[2] ?? 'node24.json'}`, import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, JSON.stringify(report, (_, value) => value === undefined ? { $missing: true } : value, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, unhandled,
  failures: results.filter(r => !r.passed).map(({ id, error }) => ({ id, error })),
  undetected: mutations.filter(r => !r.detected).map(({ switchName, result }) => ({ switchName, error: result.error })),
  native: native.passed ? { passed: true, requests: native.requestCount, leakedTimers: native.leakedTimers } : native }));
if (report.summary.failed || report.summary.detected !== mutations.length || !native.passed || unhandled.length) process.exitCode = 1;
