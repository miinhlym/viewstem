import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const registry = 'https://registry.npmjs.org';
const packages = ['core', 'dom', 'svelte', 'ui'];
const releaseBot = 'viewstem-release[bot]';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const run = (command, args, options) => execFileSync(command, args, { encoding: 'utf8', ...options }).trim();

export function isReleasePullRequest(pr, repository, sha, branch) {
  return pr.merged_at && pr.merge_commit_sha === sha
    && pr.user.login === releaseBot
    && pr.base.ref === branch && pr.base.repo.full_name === repository
    && pr.head.ref === `changeset-release/${branch}` && pr.head.repo?.full_name === repository;
}

function compareVersions(left, right) {
  assert.match(left, stableVersion);
  assert.match(right, stableVersion);
  const rightParts = right.split('.').map(Number);
  for (const [index, part] of left.split('.').entries()) {
    const difference = Number(part) - rightParts[index];
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function releaseTargets(readManifest) {
  return packages.flatMap(directory => {
    const previous = readManifest(directory, true);
    const current = readManifest(directory, false);
    assert.equal(current.name, `@viewstem/${directory}`);
    assert.ok(!current.private, `${current.name} must be public`);
    const target = { directory, name: current.name, version: current.version };
    assert.ok(previous, `Missing previous manifest for ${current.name}`);
    assert.equal(previous.name, current.name);
    if (current.version === previous.version) return [];
    assert.equal(compareVersions(current.version, previous.version), 1,
      `Invalid version bump for ${current.name}`);
    return [target];
  });
}

export function shouldPublish(target, metadata, integrity) {
  const existing = metadata.versions[target.version];
  if (existing) {
    assert.equal(existing.dist.integrity, integrity,
      `${target.name}@${target.version} exists with different tarball contents`);
    return false;
  }
  const latest = metadata['dist-tags'].latest;
  assert.ok(!latest || compareVersions(target.version, latest) > 0,
    `Refusing to move ${target.name}@latest back from ${latest} to ${target.version}`);
  return true;
}

export async function verifyPublishPrerequisites(targets, readManifest, readMetadata) {
  const metadata = new Map();
  const getMetadata = async name => {
    if (!metadata.has(name)) metadata.set(name, await readMetadata(name));
    return metadata.get(name);
  };
  // A failed earlier batch must finish before any newer batch can publish.
  for (const directory of packages) {
    const previous = readManifest(directory, true);
    assert.ok(previous, `Missing previous manifest for @viewstem/${directory}`);
    assert.equal(previous.name, `@viewstem/${directory}`);
    const published = await getMetadata(previous.name);
    assert.ok(published.versions[previous.version],
      `Previous release ${previous.name}@${previous.version} is missing on npm; rerun its release before publishing this batch`);
  }
  const preceding = new Set();
  for (const target of targets) {
    const manifest = readManifest(target.directory, false);
    assert.equal(manifest.name, target.name);
    assert.equal(manifest.version, target.version);
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        if (!name.startsWith('@viewstem/')) continue;
        assert.ok(packages.some(directory => name === `@viewstem/${directory}`),
          `Unknown internal dependency ${name}`);
        assert.match(version, stableVersion, `${manifest.name} must pin ${name} to an exact stable version`);
        const published = await getMetadata(name);
        assert.ok(published.versions[version] || preceding.has(`${name}@${version}`),
          `${manifest.name}@${manifest.version} requires ${name}@${version} on npm or earlier in this release batch`);
      }
    }
    preceding.add(`${target.name}@${target.version}`);
  }
  return metadata;
}

function readReleaseManifest(directory, previous) {
  const path = `packages/${directory}/package.json`;
  const ref = previous ? process.env.BEFORE_SHA : process.env.GITHUB_SHA;
  return JSON.parse(run('git', ['show', `${ref}:${path}`]));
}

