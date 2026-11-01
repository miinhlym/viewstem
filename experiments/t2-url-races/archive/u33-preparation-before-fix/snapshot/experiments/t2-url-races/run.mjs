import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { memoryEndpoint } from './endpoints.mjs';
import { cases, mutations, runCase, runSeed } from './scenarios.mjs';

export async function sourceHashes() {
  const hashes = {};
  for (const file of ['package.json', 'package-lock.json', 'url-probe.mjs', 'endpoints.mjs', 'scenarios.mjs', 'run.mjs', 'browser-run.mjs']) {
    hashes[file] = createHash('sha256').update(await readFile(new URL(file, import.meta.url))).digest('hex');
  }
  return hashes;
}

export async function saveReport(output, report) {
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}

export function summarize(results, controls, seeds) {
  return { scenarios: results.length, passed: results.filter(item => item.passed).length,
    mutationControls: controls.length, detected: controls.filter(item => item.detected).length,
    seeds: seeds.length, seedsPassed: seeds.filter(item => item.passed).length };
}

export function finish(summary) {
  console.log(JSON.stringify(summary));
  if (summary.scenarios !== summary.passed || summary.mutationControls !== summary.detected || summary.seeds !== summary.seedsPassed) process.exitCode = 1;
}

if (process.argv[1] && new URL(process.argv[1], 'file:').href === import.meta.url) {
  const results = [];
  for (const test of cases) results.push(await runCase(test.id, memoryEndpoint));
  const controls = [];
  for (const [mutation, id] of mutations) {
    const outcome = await runCase(id, memoryEndpoint, { [mutation]: true });
    controls.push({ mutation, id, detected: !outcome.passed && outcome.code === 'ASSERTION', outcome });
  }
  const seeds = [];
  for (let seed = 1; seed <= 100; ++seed) seeds.push(await runSeed(seed, memoryEndpoint));
  const summary = summarize(results, controls, seeds);
  await saveReport(new URL(process.env.URL_RESULT ?? 'results/latest.json', import.meta.url), {
    generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch,
    sourceSha256: await sourceHashes(), endpoint: 'memory', summary, results, controls, seeds,
  });
  finish(summary);
  for (const item of [...results, ...seeds].filter(item => !item.passed)) console.error(JSON.stringify(item));
  for (const item of controls.filter(item => !item.detected)) console.error(JSON.stringify(item));
}
