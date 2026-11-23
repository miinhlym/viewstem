# Continuous integration

English | [한국어](ci.ko.md)

The [core workflow](../.github/workflows/core.yml) runs on pushes to `main`, pull
requests, and manual dispatch. A newer run cancels an older run for the same PR.
Pushes are grouped by commit and manual CI runs have a separate group. Required
checks should use **CI complete**, which depends on every compatibility and
browser job.
Pushes to other branches without a pull request do not run CI automatically;
use a pull request or manual dispatch to check them.

## Checks and environments

- Node 22 and 24 build Core, DOM, Svelte, and UI. The compatibility jobs check Core, DOM, and Svelte types and installed-package consumers, including the independent DOM and mixed-rendering fixtures.
- Chromium runs the Core, DOM, and Svelte browser tests and the UI tarball consumer tests. The UI suite covers plain JS, React, Vue and Svelte hosts, the original JSON for all 66 families, and date and table State and events.
- **CI complete** requires both compatibility and browser jobs to pass.

Choose the local check for the packages you change. Run `npm run check:dom` for the DOM renderer and CSS transformer, `npm run check:ui` for the UI catalog, `npm run check:svelte` for the Svelte renderer, and `npm run test:ci` for the release planner. CI uses Playwright Chromium's headless shell.

## npm releases

The [first public release](#first-public-release) uses the version in each
package's `package.json`. Add a changeset when a PR has a change to ship in a
new version of a published package.

### Writing a changeset

1. Run `npx changeset` from the repository root. Select the affected packages
   and choose a SemVer bump for each. Changesets tracks `core`, `dom`, `svelte`,
   and `ui` independently.
2. Write a short changelog entry that describes what changes for users of the
   package. Add why it matters or how to migrate when users need that context.
   Link to an existing guide if the migration needs more detail.
3. Review the package names, bumps, and summary in the generated
   `.changeset/*.md` file and commit it with the PR.

A patch summary could read “Preserve unrelated URL parameters when replacing a
View.” See the [Changesets writing guide](https://changesets.dev/faq#how-do-i-add-a-changeset).

### Release PR

When `main` CI passes and changesets are pending, Changesets opens or updates
the Release PR with version bumps, any internal dependency updates, and the
refreshed npm lockfile.
A maintainer may need to approve its CI run in GitHub because it was created by
`GITHUB_TOKEN`. Merge the Release PR after **CI complete**. The same check
must pass on the merged commit before npm publishing runs. Publishing requires
the previous package versions to be public. Each internal dependency must already
be public or appear earlier in the batch. Package tags such as
`@viewstem/core@0.1.1` and GitHub Releases follow npm publishing, then the docs
workflow uses those tags to verify the released source.

If publishing fails partway through, rerun the failed jobs on that commit
before proceeding with the next batch. The job skips existing versions if their
tarball integrity matches. If an out-of-band publication already advanced
`latest`, resolve the missing versions at the registry before retrying an older
batch. A tag or GitHub Release failure can be retried on the same commit before
the docs workflow begins.

### First public release

1. Confirm publishing rights in the npm `@viewstem` scope. From a clean, verified
   `main` checkout, run `npm ci --ignore-scripts`, `npm run build:svelte && npm run build -w @viewstem/ui`,
   then `node .github/scripts/npm-release.mjs pack-initial /tmp/viewstem-release`.
   The tarballs include documentation links pinned to the source commit.
2. Publish the four tarballs with interactive 2FA and `npm publish <tarball> --access public`.
   Publish Core first, then DOM, then Svelte and UI. Record their package tags on that commit.
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
