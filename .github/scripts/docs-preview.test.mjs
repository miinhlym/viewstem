import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { artifactIdentity, desiredAction, legacyDeployment, ownsDeployment, reconcile, runWrangler, verifyPublic } from './docs-preview.mjs';

const sha = 'a'.repeat(40);
const repository = 'miinhlym/viewstem';
const url = 'https://pr-6-viewstem-preview.miinhlym.workers.dev';
const env = { GH_TOKEN: 'github-test', CLOUDFLARE_ACCOUNT_ID: 'account-test', CLOUDFLARE_API_TOKEN: 'cf-test',
  GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
  RUNNER_TEMP: '/tmp', PREVIEW_WORKER: 'viewstem-preview' };
const pr = (changes = {}) => ({ number: 6, state: 'open', base: { ref: 'main' },
  head: { sha, repo: { full_name: repository } }, ...changes });
const event = { pull_request: pr() };

function harness({ live = pr(), guardStates = [], deployments = [], statuses = {}, publicError, deletion = { success: true } } = {}) {
  const calls = [];
  let reads = 0;
  const options = {
    api: {
      async request(path, body, method) {
        if (path === '/pulls/6') { calls.push('guard'); return guardStates[reads++] || live; }
        calls.push({ path, body, method });
        if (path === '/deployments') return { id: 101 };
        if (path.endsWith('/statuses?per_page=1')) return statuses[path.split('/')[2]] || [];
        return {};
      },
      async list(path) { calls.push({ list: path }); return path.startsWith('/deployments') ? deployments : [
        { id: 11, user: { login: 'github-actions[bot]' }, body: '<!-- docs-preview-deployment -->\nold' },
      ]; },
    },
    async fetchImpl(_url, init) {
      calls.push(init.method === 'DELETE' ? 'delete' : 'scope');
      return init.method === 'DELETE' ? { ok: true, status: 200, json: async () => deletion } : { status: 403 };
    },
    async publish() { calls.push('publish'); },
    async writeArtifact(identity) { calls.push({ artifact: identity }); },
    async readOutput() { return JSON.stringify({ type: 'preview', preview_urls: [`${url}/`] }); },
    async verify(_fetch, _url, identity, removed) {
      calls.push({ verified: removed ? 'removed' : identity });
      if (publicError) throw new Error(publicError);
    },
  };
  return { calls, options };
}
const writes = (calls) => calls.filter((call) => call?.body);

test('live PR state decides close/merge, reopen, retarget in/out, and stale head behavior', () => {
  assert.equal(desiredAction(pr(), repository, sha), 'deploy');
  assert.equal(desiredAction(pr({ state: 'closed', merged: true }), repository, sha), 'cleanup');
  assert.equal(desiredAction(pr({ state: 'closed' }), repository, sha), 'cleanup');
  assert.equal(desiredAction(pr({ base: { ref: 'release' } }), repository, sha), 'cleanup');
  assert.equal(desiredAction(pr({ head: { sha: 'b'.repeat(40), repo: { full_name: repository } } }), repository, sha), 'skip');
  assert.equal(desiredAction(pr({ head: { sha, repo: { full_name: 'fork/viewstem' } } }), repository, sha), 'skip');
});

test('selective retries of old deploy and cleanup jobs cannot mutate Cloudflare', async () => {
  for (const [mode, live] of [['deploy', pr({ state: 'closed' })], ['deploy', pr({ base: { ref: 'release' } })],
    ['cleanup', pr()], ['deploy', pr({ head: { sha: 'b'.repeat(40), repo: { full_name: repository } } })]]) {
    const { calls, options } = harness({ live });
    assert.equal(await reconcile(mode, env, event, options), 'skip');
    assert.deepEqual(calls, ['guard']);
  }
});

test('PR changes during build preparation are rechecked directly before publish', async () => {
  const { calls, options } = harness({ guardStates: [pr(), pr({ state: 'closed' })] });
  assert.equal(await reconcile('deploy', env, event, options), 'skip');
  assert.equal(calls.includes('publish'), false);
  assert.deepEqual(writes(calls), []);
});

test('cleanup checks the live PR again directly before DELETE', async () => {
  const closed = pr({ state: 'closed' });
  const { calls, options } = harness({ live: pr(), guardStates: [closed, pr()] });
  assert.equal(await reconcile('cleanup', env, event, options), 'skip');
  assert.equal(calls.includes('delete'), false);
});

