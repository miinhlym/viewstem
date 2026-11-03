import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const testDirectory = new URL('../test/', import.meta.url);

export function validatePlan(plan, files) {
  assert.ok(Array.isArray(plan.shards) && plan.shards.length > 0, 'Missing browser shards');
  for (const shard of plan.shards) assert.ok(Array.isArray(shard) && shard.length > 0, 'Empty browser shard');
  const assigned = plan.shards.flat();
  assert.equal(new Set(assigned).size, assigned.length, 'Duplicate browser file assignment');
  assert.deepEqual([...assigned].sort(), [...files].sort(), 'Every browser file must belong to exactly one shard');
  return plan;
}

export async function readPlan() {
  const plan = JSON.parse(await readFile(new URL('./browser-plan.json', import.meta.url), 'utf8'));
  const files = (await readdir(testDirectory)).filter(name => name.endsWith('.browser.mjs'));
  return validatePlan(plan, files);
}

export function scopeFor(plan, shard) {
  if (shard === undefined) return { index: null, total: plan.shards.length, files: plan.shards.flat().sort() };
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
  assert.ok(match, `Use --shard=N/M, for example --shard=1/${plan.shards.length}`);
  const index = Number(match[1]), total = Number(match[2]);
  assert.equal(total, plan.shards.length, 'Shard total must match browser-plan.json');
  assert.ok(index <= total, 'Shard index is out of range');
  return { index, total, files: [...plan.shards[index - 1]].sort() };
}

export async function sourceIdentity(directory = root) {
  // Include untracked source files for local runs, but never ignored dist/results.
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--',
    'packages/core', 'packages/svelte', 'packages/svelte-ui', 'package.json', 'package-lock.json', '.github',
    'docs/handoff/shadcn-component-inventory.json'],
  { cwd: directory, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const file of files) {
    let content;
    try { content = await readFile(resolve(directory, file)); }
    catch (error) {
      // git ls-files still lists unstaged deletions; hash the current worktree.
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    hash.update(file).update('\0').update(content).update('\0');
  }
  return {
    sourceHash: hash.digest('hex'),
    revision: process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim(),
  };
}

export async function auditRows() {
  return (await Promise.all(['controls', 'overlays', 'display'].map(async group =>
    JSON.parse(await readFile(new URL(`../test/fixtures/audit-${group}.json`, import.meta.url), 'utf8'))))).flat();
}

export function auditSummary(outcomes, rows) {
  const passed = new Set(outcomes.filter(test => test.status === 'passed').map(test => test.name));
  return {
    families: rows.length,
    passedFamilies: rows.filter(row => row.testNames.every(name => passed.has(name))).length,
    requiredCases: rows.reduce((n, row) => n + row.testNames.length, 0),
    missing: rows.flatMap(row => row.testNames.filter(name => !passed.has(name))),
  };
}

export function validateReport(report, scope, identity) {
  assert.equal(report.format, 2, 'Unsupported browser report');
  assert.deepEqual(report.scope, scope, 'Unexpected shard/file scope');
  assert.equal(report.sourceHash, identity.sourceHash, 'Browser reports belong to different sources');
  assert.equal(report.revision, identity.revision, 'Browser reports belong to different revisions');
  assert.equal(report.summary?.success, true, 'Browser runner did not finish successfully');
  const counts = report.summary.counts;
  for (const key of ['failed', 'cancelled', 'skipped', 'todo']) assert.equal(counts[key], 0, `Browser ${key} cases`);
  assert.ok(Array.isArray(report.suites), 'Missing browser suite outcomes');
  assert.equal(counts.suites, report.suites.length, 'Runner/report suite counts disagree');
  for (const suite of report.suites) assert.equal(suite.status, 'passed', `Unverified browser suite: ${suite.name}`);
  assert.ok(report.outcomes.length > 0, 'Empty browser report');
  assert.equal(counts.tests, report.outcomes.length, 'Runner/report test counts disagree');
  assert.equal(counts.passed, report.outcomes.length, 'Not all browser cases passed');
  const names = new Set(), files = new Set();
  for (const test of report.outcomes) {
    assert.equal(test.status, 'passed', `Unverified browser case: ${test.name}`);
    assert.ok(typeof test.name === 'string' && test.name.length > 0, 'Unnamed browser case');
    assert.ok(!names.has(test.name), `Duplicate browser case: ${test.name}`);
    names.add(test.name); files.add(test.file);
  }
  assert.deepEqual([...files].sort(), scope.files, 'Missing or unexpected executed browser files');
}

export function mergeReports(reports, plan, identity, rows) {
  assert.equal(reports.length, plan.shards.length, 'Missing or extra browser shard reports');
  const indices = new Set();
  for (const report of reports) {
    const index = report.scope?.index;
    assert.ok(Number.isInteger(index) && index > 0 && index <= plan.shards.length, 'Invalid report shard index');
    assert.ok(!indices.has(index), 'Duplicate browser shard report');
    indices.add(index);
    validateReport(report, scopeFor(plan, `${index}/${plan.shards.length}`), identity);
    for (const key of ['node', 'platform', 'arch']) assert.equal(report[key], reports[0][key], `Mixed browser ${key}`);
  }
  const outcomes = reports.flatMap(report => report.outcomes);
  const suites = reports.flatMap(report => report.suites);
  const merged = {
    format: 2, ...identity, recordedAtUtc: new Date().toISOString(),
    node: reports[0].node, platform: reports[0].platform, arch: reports[0].arch,
    scope: scopeFor(plan),
    summary: { success: true, counts: { tests: outcomes.length, suites: suites.length, passed: outcomes.length, failed: 0, cancelled: 0, skipped: 0, todo: 0 } },
    timing: { shardDurationMs: reports.map(report => ({ index: report.scope.index, durationMs: report.summary.duration_ms })) },
    audit: auditSummary(outcomes, rows), outcomes, suites,
  };
  validateReport(merged, scopeFor(plan), identity);
  assert.deepEqual(merged.audit.missing, [], 'Unverified shadcn family behavior cases');
  return merged;
}
