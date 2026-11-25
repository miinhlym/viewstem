import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const publicReleaseWaitMs = 10 * 60_000;
const retryIntervalMs = 10_000;
const npmPackages = new Set(['core', 'dom', 'svelte', 'ui'].map(name => `@viewstem/${name}`));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const registries = {
  npm: {
    origin: 'https://registry.npmjs.org',
    name: /^(?:@[a-z\d][a-z\d._-]*\/)?[a-z\d][a-z\d._-]*$/,
    path: name => '/' + name.replace('/', '%2f'),
    archive: (metadata, version) => metadata.versions?.[version]?.dist?.tarball,
  },
  'pub.dev': {
    origin: 'https://pub.dev',
    name: /^[a-z][a-z\d_]*$/,
    path: name => '/api/packages/' + name,
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

async function readNetwork(read, stage, reportPending) {
  try {
    return await read();
  } catch (error) {
    // Fetch rejects on transport errors, including failures before an HTTP status exists.
    if (!(error instanceof TypeError) && error.name !== 'TimeoutError' && error.name !== 'AbortError') throw error;
    reportPending(`${stage}: ${error.cause?.code ?? error.name}`);
    return null;
  }
}

async function fetchRelease(url, method, stage, { request, signal, reportPending }) {
  const requestTimeout = AbortSignal.timeout(15_000);
  const response = await readNetwork(() => request(url, {
    method,
    headers: { 'cache-control': 'no-cache' },
    signal: signal ? AbortSignal.any([signal, requestTimeout]) : requestTimeout,
  }), stage, reportPending);
  if (!response) return;
  const { status } = response;
  if (status === 404 || status === 429 || status >= 500) {
    reportPending(`${stage}: HTTP ${status}`);
    return;
  }
  assert.ok(response.ok, `${stage}: HTTP ${status}`);
  return response;
}

async function publicArchive({ registry, name, version }, options) {
  const provider = registries[registry];
  const stage = `Registry metadata for ${name}`;
  const response = await fetchRelease(provider.origin + provider.path(name), 'GET', stage, options);
  if (!response) return;
  const metadata = await readNetwork(() => response.json(), stage, options.reportPending);
  if (!metadata) return;
  const archive = provider.archive(metadata, version);
  if (!archive) {
    options.reportPending(`${stage}: no archive listed for ${version}`);
    return;
  }
  assert.equal(new URL(archive).origin, provider.origin, `Unexpected archive origin for ${name}`);
  return archive;
}

export async function isPublicRelease(pkg, request = fetch, source, { signal, reportPending = () => {} } = {}) {
  const options = { request, signal, reportPending };
  const archive = await publicArchive(pkg, options);
  if (!archive) return false;
  if (source && pkg.registry === 'npm') return verifyNpmSource(pkg, archive, source, options);
  return Boolean(await fetchRelease(archive, 'HEAD', `Archive availability for ${pkg.name}@${pkg.version}`, options));
}

async function verifyNpmSource({ name, version }, archive, { sha, repository, released, history }, options) {
  const stage = `Archive download for ${name}@${version}`;
  const response = await fetchRelease(archive, 'GET', stage, options);
  if (!response) return false;
  const body = await readNetwork(() => response.arrayBuffer(), stage, options.reportPending);
  if (!body) return false;
  const readme = execFileSync('tar', ['-xOzf', '-', 'package/README.md'], {
    input: Buffer.from(body), encoding: 'utf8', timeout: 15_000,
  });
  // pack() appends an immutable link to the exact checkout used for the tarball.
  const prefix = `[Source and documentation for this version](https://github.com/${repository}/blob/`;
  const suffix = '/docs/README.md)';
  const link = readme.trimEnd().split('\n').at(-1);
  assert.ok(link?.startsWith(prefix) && link.endsWith(suffix), `Missing release source link for ${name}@${version}`);
  const publishedSha = link.slice(prefix.length, -suffix.length);
  assert.ok(history.has(publishedSha), `The public source for ${name}@${version} is outside the candidate history`);
  if (released.has(name)) assert.equal(publishedSha, sha, `${name}@${version} was not published from the release commit`);
  const path = packageDirectory(name);
  assert.equal(git('rev-parse', `${publishedSha}:${path}`), git('rev-parse', `${sha}:${path}`),
    `${name}@${version} has unpublished changes. Wait for the affected package to be released before deploying docs.`);
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

export async function waitForPublicReleases(packages, {
  source, once = false, request = fetch, now = () => performance.now(), wait = setTimeout, log = console.log,
} = {}) {
  const pending = new Map(packages.map(pkg => [`${pkg.registry}:${pkg.name}@${pkg.version}`, { pkg, reason: '' }]));
  const deadline = now() + publicReleaseWaitMs;
  const signal = AbortSignal.timeout(publicReleaseWaitMs);
  while (pending.size && now() < deadline) {
    await Promise.all([...pending].map(async ([key, entry]) => {
      const published = await isPublicRelease(entry.pkg, request, source, {
        signal,
        reportPending(reason) {
          if (entry.reason !== reason) log(`Waiting for ${key}: ${reason}`);
          entry.reason = reason;
        },
      });
      if (published) {
        log(`Public release verified: ${key}`);
        pending.delete(key);
      }
    }));
    const remaining = deadline - now();
    if (once || !pending.size || remaining <= 0) break;
    await wait(Math.min(retryIntervalMs, remaining));
  }
  const unavailable = [...pending].map(([key, { reason }]) => `${key} (${reason})`);
  assert.equal(pending.size, 0, `Public packages unavailable: ${unavailable.join(', ')}`);
}

async function main() {
  const { GITHUB_EVENT_NAME: event, GITHUB_SHA: sha, GITHUB_REPOSITORY: repository } = process.env;
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
  assert.equal(git('rev-parse', 'HEAD'), sha, 'The checkout does not match the documentation commit');
  const directories = git('ls-tree', '-d', '--name-only', `${sha}:packages`).split('\n');
  assert.deepEqual(directories.sort(), [...npmPackages].map(name => name.split('/')[1]).sort(),
    'Set up published source verification for the current package directories before deploying docs');
  const availabilityOnly = process.argv.includes('--availability-only');
  // The first pass checks source in the downloaded archives. The last pass
  // only rechecks availability because immutable versions were already verified.
  const source = availabilityOnly ? undefined : {
    sha, repository, released: new Set(releases.filter(pkg => pkg.registry === 'npm').map(pkg => pkg.name)),
    history: new Set(git('rev-list', '--first-parent', sha).split('\n')),
  };
  await waitForPublicReleases(expected, { source, once: availabilityOnly || process.argv.includes('--once') });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
