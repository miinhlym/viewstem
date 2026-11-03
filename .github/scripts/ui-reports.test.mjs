import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeReports, readPlan, scopeFor, sourceIdentity, validatePlan, validateReport } from '../../packages/svelte-ui/scripts/test-reports.mjs';

const plan = { shards: [['a.browser.mjs'], ['b.browser.mjs']] };
const identity = { sourceHash: 'same-source', revision: 'same-revision' };
const rows = [{ family: 'a', testNames: ['alpha'] }, { family: 'b', testNames: ['beta'] }];
function report(index, name) {
  return {
    format: 2, ...identity, scope: scopeFor(plan, `${index}/2`), node: 'v24.1.0', platform: 'linux', arch: 'x64',
    summary: { success: true, duration_ms: 100, counts: { tests: 1, suites: 0, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } },
    outcomes: [{ file: plan.shards[index - 1][0], name, status: 'passed', durationMs: 80 }],
    suites: [],
  };
}
const reports = () => [report(1, 'alpha'), report(2, 'beta')];

test('changing the external catalog acceptance inventory invalidates reports even at the same Git revision', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'viewstem-ci-identity-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
  git(['init', '--quiet']);
  await mkdir(join(directory, 'docs/handoff'), { recursive: true });
  const inventory = join(directory, 'docs/handoff/shadcn-component-inventory.json');
  await writeFile(inventory, '{"families":66}\n');
  git(['add', '.']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'test: catalog identity fixture']);
  const before = await sourceIdentity(directory);
  await writeFile(inventory, '{"families":67}\n');
  const after = await sourceIdentity(directory);
  assert.equal(before.revision, after.revision);
  assert.notEqual(before.sourceHash, after.sourceHash);
  assert.throws(() => validateReport({ ...report(1, 'alpha'), ...before }, scopeFor(plan, '1/2'), after));
});

test('unstaged source deletion invalidates old reports without requiring git add', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'viewstem-ci-delete-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
  git(['init', '--quiet']);
  await mkdir(join(directory, 'packages/core/src'), { recursive: true });
  const source = join(directory, 'packages/core/src/removed.mjs');
  await writeFile(source, 'export const value = 1;\n');
  git(['add', '.']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'test: deletion identity fixture']);
  const before = await sourceIdentity(directory);
  await rm(source);
  const deleted = await sourceIdentity(directory);
  assert.equal(deleted.revision, before.revision);
  assert.notEqual(deleted.sourceHash, before.sourceHash);
  assert.throws(() => validateReport({ ...report(1, 'alpha'), ...before }, scopeFor(plan, '1/2'), deleted));
  git(['add', '-u']);
  assert.deepEqual(await sourceIdentity(directory), deleted, 'staging does not change the tested worktree');
});

test('browser plan assigns every actual file once; new, missing and duplicate files cannot be silently skipped', async () => {
  assert.equal((await readPlan()).shards.length, 4);
  assert.throws(() => validatePlan(plan, ['a.browser.mjs', 'b.browser.mjs', 'new.browser.mjs']));
  assert.throws(() => validatePlan(plan, ['a.browser.mjs']));
  assert.throws(() => validatePlan({ shards: [['a.browser.mjs'], ['a.browser.mjs']] }, ['a.browser.mjs']));
  assert.throws(() => validatePlan({ shards: [[]] }, []));
});

