import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setup } from './harness.mjs';
import { cases } from './scenarios.mjs';

const results = [], unhandled = [];
const onUnhandled = () => unhandled.push({ code: 'UNHANDLED_REJECTION' });
process.on('unhandledRejection', onUnhandled);
for (const test of cases) {
  let fixture, failure;
  try { fixture = await setup(test.options); await test.run(fixture); }
  catch (error) { failure = { code: error?.code ?? 'FIXTURE_FAILURE', name: error?.name ?? 'Error' }; }
  finally {
    try { await fixture?.close(); }
    catch { failure ??= { code: 'CLEANUP_FAILURE', name: 'Error' }; }
  }
  // Assertion messages can include actual wire values. Never serialize them.
  results.push({ id: test.id, contracts: test.contracts, passed: !failure,
    ...(failure ? { failure } : {}), ...fixture?.evidence() });
}
process.off('unhandledRejection', onUnhandled);
const sourceSha256 = {};
for (const name of ['package.json', 'harness.mjs', 'scenarios.mjs', 'run.mjs', 'coverage.json',
  '../t2-http-boundary/http-probe.mjs', '../t2-http-boundary/value-expressions.mjs', '../t2-http-boundary/header-profile.mjs']) {
  sourceSha256[name] = createHash('sha256').update(await readFile(new URL(name, import.meta.url))).digest('hex');
}
const coverage = JSON.parse(await readFile(new URL('coverage.json', import.meta.url)));
const report = {
  generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch,
  scope: 'Seven documented HTTP authentication variants and trusted callback contracts over real loopback Node HTTP; not production service security or core SDK implementation',
  sourceSha256,
  summary: { executed: results.length, passed: results.filter(row => row.passed).length,
    failed: results.filter(row => !row.passed).length },
  coverage, results, unhandled,
};
assert.equal(coverage.records.every(row => row.testIds.every(id => results.some(result => result.id === id))), true);
const output = new URL(`results/${process.argv[2] ?? `node${process.versions.node.split('.')[0]}.json`}`, import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ runtime: report.runtime, summary: report.summary, unhandled,
  failures: results.filter(row => !row.passed).map(({ id, failure }) => ({ id, failure })) }));
if (report.summary.failed || unhandled.length) process.exitCode = 1;
