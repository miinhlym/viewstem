import { spawn } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const marker = '<!-- docs-preview-deployment -->';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export function desiredAction(pr, repository, sourceSha) {
  if (pr.head?.repo?.full_name !== repository) return 'skip';
  // Retarget-away may be followed by a push without another cleanup event.
  // Absence is authoritative regardless of the event's now-stale head SHA.
  if (pr.state === 'closed' || pr.base.ref !== 'main') return 'cleanup';
  return pr.head.sha === sourceSha ? 'deploy' : 'skip';
}

export function artifactIdentity(env, event) {
  return {
    source_sha: env.PREVIEW_SOURCE_SHA || event.pull_request.head.sha,
    run_id: String(env.PREVIEW_RUN_ID || env.GITHUB_RUN_ID),
    run_attempt: String(env.PREVIEW_RUN_ATTEMPT || env.GITHUB_RUN_ATTEMPT),
  };
}

export function matchesIdentity(actual, expected) {
  return Object.entries(expected).every(([key, value]) => actual?.[key] === value);
}

export function ownsDeployment(deployment, number) {
  // task is per PR even though the environment only supplies shared credentials.
  return deployment.environment === 'docs-preview' &&
    deployment.task === `docs-preview-pr-${number}` &&
    Number(deployment.payload?.pull_request) === number;
}

export async function verifyPublic(fetchImpl, url, identity, removed, { attempts = 10, pause = sleep } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const responses = await Promise.all(['/_viewstem-deploy.json', '/docs/installation/'].map((path) =>
        fetchImpl(`${url}${path}?viewstem-check=${Date.now()}-${attempt}`, {
          cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15_000),
        })));
      if (removed) {
        if (responses.every((response) => [404, 410].includes(response.status))) return;
        throw new Error(`Preview still serves content (HTTP ${responses.map((response) => response.status).join(', ')}).`);
      }
      if (!responses.every((response) => response.status === 200)) throw new Error('Preview paths are not ready.');
      if (!matchesIdentity(await responses[0].json(), identity)) throw new Error('The public preview belongs to a different build.');
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await pause(3_000);
    }
  }
  throw new Error(`Public preview verification failed: ${lastError?.message}`);
}

