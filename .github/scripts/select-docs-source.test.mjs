import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const selectSource = fileURLToPath(new URL('./docs-deploy/select-docs-source.mjs', import.meta.url));
const planRelease = fileURLToPath(new URL('./npm-release.mjs', import.meta.url));
const verifyRegistry = fileURLToPath(new URL('./docs-deploy/verify-published-packages.mjs', import.meta.url));
const guide = 'apps/docs/src/content/docs/docs/installation/index.md';
const packageSource = 'packages/core/src/index.mjs';
const packages = ['core', 'dom', 'svelte', 'ui'];

function repository(t) {
  const dir = mkdtempSync(join(tmpdir(), 'viewstem-docs-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main');
  git('config', 'user.email', 'docs@example.com');
  git('config', 'user.name', 'Docs');
  const output = join(dir, 'output');
  const repo = 'miinhlym/viewstem';
  function write(name, content) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  function commit(files) {
    for (const [name, content] of Object.entries(files)) {
      if (content === null) {
        git('rm', '--', name);
      } else {
        write(name, content);
        git('add', '--', name);
      }
    }
    return saveRevision();
  }
  function saveRevision() {
    git('commit', '-m', 'Test revision');
    const sha = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', sha);
    return sha;
  }
  function run(script, env, flags = [], args = []) {
    write('output', '');
    const result = spawnSync(process.execPath, [...flags, script, ...args], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, ...env, GITHUB_OUTPUT: output },
    });
    assert.ifError(result.error);
    return { ...result, output: readFileSync(output, 'utf8') };
  }
  function select(sha, active, event = 'workflow_dispatch') {
    return run(selectSource, {
      GITHUB_SHA: sha, GITHUB_EVENT_NAME: event, DOCS_DEFAULT_BRANCH: 'main', DOCS_ACTIVE: JSON.stringify(active),
    });
  }
  function plan(sha, before, pr) {
    write('gh', '#!/bin/sh\ntest "$#" = 4 && test "$4" = "$MOCK_URL" || exit 2\nprintf "%s\\n" "$MOCK_PRS"\n');
    chmodSync(join(dir, 'gh'), 0o755);
    return run(planRelease, {
      GITHUB_SHA: sha, BEFORE_SHA: before, GITHUB_REPOSITORY: repo, RELEASE_BRANCH: 'main',
      PATH: `${dir}${delimiter}${process.env.PATH}`, MOCK_URL: `repos/${repo}/commits/${sha}/pulls`,
      MOCK_PRS: JSON.stringify([[{ number: 3, merged_at: '2026-11-24', merge_commit_sha: sha,
        user: { login: pr ? 'viewstem-release[bot]' : 'author' }, base: { ref: 'main', repo: { full_name: repo } },
        head: { ref: pr ? 'changeset-release/main' : 'docs/fix-guide', repo: { full_name: repo } } }]]),
    }, [], ['plan']);
  }
  function mockRegistry() {
    write('mock-registry.mjs', `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.fetch = async (url, { method }) => {
  const endpoint = new URL(url);
  assert.equal(endpoint.origin, 'https://registry.npmjs.org');
  if (endpoint.pathname.endsWith('.tgz')) {
    const name = endpoint.pathname.split('/-/')[0].split('/').at(-1);
    const status = endpoint.pathname.includes('core-0.1.1') ? Number(process.env.ARCHIVE_STATUS) : 200;
    const archives = JSON.parse(process.env.MOCK_ARCHIVES);
    return new Response(method === 'GET' && status === 200 ? readFileSync(archives[name]) : null, { status });
  }
  const name = decodeURIComponent(endpoint.pathname.slice(1));
  const versions = process.env.MOCK_PUBLISH_STATUS === undefined ? ['0.1.0', '0.1.1'] : ['0.1.0'];
  return Response.json({ 'dist-tags': { latest: process.env.MOCK_LATEST || versions.at(-1) },
    versions: Object.fromEntries(versions.map(version => [version, {
      dist: { tarball: \`\${endpoint.origin}/\${name}/-/\${name.split('/').at(-1)}-\${version}.tgz\` },
    }])),
  });
};
`);
    return ['--import', join(dir, 'mock-registry.mjs')];
  }
  function verify(event, batch, archiveStatus, { latest = '', sources = {} } = {}) {
    const sha = git('rev-parse', 'HEAD');
    const archives = Object.fromEntries(packages.map(name => [name, packSource(name, sources[name] ?? base)]));
    return run(verifyRegistry, {
      GITHUB_EVENT_NAME: event, RELEASED_PACKAGES: batch, ARCHIVE_STATUS: archiveStatus, MOCK_LATEST: latest,
      GITHUB_SHA: sha, GITHUB_REPOSITORY: repo, MOCK_ARCHIVES: JSON.stringify(archives),
    }, mockRegistry(), ['--once']);
  }
  function publish(sha, before, targets, status) {
    write('npm', `#!/bin/sh
case "$1" in
  pack) printf '%s\\n' '[{"name":"@viewstem/core","version":"0.1.1","filename":"core.tgz","integrity":"test","files":[{"path":"dist/index.mjs"}]}]' ;;
  publish) printf '%s\\n' "$GITHUB_SHA" >> "$MOCK_PUBLISH_LOG"; exit "$MOCK_PUBLISH_STATUS" ;;
  *) exit 99 ;;
esac
`);
    chmodSync(join(dir, 'npm'), 0o755);
    return run(planRelease, {
      GITHUB_SHA: sha, BEFORE_SHA: before, GITHUB_REPOSITORY: repo, RELEASE_TARGETS: targets,
      PATH: `${dir}${delimiter}${process.env.PATH}`, MOCK_PUBLISH_STATUS: status, MOCK_PUBLISH_LOG: join(dir, 'publications'),
    }, mockRegistry(), ['publish']);
  }
  function verifyPlan(sha, before) {
    return run(planRelease, { GITHUB_SHA: sha, BEFORE_SHA: before }, [], ['verify-plan']);
  }
  function packSource(name, sha) {
    write('package/README.md', `[Source and documentation for this version](https://github.com/${repo}/blob/${sha}/docs/README.md)\n`);
    const archive = join(dir, `${name}.tgz`);
    execFileSync('tar', ['-czf', archive, '-C', dir, 'package/README.md']);
    return archive;
  }
  const manifest = (name, version = '0.1.0') => JSON.stringify({ name: `@viewstem/${name}`, version });
  const docsManifest = (core = '0.1.0') =>
    JSON.stringify({ name: '@viewstem/docs', private: true, dependencies: { '@viewstem/core': core } });
  const base = commit({
    'package.json': JSON.stringify({ name: 'viewstem-fixture', private: true, workspaces: ['packages/*', 'apps/docs'] }),
    'package-lock.json': '{"lockfileVersion": 3}\n',
    '.changeset/config.json': JSON.stringify({ baseBranch: 'main', commit: false, changelog: '@changesets/cli/changelog' }),
    ...Object.fromEntries(packages.map(name => [`packages/${name}/package.json`, manifest(name)])),
    'apps/docs/package.json': docsManifest(),
    [packageSource]: 'export const installedApi = () => "ready";\n',
    'packages/core/README.md': 'Core\n',
    'packages/core/README.ko.md': 'Core\n',
    [guide]: 'Use the installed API\n',
  });
  function generateRelease() {
    const modules = fileURLToPath(new URL('../../node_modules/', import.meta.url));
    symlinkSync(modules, join(dir, 'node_modules'), 'dir');
    execFileSync(process.execPath, [join(modules, '@changesets/cli/bin.js'), 'version'], { cwd: dir, stdio: 'pipe' });
    git('add', '--all', '--', '.changeset', 'packages', 'apps');
    return saveRevision();
  }
  return { base, commit, dir, git, select, plan, verify, verifyPlan, generateRelease, publish, manifest, docsManifest };
}

