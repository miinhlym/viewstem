import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { activeVersion, isLiveBuild, parseDeploymentTag, readDeployment } from './docs-deploy/docs-production-state.mjs';

const before = 'a'.repeat(40);
const after = 'b'.repeat(40);
const version = '12345678-1234-1234-1234-123456789abc';

test('the production workflow calls the deployment scripts at their repository paths', async () => {
  const workflow = await readFile(new URL('../workflows/docs-deploy.yml', import.meta.url), 'utf8');
  const scripts = new Set(Array.from(workflow.matchAll(/\bnode (\.github\/scripts\/\S+\.mjs)\b/g), match => match[1]));
  assert.deepEqual(scripts, new Set([
    '.github/scripts/docs-deploy/docs-production-state.mjs',
    '.github/scripts/docs-deploy/select-docs-source.mjs',
    '.github/scripts/docs-deploy/verify-published-packages.mjs',
  ]));
  await Promise.all([...scripts].map(path => access(new URL(`../../${path}`, import.meta.url))));
});

test('production docs use one fixed commit and verify the build before uploading', async () => {
  const workflow = await readFile(new URL('../workflows/docs-deploy.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^name: Deploy docs\n/);
  assert.match(workflow, /workflow_dispatch:\n\npermissions:/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
  assert.doesNotMatch(workflow, /id-token:|npm publish/);
  assert.match(workflow, /verify-published-packages\.mjs --availability-only/);
  assert.ok(workflow.indexOf('verify-published-packages.mjs') < workflow.indexOf('build-published.mjs'));
  assert.ok(workflow.indexOf('assert-active') < workflow.indexOf('wrangler deploy'));
  assert.ok(workflow.indexOf('verify-site-previews.mjs') < workflow.indexOf('wrangler deploy'));
});

test('manual deploys on other refs report the default branch and fail', async () => {
  const workflow = await readFile(new URL('../workflows/docs-deploy.yml', import.meta.url), 'utf8');
  const guard = workflow.split('\n  reject-manual-ref:\n')[1].split('\n  release:\n')[0];
  assert.match(guard, /github.event_name == 'workflow_dispatch' &&\n\s+github.ref != format\('refs\/heads\/\{0\}', github.event.repository.default_branch\)/);
  assert.doesNotMatch(guard, /environment:|secrets\./);
  const command = guard.split('run: |\n')[1];
  const result = spawnSync('bash', ['-c', command], { encoding: 'utf8', env: { ...process.env, DEFAULT_BRANCH: 'main' } });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /::error::Run Deploy docs on the default branch \(main\)/);
});

test('GitHub deployment records require an uploaded, live version verified in the current attempt', async () => {
  const workflow = await readFile(new URL('../workflows/docs-deploy.yml', import.meta.url), 'utf8');
  const [release, record] = workflow.split('\n  record-deployment:\n');
  assert.match(workflow, /concurrency:\n  group: docs-production\n  queue: max/);
  assert.match(release, /environment:\n      name: docs-production\n      deployment: false/);
  assert.match(release, /verified_version: \$\{\{ steps\.live\.outputs\.verified_version \}\}/);
  assert.match(release, /verified_attempt: \$\{\{ steps\.live\.outputs\.verified_attempt \}\}/);
  const verification = release.slice(release.indexOf('      - name: Check the production site'));
  assert.match(verification, /if: steps\.source\.outputs\.deploy == 'true'/);
  assert.match(verification, /DOCS_VERSION_ID: \$\{\{ steps\.publish\.outputs\.version_id \}\}/);
  assert.match(verification, /check-live\n\s+printf 'verified_attempt=%s\\nverified_version=%s/);
  assert.match(record, /needs: release\n.*\n\s+if: needs\.release\.outputs\.verified_version != '' && needs\.release\.outputs\.verified_attempt == github\.run_attempt/);
  assert.match(record, /environment:\n      name: docs-production\n      url:/);
});

test('production versions are read from the latest Cloudflare deployment', () => {
  assert.equal(activeVersion([]), '');
  const deploy = (day, versions) => ({ created_on: `2026-10-${day}T00:00:00Z`, versions });
  assert.equal(activeVersion([
    deploy('01', [{ version_id: 'superseded', percentage: 100 }]),
    deploy('02', [{ version_id: version, percentage: 100 }]),
  ]), version);
  assert.throws(() => activeVersion([deploy('02', [{ version_id: version, percentage: 50 }])]), /split/);
});

test('Cloudflare production tags identify the release and document commits', () => {
  assert.deepEqual(parseDeploymentTag(before), { base: before, through: before });
  assert.deepEqual(parseDeploymentTag(`${before}.${after}`), { base: before, through: after });
  assert.throws(() => parseDeploymentTag(), /does not identify/);
  assert.throws(() => parseDeploymentTag(`${before}.${after}.x`), /does not identify/);
});

test('the active production source comes from the currently serving Cloudflare version', async () => {
  const env = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-token' };
  const paths = [];
  let sourceTag = `${before}.${after}`;
  const request = async (url, options) => {
    const [, path] = url.split('/workers/scripts/viewstem');
    assert.equal(options.headers.authorization, 'Bearer test-token');
    paths.push(path);
    const result = path === '/deployments'
      ? { deployments: [{ created_on: '2026-11-23T00:00:00Z', versions: [{ version_id: version, percentage: 100 }] }] }
      : { annotations: { 'workers/tag': sourceTag } };
    return Response.json({ success: true, result });
  };
  assert.deepEqual(await readDeployment(env, request), { id: version, base: before, through: after });
  assert.deepEqual(paths, ['/deployments', `/versions/${version}`]);
  sourceTag = before;
  assert.deepEqual(await readDeployment(env, request), { id: version, base: before, through: before });
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
