import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { isReleasePullRequest, releaseTargets, shouldPublish, verifyPublishPrerequisites } from './npm-release.mjs';

const repository = 'miinhlym/viewstem';
const sha = 'tested-merge-commit';

test('only the merged Changesets PR on this commit can publish', () => {
  const release = {
    merged_at: '2026-11-09',
    merge_commit_sha: sha,
    user: { login: 'viewstem-release[bot]' },
    base: { ref: 'main', repo: { full_name: repository } },
    head: { ref: 'changeset-release/main', repo: { full_name: repository } },
  };
  assert.ok(isReleasePullRequest(release, repository, sha, 'main'));
  assert.ok(isReleasePullRequest({ ...release, base: { ...release.base, ref: 'trunk' },
    head: { ...release.head, ref: 'changeset-release/trunk' } }, repository, sha, 'trunk'));
  for (const override of [
    { merged_at: null },
    { merge_commit_sha: 'different-commit' },
    { user: { login: 'contributor' } },
    { user: { login: 'github-actions[bot]' } },
    { base: { ...release.base, ref: 'another-branch' } },
    { head: { ...release.head, ref: 'ordinary-pr' } },
    { head: { ...release.head, repo: { full_name: 'fork/viewstem' } } },
  ]) assert.ok(!isReleasePullRequest({ ...release, ...override }, repository, sha, 'main'));
});

test('selects only bumped packages in dependency order', () => {
  const before = { core: '0.1.0', dom: '0.1.0', svelte: '0.2.0', ui: '0.3.0' };
  const uiOnly = { ...before, 'ui': '0.3.1' };
  const all = { core: '0.1.1', dom: '0.1.1', svelte: '0.2.1', ui: '0.3.1' };
  const targets = after => releaseTargets((directory, previous) => ({
    name: `@viewstem/${directory}`, version: (previous ? before : after)[directory],
  }));
  assert.deepEqual(targets(uiOnly), [{ directory: 'ui', name: '@viewstem/ui', version: '0.3.1' }]);
  assert.deepEqual(targets(all).map(({ name, version }) => `${name}@${version}`),
    ['@viewstem/core@0.1.1', '@viewstem/dom@0.1.1', '@viewstem/svelte@0.2.1', '@viewstem/ui@0.3.1']);
  assert.deepEqual(targets(before), []);
  assert.throws(() => targets({ ...before, core: '0.0.9' }), /Invalid version bump/);
});

test('a retry skips matching tarballs and rejects collisions or stale publication', () => {
  const target = { name: '@viewstem/core', version: '0.1.1' };
  const integrity = 'sha512-example';
  const registry = (latest, versions = {}) => ({ 'dist-tags': { latest }, versions });
  assert.equal(shouldPublish(target, registry('0.1.0'), integrity), true);
  const published = { '0.1.1': { dist: { integrity } } };
  assert.equal(shouldPublish(target, registry('0.1.1', published), integrity), false);
  assert.throws(() => shouldPublish(target, registry('0.1.1', published), 'different'), /different tarball/);
  assert.throws(() => shouldPublish(target, registry('0.1.2'), integrity), /Refusing to move.*back/);
});

const directories = ['core', 'dom', 'svelte', 'ui'];
const manifests = version => Object.fromEntries(directories.map(directory => [directory, {
  name: `@viewstem/${directory}`, version,
  dependencies: directory === 'core' ? {} : {
    '@viewstem/core': version,
    ...(directory === 'dom' ? {} : { '@viewstem/dom': version }),
  },
}]));
const registryVersions = versions => ({
  'dist-tags': { latest: versions.at(-1) },
  versions: Object.fromEntries(versions.map(version => [version, { dist: { integrity: 'matching' } }])),
});
const fixtures = (previous, current, registry) => ({
  targets: releaseTargets((directory, before) => (before ? previous : current)[directory] ?? null),
  readManifest: (directory, before) => (before ? previous : current)[directory] ?? null,
  readMetadata: async name => registry[name],
});