test('the merged release must match Changesets on the pre-merge commit', t => {
  const { base, commit, git, manifest, verifyPlan, generateRelease } = repository(t);
  const intended = commit({ '.changeset/core-feature.md': '---\n"@viewstem/core": patch\n---\n\nUpdate Core.\n' });
  const genuine = generateRelease();
  git('switch', '--detach', genuine);
  git('branch', '-D', 'main');
  const accepted = verifyPlan(genuine, intended);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(git('rev-parse', 'HEAD'), genuine);
  assert.equal(git('for-each-ref', 'refs/heads'), '');

  git('switch', '--detach', base);
  const withdrawn = commit({ '.changeset/empty.md': '---\n---\n\nNo release.\n' });
  const stale = commit({ 'packages/core/package.json': manifest('core', '0.1.1') });
  assert.match(verifyPlan(stale, withdrawn).stderr, /Release PR differs from Changesets output/);
  assert.equal(git('rev-parse', 'HEAD'), stale);

  git('switch', '--detach', intended);
  const larger = commit({ '.changeset/core-feature.md': '---\n"@viewstem/core": minor\n---\n\nUpdate Core.\n' });
  const wrongVersion = commit({ 'packages/core/package.json': manifest('core', '0.1.1') });
  assert.match(verifyPlan(wrongVersion, larger).stderr, /packages\/core\/package.json/);

  git('switch', '--detach', base);
  const replaced = commit({ '.changeset/replacement.md': '---\n"@viewstem/core": patch\n---\n\nReplace Core change.\n' });
  const sameBump = commit({ 'packages/core/package.json': manifest('core', '0.1.1') });
  assert.match(verifyPlan(sameBump, replaced).stderr, /\.changeset\/replacement.md/);

  git('switch', '--detach', intended);
  const revised = commit({ '.changeset/core-feature.md': '---\n"@viewstem/core": patch\n---\n\nRevised summary.\n' });
  const sameId = commit({ 'packages/core/package.json': git('show', `${genuine}:packages/core/package.json`) + '\n',
    'apps/docs/package.json': git('show', `${genuine}:apps/docs/package.json`) + '\n',
    'packages/core/CHANGELOG.md': git('show', `${genuine}:packages/core/CHANGELOG.md`) + '\n',
    '.changeset/core-feature.md': null });
  assert.match(verifyPlan(sameId, revised).stderr, /packages\/core\/CHANGELOG.md/);
});

