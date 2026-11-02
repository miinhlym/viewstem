import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
const environment = { ...process.env };
delete environment.NODE_TEST_CONTEXT;
const run = (args, cwd = root) => spawnSync(process.execPath, args, {
  cwd, env: environment, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
});
const temporary = async t => {
  const directory = await mkdtemp(join(tmpdir(), 'viewstem-preflight-tooling-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};

test('preflight reporter never records skipped or todo cases as executed passes', async t => {
  const directory = await temporary(t), fixture = join(directory, 'cases.test.mjs');
  await writeFile(fixture, `import test from 'node:test';
test('executed', () => {});
test.skip('skipped', () => { throw Error('never executed'); });
test.todo('todo', () => { throw Error('not passing'); });
`);
  const result = run(['--test', `--test-reporter=${join(scripts, 'test-reporter.mjs')}`, fixture]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual([report.passed, report.failed, report.skipped, report.todo], [1, 0, 1, 1]);
  assert.deepEqual(report.tests.map(row => row.name), ['executed']);
  assert.deepEqual(report.skippedTests.map(row => row.name), ['skipped']);
  assert.deepEqual(report.todoTests.map(row => row.name), ['todo']);
});

test('preflight test runner includes top-level suites, excludes fixtures, and fails on unexecuted cases', async t => {
  const directory = await temporary(t), core = join(directory, 'packages/core');
  await mkdir(join(core, 'scripts'), { recursive: true });
  await mkdir(join(core, 'test/fixtures'), { recursive: true });
  for (const name of ['run-tests.mjs', 'test-reporter.mjs']) await cp(join(scripts, name), join(core, 'scripts', name));
  await writeFile(join(core, 'test/selected.test.mjs'), `import test from 'node:test'; test('selected',()=>{});`);
  await writeFile(join(core, 'test/helper.mjs'), `throw Error('helper must not execute');`);
  await writeFile(join(core, 'test/fixtures/ignored.test.mjs'), `throw Error('nested fixture must not execute');`);
  const selected = run([join(core, 'scripts/run-tests.mjs')], directory);
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(JSON.parse(selected.stdout).passed, 1);
  await writeFile(join(core, 'test/unexecuted.test.mjs'), `import test from 'node:test'; test.skip('skipped'); test.todo('todo');`);
  const incomplete = run([join(core, 'scripts/run-tests.mjs')], directory);
  assert.equal(incomplete.status, 1, incomplete.stderr);
  const report = JSON.parse(await readFile(join(core, 'test/results/current.json'), 'utf8'));
  assert.deepEqual([report.passed, report.failed, report.skipped, report.todo], [1, 0, 1, 1]);
  assert.deepEqual(report.tests.map(row => row.name), ['selected']);
});

test('preflight acceptance verification requires an executed report', () => {
  const result = run([join(scripts, 'check-coverage.mjs')]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /at least one executed test report is required/);
});

test('preflight build requires declarations, preserves prior output on failure, and removes obsolete distribution files', async t => {
  const directory = await temporary(t), core = join(directory, 'packages/core');
  await mkdir(core, { recursive: true });
  await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
  for (const name of ['src', 'scripts', 'vendor']) {
    await cp(join(root, 'packages/core', name), join(core, name), { recursive: true });
  }
  await mkdir(join(core, 'dist'));
  await writeFile(join(core, 'dist/obsolete.js'), 'previous build');
  const declaration = await readFile(join(core, 'src/http.d.ts'));
  await rm(join(core, 'src/http.d.ts'));
  const incomplete = run([join(core, 'scripts/build.mjs')], directory);
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /ENOENT.*http\.d\.ts/s);
  assert.equal(await readFile(join(core, 'dist/obsolete.js'), 'utf8'), 'previous build');
  await writeFile(join(core, 'src/http.d.ts'), declaration);
  const complete = run([join(core, 'scripts/build.mjs')], directory);
  assert.equal(complete.status, 0, complete.stderr);
  assert.deepEqual((await readdir(join(core, 'dist'))).sort(), [
    'THIRD-PARTY-NOTICES.txt', 'cel-support.json', 'cel.d.ts', 'cel.js', 'cel.js.map', 'chunks', 'http.d.ts', 'http.js', 'http.js.map',
    'index.d.ts', 'index.js', 'index.js.map',
  ]);
  const chunks = await readdir(join(core, 'dist/chunks'));
  assert.ok(chunks.length > 0);
  assert.ok(chunks.every(name => /^chunk-[A-Z0-9]+\.js(?:\.map)?$/.test(name)));
  for (const name of chunks.filter(name => name.endsWith('.js'))) assert.ok(chunks.includes(`${name}.map`));
  assert.equal((await readdir(core)).some(name => name.startsWith('.core-build-')), false);
});
