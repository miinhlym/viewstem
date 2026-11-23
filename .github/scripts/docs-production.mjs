import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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

export function checkSourceOrder(source, current, bootstrap, isAncestor) {
  assert.match(source, shaPattern, 'Invalid documentation source SHA');
  if (current === undefined) return;
  assert.match(current, shaPattern, 'The active Cloudflare version does not identify its source SHA');
  if (source === current) return;
  assert.ok(!bootstrap, 'The 0.1.0 bootstrap can only retry the initial source commit after deployment');
  assert.ok(isAncestor(current, source), `Refusing to replace ${current} with older or unrelated source ${source}`);
}

function deploymentIdentity() {
  const { DOCS_SOURCE_SHA: sourceSha, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: runAttempt } = process.env;
  assert.match(sourceSha ?? '', shaPattern, 'Invalid documentation source SHA');
  assert.match(runId ?? '', /^\d+$/, 'Missing workflow run ID');
  assert.match(runAttempt ?? '', /^\d+$/, 'Missing workflow run attempt');
  return { source_sha: sourceSha, run_id: runId, run_attempt: runAttempt };
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

function isAncestor(current, source) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', current, source], { stdio: 'inherit' });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw result.error ?? new Error('Could not compare the active and candidate source commits');
}

async function main() {
  const command = process.argv[2];
  if (command === 'active-version') {
    console.log(activeVersion(JSON.parse(readFileSync(0, 'utf8'))));
  } else if (command === 'check-order') {
    const current = process.argv.includes('--first-deployment') ? undefined : process.env.ACTIVE_SOURCE_SHA ?? '';
    checkSourceOrder(process.env.DOCS_SOURCE_SHA, current, process.env.DOCS_BOOTSTRAP_0_1_0 === 'true', isAncestor);
  } else if (command === 'stamp') {
    writeFileSync(`apps/docs/dist${markerPath}`, JSON.stringify(deploymentIdentity()) + '\n');
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
