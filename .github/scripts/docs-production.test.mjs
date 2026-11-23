import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeVersion, isLiveBuild, parseDeploymentTag, readDeployment } from './docs-production.mjs';

const before = 'a'.repeat(40);
const after = 'b'.repeat(40);
const version = '12345678-1234-1234-1234-123456789abc';

test('production versions are read from the latest Cloudflare deployment', () => {
  assert.equal(activeVersion([]), '');
  const deploy = (day, versions) => ({ created_on: `2026-10-${day}T00:00:00Z`, versions });
  assert.equal(activeVersion([
    deploy('01', [{ version_id: 'superseded', percentage: 100 }]),
    deploy('02', [{ version_id: version, percentage: 100 }]),
  ]), version);
  assert.throws(() => activeVersion([deploy('02', [{ version_id: version, percentage: 50 }])]), /split/);
});

test('Cloudflare production tags identify the release and document commits, including legacy tags', () => {
  assert.deepEqual(parseDeploymentTag(before), { base: before, through: before });
  assert.deepEqual(parseDeploymentTag(`${before}.${after}`), { base: before, through: after });
  assert.throws(() => parseDeploymentTag(), /does not identify/);
  assert.throws(() => parseDeploymentTag(`${before}.${after}.x`), /does not identify/);
});

test('the active production source comes from the currently serving Cloudflare version', async () => {
  const env = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-token' };
  const paths = [];
  const request = async (url, options) => {
    const [, path] = url.split('/workers/scripts/viewstem');
    assert.equal(options.headers.authorization, 'Bearer test-token');
    paths.push(path);
    const result = path === '/deployments'
      ? { deployments: [{ created_on: '2026-11-23T00:00:00Z', versions: [{ version_id: version, percentage: 100 }] }] }
      : { annotations: { 'workers/tag': `${before}.${after}` } };
    return Response.json({ success: true, result });
  };
  assert.deepEqual(await readDeployment(env, request), { id: version, base: before, through: after });
  assert.deepEqual(paths, ['/deployments', `/versions/${version}`]);
  assert.deepEqual(await readDeployment(env, request, false), { id: version });
  assert.equal(await readDeployment(env, async () => Response.json({ success: true, result: { deployments: [] } })), null);
  await assert.rejects(readDeployment(env, async () => new Response(null, { status: 403 })), /HTTP 403/);
});

test('public verification rejects stale artifacts and redirected routes', async () => {
  const marker = { source_sha: before, docs_through_sha: after, run_id: '42', run_attempt: '2' };
  const paths = [];
  const request = ({ current, pageStatus }) => async (url, options) => {
    paths.push(url.pathname);
    assert.equal(options.redirect, 'manual');
    if (url.pathname === '/_viewstem-deploy.json') {
      assert.equal(url.searchParams.get('attempt'), '2');
      return Response.json(current);
    }
    return new Response(null, { status: pageStatus });
  };
  assert.equal(await isLiveBuild(marker, request({ current: { ...marker, run_attempt: '1' }, pageStatus: 200 })), false);
  assert.deepEqual(paths, ['/_viewstem-deploy.json']);
  assert.equal(await isLiveBuild(marker, request({ current: { ...marker, docs_through_sha: before }, pageStatus: 200 })), false);
  assert.equal(await isLiveBuild(marker, request({ current: marker, pageStatus: 302 })), false);
  assert.equal(await isLiveBuild(marker, request({ current: marker, pageStatus: 200 })), true);
  assert.ok(paths.includes('/sitemap-index.xml') && paths.includes('/ko/docs/installation/'));
});