const nativeCases = [
  { name: 'flat pass', body: "test('case', () => {});", passes: true },
  { name: 'nested suites', body: "describe('outer', () => describe('inner', () => it('case', () => {})));", passes: true, suites: 2 },
  { name: 'assertion failure', body: "test('case', () => { throw Error('fixture failure'); });" },
  { name: 'skip', body: "test.skip('case', () => {});", count: 'skipped' },
  { name: 'todo', body: "test.todo('case', () => {});", count: 'todo' },
  { name: 'cancelled test', body: "test('case', { signal: AbortSignal.abort() }, () => {});", aborted: true },
  { name: 'suite teardown failure', body: "describe('group', () => { after(() => { throw Error('teardown failure'); }); it('case', () => {}); });" },
];
for (const fixture of nativeCases) {
  test(`native browser reporter preserves ${fixture.name}`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'viewstem-ci-reporter-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const name = 'fixture.browser.mjs';
    await writeFile(join(directory, name), `import { test, describe, it, after } from 'node:test';\n${fixture.body}\n`);
    const output = join(directory, 'report.json');
    const scope = { index: 1, total: 1, files: [name] };
    const reporter = fileURLToPath(new URL('../../packages/svelte-ui/scripts/audit-reporter.mjs', import.meta.url));
    const env = { ...process.env, VIEWSTEM_UI_REPORT: JSON.stringify({ ...identity, scope }) };
    // Start an independent runner, not a worker in this parent test process.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      '--test', `--test-reporter=${reporter}`, `--test-reporter-destination=${output}`, join(directory, name),
    ], { encoding: 'utf8', timeout: 10_000, env });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    const actual = JSON.parse(await readFile(output, 'utf8'));
    if (fixture.passes) {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(actual.outcomes.map(test => test.name), ['case']);
      assert.equal(actual.summary.counts.tests, 1);
      assert.equal(actual.suites.length, fixture.suites ?? 0);
      validateReport(actual, scope, identity);
    } else {
      assert.equal(result.status, 1, 'failed or incomplete runs cannot pass');
      if (fixture.count) assert.equal(actual.summary.counts[fixture.count], 1);
      // Node 22 classifies pre-aborted tests as failed; Node 24 as cancelled.
      if (fixture.aborted) assert.equal(actual.summary.counts.failed + actual.summary.counts.cancelled, 1);
      assert.throws(() => validateReport(actual, scope, identity));
    }
  });
}

test('shard arguments reject wrong totals, zero, out-of-range and malformed indices before execution', () => {
  for (const value of ['0/2', '3/2', '1/3', '1', '1/2junk', '-1/2']) assert.throws(() => scopeFor(plan, value));
  const runner = fileURLToPath(new URL('../../packages/svelte-ui/scripts/run-tests.mjs', import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [runner, '--test-name-pattern=alpha'], { stdio: 'pipe' }));
});

test('merge accounts for all files and family cases independent of shard arrival order', () => {
  const input = reports().reverse();
  input[0].suites = [{ name: 'group', status: 'passed' }];
  input[0].summary.counts.suites = 1;
  const merged = mergeReports(input, plan, identity, rows);
  assert.equal(merged.summary.counts.passed, 2);
  assert.deepEqual(merged.audit, { families: 2, passedFamilies: 2, requiredCases: 2, missing: [] });
  assert.deepEqual(merged.scope.files, ['a.browser.mjs', 'b.browser.mjs']);
  assert.deepEqual(merged.suites, input[0].suites);
  assert.equal(merged.summary.counts.suites, 1);
});

test('missing, duplicate, stale, foreign or incomplete reports cannot produce a green merge', () => {
  assert.throws(() => mergeReports(reports().slice(0, 1), plan, identity, rows));
  assert.throws(() => mergeReports([report(1, 'alpha'), report(1, 'alpha')], plan, identity, rows));
  const mutations = [
    r => { r.sourceHash = 'old'; }, r => { r.revision = 'other'; },
    r => { r.node = 'v22.21.1'; }, r => { r.scope.files = ['wrong.browser.mjs']; },
    r => { r.summary.success = false; }, r => { r.summary.counts.tests = 2; },
    r => { r.outcomes = []; }, r => { r.outcomes[0].file = 'a.browser.mjs'; },
    r => { r.outcomes[0].name = 'alpha'; }, r => { r.outcomes[0].name = 'unrelated'; },
    r => { r.suites = [{ name: 'group', status: 'failed' }]; r.summary.counts.suites = 1; },
    r => { r.suites = [{ name: 'group', status: 'skipped' }]; r.summary.counts.suites = 1; },
    r => { r.suites = [{ name: 'group', status: 'todo' }]; r.summary.counts.suites = 1; },
    r => { delete r.suites; }, r => { r.summary.counts.suites = 1; },
  ];
  for (const mutate of mutations) {
    const input = reports(); mutate(input[1]);
    assert.throws(() => mergeReports(input, plan, identity, rows));
  }
});

test('failed, cancelled, skipped and todo cases remain failures even with a successful summary flag', () => {
  for (const key of ['failed', 'cancelled', 'skipped', 'todo']) {
    const input = report(1, 'alpha'); input.summary.counts[key] = 1;
    assert.throws(() => validateReport(input, scopeFor(plan, '1/2'), identity));
  }
  for (const status of ['failed', 'skipped', 'todo']) {
    const input = report(1, 'alpha'); input.outcomes[0].status = status;
    assert.throws(() => validateReport(input, scopeFor(plan, '1/2'), identity));
  }
});