async function verifyChangesetsPlan() {
  const { BEFORE_SHA: before, GITHUB_SHA: sha, GITHUB_EVENT_NAME: event, RELEASE_PR_AUTHOR: author } = process.env;
  if (event === 'pull_request') {
    assert.equal(author, releaseBot, `The Changesets release branch requires a PR opened by ${releaseBot}`);
  }
  assert.equal(run('git', ['rev-parse', 'HEAD']), sha, 'The checkout does not match the release commit');
  assert.equal(run('git', ['status', '--porcelain', '--untracked-files=no']), '', 'Expected a clean release checkout');
  run('git', ['merge-base', '--is-ancestor', before, sha]);
  assert.ok(releaseTargets(readReleaseManifest).length, 'Release PR must bump at least one public package');
  const { baseBranch, commit } = JSON.parse(run('git', ['show', `${before}:.changeset/config.json`]));
  assert.equal(commit, false, 'Changesets version generation must leave changes uncommitted');
  const cli = fileURLToPath(import.meta.resolve('@changesets/cli/bin.js'));
  const directory = await mkdtemp(join(tmpdir(), 'viewstem-changesets-plan-'));
  try {
    // Run the same generator against the original inputs without changing the tested checkout.
    const objects = run('git', ['rev-parse', '--path-format=absolute', '--git-path', 'objects']);
    const options = { cwd: directory, env: { ...process.env, GIT_ALTERNATE_OBJECT_DIRECTORIES: objects } };
    const snapshot = (...args) => run('git', args, options);
    snapshot('init', '--quiet', '--template=', '--initial-branch', baseBranch);
    snapshot('switch', '--quiet', '-C', baseBranch, before);
    await symlink(fileURLToPath(new URL('../../node_modules/', import.meta.url)), join(directory, 'node_modules'), 'dir');
    run(process.execPath, [cli, 'version'], options);
    snapshot('add', '--all', '--', '.', ':(exclude)node_modules');
    const generated = snapshot('write-tree');
    // npm ci checks the lockfile against the generated manifests without resolving versions again.
    const differences = snapshot('diff', '--name-only', '--no-renames', generated, sha, '--',
      '.', ':(exclude)package-lock.json');
    assert.equal(differences, '', `Release PR differs from Changesets output at the base commit:\n${differences}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readRegistry(name) {
  const response = await fetch(`${registry}/${encodeURIComponent(name)}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) {
    throw new Error(`${name} is missing on npm. Verify the package's public registry record before retrying.`);
  }
  if (!response.ok) throw new Error(`Could not read ${name} from npm (HTTP ${response.status})`);
  return response.json();
}

async function plan() {
  const { GITHUB_REPOSITORY: repository, GITHUB_SHA: sha, RELEASE_BRANCH: branch } = process.env;
  assert.ok(branch, 'The repository default branch is required');
  const pages = JSON.parse(run('gh', ['api', '--paginate', '--slurp',
    `repos/${repository}/commits/${sha}/pulls`]));
  const release = pages.flat().find(pr => isReleasePullRequest(pr, repository, sha, branch));
  const targets = release ? releaseTargets(readReleaseManifest) : [];
  if (release) assert.ok(targets.length, 'Release PR must bump at least one public package');
  const releasedPackages = targets.map(({ name, version }) => ({ registry: 'npm', name, version }));
  await appendFile(process.env.GITHUB_OUTPUT,
    `targets=${JSON.stringify(targets)}\nreleased_packages=${JSON.stringify(releasedPackages)}\n`);
}

async function pack(target, directory, repository, sha) {
  const source = `https://github.com/${repository}/blob/${sha}/`;
  const packageDir = `packages/${target.directory}`;
  const readmes = await Promise.all(['README.md', 'README.ko.md'].map(async file => {
    const path = join(packageDir, file);
    return { path, contents: await readFile(path, 'utf8'), korean: file.endsWith('.ko.md') };
  }));
  try {
    for (const { path, contents, korean } of readmes) {
      const link = korean ? '이 버전의 소스와 문서' : 'Source and documentation for this version';
      const docs = korean ? 'docs/README.ko.md' : 'docs/README.md';
      const resolved = contents.replaceAll(/\]\(\.\.\/\.\.\/(docs\/[^)]+)\)/g, `](${source}$1)`);
      await writeFile(path, `${resolved.trimEnd()}\n\n[${link}](${source}${docs})\n`);
    }
    const [tarball] = JSON.parse(run('npm', ['pack', `./${packageDir}`, '--pack-destination',
      directory, '--ignore-scripts', '--json']));
    assert.equal(tarball.name, target.name);
    assert.equal(tarball.version, target.version);
    assert.ok(tarball.files.some(file => file.path.startsWith('dist/')), `${target.name} has no build output`);
    return tarball;
  } finally {
    await Promise.all(readmes.map(({ path, contents }) => writeFile(path, contents)));
  }
}

async function publish(targets) {
  assert.equal(run('git', ['rev-parse', 'HEAD']), process.env.GITHUB_SHA, 'The checkout does not match the release commit');
  const metadata = await verifyPublishPrerequisites(targets, readReleaseManifest, readRegistry);
  const directory = await mkdtemp(join(tmpdir(), 'viewstem-npm-release-'));
  try {
    const pending = [];
    for (const target of targets) {
      const published = metadata.get(target.name) ?? await readRegistry(target.name);
      const tarball = await pack(target, directory, process.env.GITHUB_REPOSITORY, process.env.GITHUB_SHA);
      if (shouldPublish(target, published, tarball.integrity)) {
        pending.push(tarball);
      } else {
        console.log(`Already published ${target.name}@${target.version} with matching contents`);
      }
    }
    for (const tarball of pending) {
      execFileSync('npm', ['publish', join(directory, tarball.filename),
        '--access', 'public', '--tag', 'latest', '--registry', registry, '--ignore-scripts'], { stdio: 'inherit' });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function createReleases(targets) {
  const { GITHUB_REPOSITORY: repository, GITHUB_SHA: sha } = process.env;
  const releases = JSON.parse(run('gh', ['api', '--paginate', '--slurp', `repos/${repository}/releases`])).flat();
  for (const { directory, name, version } of targets) {
    const tag = `${name}@${version}`;
    const ref = `refs/tags/${tag}`;
    const remote = run('git', ['ls-remote', '--tags', 'origin', ref, `${ref}^{}`]);
    if (remote) {
      const refs = new Map(remote.split('\n').map(line => line.split('\t').reverse()));
      assert.equal(refs.get(`${ref}^{}`) ?? refs.get(ref), sha, `${tag} points to a different commit`);
    } else {
      execFileSync('gh', ['api', '--method', 'POST', `repos/${repository}/git/refs`,
        '-f', `ref=${ref}`, '-f', `sha=${sha}`], { stdio: 'inherit' });
    }
    if (releases.some(release => release.tag_name === tag)) continue;
    const changelog = `https://github.com/${repository}/blob/${sha}/packages/${directory}/CHANGELOG.md`;
    execFileSync('gh', ['release', 'create', tag, '--repo', repository, '--verify-tag',
      '--title', tag, '--notes', `[Package changelog](${changelog})`, '--latest=false'], { stdio: 'inherit' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  if (command === 'plan') await plan();
  else if (command === 'verify-plan') await verifyChangesetsPlan();
  else if (command === 'publish') await publish(JSON.parse(process.env.RELEASE_TARGETS));
  else if (command === 'tag') await createReleases(JSON.parse(process.env.RELEASE_TARGETS));
  else throw new Error(`Unknown release command: ${command}`);
}
