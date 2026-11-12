import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const registry = 'https://registry.npmjs.org';
const packages = ['core', 'svelte', 'ui'];
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();

export function isReleasePullRequest(pr, repository, sha) {
  return pr.merged_at && pr.merge_commit_sha === sha
    && pr.user.login === 'github-actions[bot]'
    && pr.base.ref === 'main' && pr.base.repo.full_name === repository
    && pr.head.ref === 'changeset-release/main' && pr.head.repo?.full_name === repository;
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
    assert.equal(previous.name, `@viewstem/${directory}`);
    assert.equal(current.name, previous.name);
    assert.ok(!current.private, `${current.name} must be public`);
    if (current.version === previous.version) return [];
    assert.equal(compareVersions(current.version, previous.version), 1,
      `Invalid version bump for ${current.name}`);
    return [{ directory, name: current.name, version: current.version }];
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

async function readRegistry(name) {
  const response = await fetch(`${registry}/${encodeURIComponent(name)}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) {
    throw new Error(`${name} is missing on npm. Complete the initial 2FA publish and Trusted Publisher setup first.`);
  }
  if (!response.ok) throw new Error(`Could not read ${name} from npm (HTTP ${response.status})`);
  return response.json();
}

async function plan() {
  const { GITHUB_REPOSITORY: repository, GITHUB_SHA: sha, BEFORE_SHA: before } = process.env;
  const pages = JSON.parse(run('gh', ['api', '--paginate', '--slurp',
    `repos/${repository}/commits/${sha}/pulls`]));
  const release = pages.flat().find(pr => isReleasePullRequest(pr, repository, sha));
  const targets = release ? releaseTargets((directory, previous) =>
    JSON.parse(run('git', ['show', `${previous ? before : sha}:packages/${directory}/package.json`]))) : [];
  if (release) assert.ok(targets.length, 'Release PR must bump at least one public package');
  await appendFile(process.env.GITHUB_OUTPUT, `targets=${JSON.stringify(targets)}\n`);
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
  const directory = await mkdtemp(join(tmpdir(), 'viewstem-npm-release-'));
  try {
    const pending = [];
    for (const target of targets) {
      const metadata = await readRegistry(target.name);
      const tarball = await pack(target, directory, process.env.GITHUB_REPOSITORY, process.env.GITHUB_SHA);
      if (shouldPublish(target, metadata, tarball.integrity)) {
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

async function packInitialRelease(output) {
  assert.ok(output, 'Pass a directory for the release tarballs');
  assert.equal(run('git', ['status', '--porcelain']), '', 'Pack the initial release from a clean checkout');
  const destination = resolve(output);
  const sha = run('git', ['rev-parse', 'HEAD']);
  await mkdir(destination, { recursive: true });
  for (const directory of packages) {
    const { name, version } = JSON.parse(await readFile(`packages/${directory}/package.json`, 'utf8'));
    const tarball = await pack({ directory, name, version }, destination, 'miinhlym/viewstem', sha);
    console.log(join(destination, tarball.filename));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  if (command === 'pack-initial') await packInitialRelease(process.argv[3]);
  else if (command === 'plan') await plan();
  else if (command === 'publish') await publish(JSON.parse(process.env.RELEASE_TARGETS));
  else if (command === 'tag') await createReleases(JSON.parse(process.env.RELEASE_TARGETS));
  else throw new Error(`Unknown release command: ${command}`);
}
