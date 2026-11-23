import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeVersion, checkSourceOrder, isLiveBuild } from './docs-production.mjs';

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

test('an existing production source may be retried or advanced, and bootstrap may only retry itself', () => {
  const isAncestor = (older, newer) => older === before && newer === after;
  checkSourceOrder(before, undefined, true, isAncestor);
  checkSourceOrder(before, before, true, isAncestor);
  checkSourceOrder(after, before, false, isAncestor);
  assert.throws(() => checkSourceOrder(before, after, false, isAncestor), /older or unrelated/);
  assert.throws(() => checkSourceOrder(after, before, true, isAncestor), /bootstrap/);
  assert.throws(() => checkSourceOrder(after, '', false, isAncestor), /does not identify/);
});

test('public verification rejects stale artifacts and redirected routes', async () => {
  const marker = { source_sha: after, run_id: '42', run_attempt: '2' };
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
  assert.equal(await isLiveBuild(marker, request({ current: marker, pageStatus: 302 })), false);
  assert.equal(await isLiveBuild(marker, request({ current: marker, pageStatus: 200 })), true);
  assert.ok(paths.includes('/sitemap-index.xml') && paths.includes('/ko/docs/installation/'));
});
