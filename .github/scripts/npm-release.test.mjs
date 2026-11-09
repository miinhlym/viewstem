import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isReleasePullRequest, releaseTargets, shouldPublish } from './npm-release.mjs';

const repository = 'miinhlym/viewstem';
const sha = 'tested-merge-commit';

test('only the merged Changesets PR on this commit can publish', () => {
  const release = {
    merged_at: '2026-11-09',
    merge_commit_sha: sha,
    user: { login: 'github-actions[bot]' },
    base: { ref: 'main', repo: { full_name: repository } },
    head: { ref: 'changeset-release/main', repo: { full_name: repository } },
  };
  assert.ok(isReleasePullRequest(release, repository, sha));
  for (const override of [
    { merged_at: null },
    { merge_commit_sha: 'different-commit' },
    { user: { login: 'contributor' } },
    { base: { ...release.base, ref: 'another-branch' } },
    { head: { ...release.head, ref: 'ordinary-pr' } },
    { head: { ...release.head, repo: { full_name: 'fork/viewstem' } } },
  ]) assert.ok(!isReleasePullRequest({ ...release, ...override }, repository, sha));
});

test('selects only bumped packages in dependency order', () => {
  const before = { core: '0.1.0', svelte: '0.2.0', 'svelte-ui': '0.3.0' };
  const uiOnly = { ...before, 'svelte-ui': '0.3.1' };
  const coreAndRenderer = { ...before, core: '0.1.1', svelte: '0.2.1' };
  const targets = after => releaseTargets((directory, previous) => ({
    name: `@viewstem/${directory}`, version: (previous ? before : after)[directory],
  }));
  assert.deepEqual(targets(uiOnly), [{ directory: 'svelte-ui', name: '@viewstem/svelte-ui', version: '0.3.1' }]);
  assert.deepEqual(targets(coreAndRenderer).map(({ name, version }) => `${name}@${version}`),
    ['@viewstem/core@0.1.1', '@viewstem/svelte@0.2.1']);
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
