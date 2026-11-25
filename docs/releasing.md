# Releasing Viewstem

## npm releases

After CI succeeds on `main`, it calls [Release npm packages](../.github/workflows/npm-release.yml).

Add a changeset when a PR has a change to ship in a new version of a published
package.

### Writing a changeset

1. Run `npx changeset` from the repository root. Select the affected packages
   and choose a SemVer bump for each. Changesets tracks `core`, `dom`, `svelte`,
   and `ui` independently.
2. The summary appears in the package changelog. Name the affected feature
   and describe what changes for package users. For a routine patch, aim for
   one short sentence. Keep implementation details and full benchmark results
   in the PR.
3. Explain why the change matters when it helps users understand the impact.
   When users need to update their code, include migration steps and link to
   an existing guide if the steps need more detail.
4. Review the package names, bumps, and summary in the generated
   `.changeset/*.md` file and commit it with the PR.

A patch summary could read “Preserve unrelated URL parameters when replacing a View.”
or “Keep DataTable rows and focus during unrelated View updates.”
[Changesets writing guide](https://changesets.dev/guide/writing-changesets)

### Release PR

When `main` CI passes and pending changesets include a public package bump,
Changesets uses the GitHub App installation token to open or update the Release
PR as `viewstem-release[bot]`. The PR contains the version bumps, internal
dependency updates, and refreshed npm lockfile. GitHub starts CI automatically.
The changelog and PR body link each change to its source PR or commit.
Each package groups its internal dependency updates under a single entry
with links to the source PRs and commit links for changes without a PR.
**CI complete** must pass on the PR and on the merged commit before publishing.
Release PR CI and the publishing workflow regenerate the Changesets output from the PR base and
the pre-merge commit, respectively, in a temporary directory. They compare all
generated files, including manifests, changelogs, and consumed changesets, with
the candidate commit. npm validates the lockfile separately. Both replays use a
read-only GitHub token to resolve changelog links. For local generation, set
`GITHUB_TOKEN` to a token with read access to the repository and its pull
requests. Changed input blocks stale release output. Merge the Release PR
after **CI complete**.
Publishing requires the previous versions to be public. Each internal dependency must already
be public or appear earlier in the batch. After npm publishing succeeds, the
documentation job verifies the public versions and deploys the same commit.
A separate job records package tags such as `@viewstem/core@0.1.1` and GitHub Releases.
Each GitHub Release uses the same package entry shown in the Release PR. It reads
the entry from the release commit's changelog and preserves its headings, source
links, and dependency list.

Merge documentation-only changes through the regular PR process without a
changeset. To publish a separate site update, run **Deploy docs** manually.
See the [deployment procedure](#deploy-independently-of-a-package-release).

If publishing fails partway through, rerun the failed jobs on that commit
before proceeding with the next batch. The job skips existing versions if their
tarball integrity matches. If an out-of-band publication already advanced
`latest`, resolve the missing versions at the registry before retrying an older
batch. If publishing succeeded and the site failed, rerun the docs job in the
original workflow. Retry tag or GitHub Release failures in the record job.

### Trusted Publishing setup

Each public npm package uses a Trusted Publisher for GitHub owner `miinhlym`,
repository `viewstem`, and workflow filename `ci.yml`, with direct `npm publish`
allowed. Leave the npm Environment field empty. The publishing job has no
GitHub environment. `ci.yml` calls `npm-release.yml`.

Set up a `ci.yml` connection for each package before merging its Release PR.
npm validates a new connection on the first successful publish within two days
of registration. If a connection expires, recreate it before retrying the
release.
[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

### Release PR GitHub App

Install the private `viewstem-release` GitHub App on `miinhlym/viewstem`. Grant
repository **Contents** and **Pull requests** read and write permissions.
Limit the `release-pr` GitHub Actions environment to `main`. Add the App's
client ID as the environment variable `RELEASE_APP_CLIENT_ID` and its private
key as the environment secret `RELEASE_APP_PRIVATE_KEY`.

The Release PR job requests an installation token scoped to this repository.
PR CI and post-merge release planning both require the App's bot as the author.
The npm publish job uses OIDC and the tagging job has contents write permission.

## Deploy the site

The [Docs preview workflow](../.github/workflows/docs-preview.yml) builds the
head of each PR from a branch in this repository targeting `main`. Each PR has
a Cloudflare Preview named `pr-<number>` on `viewstem-preview`, served at
`https://pr-<number>-viewstem-preview.miinhlym.workers.dev`. After the public
URL serves the expected build, GitHub Actions records the PR's deployment and
updates one comment with the preview, source commit, and run links. Closing or
merging the PR or changing its base away from `main` removes the preview, retires
its deployment record, and updates the existing comment. Reopening or moving the
PR back to `main` creates its preview again. Use the [local preview](../apps/docs/README.md#run-locally) for fork PRs.

The repository's Actions event policy allows `pull_request` and
`pull_request_target` for `.github/workflows/docs-preview.yml`. The second
event runs the cleanup workflow from the default branch.
[GitHub Actions event policy](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target#default-policy-for-pull_request_target)

If removal fails, rerun the failed cleanup job after confirming the PR is still
closed or targets a different base branch. If automatic cleanup is unavailable,
a maintainer can remove the named preview from the repository root. Set
`pr_number` to the closed or retargeted PR's number and use Cloudflare
credentials authorized for `viewstem-preview`.

```sh
pr_number=123
npx --no-install wrangler preview delete --config apps/docs/wrangler.jsonc \
  --worker-name viewstem-preview --name "pr-${pr_number}"
```

[Deploy docs](../.github/workflows/docs-deploy.yml) builds the workflow
commit against the public npm versions pinned in that commit's
[site manifest](../apps/docs/package.json). It installs those packages outside the workspace,
checks links, and runs the examples and Playground in Chromium before publishing
to `viewstem`. [Astro's `site` setting](../apps/docs/astro.config.mjs) sets the public origin
for the sitemap.

### Deploy independently of a package release

Merge documentation and related package code to `main` through the usual PRs.
A documentation-only merge is available for the next package release. For a
separate site update, choose **Actions → Deploy docs → Run workflow**, then select
`main`. GitHub fixes the source SHA at dispatch, and the site manifest at that
SHA supplies the package versions. Selecting the branch is the only input.
For a branch that contains the current workflow, selecting a branch other than
`main` fails with a message naming the default branch.

The [deployment scripts](../.github/scripts/docs-deploy/) select the source
commit, verify the public packages, and check the active production version.

The active deployment's recorded package release commit is the starting point
for the safety check. The workflow inspects the entire first-parent history
from that baseline to the selected commit. It accepts site changes and the named
CI/deployment maintenance files. Retired maintenance paths are allowed in
history once removed from the candidate. The workflow stops on package changes,
pending changeset commits, root dependency changes, or other unclassified paths,
including package changes that kept the same version or were later reverted.
If the baseline is missing or the check stops the deployment, wait for the next
package release and use its documentation job. Review prose against the public
API before dispatching. Browser tests cover runnable examples and Playground.

For example, an installation guide fix can deploy with the existing public
packages if only the site has changed since the baseline. If a Core feature has
also landed since then, the whole manual deployment stops, even if Core's
version is unchanged and the examples still pass.

### Package releases and production setup

After the complete npm batch is published, the release workflow calls **Deploy
docs** for the same release commit. Changesets updates the site's pins for
its dependencies in the release. For example, a UI-only release can move the
site to `ui@0.1.1` with `core@0.1.0` and `dom@0.1.0`.
Both deployment paths read the source commit from each exact public npm
archive and compare its package tree with the candidate commit. A package in
the incoming npm batch must identify the release commit itself. If a tree has
unpublished changes, the site waits for that package's release.
Tags and GitHub Releases record the package release in a separate job.
The npm caller passes its published batch in `released_packages` as objects with
`registry`, `name`, and `version`. The registry check can confirm pub.dev archive
availability. Adding an in-repository package for another registry also
requires source verification for its directory before it can deploy docs.

Both entry points share one production queue. Cloudflare version metadata and
`/_viewstem-deploy.json` record the package release baseline and the exact site
commit. For the initial `0.1.0` deployment, the single SHA in Cloudflare
metadata identifies both. An older run skips deployment once a newer commit is
active. The workflow checks the active Cloudflare version again before uploading.
GitHub Deployments records the version after the public site check succeeds.
If the active Worker version lacks source metadata, restore a previously verified
version that has it before retrying. The workflow needs that metadata to protect
deployment order.

To retry a site failure, open the **original** release run in GitHub Actions and
select **Re-run jobs** for **Build, verify, and deploy docs**. If only deployment recording
failed, rerun the preceding docs job to verify the site again. GitHub keeps the
original commit and successful publishing outputs for job retries. Docs use
the exact public versions even after a registry's `latest` advances. The run
skips deployment if a newer site commit is already active. See
[GitHub's job retry documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs#re-running-a-specific-job).

Configure `CLOUDFLARE_ACCOUNT_ID` as the repository variable for the account
that owns `miinhlym.workers.dev`. Allow only the default branch (`main`) in the
`docs-production` deployment branch rules. Enable GitHub Actions for the
repository. The **Run workflow** button becomes available once the workflow is
on the default branch. Separate **Individual Workers Editor** tokens are scoped
to the corresponding Worker and stored in its GitHub Actions environment.

| Environment | Secret | Cloudflare Worker |
| --- | --- | --- |
| `docs-preview` | `CLOUDFLARE_PREVIEW_API_TOKEN` | `viewstem-preview` |
| `docs-production` | `CLOUDFLARE_PRODUCTION_API_TOKEN` | `viewstem` |

The production job reads the token from its `docs-production` environment.
Each reusable workflow call forwards the named secret. Store the value in
the environment. [GitHub reusable workflow secrets](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#using-inputs-and-secrets-in-a-reusable-workflow)

If a public check fails after an upload, use the previous Cloudflare version ID
in the Actions summary to restore the site from the `viewstem` Worker's
**Deployments** tab. Check `/_viewstem-deploy.json` and the installation page,
then fix the change in a follow-up PR. [Cloudflare rollback procedure](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
