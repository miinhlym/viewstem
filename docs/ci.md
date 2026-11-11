# Continuous integration

English | [한국어](ci.ko.md)

The [core workflow](../.github/workflows/core.yml) runs on pushes to `main`, pull
requests, and manual dispatch. A newer run cancels an older run for the same PR
or branch. Required checks should use **CI complete**, which depends on every
compatibility and browser job.
Pushes to other branches without a pull request do not run CI automatically;
use a pull request or manual dispatch to check them.

## Checks and environments

- Node 22 and 24 build core, the Svelte adapter and browser UI, and check core and Svelte types and tarball consumers.
- Chromium runs the core and Svelte browser tests and the UI tarball consumer tests. The UI suite covers plain JS, React, Vue and Svelte hosts, the original JSON for all 66 families, and date and table State and events.
- **CI complete** requires both compatibility and browser jobs to pass.

Run `npm run check:ui`, `npm run check:svelte`, and `npm run test:ci` locally. CI uses Playwright Chromium's headless shell.

## npm releases

Run `npx changeset` for a PR that changes a published package and commit the
generated file with the PR. Choose the affected packages, their SemVer bumps,
and a summary for the changelog. Changesets tracks `core`, `svelte`, and
`ui` independently. The Release PR includes any internal dependency
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
   `main` checkout, run `npm ci --ignore-scripts`, `npm run build:svelte && npm run build -w @viewstem/ui`,
   then `node .github/scripts/npm-release.mjs pack-initial /tmp/viewstem-release`.
   The tarballs include documentation links pinned to the source commit.
2. Publish the three tarballs with interactive 2FA and `npm publish <tarball> --access public`
   in this order: core, svelte, ui. Record their package tags on that commit.
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
