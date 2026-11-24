import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, delimiter } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyPaths, mayPublish, planBuild } from './docs-site-changes.mjs';

const style = 'apps/docs/src/styles/footer.css';
const guide = 'apps/docs/src/content/docs/api.md';
const example = 'apps/docs/src/examples/demo.ts';
const library = 'packages/core/src/index.ts';
const label = (event, name) => ({ event, label: { name } });
const merged = commit_id => ({ event: 'merged', commit_id });

test('only approved site paths are eligible, with explicit review for release-sensitive files', () => {
  assert.equal(classifyPaths([style, 'apps/docs/public/brand/logo.svg']), 'automatic');
  assert.equal(classifyPaths([guide, example, 'apps/docs/astro.config.mjs']), 'review');
  for (const path of [library, 'docs/VIEWSTEM-SPEC.md', '.changeset/core.md', 'package-lock.json',
    'apps/docs/package.json', 'apps/docs/wrangler.jsonc', 'apps/docs/public/_viewstem-deploy.json', '.github/workflows/core.yml']) {
    assert.equal(classifyPaths([style, path]), 'release');
  }
  assert.equal(classifyPaths([]), 'release');
});

test('publication uses labels present at merge, with the next-release label taking priority', () => {
  const events = [label('labeled', 'docs:publish'), merged('sha')];
  assert.equal(mayPublish('automatic', [merged('sha')], 'sha'), true);
  assert.equal(mayPublish('review', [merged('sha')], 'sha'), false);
  assert.equal(mayPublish('release', events, 'sha'), false);
  assert.equal(mayPublish('review', [...events, label('unlabeled', 'docs:publish')], 'sha'), true);
  assert.equal(mayPublish('review', [...events].reverse(), 'sha'), false);
  assert.equal(mayPublish('review', [...events.slice(0, 1), label('unlabeled', 'docs:publish'), merged('sha')], 'sha'), false);
  assert.equal(mayPublish('automatic', [label('labeled', 'docs:next-release'), ...events], 'sha'), false);
  assert.equal(mayPublish('automatic', [merged('other')], 'sha'), false);
});

