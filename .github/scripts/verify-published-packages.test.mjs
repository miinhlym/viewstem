import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentPackages, isPublicRelease, parseReleasedPackages } from './docs-deploy/verify-published-packages.mjs';

const npm = { registry: 'npm', name: '@viewstem/core', version: '0.1.0' };
const dart = { registry: 'pub.dev', name: 'viewstem', version: '0.1.0' };
const npmArchive = 'https://registry.npmjs.org/@viewstem/core/-/core-0.1.0.tgz';

const npmMetadata = (latest, archive = npmArchive) => Response.json({
  'dist-tags': { latest },
  versions: { '0.1.0': { dist: { tarball: archive } } },
});

test('a release batch accepts both registries and rejects conflicting or prerelease versions', () => {
  assert.deepEqual(parseReleasedPackages(JSON.stringify([npm, dart])), [npm, dart]);
  assert.throws(() => parseReleasedPackages('[]'), /at least one/);
  assert.throws(() => parseReleasedPackages(JSON.stringify([npm, { ...npm, version: '0.1.1' }])), /Conflicting/);
  assert.throws(() => parseReleasedPackages(JSON.stringify([{ ...npm, version: '0.1.1-beta.1' }])), /stable/);
});

test('npm metadata is insufficient until the version archive is publicly available', async () => {
  for (const status of [404, 200]) {
    const request = async (url, options) => {
      if (options.method === 'HEAD') {
        assert.equal(url, npmArchive);
        return new Response(null, { status });
      }
      assert.equal(url, 'https://registry.npmjs.org/@viewstem%2fcore');
      return npmMetadata('0.1.0');
    };
    assert.equal(await isPublicRelease(npm, request), status === 200);
  }
});

test('release archives must have the expected registry origin', async () => {
  await assert.rejects(isPublicRelease(npm, async () => npmMetadata('0.1.0', 'https://invalid.example/core.tgz')),
    /Unexpected archive origin/);
});

test('an exact public version remains valid for docs if npm latest advanced', async () => {
  const request = async (_url, options) => options.method === 'HEAD' ? new Response(null) : npmMetadata('0.1.1');
  assert.equal(await isPublicRelease(npm, request), true);
  assert.equal(await isPublicRelease(npm, async () => new Response(null, { status: 404 })), false);
});

test('a Dart release uses pub.dev metadata and checks the public archive', async () => {
  const archive = 'https://pub.dev/api/archives/viewstem-0.1.0.tar.gz';
  const request = async (url, options) => {
    if (options.method === 'HEAD') {
      assert.equal(url, archive);
      return new Response(null, { status: 200 });
    }
    assert.equal(url, 'https://pub.dev/api/packages/viewstem');
    return Response.json({
      latest: { version: '0.1.0' },
      versions: [{ version: '0.1.0', archive_url: archive }],
    });
  };
  assert.equal(await isPublicRelease(dart, request), true);
});

test('transport failures during metadata or archive checks return a retriable result', async () => {
  assert.equal(await isPublicRelease(npm, async () => {
    throw new DOMException('metadata deadline', 'TimeoutError');
  }), false);
  assert.equal(await isPublicRelease(npm, async (_url, options) => {
    if (options.method === 'HEAD') throw new TypeError('connection reset');
    return npmMetadata('0.1.0');
  }), false);
  assert.equal(await isPublicRelease(npm, async () => ({
    ok: true, status: 200, async json() { throw new DOMException('body deadline', 'TimeoutError'); },
  })), false);
  await assert.rejects(isPublicRelease(npm, async () => new Response(null, { status: 403 })), /HTTP 403/);
});

test('the release batch and installed docs pins agree with the checked out manifests', () => {
  const { name, version } = npm;
  const manifests = [{ name, version }];
  const dependencies = { [name]: version, astro: '6.4.8' };
  assert.deepEqual(deploymentPackages([dart], manifests, dependencies), [dart, npm]);
  assert.throws(() => deploymentPackages([{ ...npm, version: '0.1.1' }], manifests, dependencies),
    /workflow commit does not contain/);
  assert.throws(() => deploymentPackages([npm], manifests, { [name]: '0.1.1' }), /must pin/);
  assert.throws(() => deploymentPackages([{ ...npm, name: 'other' }], manifests, dependencies), /Unknown Viewstem npm package/);
});
