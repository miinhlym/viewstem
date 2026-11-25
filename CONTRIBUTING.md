# Contributing to Viewstem

Issues and pull requests are welcome. You can write them in English or Korean.
Project and package guides use English as their reference language and provide
Korean translations. Design specifications are in Korean. Participation follows our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Before starting

Search existing issues and pull requests for related work. Open an issue before
implementing a substantial feature, changing a public API or declaration contract,
adding a dependency, or adding a renderer or UI kit. Describe the use case and
the behavior you propose. Small bug fixes and documentation corrections can go
directly to a pull request.

Use [Support](SUPPORT.md) for usage questions. Report vulnerabilities through
[Security](SECURITY.md), not a public issue or pull request.

## Decisions and review

[@miinhlym](https://github.com/miinhlym) is the current maintainer and makes the
final decisions on scope, merges, and releases. Contributors can propose changes
and discuss alternatives in issues and pull requests. An accepted proposal is
not a promise of a delivery date. Review and maintenance commitments are defined
in [Support](SUPPORT.md).

## Local setup

Fork the repository, clone your fork, and create a branch for your change. From
the repository root:

```sh
npm ci --ignore-scripts
npx playwright install chromium
```

Use a Node.js version from the [CI matrix](.github/workflows/ci.yml). The
[workspace scripts](package.json) and [verification table](docs/verification.md#choose-checks-by-change) describe
the package checks relevant to your change.

## Working with the project contracts

Use the [documentation map](docs/README.md) to find the owner of the area you
are changing. The [architecture guide (Korean)](docs/architecture.md) explains
the implementation boundaries and links to the current contracts.

- Keep core independent of DOM, frameworks, and application-specific business rules.
- Preserve cancellation, ownership, validation, and authorization boundaries.
- Add a regression test for an observable bug. Describe the failing behavior
  before the fix; passing unrelated tests is not evidence for the change.
- Update the owning specification or usage document when approved public behavior
  changes. Preserve historical experiment and verification records.
- Edit generated files through their source and generator. For the site’s shadcn
  sources, use the [upstream workflow](apps/docs/upstream/README.md). For CEL,
  use the [vendor workflow](packages/core/vendor/README.md).
- Do not commit credentials, personal data, local conversation archives, build
  output, or unrelated changes. Use a minimal, sanitized reproduction.

## Documentation languages

Repository README files may have a paired `README.ko.md`. Keep commands,
examples, and support limits aligned between each pair. Other repository
Markdown files have a single source language. Link to that source from both
documentation maps. The site maintains its English and Korean pages under
the [site content routes](apps/docs/README.md#hand-authored-documentation).

Design specifications, implementation handoffs, and historical verification
records retain their existing language and ownership. Mark links to Korean-only
documents in English guides. Do not translate or rewrite past evidence as a new
verification result. The root `LICENSE` and third-party license texts remain in
their original form.

## Verification

Use the [verification guide](docs/verification.md#choose-checks-by-change) to choose checks for your change. Include the executed commands and results in your PR.

## Pull requests

Keep each pull request focused on one problem and make commits independently
understandable. Explain the observed behavior, the change, and how you verified it.
For visible changes, include a screenshot or a short description of the before
and after behavior. Point out compatibility changes explicitly.

Use `type: summary` for commit messages and pull request titles. Existing types
are `feat`, `fix`, `perf`, `deps`, `ci`, `docs`, `test`, `refactor`, `style`, and
`chore`. English or Korean is accepted; omit a trailing period.

AI-assisted contributions are welcome under the same review requirements.
The submitter must understand the change, verify its behavior, check its sources
and submission rights, and respond to review feedback. Do not submit unreviewed
generated changes or claim checks that were not run.

For npm package changes, see [Writing a changeset](docs/releasing.md#writing-a-changeset)
for when to add a changeset and what to include.

## Contribution licensing

By intentionally submitting a contribution for inclusion, you agree to license
your contribution under the project's [MIT License](LICENSE), unless an existing
third-party file specifies otherwise. You retain copyright in your contribution.
Only submit material you have the right to contribute; preserve third-party
licenses and attribution, and identify new third-party material in the pull request.

No separate contributor license agreement (CLA), copyright assignment, or DCO
sign-off is required. A `Signed-off-by` line is optional.

The root `LICENSE` is the reference for Viewstem's own license. The four package
directories carry identical copies so installed packages include the license.
Keep those copies and the package `license` fields aligned. Existing package
consumer checks verify installed license text for Core and Svelte and the vendored CEL notice for Core. The independent DOM check verifies that all four tarballs include `LICENSE`. Inspect the UI package contents for the Viewstem and Basecoat licenses.