test('a partial batch A blocks batch B until A is retried with matching tarballs', async () => {
  const original = manifests('0.1.0');
  const batchA = manifests('0.1.1');
  const batchB = { ...batchA, ui: { ...batchA.ui, version: '0.1.2' } };
  const registry = Object.fromEntries(directories.map(directory => [
    `@viewstem/${directory}`, registryVersions(directory === 'core' ? ['0.1.0', '0.1.1'] : ['0.1.0']),
  ]));
  const next = fixtures(batchA, batchB, registry);
  await assert.rejects(verifyPublishPrerequisites(next.targets, next.readManifest, next.readMetadata),
    /Previous release @viewstem\/dom@0\.1\.1 is missing/);
  const retry = fixtures(original, batchA, registry);
  const metadata = await verifyPublishPrerequisites(retry.targets, retry.readManifest, retry.readMetadata);
  assert.equal(shouldPublish(retry.targets[0], metadata.get('@viewstem/core'), 'matching'), false);
  for (const target of retry.targets.slice(1)) {
    assert.equal(shouldPublish(target, metadata.get(target.name), 'matching'), true);
    registry[target.name] = registryVersions(['0.1.0', '0.1.1']);
  }
  await verifyPublishPrerequisites(next.targets, next.readManifest, next.readMetadata);
  assert.equal(shouldPublish(next.targets[0], registry['@viewstem/ui'], 'matching'), true);
});

test('every previous main package must exist even when it is unchanged in the new batch', async () => {
  const previous = manifests('0.1.0');
  const current = { ...previous, core: { ...previous.core, version: '0.1.1' } };
  const registry = Object.fromEntries(directories.map(directory => [
    `@viewstem/${directory}`, registryVersions(directory === 'ui' ? [] : ['0.1.0']),
  ]));
  const fixture = fixtures(previous, current, registry);
  await assert.rejects(verifyPublishPrerequisites(fixture.targets, fixture.readManifest, fixture.readMetadata),
    /Previous release @viewstem\/ui@0\.1\.0 is missing/);
});

test('internal dependencies must be public or precede their dependent in the batch', async () => {
  const previous = manifests('0.1.0');
  const current = manifests('0.1.1');
  const registry = Object.fromEntries(directories.map(directory => [
    `@viewstem/${directory}`, registryVersions(['0.1.0']),
  ]));
  const fixture = fixtures(previous, current, registry);
  await verifyPublishPrerequisites(fixture.targets, fixture.readManifest, fixture.readMetadata);
  await assert.rejects(verifyPublishPrerequisites(fixture.targets.toReversed(), fixture.readManifest, fixture.readMetadata),
    /requires @viewstem\/core@0\.1\.1 on npm or earlier/);
  await assert.rejects(verifyPublishPrerequisites(fixture.targets.slice(2), fixture.readManifest, fixture.readMetadata),
    /requires @viewstem\/core@0\.1\.1 on npm or earlier/);
  registry['@viewstem/core'] = registryVersions(['0.1.0', '0.1.1']);
  registry['@viewstem/dom'] = registryVersions(['0.1.0', '0.1.1']);
  await verifyPublishPrerequisites(fixture.targets.slice(2), fixture.readManifest, fixture.readMetadata);
  current.ui.dependencies['@viewstem/core'] = '^0.1.1';
  await assert.rejects(verifyPublishPrerequisites(fixture.targets, fixture.readManifest, fixture.readMetadata),
    /must pin @viewstem\/core to an exact stable version/);
});

test('a release requires a previous manifest for every published package', async () => {
  const previous = manifests('0.1.0');
  delete previous.dom;
  const current = manifests('0.1.0');
  const readManifest = (directory, before) => (before ? previous : current)[directory];
  assert.throws(() => releaseTargets(readManifest), /Missing previous manifest for @viewstem\/dom/);
  await assert.rejects(verifyPublishPrerequisites([], readManifest, async () => registryVersions(['0.1.0'])),
    /Missing previous manifest for @viewstem\/dom/);
});