test('a docs-only commit does not publish packages and can deploy as the exact manual SHA', t => {
  const { base, commit, git, select, plan, verify } = repository(t);
  const sha = commit({
    [guide]: 'Fix an installation typo\n',
    '.github/scripts/docs-preview.mjs': '// Remove a retired preview-record format.\n',
    '.github/workflows/docs-preview.yml': 'name: Docs preview\n',
    '.changeset/README.md': 'Changeset instructions\n',
    'AGENTS.md': 'Repository documentation entry point\n',
    'docs/README.md': 'Documentation map\n',
    'docs/architecture.md': 'Implementation boundaries\n',
    'docs/releasing.md': 'Release procedure\n',
    'docs/verification.md': 'Verification commands\n',
    'skills/README.md': 'Skill maintenance guide\n',
  });
  const releasePlan = plan(sha, base, false);
  assert.equal(releasePlan.status, 0, releasePlan.stderr);
  assert.equal(releasePlan.output, 'targets=[]\nreleased_packages=[]\n');
  const deployment = select(sha, { base, through: base });
  assert.equal(deployment.status, 0, deployment.stderr);
  assert.equal(deployment.output, `deploy=true\nbase=${base}\nthrough=${sha}\n`);
  const published = verify('workflow_dispatch', '', 200);
  assert.equal(published.status, 0, published.stderr);
  assert.equal(git('rev-parse', 'HEAD'), sha);
  assert.equal(git('tag', '--list'), '');
});

test('manual deployment allows deletion of baseline reports without admitting later edits or additions', t => {
  const { base, commit, select } = repository(t);
  const report = 'docs/designs/old-review.md';
  const release = commit({ [report]: 'Old design evidence\n' });
  const removed = commit({ [report]: null });

  const accepted = select(removed, { base: release, through: release });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.output, /deploy=true/);

  const addedThenRemoved = select(removed, { base, through: base });
  assert.equal(addedThenRemoved.status, 1);
  assert.ok(addedThenRemoved.stderr.includes(report));

  const edited = commit({ [report]: 'New design evidence\n' });
  const restored = select(edited, { base: release, through: release });
  assert.equal(restored.status, 1);
  assert.ok(restored.stderr.includes(report));
});