test('pre-merge check requires a current label for reviewable site changes only', t => {
  const dir = mkdtempSync(join(tmpdir(), 'viewstem-docs-label-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-b', 'main');
  git('config', 'user.email', 'docs@example.com');
  git('config', 'user.name', 'Docs');
  const commit = (message) => {
    git('commit', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const write = (name, contents) => {
    const file = join(dir, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
    git('add', '--', name);
  };
  const base = commit('Baseline');
  write(guide, 'Fix the installation guide.\n');
  const docsHead = commit('Edit guide');
  write(style, 'footer { color: black; }\n');
  const styleHead = commit('Edit styles');
  write(guide, 'Document the new API.\n');
  write(library, 'export const newApi = true;\n');
  const mixedHead = commit('Change package and guide');
  const cli = join(dir, 'gh');
  writeFileSync(cli, '#!/bin/sh\ntest "$#" = 2 && test "$1" = api && test "$2" = repos/miinhlym/viewstem/pulls/3 || exit 2\nprintf "%s\\n" "$MOCK_PR"\n', { mode: 0o755 });
  const event = join(dir, 'event.json');
  const script = fileURLToPath(new URL('./docs-site-changes.mjs', import.meta.url));

  function check(baseSha, headSha, labels, currentHead = headSha) {
    const base = { ref: 'main', sha: baseSha };
    // The event still has the label even if the live PR just lost it.
    writeFileSync(event, JSON.stringify({ number: 3, pull_request: { base, head: { sha: headSha }, labels: [{ name: 'docs:publish' }] } }));
    const live = labels ? JSON.stringify({ base, head: { sha: currentHead }, labels: labels.map(name => ({ name })) }) : 'unexpected API request';
    return spawnSync(process.execPath, [script, 'check-pr'], { cwd: dir, encoding: 'utf8', env: {
      ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, MOCK_PR: live,
      GITHUB_EVENT_PATH: event, GITHUB_REPOSITORY: 'miinhlym/viewstem',
    } });
  }

  const missing = check(base, docsHead, ['documentation']);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /Add docs:publish .* or docs:next-release/);
  assert.equal(check(base, docsHead, ['docs:publish']).status, 0);
  assert.equal(check(base, docsHead, ['docs:next-release']).status, 0);
  assert.match(check(base, docsHead, ['docs:publish'], styleHead).stderr, /The PR head changed/);
  assert.equal(check(docsHead, styleHead).status, 0);
  assert.equal(check(styleHead, mixedHead).status, 0);
});

test('the required CI check handles PR label changes and excludes manual dispatch results', () => {
  const workflow = readFileSync(new URL('../workflows/core.yml', import.meta.url), 'utf8');
  assert.match(workflow, /pull_request:\n\s+types: \[[^\n]*\blabeled, unlabeled\]/);
  assert.match(workflow, /needs: \[docs-label, compatibility, ui\]/);
  assert.match(workflow, /GITHUB_EVENT_NAME.*pull_request.*DOCS_LABEL_RESULT.*!= success/);
  assert.match(workflow, /workflow_dispatch' && 'Manual CI complete' \|\| 'CI complete'/);
});

test('queue ordering preserves published docs across releases, blocks regressions, and supports bootstrap and reruns', () => {
  const history = ['initial', 'old-docs', 'release', 'new-docs'];
  const ancestor = (a, b) => history.includes(a) && history.includes(b) && history.indexOf(a) <= history.indexOf(b);
  const active = { base: 'initial', through: 'new-docs' };
  assert.equal(planBuild('refresh', 'old-docs', null, ancestor), null);
  assert.deepEqual(planBuild('release', 'initial', null, ancestor, true), { base: 'initial', through: 'initial' });
  assert.deepEqual(planBuild('refresh', 'new-docs', active, ancestor), active);
  assert.equal(planBuild('refresh', 'old-docs', active, ancestor), null);
  assert.deepEqual(planBuild('release', 'release', active, ancestor), { base: 'release', through: 'new-docs' });
  assert.deepEqual(planBuild('release', 'initial', active, ancestor, true), active);
  assert.throws(() => planBuild('release', 'release', active, ancestor, true), /bootstrap/);
  assert.throws(() => planBuild('release', 'initial', { base: 'release', through: 'new-docs' }, ancestor), /newer or unrelated/);
});

test('production replay applies only the independent PRs, including when a release reaches the queue later', t => {
  const dir = mkdtempSync(join(tmpdir(), 'viewstem-docs-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-b', 'main');
  git('config', 'user.email', 'docs@example.com');
  git('config', 'user.name', 'Docs');
  const repository = 'miinhlym/viewstem';
  const mocks = {};
  let number = 0;
  function commit(files, labels = []) {
    for (const [name, contents] of Object.entries(files)) {
      const path = join(dir, name);
      if (contents === null) {
        rmSync(path);
      } else {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, contents);
      }
      git('add', '--', name);
    }
    git('commit', '-m', `PR ${++number}`);
    const sha = git('rev-parse', 'HEAD');
    mocks[`repos/${repository}/commits/${sha}/pulls`] = [{ number, merge_commit_sha: sha,
      merged_at: '2026-11-23', user: { login: 'author' }, base: { ref: 'main', repo: { full_name: repository } } }];
    mocks[`repos/${repository}/issues/${number}/timeline`] = [...labels.map(name => label('labeled', name)), merged(sha)];
    return sha;
  }

  const guideText = (api, footer = 'Old guide footer') => `${api}\n\n${'Stable guide section\n'.repeat(8)}\n${footer}\n`;
  const base = commit({ [library]: 'published', [guide]: guideText('Released API'), [style]: 'old footer\n',
    'apps/docs/public/old.woff': Buffer.from([0, 255]) });
  const mixed = commit({ [library]: 'unreleased', [guide]: guideText('Upcoming API') });
  const held = commit({ [guide]: guideText('Upcoming API with options') }, ['docs:next-release']);
  commit({ [guide]: guideText('Upcoming API with options and fixes') }, ['docs:publish']);
  const first = commit({ [style]: 'new footer\n', 'apps/docs/public/old.woff': null,
    'apps/docs/public/new.woff': Buffer.from([0, 200]) });
  const docsFix = commit({ [guide]: guideText('Upcoming API with options and fixes', 'Fixed guide footer') }, ['docs:publish']);
  const release = commit({ 'packages/core/package.json': '{"version":"0.1.1"}' });
  commit({ [guide]: guideText('The next unpublished API', 'Fixed guide footer') });
  const oldCutoff = commit({ [style]: 'strong footer\n' });
  const tip = commit({ [style]: 'final footer\n' });
  git('update-ref', 'refs/remotes/origin/main', tip);
  const contracts = join(dir, 'responses.json');
  writeFileSync(contracts, JSON.stringify(mocks));
  const gh = join(dir, 'gh');
  writeFileSync(gh, '#!/usr/bin/env node\nconst value = require(process.env.MOCKS)[process.argv.at(-1)];\nif (!value) process.exit(2);\nconsole.log(JSON.stringify([value]));\n', { mode: 0o755 });
  const output = join(dir, 'output');
  const script = fileURLToPath(new URL('./docs-site-changes.mjs', import.meta.url));
  const route = fileURLToPath(new URL('./npm-release.mjs', import.meta.url));
  const env = { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, MOCKS: contracts,
    GITHUB_OUTPUT: output, GITHUB_REPOSITORY: repository };

  for (const [source, expected] of [[mixed, false], [held, false], [first, true], [docsFix, true]]) {
    writeFileSync(output, '');
    const plan = spawnSync(process.execPath, [route, 'plan'], { cwd: dir, encoding: 'utf8',
      env: { ...env, BEFORE_SHA: git('rev-parse', `${source}^`), GITHUB_SHA: source } });
    assert.equal(plan.status, 0, plan.stderr);
    assert.match(readFileSync(output, 'utf8'), new RegExp(`targets=\\[\\].*\\ndocs_publishable=${expected}`, 's'));
  }

  function prepare(mode, source, active) {
    git('restore', '--source=HEAD', '--staged', '--worktree', '--', 'apps/docs');
    git('checkout', '--detach', source);
    writeFileSync(output, '');
    return spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...env,
      GITHUB_SHA: source, DOCS_SOURCE_SHA: source, DOCS_MODE: mode,
      DOCS_ACTIVE: JSON.stringify(active), DOCS_BOOTSTRAP_0_1_0: 'false' } });
  }

  const firstRefresh = prepare('refresh', first, { base, through: base });
  assert.equal(firstRefresh.status, 0, firstRefresh.stderr);
  assert.match(firstRefresh.stdout, /Docs PR #4 needs a change/);
  assert.equal(readFileSync(output, 'utf8'), `deploy=true\nbase=${base}\nthrough=${first}\n`);
  assert.equal(readFileSync(join(dir, library), 'utf8'), 'published');
  assert.equal(readFileSync(join(dir, guide), 'utf8'), guideText('Released API'));
  assert.equal(readFileSync(join(dir, style), 'utf8'), 'new footer\n');
  assert.deepEqual(readFileSync(join(dir, 'apps/docs/public/new.woff')), Buffer.from([0, 200]));
  assert.throws(() => readFileSync(join(dir, 'apps/docs/public/old.woff')), { code: 'ENOENT' });

  const laterRefresh = prepare('refresh', tip, { base, through: first });
  assert.equal(laterRefresh.status, 0, laterRefresh.stderr);
  assert.equal(readFileSync(join(dir, style), 'utf8'), 'final footer\n');
  assert.equal(readFileSync(join(dir, guide), 'utf8'), guideText('Released API', 'Fixed guide footer'));
  const staleRefresh = prepare('refresh', oldCutoff, { base, through: tip });
  assert.equal(staleRefresh.status, 0, staleRefresh.stderr);
  assert.equal(readFileSync(output, 'utf8'), '');

  const releaseAfterRefresh = prepare('release', release, { base, through: tip });
  assert.equal(releaseAfterRefresh.status, 0, releaseAfterRefresh.stderr);
  assert.equal(readFileSync(output, 'utf8'), `deploy=true\nbase=${release}\nthrough=${tip}\n`);
  assert.equal(git('rev-parse', 'HEAD'), release);
  assert.equal(readFileSync(join(dir, style), 'utf8'), 'final footer\n');
  assert.equal(readFileSync(join(dir, guide), 'utf8'), guideText('Upcoming API with options and fixes', 'Fixed guide footer'));
});
