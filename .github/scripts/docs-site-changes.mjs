import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const shaPattern = /^[a-f0-9]{40}$/;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const waitForRelease = 'Wait for the next package release and retry its documentation deployment.';
// Deployment machinery and its maintainer guides do not change the shipped packages.
const deploymentPaths = /^(?:\.github\/(?:workflows\/(?:core|docs-release|npm-release)\.yml|scripts\/(?:docs-preview|docs-production|docs-site-changes|npm-release|verify-docs-release)(?:\.test)?\.mjs)|docs\/(?:ci(?:\.ko)?\.md|VIEWSTEM-SPEC\.md|history\/decision-register\.md))$/;

export async function selectSource(env) {
  const { GITHUB_EVENT_NAME: event, GITHUB_SHA: sha, DOCS_DEFAULT_BRANCH: branch, GITHUB_OUTPUT: output } = env;
  const active = JSON.parse(env.DOCS_ACTIVE);
  assert.ok(event === 'push' || event === 'workflow_dispatch', 'Unsupported documentation deployment event');
  assert.match(sha ?? '', shaPattern, 'Expected the fixed workflow commit SHA');
  assert.equal(git('rev-parse', 'HEAD').trim(), sha, 'The checkout does not match the workflow commit');
  assert.equal(git('status', '--porcelain', '--untracked-files=no').trim(), '', 'Expected a clean source checkout');
  assert.ok(branch, 'The repository default branch is required');
  const history = git('rev-list', '--first-parent', `refs/remotes/origin/${branch}`).trim().split('\n');
  const order = new Map(history.map((commit, index) => [commit, index]));
  assert.ok(order.has(sha), 'The workflow commit must be on the default branch');
  if (active) {
    assert.ok(order.has(active.base) && order.has(active.through) && order.get(active.base) >= order.get(active.through),
      `Cannot establish the active production source on the default branch. ${waitForRelease}`);
    if (order.get(sha) > order.get(active.through)) {
      console.log('A newer documentation commit is already in production. Skipping this deployment.');
      return;
    }
  }

  let base = sha;
  if (event === 'workflow_dispatch') {
    assert.ok(active, `No verified package release baseline is available. ${waitForRelease}`);
    base = active.base;
    // Inspect every first-parent change, including both sides of renames and changes later
    // reverted. A current patch or an unchanged version field cannot prove safety.
    const paths = git('log', '--first-parent', '--diff-merges=first-parent', '--name-only',
      '--no-renames', '-z', '--format=', `${base}..${sha}`, '--').split('\0').filter(Boolean);
    const unexpected = [...new Set(paths.filter(path => !path.startsWith('apps/docs/') && !deploymentPaths.test(path)))];
    assert.equal(unexpected.length, 0,
      `Cannot prove that this commit contains only safe documentation changes since ${base}. ${waitForRelease}\n${unexpected.slice(0, 12).map(path => JSON.stringify(path)).join('\n')}`);
  }

  await appendFile(output, `deploy=true\nbase=${base}\nthrough=${sha}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await selectSource(process.env);