test('manual deployment recognizes the moved maintainer docs without allowing arbitrary docs paths', t => {
  const { commit, select } = repository(t);
  const base = commit({
    'docs/handoff/acceptance-matrix.md': 'Acceptance expectations\n',
    'docs/handoff/core-acceptance-coverage.json': '{}\n',
    'docs/handoff/core-cel-support.md': 'CEL reference\n',
    'docs/spec/09-preserved-contracts.md': 'State and URL\n',
  });
  const sha = commit({
    'docs/handoff/acceptance-matrix.md': null,
    'docs/handoff/core-acceptance-coverage.json': null,
    'docs/handoff/core-cel-support.md': null,
    'docs/spec/09-preserved-contracts.md': null,
    'docs/acceptance.md': 'Acceptance expectations\n',
    'docs/core-acceptance-coverage.json': '{}\n',
    'docs/core-cel.md': 'CEL reference\n',
    'docs/follow-up.md': 'Follow-up scope\n',
    'docs/spec/04-action.md': 'Action contract\n',
    'docs/spec/06-composition-examples.md': 'Composition examples\n',
    'docs/spec/09-state-store-and-url.md': 'State and URL\n',
    'experiments/t3-application/README.md': 'Historical reproduction instructions\n',
  });
  const active = { base, through: base };
  const allowed = select(sha, active);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(allowed.output, `deploy=true\nbase=${base}\nthrough=${sha}\n`);

  const unknown = commit({ 'docs/unclassified.md': 'Unknown file\n' });
  const blocked = select(unknown, active);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /docs\/unclassified\.md/);
});

test('manual deployment accepts workflow and script moves after the active release and rejects unknown paths', t => {
  const { base, commit, select } = repository(t);
  const oldScript = '.github/scripts/docs-site-changes.mjs';
  const oldTest = '.github/scripts/docs-site-changes.test.mjs';
  const ci = 'name: CI\n';
  const deploy = 'name: Deploy docs\n';
  commit({
    '.github/workflows/core.yml': ci,
    '.github/workflows/docs-release.yml': deploy,
    [oldScript]: 'export const select = true;\n',
    [oldTest]: '// Source test\n',
  });
  const moved = commit({
    '.github/workflows/core.yml': null,
    '.github/workflows/docs-release.yml': null,
    '.github/workflows/ci.yml': ci,
    '.github/workflows/docs-deploy.yml': deploy,
    [oldScript]: null,
    [oldTest]: null,
    '.github/scripts/docs-deploy/select-docs-source.mjs': 'export const select = true;\n',
    '.github/scripts/select-docs-source.test.mjs': '// Source test\n',
  });
  const active = { base, through: base };
  const result = select(moved, active);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, `deploy=true\nbase=${base}\nthrough=${moved}\n`);

  const unexpected = '.github/scripts/docs-deploy/new-deployment-script.mjs';
  const blocked = select(commit({ [unexpected]: '// Unknown script\n' }), active);
  assert.equal(blocked.status, 1);
  assert.ok(blocked.stderr.includes(unexpected));
  assert.equal(blocked.output, '');
});

test('an unversioned feature blocks manual deployment even if a hosted example still passes', t => {
  const { base, commit, dir, git, select, verify } = repository(t);
  const published = join(dir, 'published.mjs');
  writeFileSync(published, git('show', `${base}:${packageSource}`));
  const example = join(dir, 'hosted-example.mjs');
  writeFileSync(example, `import assert from 'node:assert/strict'; import { installedApi } from './published.mjs';
assert.equal(installedApi(), 'ready');\n`);
  commit({ [packageSource]: 'export const installedApi = () => "ready";\nexport const unpublishedApi = () => "new";\n',
    [guide]: 'Try the new unpublishedApi function.\n' });
  // This latest commit looks docs-only, and the old example and registry pins still pass.
  const candidate = commit({ [guide]: 'Try the new unpublishedApi function. Fix a typo.\n' });
  assert.equal(git('diff', '--name-only', base, candidate, '--', ':(glob)**/package.json'), '');
  execFileSync(process.execPath, [example], { cwd: dir });
  assert.match(verify('workflow_dispatch', '', 200).stderr, /@viewstem\/core@0.1.0 has unpublished changes/);
  const blocked = select(candidate, { base, through: base });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /Wait for the next package release/);
  assert.ok(blocked.stderr.includes(packageSource));
  assert.equal(blocked.output, '');
  const reverted = commit({ [packageSource]: git('show', `${base}:${packageSource}`) + '\n' });
  assert.equal(select(reverted, { base, through: base }).status, 1);
});

