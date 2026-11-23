import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
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

export async function isPublicRelease({ registry, name, version }, request = fetch) {
  const provider = registries[registry];
  const options = { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(15000) };
  const response = await request(provider.origin + provider.path(name), options);
  if (response.status === 404 || response.status === 429 || response.status >= 500) return false;
  assert.ok(response.ok, `Could not read ${registry} metadata for ${name}: HTTP ${response.status}`);
  const metadata = await response.json();
  const archive = provider.archive(metadata, version);
  if (!archive) return false;
  assert.equal(provider.latest(metadata), version, `${name}@${version} has been superseded on ${registry}`);
  assert.equal(new URL(archive).origin, provider.origin, `Unexpected archive origin for ${name}`);
  const download = await request(archive, { ...options, method: 'HEAD' });
  if (download.status === 404 || download.status === 429 || download.status >= 500) return false;
  assert.ok(download.ok, `Could not access ${name}@${version} on ${registry}: HTTP ${download.status}`);
  return true;
}

async function main() {
  const releases = parseReleasedPackages(process.env.RELEASED_PACKAGES);
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
    const states = await Promise.all([...pending].map(async ([key, entry]) => [key, await isPublicRelease(entry)]));
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
