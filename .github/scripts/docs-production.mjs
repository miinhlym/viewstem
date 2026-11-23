import assert from 'node:assert/strict';
import { appendFile, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const markerPath = '/_viewstem-deploy.json';
const productionOrigin = 'https://viewstem.miinhlym.workers.dev';
const shaPattern = /^[0-9a-f]{40}$/;
const versionPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export function activeVersion(deployments) {
  assert.ok(Array.isArray(deployments), 'Expected Cloudflare deployment history');
  const active = deployments.toSorted((a, b) => b.created_on.localeCompare(a.created_on))[0];
  if (!active) return '';
  assert.ok(active.versions.length === 1 && active.versions[0].percentage === 100,
    'Resolve the split Cloudflare deployment before publishing');
  const version = active.versions[0].version_id;
  assert.match(version, versionPattern, 'Invalid active Cloudflare version ID');
  return version;
}

export function parseDeploymentTag(tag = '') {
  const parts = tag.split('.');
  assert.ok(parts.length <= 2 && parts.every(part => shaPattern.test(part)),
    'The active Cloudflare version does not identify its source commits');
  const [base, through = base] = parts;
  return { base, through };
}

export async function readDeployment(env, request = fetch, includeSource = true) {
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = env;
  assert.match(account ?? '', /^[0-9a-f]{32}$/, 'Set the CLOUDFLARE_ACCOUNT_ID repository variable');
  assert.ok(token, 'Set the CLOUDFLARE_PRODUCTION_API_TOKEN environment secret');
  const worker = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/viewstem`;
  async function read(path) {
    const response = await request(worker + path, {
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000),
    });
    assert.ok(response.ok, `Cloudflare ${path} returned HTTP ${response.status}`);
    const payload = await response.json();
    assert.equal(payload.success, true, `Cloudflare ${path} failed`);
    return payload.result;
  }
  const id = activeVersion((await read('/deployments')).deployments);
  if (!id) return null;
  if (!includeSource) return { id };
  const version = await read(`/versions/${id}`);
  return { id, ...parseDeploymentTag(version.annotations?.['workers/tag']) };
}

function deploymentIdentity() {
  const { DOCS_BASE_SHA: base, DOCS_THROUGH_SHA: through, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: runAttempt } = process.env;
  const { base: sourceSha, through: docsSha } = parseDeploymentTag(`${base}.${through}`);
  assert.match(runId ?? '', /^\d+$/, 'Missing workflow run ID');
  assert.match(runAttempt ?? '', /^\d+$/, 'Missing workflow run attempt');
  return { source_sha: sourceSha, docs_through_sha: docsSha, run_id: runId, run_attempt: runAttempt };
}

export async function isLiveBuild(identity, request = fetch) {
  async function get(path) {
    try {
      return await request(new URL(path, productionOrigin), {
        redirect: 'manual',
        headers: { 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      if (error instanceof TypeError || error.name === 'TimeoutError' || error.name === 'AbortError') return null;
      throw error;
    }
  }

  const markerUrl = `${markerPath}?run=${identity.run_id}&attempt=${identity.run_attempt}`;
  const response = await get(markerUrl);
  if (response?.status !== 200) return false;
  const marker = await response.json().catch(() => null);
  if (!marker || !Object.entries(identity).every(([key, value]) => marker[key] === value)) return false;

  const pages = await Promise.all(['/ko/docs/installation/', '/sitemap-index.xml'].map(get));
  return pages.every(page => page?.status === 200);
}

async function main() {
  const command = process.argv[2];
  if (command === 'read-active') {
    const active = await readDeployment(process.env);
    await appendFile(process.env.GITHUB_OUTPUT, `deployment=${JSON.stringify(active)}\n`);
  } else if (command === 'assert-active') {
    const previous = JSON.parse(process.env.DOCS_ACTIVE);
    const current = await readDeployment(process.env, fetch, false);
    assert.equal(current?.id, previous?.id, 'The active Cloudflare version changed during this build');
  } else if (command === 'stamp') {
    await writeFile(`apps/docs/dist${markerPath}`, JSON.stringify(deploymentIdentity()) + '\n');
  } else if (command === 'check-live') {
    const identity = deploymentIdentity();
    for (let attempt = 1; attempt <= 10; attempt++) {
      if (await isLiveBuild(identity)) {
        console.log(`Verified the public documentation build for ${identity.source_sha}`);
        return;
      }
      if (attempt < 10) await setTimeout(5_000);
    }
    throw new Error('The expected production build is not serving. Check the Cloudflare versions in the job summary.');
  } else {
    throw new Error(`Unknown production deployment command: ${command}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
