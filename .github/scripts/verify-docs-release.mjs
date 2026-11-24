import assert from 'node:assert/strict';
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

const packageDirectory = name => `packages/${name.slice('@viewstem/'.length)}`;

export function deploymentPackages(releases, manifests, dependencies) {
  const versions = new Map(manifests.map(({ name, version }) => [name, version]));
  for (const { registry, name, version } of releases) {
    if (registry !== 'npm') continue;
    assert.ok(npmPackages.has(name), `Unknown Viewstem npm package: ${name}`);
    assert.equal(versions.get(name), version, `The workflow commit does not contain ${name}@${version}`);
  }
  const runtime = Object.entries(dependencies).filter(([name]) => name.startsWith('@viewstem/'));
  assert.ok(runtime.length, 'The docs app must declare its Viewstem dependencies');
  for (const [name, version] of runtime) {
    assert.ok(npmPackages.has(name), `Unknown documentation dependency: ${name}`);
    assert.equal(version, versions.get(name), `The docs app must pin ${name} to the workflow commit's package version`);
  }
  return parseReleasedPackages(JSON.stringify([...releases, ...manifests.map(({ name, version }) => ({
    registry: 'npm', name, version,
  }))]));
}

async function main() {
  const event = process.env.GITHUB_EVENT_NAME;
  assert.ok(event === 'push' || event === 'workflow_dispatch', 'Unsupported documentation deployment event');
  const manual = event === 'workflow_dispatch';
  const releases = manual ? [] : parseReleasedPackages(process.env.RELEASED_PACKAGES);
  const readManifest = async path => JSON.parse(await readFile(path, 'utf8'));
  const manifests = await Promise.all([...npmPackages].map(async name => {
    const manifest = await readManifest(`${packageDirectory(name)}/package.json`);
    assert.equal(manifest.name, name);
    return manifest;
  }));
  const { dependencies } = await readManifest('apps/docs/package.json');
  const expected = deploymentPackages(releases, manifests, dependencies);
  const pending = new Map(expected.map(entry => [`${entry.registry}:${entry.name}@${entry.version}`, entry]));
  const attempts = process.argv.includes('--once') ? 1 : 18;
  for (let attempt = 0; attempt < attempts && pending.size; attempt++) {
    const states = await Promise.all([...pending].map(async ([key, entry]) => [key, await isPublicRelease(entry, fetch, !manual)]));
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