test('ready history and comment follow public artifact verification, without cross-PR inactivation', async () => {
  const { calls, options } = harness({ deployments: [
    { id: 1, task: 'docs-preview-pr-6', environment: 'docs-preview', payload: { pull_request: 6 } },
    { id: 2, task: 'docs-preview-pr-60', environment: 'docs-preview', payload: { pull_request: 60 } },
  ], statuses: { 1: [{ state: 'success' }], 2: [{ state: 'success' }] } });
  assert.equal(await reconcile('ready', env, event, options), 'deploy');
  const mutations = writes(calls);
  assert.equal(mutations[0].body.transient_environment, true);
  assert.equal(mutations[0].body.task, 'docs-preview-pr-6');
  assert.deepEqual(mutations[0].body.payload, { pull_request: 6, ...artifactIdentity(env, event), preview_url: url });
  assert.deepEqual(mutations.filter((call) => call.body.state).map((call) => [call.path, call.body.state, call.body.auto_inactive]), [
    ['/deployments/101/statuses', 'success', false], ['/deployments/1/statuses', 'inactive', false],
  ]);
  assert.ok(calls.findIndex((call) => call?.verified) < calls.indexOf(mutations[0]));
  assert.match(mutations.at(-1).body.body, /Viewstem preview ready/);
});

test('cleanup covers retarget-away and updates only owned native or explicit deployment records', async () => {
  const { calls, options } = harness({ live: pr({ base: { ref: 'release' } }), deployments: [
    { id: 1, task: 'deploy', environment: 'docs-preview' },
    { id: 2, task: 'deploy', environment: 'docs-preview' },
    { id: 3, task: 'docs-preview-pr-6', environment: 'docs-preview', payload: { pull_request: 6 } },
    { id: 4, task: 'docs-preview-pr-6', environment: 'docs-preview', payload: { pull_request: 6 } },
  ], statuses: { 1: [{ state: 'success', environment_url: `${url}/` }],
    2: [{ state: 'success', environment_url: url.replace('pr-6-', 'pr-60-') }], 3: [{ state: 'inactive' }] } });
  assert.equal(await reconcile('cleanup', env, event, options), 'cleanup');
  assert.deepEqual(writes(calls), []);
  assert.equal(await reconcile('removed', env, event, options), 'cleanup');
  assert.deepEqual(writes(calls).map((call) => call.path), ['/deployments/1/statuses', '/deployments/4/statuses', '/issues/comments/11']);
  assert.ok(calls.indexOf('delete') < calls.findIndex((call) => call?.verified === 'removed'));
  assert.match(writes(calls).at(-1).body.body, /preview removed/);
});

test('a still-serving alias prevents cleanup status and comment updates even after successful DELETE', async () => {
  const { calls, options } = harness({ live: pr({ state: 'closed' }), publicError: 'still serving' });
  await assert.rejects(reconcile('cleanup', env, event, options), /still serving/);
  assert.ok(calls.includes('delete'));
  assert.deepEqual(writes(calls), []);
});

test('Cloudflare already-absent response still requires public removal verification', async () => {
  const { calls, options } = harness({ live: pr({ state: 'closed' }), deletion: { success: false, errors: [{ code: 10025 }] } });
  assert.equal(await reconcile('cleanup', env, event, options), 'cleanup');
  assert.equal(calls.filter((call) => call?.verified === 'removed').length, 1);
});

test('PR closed during upload cannot publish ready GitHub metadata', async () => {
  const { calls, options } = harness({ guardStates: [pr(), pr(), pr({ state: 'closed' })] });
  assert.equal(await reconcile('deploy', env, event, options), 'deploy');
  assert.equal(await reconcile('ready', env, event, options), 'skip');
  assert.ok(calls.includes('publish'));
  assert.deepEqual(writes(calls), []);
});

test('a stale or wrong-attempt public artifact cannot pass readiness', async () => {
  const identity = artifactIdentity(env, event);
  let reads = 0;
  const fetchImpl = async (target) => {
    reads++;
    return { ok: true, status: 200, json: async () => ({ ...identity, run_attempt: '1' }) };
  };
  await assert.rejects(verifyPublic(fetchImpl, url, identity, false, { attempts: 2, pause: async () => {} }), /different build/);
  assert.equal(reads, 4);
  await verifyPublic(async () => ({ ok: true, status: 200, json: async () => identity }), url, identity, false);
});

test('public deletion requires both paths to become 404/410; redirects, errors, and serving paths fail', async () => {
  for (const status of [200, 301, 403, 500]) {
    await assert.rejects(verifyPublic(async () => ({ status }), url, {}, true, { attempts: 1 }), /still serves/);
  }
  await assert.rejects(verifyPublic(async (target) => ({ status: target.includes('_viewstem') ? 404 : 200 }), url, {}, true, { attempts: 1 }), /still serves/);
  await verifyPublic(async () => ({ status: 404 }), url, {}, true);
});

