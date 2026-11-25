import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { withDeadline } from './deadline.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    samples: { type: 'string', default: '5' },
    warmup: { type: 'string', default: '2' },
    match: { type: 'string', default: '.' },
    out: { type: 'string' },
    'timeout-ms': { type: 'string', default: '60000' },
    'source-archive': { type: 'string' },
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
    'Usage: node bench/run.mjs [all|core|browser|docs] [--samples=5] [--warmup=2] [--match=regex] [--out=path] [--timeout-ms=60000] [--source-archive=path.tar]',
  );
}
const samples = Number(values.samples);
const warmup = Number(values.warmup);
const timeoutMs = Number(values['timeout-ms']);
if (
  !Number.isSafeInteger(samples) ||
  samples < 1 ||
  !Number.isSafeInteger(warmup) ||
  warmup < 0 ||
  !Number.isSafeInteger(timeoutMs) ||
  timeoutMs < 1
) {
  throw new Error('Use positive --samples and --timeout-ms, and nonnegative --warmup counts');
}
const match = new RegExp(values.match);
const output = values.out
  ? resolve(values.out)
  : join(await mkdtemp(join(tmpdir(), 'viewstem-bench-')), 'results.json');
const git = (...args) => execFileSync('git', ['-C', root, ...args]);
const sha = (data) => createHash('sha256').update(data).digest('hex');

async function sourceIdentity() {
  const archivePath = values['source-archive'];
  if (!archivePath) {
    const checkout = git('rev-parse', '--show-toplevel').toString().trim();
    if (resolve(checkout) !== resolve(root))
      throw new Error('Use --source-archive when running an exported source tree');
    return {
      commit: git('rev-parse', 'HEAD').toString().trim(),
      sourceDiffSha256: sha(git('diff', '--binary', 'HEAD')),
    };
  }
  const archive = await readFile(resolve(archivePath));
  const commit = execFileSync('git', ['get-tar-commit-id'], {
    input: archive.subarray(0, 1024),
  })
    .toString()
    .trim();
  if (!/^[a-f0-9]{40,64}$/.test(commit))
    throw new Error('The source archive must be an uncompressed git archive tar with a commit ID');
  const changes = [];
  const archivedPaths = new Set();
  // git archive writes a POSIX tar. Its pax headers carry the commit comment and
  // any long path preceding the corresponding regular file.
  let extendedPath;
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start, length) =>
      header
        .subarray(start, start + length)
        .toString()
        .replace(/\0.*$/, '');
    const name = text(0, 100),
      prefix = text(345, 155);
    const size = Number.parseInt(text(124, 12).trim(), 8) || 0;
    const type = text(156, 1);
    const body = archive.subarray(offset + 512, offset + 512 + size);
    if (type === 'x') extendedPath = body.toString().match(/(?:^|\n)\d+ path=([^\n]+)\n/)?.[1];
    else if (type === '0' || type === '') {
      const path = extendedPath ?? (prefix ? prefix + '/' + name : name);
      extendedPath = undefined;
      if (path.startsWith('/') || path.split('/').includes('..'))
        throw new Error('Invalid source archive path');
      archivedPaths.add(path);
      if (!path.startsWith('bench/')) {
        let current;
        try {
          current = await readFile(join(root, path));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (!current || sha(current) !== sha(body)) changes.push(path);
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!archivedPaths.size) throw new Error('The source archive contains no regular files');
  return {
    commit,
    sourceDiffSha256: null,
    sourceArchive: {
      path: resolve(archivePath),
      sha256: sha(archive),
      changedTrackedFiles: changes,
    },
  };
}

async function fingerprint(directory) {
  const hash = createHash('sha256');
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
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
const sources = artifacts.map((directory) => directory.replace(/\/dist$/, '/src'));

const report = {
  metadata: {
    timestamp: new Date().toISOString(),
    ...(await sourceIdentity()),
    fixtures: await fingerprint(join(root, 'bench')),
    sources: Object.fromEntries(
      await Promise.all(
        sources.map(async (directory) => [directory, await fingerprint(join(root, directory))]),
      ),
    ),
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
    timeoutMs,
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

async function measure({ id, workload, sample, recover }) {
  if (ids.has(id)) throw new Error(`Duplicate benchmark ID: ${id}`);
  ids.add(id);
  if (!match.test(id)) return;
  const durations = [];
  const observations = [];
  try {
    for (let i = 0; i < warmup + samples; i++) {
      const controller = new AbortController();
      const result = await withDeadline(
        Promise.resolve().then(() => sample({ signal: controller.signal })),
        id + ' sample ' + (i + 1),
        timeoutMs,
        () => controller.abort(),
      );
      const elapsed = typeof result === 'number' ? result : result?.ms;
      if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0) {
        throw new Error(`Invalid duration for ${id}: ${elapsed}`);
      }
      durations.push(elapsed);
      if (result !== null && typeof result === 'object') {
        const { ms, ...observation } = result;
        observations.push(observation);
      } else observations.push(null);
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
      ...(observations.some((observation) => observation !== null)
        ? {
            observations: {
              warmup: observations.slice(0, warmup),
              samples: observations.slice(warmup),
            },
          }
        : {}),
    });
    console.log(`${id}  ${median.toFixed(2)} ms (max ${ordered.at(-1).toFixed(2)})`);
  } catch (error) {
    const reason = describeError(error);
    report.failures.push({ id, workload, durations, observations, reason });
    console.error(`${id}  ${reason}`);
    // Persist the failure before a browser recovery or cleanup can fail.
    await save();
    if (recover) await withDeadline(recover(), id + ' recovery', timeoutMs);
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