export function runWrangler(env, spawnImpl = spawn) {
  // Wrangler needs the Cloudflare token, never the GitHub API credential.
  const { GH_TOKEN: _ghToken, GITHUB_TOKEN: _githubToken, ...wranglerEnv } = env;
  return new Promise((done, reject) => {
    const child = spawnImpl('npx', ['--no-install', 'wrangler', 'preview', '--config', 'apps/docs/wrangler.jsonc',
      '--worker-name', env.PREVIEW_WORKER, '--name', env.PREVIEW_NAME], { env: wranglerEnv, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? done() : reject(new Error(`Wrangler exited with code ${code}.`)));
  });
}

export function githubClient(env, fetchImpl) {
  const root = `${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}`;
  async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetchImpl(`${root}${path}`, {
      method,
      headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: 'application/vnd.github+json',
        'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
    return response.json();
  }
  async function list(path) {
    const entries = [];
    for (let page = 1; ; page++) {
      const items = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      entries.push(...items);
      if (items.length < 100) return entries;
    }
  }
  return { request, list };
}

export async function reconcile(mode, env, event, { fetchImpl = fetch, publish = runWrangler,
  writeArtifact = (identity) => writeFile('apps/docs/dist/_viewstem-deploy.json', `${JSON.stringify(identity)}\n`),
  readOutput = (file) => readFile(file, 'utf8'), verify = verifyPublic, api = githubClient(env, fetchImpl) } = {}) {
  if (!['deploy', 'cleanup', 'ready', 'removed'].includes(mode)) throw new Error('Expected deploy, cleanup, ready, or removed.');
  const metadata = ['ready', 'removed'].includes(mode);
  const action = ['deploy', 'ready'].includes(mode) ? 'deploy' : 'cleanup';
  const required = metadata ? ['GH_TOKEN'] : ['GH_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
  for (const name of required) {
    if (!env[name]) throw new Error(`Missing ${name}.`);
  }
  const number = event.pull_request.number;
  const identity = artifactIdentity(env, event);
  const previewName = `pr-${number}`;
  const url = `https://${previewName}-${env.PREVIEW_WORKER}.miinhlym.workers.dev`;
  const repoUrl = `${env.GITHUB_SERVER_URL || 'https://github.com'}/${env.GITHUB_REPOSITORY}`;
  const logUrl = `${repoUrl}/actions/runs/${identity.run_id}/attempts/${identity.run_attempt}`;
  const current = async () => {
    const pr = await api.request(`/pulls/${number}`);
    return desiredAction(pr, env.GITHUB_REPOSITORY, identity.source_sha) === action;
  };
  // A selective job retry must never rely on a cached predecessor's decision.
  if (!await current()) return 'skip';

  if (!metadata) {
    if (mode === 'deploy') {
      // Fail closed if the preview token unexpectedly reaches the production worker.
      const scope = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/workers/viewstem`, {
        headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(15_000),
      });
      if (![403, 404].includes(scope.status)) throw new Error(`Production scope must be denied: HTTP ${scope.status}`);
      await writeArtifact(identity);
      const output = join(env.RUNNER_TEMP, `docs-preview-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}.ndjson`);
      // The authoritative guard is directly before the Cloudflare mutation.
      if (!await current()) return 'skip';
      await publish({ ...env, PREVIEW_NAME: previewName, WRANGLER_OUTPUT_FILE_PATH: output });
      const records = (await readOutput(output)).trim().split('\n').map((line) => JSON.parse(line));
      const published = records.filter((record) => record.type === 'preview').at(-1);
      if (!published?.preview_urls?.some((value) => value.replace(/\/$/, '') === url)) {
        throw new Error('Wrangler did not report the expected public PR alias.');
      }
      await verify(fetchImpl, url, identity, false);
    } else {
      // No dependency installation or PR code executes on the trusted cleanup job.
      if (!await current()) return 'skip';
      const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/workers/${env.PREVIEW_WORKER}/previews/${previewName}`, {
        method: 'DELETE', headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json();
      const absent = result.success === false && result.errors?.length === 1 && result.errors[0].code === 10025;
      if (!(response.ok && result.success === true) && !absent) {
        throw new Error(`Cloudflare preview deletion failed: HTTP ${response.status}`);
      }
      // API success alone does not establish public alias removal.
      await verify(fetchImpl, url, identity, true);
    }

    return action;
  }

  // Separate metadata jobs receive no Cloudflare credential and execute no PR
  // package scripts. Cached predecessor outputs identify the actual upload on
  // selective job retries, even when GITHUB_RUN_ATTEMPT has advanced.
  await verify(fetchImpl, url, identity, action === 'cleanup');

  if (!await current()) return 'skip';
  const deployments = await api.list('/deployments?environment=docs-preview');
  let activeId;
  if (action === 'deploy') {
    if (!await current()) return 'skip';
    const existing = deployments.find(deployment => ownsDeployment(deployment, number)
      && matchesIdentity(deployment.payload, identity));
    const deployment = existing ?? await api.request('/deployments', {
      ref: identity.source_sha, task: `docs-preview-pr-${number}`, environment: 'docs-preview',
      auto_merge: false, required_contexts: [], transient_environment: true, production_environment: false,
      payload: { pull_request: number, ...identity, preview_url: url },
      description: `Documentation preview for PR #${number}`,
    });
    activeId = deployment.id;
    if (!activeId) throw new Error('GitHub did not return a deployment record.');
    if (!await current()) return 'skip';
    const [status] = existing ? await api.request(`/deployments/${activeId}/statuses?per_page=1`) : [];
    if (status?.state !== 'success' || status.environment_url !== url) {
      await api.request(`/deployments/${activeId}/statuses`, {
        state: 'success', environment_url: url, log_url: logUrl, auto_inactive: false,
      });
    }
  }
  for (const deployment of deployments) {
    if (deployment.id === activeId || !ownsDeployment(deployment, number)) continue;
    const [status] = await api.request(`/deployments/${deployment.id}/statuses?per_page=1`);
    // A state change between creating a record and its first status can leave
    // an owned record with no status; cleanup must retire that record too.
    if (status && !['success', 'queued', 'pending', 'in_progress'].includes(status.state)) continue;
    if (!await current()) return 'skip';
    await api.request(`/deployments/${deployment.id}/statuses`, {
      state: 'inactive', environment_url: url, log_url: logUrl, auto_inactive: false,
      description: action === 'cleanup' ? 'PR preview removed' : 'Replaced by a newer preview for this PR',
    });
  }
  const comments = await api.list(`/issues/${number}/comments`);
  const existing = comments.find((comment) => comment.user?.login === 'github-actions[bot]' && comment.body?.startsWith(marker));
  const body = action === 'cleanup' ? `${marker}\n**Viewstem preview removed**` : [
    marker, `**Viewstem preview ready** · [Open site](${url})`, '',
    `[Documentation](${url}/docs/) · [Examples](${url}/examples/) · [Playground](${url}/playground/)`, '',
    `<sub>Deployed commit [\`${identity.source_sha.slice(0, 7)}\`](${repoUrl}/commit/${identity.source_sha}) · [Build log](${logUrl})</sub>`,
  ].join('\n');
  // Comment-only retries cannot announce an old public artifact as ready.
  if (!await current()) return 'skip';
  await verify(fetchImpl, url, identity, action === 'cleanup');
  if (!await current()) return 'skip';
  if (existing) await api.request(`/issues/comments/${existing.id}`, { body }, 'PATCH');
  else if (action === 'deploy') await api.request(`/issues/${number}/comments`, { body });
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,
    action === 'deploy' ? `[Open the PR preview](${url})\nSource: ${identity.source_sha}; run: ${identity.run_id}/${identity.run_attempt}\n` : `Removed PR #${number} preview and verified its public alias is absent.\n`);
  return action;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const mode = process.argv[2];
  const action = await reconcile(mode, process.env, event);
  if (process.env.GITHUB_OUTPUT && ['deploy', 'cleanup'].includes(mode) && action !== 'skip') {
    const identity = artifactIdentity(process.env, event);
    await appendFile(process.env.GITHUB_OUTPUT, `action=${action}\nsource_sha=${identity.source_sha}\nrun_id=${identity.run_id}\nrun_attempt=${identity.run_attempt}\n`);
  }
}
