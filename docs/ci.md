# Continuous integration

English | [한국어](ci.ko.md)

The [core workflow](../.github/workflows/core.yml) runs on pushes to `main`, pull
requests, and manual dispatch. A newer run cancels an older run for the same PR
or branch. Required checks should use **CI complete**, which depends on every
compatibility job and every browser shard, including their merged audit.
Pushes to other branches without a pull request do not run CI automatically;
use a pull request or manual dispatch to check them.

## Checks and environments

| Job | Environment | Checks |
|---|---|---|
| Node compatibility | Node 22.21.1 and 24.1.0, Ubuntu | Build all three packages, core tests/types/acceptance mapping, CI tooling regressions, Svelte/UI types, reproducible generated sources, all three installed tarball consumers |
| Browser integration | Inside UI shard 4 on Node 24.1.0 | Core browser behavior and Svelte renderer |
| UI browser | Node 24.1.0, Chromium, four Ubuntu jobs | Every Svelte UI browser file, with a fresh context/page per case and sequential files inside each shard |
| CI complete | Node 24.1.0, Ubuntu | All prerequisite jobs succeeded; all shards have matching source/revision/environment; no missing files, duplicate cases, failures, skips or todos; all 66 family contracts verified |

Browser behavior runs once across the shards. Node-specific build and package
installation checks run on both Node versions. This changes test scheduling,
not the package API or supported component behavior. Tests still consume built
public package exports. The catalog and tarball checks register the
full component collection; individual behavior cases register the complete
families referenced by their View.

CI installs Chromium with `--only-shell`: all current browser checks already use
Playwright's default headless shell. A future headed test or explicit `channel`
requires revisiting the installation command.

## Local checks and shard maintenance

Existing commands such as `npm run check:svelte-ui` still run the complete local
suite. To reproduce the Svelte UI shards and merge their reports:

```sh
npm run build:svelte-ui
npx playwright install chromium
npm run test:ci
npm run test -w @viewstem/svelte-ui -- --shard=1/4
npm run test -w @viewstem/svelte-ui -- --shard=2/4
npm run test -w @viewstem/svelte-ui -- --shard=3/4
npm run test -w @viewstem/svelte-ui -- --shard=4/4
node packages/svelte-ui/scripts/merge-test-reports.mjs packages/svelte-ui/test/results
```

The [browser plan](../packages/svelte-ui/scripts/browser-plan.json) assigns every
`*.browser.mjs` file exactly once. Add new files to it; an unassigned file fails
before tests start. Balance groups using measured durations rather than file
counts. Changing the number of shards also requires updating the workflow
matrix and shard/report arguments.

Each run replaces its own `shard-N-of-M.json`. The merger rejects incomplete,
duplicate, failed, skipped, or mixed-source reports. Re-run every shard after
changing source, fixtures, dependency locks or CI configuration. Reports are
diagnostic artifacts, never cached substitutes for executing tests.
Source identity includes unstaged additions, edits and deletions; staging is not
required. Native test suites are recorded separately from individual cases, and
suite teardown failures or missing suite results also fail validation.

CI uploads individual shard reports and a merged `ui-browser-results` artifact
for 14 days. A partial shard is not a complete family audit. Full local runs and
successful merges write `packages/svelte-ui/test/results/current.json`.

## npm releases

Run `npx changeset` for a PR that changes a published package and commit the
generated file with the PR. Choose the affected packages, their SemVer bumps,
and a summary for the changelog. Changesets tracks `core`, `svelte`, and
`svelte-ui` independently. The Release PR includes any internal dependency
updates and the refreshed npm lockfile.

On a successful `main` CI run, Changesets opens or updates the Release PR.
A maintainer may need to approve its CI run in GitHub because it was created by
`GITHUB_TOKEN`. Merge the Release PR after **CI complete**. The same check
must pass on the merged commit before npm publishing runs. Package tags such as
`@viewstem/core@0.1.1` and GitHub Releases follow successful npm publishing. If
publishing fails partway through, rerun the failed jobs on the same commit. The
job skips existing versions with matching tarball integrity.

### First public release

1. Confirm publishing rights in the npm `@viewstem` scope. From a clean, verified
   `main` checkout, run `npm ci --ignore-scripts`, `npm run build:svelte-ui`,
   then `node .github/scripts/npm-release.mjs pack-initial /tmp/viewstem-release`.
   The tarballs include documentation links pinned to the source commit.
2. Publish the three tarballs with interactive 2FA and `npm publish <tarball> --access public`
   in this order: core, svelte, svelte-ui. Record their package tags on that commit.
3. Add a Trusted Publisher for each npm package. Use GitHub owner `miinhlym`,
   repository `viewstem`, and workflow filename `core.yml`, with direct
   `npm publish` allowed. `core.yml` calls `npm-release.yml`. Set up trust when
   ready to validate the first OIDC publish within npm's two-day window.
   See [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

The repository's Actions settings must allow GitHub Actions to create PRs.
The workflow grants PR write access only to the Release PR job. The npm publish
job has OIDC permission and the tagging job has contents write permission.

## Time budget

The target is **at most five minutes**, with **three minutes** as a stretch goal,
for the complete required CI path including setup, build, verification and
report aggregation. GitHub runner allocation delay is tracked separately.
Also inspect total runner time: distributing identical tests twice is not a
speed improvement. Job timeouts are safety limits, not the performance target.

Compare repeated runs of the same revision, retain cold/warm cache and failure
evidence, and keep the full acceptance scope. Record actual observations and
limitations in the [optimization handoff](handoff/ci-optimization-2026-11-03.md)
(Korean). Do not treat local harness timings as remote CI measurements.
