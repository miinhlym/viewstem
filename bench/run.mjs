import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    samples: { type: 'string', default: '5' },
    warmup: { type: 'string', default: '2' },
    match: { type: 'string', default: '.' },
    out: { type: 'string' },
  },
});
const [selection = 'all'] = positionals;
const groups = {
  core: () => import('./core.mjs').then((module) => module.benchmarkCore),
  browser: () => import('./browser.mjs').then((module) => module.benchmarkBrowser),
  docs: () => import('./docs.mjs').then((module) => module.benchmarkDocs),
};
if (positionals.length > 1 || (selection !== 'all' && !Object.hasOwn(groups, selection))) {
  throw new Error(
    'Usage: node bench/run.mjs [all|core|browser|docs] [--samples=5] [--warmup=2] [--match=regex] [--out=path]',
  );
}
const samples = Number(values.samples);
const warmup = Number(values.warmup);
if (!Number.isSafeInteger(samples) || samples < 1 || !Number.isSafeInteger(warmup) || warmup < 0) {
  throw new Error('Use positive --samples and nonnegative --warmup counts');
}
const match = new RegExp(values.match);
const output = values.out
  ? resolve(values.out)
  : join(await mkdtemp(join(tmpdir(), 'viewstem-bench-')), 'results.json');
const git = (...args) => execFileSync('git', ['-C', root, ...args]);
const sha = (data) => createHash('sha256').update(data).digest('hex');

async function fingerprint(directory) {
  const hash = createHash('sha256');
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  for (const file of files) {
    hash.update(relative(directory, file) + '\0');
    hash.update(sha(await readFile(file)));
  }
  return { files: files.length, sha256: hash.digest('hex') };
}

const artifacts =
  selection === 'core'
    ? ['packages/core/dist']
    : ['packages/core/dist', 'packages/dom/dist', 'packages/ui/dist'];
if (selection === 'all' || selection === 'browser') artifacts.push('packages/svelte/dist');
if (selection === 'all' || selection === 'docs') artifacts.push('apps/docs/dist');

const report = {
  metadata: {
    timestamp: new Date().toISOString(),
    commit: git('rev-parse', 'HEAD').toString().trim(),
    sourceDiffSha256: sha(git('diff', '--binary', 'HEAD')),
    fixtures: await fingerprint(join(root, 'bench')),
    lockSha256: sha(await readFile(join(root, 'package-lock.json'))),
    artifacts: Object.fromEntries(
      await Promise.all(
        artifacts.map(async (directory) => [directory, await fingerprint(join(root, directory))]),
      ),
    ),
    environment: {
      node: process.version,
      v8: process.versions.v8,
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      chromium: selection === 'core' ? undefined : chromium.executablePath(),
    },
    selection,
    match: values.match,
    warmup,
    samples,
    unit: 'ms',
  },
  results: [],
  failures: [],
};
const ids = new Set();
const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
const describeError = (error) => error?.stack ?? JSON.stringify(error) ?? String(error);
await save();
console.log(output);

async function measure({ id, workload, sample }) {
  if (ids.has(id)) throw new Error(`Duplicate benchmark ID: ${id}`);
  ids.add(id);
  if (!match.test(id)) return;
  const durations = [];
  try {
    for (let i = 0; i < warmup + samples; i++) {
      const elapsed = await sample();
      if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0) {
        throw new Error(`Invalid duration for ${id}: ${elapsed}`);
      }
      durations.push(elapsed);
    }
    const measured = durations.slice(warmup);
    const ordered = [...measured].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    const median = ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
    report.results.push({
      id,
      workload,
      warmup: durations.slice(0, warmup),
      samples: measured,
      median,
      max: ordered.at(-1),
    });
    console.log(`${id}  ${median.toFixed(2)} ms (max ${ordered.at(-1).toFixed(2)})`);
  } catch (error) {
    const reason = describeError(error);
    report.failures.push({ id, workload, durations, reason });
    console.error(`${id}  ${reason}`);
  }
  await save();
}

for (const group of selection === 'all' ? Object.keys(groups) : [selection]) {
  try {
    const run = await groups[group]();
    await run(measure);
  } catch (error) {
    const reason = describeError(error);
    report.failures.push({ group, reason });
    console.error(`${group}  ${reason}`);
    await save();
  }
}
if (!report.results.length || report.failures.length) process.exitCode = 1;
