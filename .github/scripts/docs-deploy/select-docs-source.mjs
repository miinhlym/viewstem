import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const shaPattern = /^[a-f0-9]{40}$/;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const waitForRelease = 'Wait for the next package release and retry its documentation deployment.';
const historicalDocs = /^(?:docs\/(?:designs|handoff|history)\/|(?:concepts_brief|design_draft)\.md$)/;
// These exact maintenance paths do not change the shipped packages.
const deploymentPaths = new Set([
  '.github/workflows/ci.yml',
  '.github/workflows/docs-preview.yml',
  '.github/workflows/docs-deploy.yml',
  '.github/workflows/npm-release.yml',
  '.github/scripts/docs-preview.mjs',
  '.github/scripts/docs-preview.test.mjs',
  '.github/scripts/docs-production-state.test.mjs',
  '.github/scripts/npm-release.mjs',
  '.github/scripts/npm-release.test.mjs',
  '.github/scripts/select-docs-source.test.mjs',
  '.github/scripts/verify-published-packages.test.mjs',
  '.github/scripts/docs-deploy/docs-production-state.mjs',
  '.github/scripts/docs-deploy/select-docs-source.mjs',
  '.github/scripts/docs-deploy/verify-published-packages.mjs',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/pull_request_template.md',
  '.changeset/README.md',
  'AGENTS.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'README.md',
  'README.ko.md',
  'SECURITY.md',
  'SUPPORT.md',
  'docs/README.md',
  'docs/README.ko.md',
  'docs/acceptance.md',
  'docs/architecture.md',
  'docs/ci.md',
  'docs/core-acceptance-coverage.json',
  'docs/core-cel.md',
  'docs/decisions.md',
  'docs/follow-up.md',
  'docs/designs/viewstem-resource-sets-implementation-2026-11-16.md',
  'docs/handoff/acceptance-matrix.md',
  'docs/handoff/implementation-start.md',
  'docs/handoff/open-contracts.md',
  'docs/handoff/public-api-naming-2026-11-02.md',
  'docs/spec/01-datasource-auth.md',
  'docs/spec/02-query.md',
  'docs/spec/03-variable-type.md',
  'docs/spec/04-action.md',
  'docs/spec/05-component-view.md',
  'docs/spec/06-composition-examples.md',
  'docs/spec/07-host-integration.md',
  'docs/spec/08-readiness-conformance.md',
  'docs/spec/09-preserved-contracts.md',
  'docs/spec/09-state-store-and-url.md',
  'docs/spec/10-value-contracts.md',
  'docs/spec/11-optional-charts.md',
  'docs/spec/12-resource-sets-browser.md',
  'docs/releasing.md',
  'docs/verification.md',
  'docs/VIEWSTEM-SPEC.md',
  'docs/history/decision-register.md',
  'experiments/t1-cel-patch/README.md',
  'experiments/t1-values/README.md',
  'experiments/t2-composite-query/README.md',
  'experiments/t2-http-boundary/README.md',
  'experiments/t2-query-http/README.md',
  'experiments/t2-query-polling/README.md',
  'experiments/t2-query-races/README.md',
  'experiments/t2-url-races/README.md',
  'experiments/t3-application/README.md',
  'experiments/t4-charts/README.md',
  'experiments/verification/README.md',
  'skills/README.md',
  // The active release can predate moves and removals of maintenance files.
  '.github/workflows/core.yml',
  '.github/workflows/docs-release.yml',
  '.github/scripts/docs-production.mjs',
  '.github/scripts/docs-production.test.mjs',
  '.github/scripts/docs-site-changes.mjs',
  '.github/scripts/docs-site-changes.test.mjs',
  '.github/scripts/verify-docs-release.mjs',
  '.github/scripts/verify-docs-release.test.mjs',
  'CODE_OF_CONDUCT.ko.md',
  'CONTRIBUTING.ko.md',
  'SECURITY.ko.md',
  'SUPPORT.ko.md',
  'docs/ci.ko.md',
]);

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
    const changedPaths = (...options) => git('log', '--first-parent', '--diff-merges=first-parent', '--name-only',
      '--no-renames', '-z', '--format=', ...options, `${base}..${sha}`, '--').split('\0').filter(Boolean);
    const paths = [...new Set(changedPaths())].filter(path => !path.startsWith('apps/docs/') && !deploymentPaths.has(path));
    // A historical path can be removed, but edits or additions still need an explicit review.
    const edited = paths.some(path => historicalDocs.test(path)) ? new Set(changedPaths('--diff-filter=d')) : new Set();
    const unexpected = paths.filter(path => !historicalDocs.test(path) || edited.has(path));
    assert.equal(unexpected.length, 0,
      `Cannot prove that this commit contains only safe documentation changes since ${base}. ${waitForRelease}\n${unexpected.slice(0, 12).map(path => JSON.stringify(path)).join('\n')}`);
  }

  await appendFile(output, `deploy=true\nbase=${base}\nthrough=${sha}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await selectSource(process.env);