test('a UI-only release cannot hide pending Core changes, and a later Core release can recover', t => {
  const { base, commit, select, verify, manifest, docsManifest } = repository(t);
  const live = { base, through: base };
  const batch = name => JSON.stringify([{ registry: 'npm', name: `@viewstem/${name}`, version: '0.1.1' }]);
  commit({ [packageSource]: 'export const unpublishedApi = () => "new";\n', [guide]: 'Try the unreleased Core API.\n' });
  const ui = commit({ 'packages/ui/package.json': manifest('ui', '0.1.1') });
  assert.equal(select(ui, live, 'push').status, 0);
  const failed = verify('push', batch('ui'), 200, { sources: { ui } });
  assert.match(failed.stderr, /@viewstem\/core@0.1.0 has unpublished changes/);
  assert.equal(select(ui, live).status, 1);
  assert.match(verify('workflow_dispatch', '', 200, { sources: { ui } }).stderr, /@viewstem\/core@0.1.0 has unpublished changes/);

  const core = commit({ 'packages/core/package.json': manifest('core', '0.1.1'), 'apps/docs/package.json': docsManifest('0.1.1') });
  const resumed = select(core, live, 'push');
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(resumed.output, `deploy=true\nbase=${core}\nthrough=${core}\n`);
  const verified = verify('push', batch('core'), 200, { sources: { core, ui } });
  assert.equal(verified.status, 0, verified.stderr);

  const changedUi = commit({ 'packages/ui/src/index.mjs': 'export const notInPublicUI = true;\n' });
  const blocked = verify('push', batch('core'), 200, { sources: { core: changedUi, ui } });
  assert.match(blocked.stderr, /@viewstem\/ui@0.1.1 has unpublished changes/);
});

test('a release uses its exact commit and requires public archive availability without Git tags', t => {
  const { base, commit, dir, git, select, plan, verify, publish, manifest, docsManifest } = repository(t);
  const sha = commit({ [packageSource]: 'export const newApi = true;\n', [guide]: 'Try the new API\n',
    'packages/core/package.json': manifest('core', '0.1.1'), 'apps/docs/package.json': docsManifest('0.1.1') });
  const planResult = plan(sha, base, true);
  assert.equal(planResult.status, 0, planResult.stderr);
  const targets = planResult.output.match(/^targets=(.+)$/m)[1];
  const batch = planResult.output.match(/^released_packages=(.+)$/m)[1];
  assert.deepEqual(JSON.parse(batch), [{ registry: 'npm', name: '@viewstem/core', version: '0.1.1' }]);
  const failedPublish = publish(sha, base, targets, 13);
  assert.equal(failedPublish.status, 1, failedPublish.stderr);
  assert.match(failedPublish.stderr, /Command failed: npm publish/);
  const published = publish(sha, base, targets, 0);
  assert.equal(published.status, 0, published.stderr);
  const first = select(sha, { base, through: base }, 'push');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.output, `deploy=true\nbase=${sha}\nthrough=${sha}\n`);
  const unavailable = verify('push', batch, 404, { sources: { core: sha } });
  assert.equal(unavailable.status, 1);
  assert.match(unavailable.stderr, /Public packages unavailable.*@viewstem\/core@0\.1\.1/);
  assert.equal(verify('push', batch, 200, { sources: { core: sha } }).status, 0);
  assert.match(verify('push', batch, 200).stderr, /was not published from the release commit/);

  const newer = commit({ [guide]: 'Later unpublished docs change\n' });
  assert.match(publish(sha, base, targets, 0).stderr, /checkout does not match the release commit/);
  git('checkout', '--detach', sha);
  const retry = select(sha, { base, through: base }, 'push');
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(retry.output, first.output);
  assert.equal(git('rev-parse', 'HEAD'), sha);
  const advanced = verify('push', batch, 200, { latest: '0.2.0', sources: { core: sha } });
  assert.equal(advanced.status, 0, advanced.stderr);
  assert.equal(readFileSync(join(dir, 'publications'), 'utf8'), `${sha}\n${sha}\n`);
  const outdated = select(sha, { base: sha, through: newer }, 'push');
  assert.equal(outdated.status, 0, outdated.stderr);
  assert.match(outdated.stdout, /newer documentation commit/);
  assert.equal(outdated.output, '');
});

test('manual deployment fails when the baseline, checkout identity, or change scope is unproven', t => {
  const { base, commit, select } = repository(t);
  const sha = commit({ 'package-lock.json': '{}\n', [guide]: 'Update docs\n' });
  assert.match(select(sha, null).stderr, /No verified package release baseline/);
  assert.match(select(sha, { base: 'f'.repeat(40), through: base }).stderr, /Cannot establish/);
  assert.match(select(base, { base, through: base }).stderr, /checkout does not match/);
  assert.match(select(sha, { base, through: base }).stderr, /Cannot prove.*\n.*package-lock\.json/s);
});