test('CI tests automation on Node 24 and calls the release workflow only from default branch pushes', async () => {
  const ci = await readFile(new URL('../workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /^name: CI\n/);
  assert.match(ci, /group:.*github\.event_name.*github\.event\.pull_request\.number \|\| github\.sha/);
  assert.match(ci, /needs: \[compatibility, ui\]/);
  assert.match(ci, /- name: Test release and deployment automation\n\s+if: matrix\.node == '24\.1\.0'\n\s+run: npm run test:ci/);
  assert.equal(ci.match(/npm run test:ci/g)?.length, 1);
  const releasePlanCondition = ci.split('CHECK_RELEASE_PLAN:')[1].split('\n    steps:')[0];
  assert.match(releasePlanCondition, /github\.event\.pull_request\.head\.ref == format\('changeset-release\/\{0\}', github\.event\.repository\.default_branch\)/);
  assert.doesNotMatch(releasePlanCondition, /user\.login/);
  assert.match(ci, /BEFORE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\n\s+RELEASE_PR_AUTHOR: \$\{\{ github\.event\.pull_request\.user\.login \}\}\n\s+run: node \.github\/scripts\/npm-release\.mjs verify-plan/);
  assert.match(ci, /workflow_dispatch' && 'Manual CI complete' \|\| 'CI complete'/);
  const caller = ci.slice(ci.indexOf('\n  release:'));
  assert.match(caller, /needs: complete\n\s+if: github\.event_name == 'push' && github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
  assert.match(caller, /pull-requests: read/);
  assert.doesNotMatch(caller, /pull-requests: write/);
  assert.match(caller, /uses: \.\/\.github\/workflows\/npm-release\.yml/);
  assert.match(caller, /CLOUDFLARE_PRODUCTION_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_PRODUCTION_API_TOKEN \}\}/);
  assert.match(caller, /RELEASE_APP_PRIVATE_KEY: \$\{\{ secrets\.RELEASE_APP_PRIVATE_KEY \}\}/);
});

test('release PR creation uses the App and production docs depend on publishing', async () => {
  const release = await readFile(new URL('../workflows/npm-release.yml', import.meta.url), 'utf8');
  assert.match(release, /^name: Release npm packages\n/);
  const namedSecret = /secrets:\n\s+CLOUDFLARE_PRODUCTION_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_PRODUCTION_API_TOKEN \}\}/;
  assert.match(release, /workflow_call:\n\s+secrets:\n\s+CLOUDFLARE_PRODUCTION_API_TOKEN:\n\s+required: true/);
  const docs = release.slice(release.indexOf('\n  docs:'));
  assert.match(docs, /needs: \[plan, publish\]\n\s+if: needs\.plan\.outputs\.targets != '\[\]'/);
  assert.match(docs, /uses: \.\/\.github\/workflows\/docs-deploy\.yml/);
  assert.match(docs, namedSecret);
  assert.match(release, /changeset status --output.*\n.*\.type != "none"/);
  const version = release.slice(release.indexOf('\n  version:'), release.indexOf('\n  publish:'));
  assert.match(version, /environment:\n\s+name: release-pr\n\s+deployment: false/);
  assert.match(version, /uses: actions\/create-github-app-token@[a-f0-9]{40}/);
  assert.match(version, /run: test "\$APP_SLUG" = viewstem-release/);
  assert.match(version, /github-token: \$\{\{ steps\.release-app\.outputs\.token \}\}/);
  assert.doesNotMatch(release.slice(release.indexOf('\n  publish:')), /RELEASE_APP_PRIVATE_KEY/);
  assert.match(release, /BEFORE_SHA: \$\{\{ github\.event\.before \}\}\n\s+run: node \.github\/scripts\/npm-release\.mjs verify-plan/);
  const publish = release.slice(release.indexOf('\n  publish:'), release.indexOf('\n  tag:'));
  assert.match(publish, /group: npm-publish\n\s+queue: max/);
  assert.match(publish, /fetch-depth: 0/);
  assert.match(publish, /BEFORE_SHA: \$\{\{ github\.event\.before \}\}/);
});
