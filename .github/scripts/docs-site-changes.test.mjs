import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const selectSource = fileURLToPath(new URL('./docs-site-changes.mjs', import.meta.url));
const planRelease = fileURLToPath(new URL('./npm-release.mjs', import.meta.url));
const verifyRegistry = fileURLToPath(new URL('./verify-docs-release.mjs', import.meta.url));
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
        user: { login: pr ? 'github-actions[bot]' : 'author' }, base: { ref: 'main', repo: { full_name: repo } },
        head: { ref: pr ? 'changeset-release/main' : 'docs/fix-guide', repo: { full_name: repo } } }]]),
    }, [], ['plan']);
  }
  function mockRegistry() {
    write('mock-registry.mjs', `
import assert from 'node:assert/strict';
globalThis.fetch = async (url, { method }) => {
  const endpoint = new URL(url);
  assert.equal(endpoint.origin, 'https://registry.npmjs.org');
  if (method === 'HEAD') {
    return new Response(null, { status: endpoint.pathname.includes('core-0.1.1')
      ? Number(process.env.ARCHIVE_STATUS) : 200 });
  }
  const name = decodeURIComponent(endpoint.pathname.slice(1));
  const version = name === '@viewstem/core' && process.env.GITHUB_EVENT_NAME === 'push'
    && process.env.MOCK_PUBLISH_STATUS === undefined ? '0.1.1' : '0.1.0';
  return Response.json({ 'dist-tags': { latest: version }, versions: {
    [version]: { dist: { tarball: \`\${endpoint.origin}/\${name}/-/\${name.split('/').at(-1)}-\${version}.tgz\` } },
  } });
};
`);
    return ['--import', join(dir, 'mock-registry.mjs')];
  }
  function verify(event, batch, archiveStatus) {
    return run(verifyRegistry, {
      GITHUB_EVENT_NAME: event, RELEASED_PACKAGES: batch, ARCHIVE_STATUS: archiveStatus,
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
  const publishedVersions = verify('workflow_dispatch', '', 200);
  assert.equal(publishedVersions.status, 0, publishedVersions.stderr);
  const blocked = select(candidate, { base, through: base });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /Wait for the next package release/);
  assert.ok(blocked.stderr.includes(packageSource));
  assert.equal(blocked.output, '');
  const reverted = commit({ [packageSource]: git('show', `${base}:${packageSource}`) + '\n' });
  assert.equal(select(reverted, { base, through: base }).status, 1);
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
  assert.equal(first.output, `deploy=true\nbase=${sha}\nthrough=${sha}\n`);
  const unavailable = verify('push', batch, 404);
  assert.equal(unavailable.status, 1);
  assert.match(unavailable.stderr, /Public packages unavailable.*@viewstem\/core@0\.1\.1/);
  assert.equal(verify('push', batch, 200).status, 0);

  const newer = commit({ [guide]: 'Later unpublished docs change\n' });
  assert.match(publish(sha, base, targets, 0).stderr, /checkout does not match the release commit/);
  git('checkout', '--detach', sha);
  const retry = select(sha, { base, through: base }, 'push');
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(retry.output, first.output);
  assert.equal(git('rev-parse', 'HEAD'), sha);
  assert.equal(verify('push', batch, 200).status, 0);
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
