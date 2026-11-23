import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicRelease, parseReleasedPackages } from './verify-docs-release.mjs';

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

test('an older release or an unexpected download origin cannot deploy the current site', async () => {
  await assert.rejects(isPublicRelease(npm, async () => npmMetadata('0.1.1')), /superseded/);
  await assert.rejects(isPublicRelease(npm, async () => npmMetadata('0.1.0', 'https://invalid.example/core.tgz')),
    /Unexpected archive origin/);
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
