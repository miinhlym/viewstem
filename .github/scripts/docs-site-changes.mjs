import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const sitePath = /^apps\/docs\/(?:(?:src|public)\/.+|astro\.config\.mjs|(?:components|tsconfig)\.json)$/;
const automaticPath = /^(apps\/docs\/src\/styles\/.+\.css|apps\/docs\/public\/.+\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?))$/i;
const publishLabel = 'docs:publish';
const holdLabel = 'docs:next-release';
const reservedPath = 'apps/docs/public/_viewstem-deploy.json';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export function classifyPaths(paths) {
  if (!paths.length || !paths.every(path => sitePath.test(path) && path !== reservedPath)) return 'release';
  return paths.every(path => automaticPath.test(path)) ? 'automatic' : 'review';
}

export function mayPublish(classification, events, sha) {
  const labels = new Set();
  for (const event of events) {
    if (event.event === 'merged' && event.commit_id === sha) {
      return !labels.has(holdLabel) &&
        (classification === 'automatic' || (classification === 'review' && labels.has(publishLabel)));
    }
    if (event.event === 'labeled') labels.add(event.label?.name);
    if (event.event === 'unlabeled') labels.delete(event.label?.name);
  }
  return false;
}

const changes = sha => git('diff', '--name-only', '--no-renames', '-z', `${sha}^1`, sha, '--').split('\0').filter(Boolean);
const firstParentRange = (base, through) => git('rev-list', '--first-parent', '--reverse', `${base}..${through}`).trim().split('\n').filter(Boolean);
const firstParentHistory = tip => git('rev-list', '--first-parent', tip).trim().split('\n');

export function hasPublishableSiteChanges(before, through, repository) {
  return eligiblePullRequests(before, through, repository).length > 0;
}

function list(path) {
  return JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', path], { encoding: 'utf8' })).flat();
}

function eligiblePullRequests(base, through, repository) {
  const eligible = [];
  for (const sha of firstParentRange(base, through)) {
    const classification = classifyPaths(changes(sha));
    if (classification === 'release') continue;
    const pulls = list(`repos/${repository}/commits/${sha}/pulls`);
    const pr = pulls.find(pull => pull.merged_at && pull.merge_commit_sha === sha &&
      pull.base?.ref === 'main' && pull.base?.repo?.full_name === repository);
    assert.ok(pr, `No merged main PR is associated with the documentation commit ${sha}`);
    const events = list(`repos/${repository}/issues/${pr.number}/timeline`);
    assert.ok(events.some(event => event.event === 'merged' && event.commit_id === sha),
      `Missing the merge event for PR #${pr.number} at ${sha}`);
    if (mayPublish(classification, events, sha)) eligible.push({ sha, number: pr.number });
  }
  return eligible;
}

function tryApply(patch, args) {
  const result = spawnSync('git', ['apply', '--index', ...args], { input: patch, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) throw new Error(`git apply failed: ${result.stderr}`);
  return result;
}

function applySiteChanges(base, candidates, required = new Set()) {
  git('checkout', '--detach', base);
  const applied = [];
  const deferred = [];
  for (const { sha, number } of candidates) {
    // Recheck at the mutation boundary, including both sides of moved or deleted paths.
    assert.notEqual(classifyPaths(changes(sha)), 'release', `PR #${number} contains changes outside the site`);
    const patch = git('diff', '--binary', '--full-index', '--no-renames', '--no-ext-diff', '--no-textconv', `${sha}^1`, sha, '--');
    const check = tryApply(patch, ['--check']);
    if (check.status === 0) {
      assert.equal(tryApply(patch, []).status, 0, `Could not apply the checked patch for PR #${number}`);
      applied.push(sha);
    } else if (tryApply(patch, ['--reverse', '--check']).status === 0) {
      applied.push(sha);
    } else {
      assert.ok(!required.has(sha), `The new package release conflicts with already published docs PR #${number}`);
      deferred.push(number);
    }
  }
  return { applied, deferred };
}

export function planBuild(mode, source, active, isAncestor, bootstrap = false) {
  if (mode === 'refresh') {
    if (!active || (source !== active.through && isAncestor(source, active.through))) return null;
    assert.ok(isAncestor(active.through, source), 'The documentation change is outside the active main history');
    return { base: active.base, through: source };
  }
  assert.equal(mode, 'release');
  if (!active) return { base: source, through: source };
  assert.ok(!bootstrap || source === active.base, 'The bootstrap can only retry its original source');
  assert.ok(isAncestor(active.base, source), 'The package release would replace a newer or unrelated release');
  if (isAncestor(active.through, source)) return { base: source, through: source };
  assert.ok(isAncestor(source, active.through), 'The package release is outside the active main history');
  return { base: source, through: active.through };
}

export async function prepare(env) {
  const { DOCS_MODE, DOCS_SOURCE_SHA, DOCS_BOOTSTRAP_0_1_0, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_OUTPUT } = env;
  const active = JSON.parse(env.DOCS_ACTIVE);
  const main = firstParentHistory('refs/remotes/origin/main');
  const order = new Map(main.map((sha, index) => [sha, index]));
  const isAncestor = (older, newer) => order.has(older) && order.has(newer) && order.get(older) >= order.get(newer);
  assert.ok(isAncestor(DOCS_SOURCE_SHA, GITHUB_SHA), 'The requested source must be on the tested main history');
  if (active) assert.ok(isAncestor(active.base, active.through), 'The active deployment must be on main');
  const build = planBuild(DOCS_MODE, DOCS_SOURCE_SHA, active, isAncestor, DOCS_BOOTSTRAP_0_1_0 === 'true');
  if (!build) {
    console.log('No active baseline or a newer documentation commit is already in production.');
    return;
  }

  const candidates = eligiblePullRequests(build.base, build.through, GITHUB_REPOSITORY);
  assert.equal(git('status', '--porcelain', '--untracked-files=no').trim(), '', 'The production build needs a clean checkout');
  const required = new Set();
  if (active && build.base !== active.base && candidates.length) {
    // A release must preserve every separately published patch newer than its own commit.
    const previous = eligiblePullRequests(active.base, active.through, GITHUB_REPOSITORY);
    for (const sha of applySiteChanges(active.base, previous).applied) required.add(sha);
    git('restore', '--source=HEAD', '--staged', '--worktree', '--', 'apps/docs');
  }
  const { applied, deferred } = applySiteChanges(build.base, candidates, required);
  for (const number of deferred) console.log(`::warning::Docs PR #${number} needs a change that is not in the published baseline. It will be included with its release.`);
  const retry = DOCS_MODE === 'refresh' && active.through === build.through;
  if (DOCS_MODE === 'refresh' && !(retry ? applied.length : applied.some(sha => isAncestor(active.through, sha)))) {
    console.log('No newly applicable documentation changes were approved for the public packages.');
    return;
  }
  await appendFile(GITHUB_OUTPUT, `deploy=true\nbase=${build.base}\nthrough=${build.through}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await prepare(process.env);
