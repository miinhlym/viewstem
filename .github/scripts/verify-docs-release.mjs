import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const npmPackages = new Set(['core', 'dom', 'svelte', 'ui'].map(name => `@viewstem/${name}`));
const registries = {
  npm: {
    origin: 'https://registry.npmjs.org',
    name: /^(?:@[a-z\d][a-z\d._-]*\/)?[a-z\d][a-z\d._-]*$/,
    path: name => '/' + name.replace('/', '%2f'),
    latest: metadata => metadata['dist-tags']?.latest,
    archive: (metadata, version) => metadata.versions?.[version]?.dist?.tarball,
  },
  'pub.dev': {
    origin: 'https://pub.dev',
    name: /^[a-z][a-z\d_]*$/,
    path: name => '/api/packages/' + name,
    latest: metadata => metadata.latest?.version,
    archive: (metadata, version) => metadata.versions?.find(entry => entry.version === version)?.archive_url,
  },
};

export function parseReleasedPackages(input) {
  const packages = JSON.parse(input);
  assert.ok(Array.isArray(packages) && packages.length > 0, 'Specify at least one public package release');
  const versions = new Map();
  for (const { registry, name, version } of packages) {
    assert.ok(Object.hasOwn(registries, registry), `Unsupported package registry: ${registry}`);
    assert.ok(typeof name === 'string' && registries[registry].name.test(name), 'Invalid package name');
    assert.ok(typeof version === 'string' && stableVersion.test(version), 'Expected a stable package version');
    const key = `${registry}:${name}`;
    assert.ok(!versions.has(key) || versions.get(key) === version, `Conflicting versions for ${key}`);
    versions.set(key, version);
  }
  return packages;
}

async function readNetwork(read) {
  try {
    return await read();
  } catch (error) {
    // Fetch rejects on transport errors, including failures before an HTTP status exists.
    if (error instanceof TypeError || error.name === 'TimeoutError' || error.name === 'AbortError') return null;
    throw error;
  }
}

function fetchRelease(url, method, request) {
  return readNetwork(() => request(url, {
    method, headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(15_000),
  }));
}

function shouldRetry(response) {
  return !response || response.status === 404 || response.status === 429 || response.status >= 500;
}

export async function isPublicRelease({ registry, name, version }, request = fetch, requireLatest = true) {
  const provider = registries[registry];
  const response = await fetchRelease(provider.origin + provider.path(name), 'GET', request);
  if (shouldRetry(response)) return false;
  assert.ok(response.ok, `Could not read ${registry} metadata for ${name}: HTTP ${response.status}`);
  const metadata = await readNetwork(() => response.json());
  if (!metadata) return false;
  const archive = provider.archive(metadata, version);
  if (!archive) return false;
  if (requireLatest) assert.equal(provider.latest(metadata), version, `${name}@${version} has been superseded on ${registry}`);
  assert.equal(new URL(archive).origin, provider.origin, `Unexpected archive origin for ${name}`);
  const download = await fetchRelease(archive, 'HEAD', request);
  if (shouldRetry(download)) return false;
  assert.ok(download.ok, `Could not access ${name}@${version} on ${registry}: HTTP ${download.status}`);
  return true;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const packageDirectory = name => `packages/${name.slice('@viewstem/'.length)}`;

export function verifyReleaseSource(releases, { sourceSha, bootstrap, resolveTag, archiveMatches, readManifest }) {
  if (bootstrap) {
    assert.ok(releases.length === npmPackages.size && new Set(releases.map(({ name }) => name)).size === npmPackages.size
      && releases.every(({ registry, name, version }) => registry === 'npm' && npmPackages.has(name) && version === '0.1.0'),
    'The bootstrap must specify all four Viewstem npm packages at 0.1.0');
  }

  const commits = releases.map(({ registry, name, version }) => {
    if (registry === 'npm') {
      assert.ok(npmPackages.has(name), `Unknown Viewstem npm package: ${name}`);
      const manifest = readManifest(packageDirectory(name));
      assert.equal(manifest.name, name);
      assert.equal(manifest.version, version, `The source does not contain ${name}@${version}`);
    }
    const tag = `${registry === 'npm' ? '' : 'pub.dev/'}${name}@${version}`;
    return resolveTag(tag);
  });

  if (bootstrap) {
    assert.ok(commits.every(sha => sha === commits[0]), 'The bootstrap package tags must point to the same commit');
    assert.ok(archiveMatches(commits[0], sourceSha), 'The bootstrap source must preserve the 0.1.0 npm package trees');
  } else {
    assert.ok(commits.every(sha => sha === sourceSha), 'Every release tag must identify the selected source commit');
  }
}

async function main() {
  const docsOnly = process.argv.includes('--docs-only');
  const releases = docsOnly ? [] : parseReleasedPackages(process.env.RELEASED_PACKAGES);
  if (process.argv.includes('--verify-source')) {
    verifyReleaseSource(releases, {
      sourceSha: git('rev-parse', 'HEAD'),
      bootstrap: process.env.DOCS_BOOTSTRAP_0_1_0 === 'true',
      resolveTag(tag) {
        try {
          return git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`);
        } catch (error) {
          if (error.status === 128) throw new Error(`Missing release tag ${tag}`, { cause: error });
          throw error;
        }
      },
      readManifest: directory => JSON.parse(readFileSync(`${directory}/package.json`, 'utf8')),
      archiveMatches(published, source) {
        try {
          git('merge-base', '--is-ancestor', published, source);
        } catch (error) {
          if (error.status === 1) return false;
          throw error;
        }
        return !git('diff', '--name-only', published, source, '--', ...[...npmPackages].map(packageDirectory));
      },
    });
  }
  const readManifest = async path => JSON.parse(await readFile(path, 'utf8'));
  const { dependencies } = await readManifest('apps/docs/package.json');
  const svelte = await readManifest('packages/svelte/package.json');
  const docsPackages = Object.entries({ ...dependencies, [svelte.name]: svelte.version })
    .filter(([name]) => name.startsWith('@viewstem/'))
    .map(([name, version]) => ({ registry: 'npm', name, version }));
  const expected = parseReleasedPackages(JSON.stringify([...releases, ...docsPackages]));
  const pending = new Map(expected.map(entry => [`${entry.registry}:${entry.name}@${entry.version}`, entry]));
  const attempts = process.argv.includes('--once') ? 1 : 18;
  for (let attempt = 0; attempt < attempts && pending.size; attempt++) {
    const states = await Promise.all([...pending].map(async ([key, entry]) => [key, await isPublicRelease(entry, fetch, !docsOnly)]));
    for (const [key, published] of states) {
      if (!published) continue;
      console.log(`Public release verified: ${key}`);
      pending.delete(key);
    }
    if (pending.size && attempt + 1 < attempts) await setTimeout(10000);
  }
  assert.equal(pending.size, 0, `Public packages unavailable: ${[...pending.keys()].join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
