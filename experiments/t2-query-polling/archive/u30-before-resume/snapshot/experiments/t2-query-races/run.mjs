import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cases, setup, runBurstSeed } from './scenarios.mjs';
import { flush } from './harness.mjs';

const results = [];
for (const test of cases) {
  const context = setup(test.options);
  try {
    await test.run(context);
    context.query.dispose();
    await flush();
    assert.equal(context.clock.tasks.size, 0, 'leaked timer');
    for (const slot of context.host.slots.values()) assert.equal(slot.query.tickets.size, 0, 'leaked waiter');
    results.push({ id: test.id, contracts: test.contracts, passed: true, trace: context.trace });
  } catch (error) {
    results.push({ id: test.id, contracts: test.contracts, passed: false,
      error: error.stack, trace: context.trace });
    context.query.dispose();
  }
}

const mutations = [];
for (const [switchName, scenario] of [
  ['skipGenerationGuard', 'R03-input-ABA'],
  ['skipLifetimeGuard', 'R12-replace-same-address-late-success'],
  ['skipTerminalGuard', 'R16-timeout-late-success-after-retry'],
  ['completeRefreshOnActive', 'R06-refresh-waves'],
]) {
  const context = setup({}, { [switchName]: true });
  try {
    await cases.find(test => test.id === scenario).run(context);
    mutations.push({ switchName, scenario, detected: false });
  } catch (error) {
    mutations.push({ switchName, scenario, detected: error.code === 'ERR_ASSERTION', error: error.message });
  } finally {
    context.query.dispose();
    await flush();
  }
}

const seeds = [];
for (let seed = 1; seed <= 100; ++seed) {
  try { seeds.push(await runBurstSeed(seed)); }
  catch (error) { seeds.push({ seed, passed: false, error: error.stack }); }
}

const sourceSha256 = {};
for (const path of ['package.json', 'harness.mjs', 'query-probe.mjs', 'scenarios.mjs', 'run.mjs']) {
  sourceSha256[path] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
}
const passed = results.filter(result => result.passed).length;
const detected = mutations.filter(result => result.detected).length;
const seedsPassed = seeds.filter(result => result.passed).length;
const report = {
  generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform,
  architecture: process.arch, sourceSha256,
  scope: 'Independent JSON-valued Query scheduling prototype, not production core or full T2',
  summary: { scenarios: results.length, passed, mutationControls: mutations.length, detected,
    burstSeeds: seeds.length, seedsPassed, generatedInputUpdates: 4_000 },
  results, mutations, seeds,
};
const output = new URL(process.env.T2_RESULT ?? 'results/latest.json', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, JSON.stringify(report, (_, value) => value === undefined ? { $missing: true } : value, 2) + '\n');
console.log(`Query scenarios: ${passed}/${results.length}; broken-guard controls: ${detected}/${mutations.length}; burst seeds: ${seedsPassed}/${seeds.length}`);
console.log(`Report: ${fileURLToPath(output)}`);
for (const result of results.filter(result => !result.passed)) console.error(result.id, result.error);
for (const result of mutations.filter(result => !result.detected)) console.error('Undetected mutation:', result.switchName);
for (const result of seeds.filter(result => !result.passed).slice(0, 3)) console.error('Seed failed:', result.seed, result.error);
if (passed !== results.length || detected !== mutations.length || seedsPassed !== seeds.length) process.exitCode = 1;