test('ownership requires the exact per-PR task/payload or native public alias', () => {
  assert.equal(ownsDeployment({ environment: 'docs-preview', task: 'docs-preview-pr-6', payload: { pull_request: 60 } }, 6), false);
  assert.equal(legacyDeployment({ environment: 'docs-preview', task: 'deploy' }, { environment_url: `${url}/other` }, url), false);
});

test('workflow handles base edits without branch filters and keeps cleanup on trusted code and queued jobs', async () => {
  const workflow = await readFile(new URL('../workflows/docs-preview.yml', import.meta.url), 'utf8');
  assert.match(workflow, /types: \[opened, synchronize, reopened, edited\]/);
  assert.match(workflow, /types: \[closed, edited\]/);
  assert.doesNotMatch(workflow, /branches:/);
  assert.equal((workflow.match(/queue: max/g) || []).length, 3);
  assert.equal((workflow.match(/deployment: false/g) || []).length, 2);
  const cleanup = workflow.split('\n  cleanup:')[1].split('\n  metadata:')[0];
  assert.match(cleanup, /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  assert.doesNotMatch(cleanup, /ref: \$\{\{ github.event.pull_request.head.sha/);
});


test('cleanup still deletes after a push changes the head of a closed or retargeted PR', async () => {
  for (const state of [ { state: 'closed' }, { base: { ref: 'release' } } ]) {
    const { calls, options } = harness({ live: pr({ ...state, head: { sha: 'b'.repeat(40), repo: { full_name: repository } } }) });
    assert.equal(await reconcile('cleanup', env, event, options), 'cleanup');
    assert.ok(calls.includes('delete'));
    assert.equal(await reconcile('removed', env, event, options), 'cleanup');
  }
});

test('metadata-only retry uses the uploaded attempt from predecessor outputs without Cloudflare credentials', async () => {
  const metadataEnv = { ...env, GITHUB_RUN_ATTEMPT: '3', PREVIEW_SOURCE_SHA: sha, PREVIEW_RUN_ID: '123', PREVIEW_RUN_ATTEMPT: '2' };
  delete metadataEnv.CLOUDFLARE_API_TOKEN;
  delete metadataEnv.CLOUDFLARE_ACCOUNT_ID;
  const { calls, options } = harness();
  assert.equal(await reconcile('ready', metadataEnv, event, options), 'deploy');
  assert.equal(calls.find((call) => call?.verified)?.verified.run_attempt, '2');
  assert.equal(calls.includes('publish'), false);
  assert.equal(calls.includes('scope'), false);
  assert.equal(calls.includes('delete'), false);
  assert.match(writes(calls).at(-1).body.body, /attempts\/2/);
});

test('reconciling metadata for the same artifact reuses its deployment record', async () => {
  const { calls, options } = harness({ deployments: [{
    id: 1, task: 'docs-preview-pr-6', environment: 'docs-preview',
    payload: { pull_request: 6, ...artifactIdentity(env, event) },
  }], statuses: { 1: [{ state: 'success', environment_url: url }] } });
  assert.equal(await reconcile('ready', env, event, options), 'deploy');
  assert.deepEqual(writes(calls).map(operation => operation.path), ['/issues/comments/11']);
});

test('metadata public mismatch prevents every GitHub mutation', async () => {
  const { calls, options } = harness({ publicError: 'different build' });
  await assert.rejects(reconcile('ready', env, event, options), /different build/);
  assert.deepEqual(writes(calls), []);
});

test('Wrangler receives Cloudflare credentials with both GitHub credential names removed', async () => {
  await runWrangler({ ...env, GITHUB_TOKEN: 'also-remove', PREVIEW_NAME: 'pr-6' }, (command, args, options) => {
    assert.equal(command, 'npx');
    assert.equal(options.env.GH_TOKEN, undefined);
    assert.equal(options.env.GITHUB_TOKEN, undefined);
    assert.equal(options.env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_API_TOKEN);
    assert.deepEqual(args.slice(-2), ['--name', 'pr-6']);
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('exit', 0));
    return child;
  });
});

test('Cloudflare jobs have read-only GitHub permissions; only isolated metadata can write', async () => {
  const workflow = await readFile(new URL('../workflows/docs-preview.yml', import.meta.url), 'utf8');
  const [mutators, metadata] = workflow.split('\n  metadata:');
  assert.doesNotMatch(mutators, /pull-requests: write|deployments: write/);
  assert.match(metadata, /pull-requests: write/);
  assert.match(metadata, /deployments: write/);
  assert.doesNotMatch(metadata, /CLOUDFLARE_API_TOKEN|npm ci|build:docs|environment:/);
  assert.match(metadata, /PREVIEW_RUN_ATTEMPT: \$\{\{ needs.preview.outputs.run_attempt/);
  assert.equal((workflow.match(/github.event.changes.base.ref != null/g) || []).length, 2);
});
