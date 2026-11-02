# Contributing to Viewstem

English | [한국어](CONTRIBUTING.ko.md)

Issues and pull requests are welcome. You can write them in English or Korean.
User-facing guides use English as their reference language and provide Korean
translations. Existing design specifications remain in Korean. Participation follows our
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

Use a Node.js version from the [CI matrix](.github/workflows/core.yml). The
[workspace scripts](package.json) are the command reference. Examples run locally:

```sh
npm run playground
npm run example:svelte
npm run example:svelte-ui
```

These start separate development servers. See the relevant
[playground](playground/README.md), [Svelte](packages/svelte/example/README.md), or
[UI gallery](packages/svelte-ui/example/README.md) instructions for their ports
and options.

## Working with the project contracts

Start with the [documentation map](docs/README.md) and follow the specifications
for the area you change. The [implementation guide (Korean)](docs/handoff/implementation-start.md)
explains how contracts, acceptance mappings, and verification evidence are maintained.

- Keep core independent of DOM, frameworks, and application-specific business rules.
- Preserve cancellation, ownership, validation, and authorization boundaries.
- Add a regression test for an observable bug. Describe the failing behavior
  before the fix; passing unrelated tests is not evidence for the change.
- Update the owning specification or usage document when approved public behavior
  changes. Preserve historical experiment and verification records.
- Edit generated files through their source and generator. For shadcn sources,
  use the [upstream workflow (Korean)](packages/svelte-ui/upstream/README.md); for CEL,
  use the [vendor workflow](packages/core/vendor/README.md).
- Do not commit credentials, personal data, local conversation archives, build
  output, or unrelated changes. Use a minimal, sanitized reproduction.

## Documentation languages

The root, package, playground, and example READMEs, documentation guide, and
community policies use English in the default file and Korean in a sibling
`*.ko.md` file. Each pair links to the other language at the top. Keep both
versions aligned in the same change, including examples, commands, and support
limits. Link to the matching language when a translation exists.

Design specifications, implementation handoffs, and historical verification
records retain their existing language and ownership. Mark links to Korean-only
documents in English guides. Do not translate or rewrite past evidence as a new
verification result. The root `LICENSE` and third-party license texts remain in
their original form.

## Verification

Run checks that cover the changed behavior. The full CI runs on each configured
Node version; the commands below identify the relevant local gates.

| Change | Checks |
|---|---|
| Core behavior or contracts | `npm run check`; add `npm run test:browser` for browser behavior |
| Core package contents, declarations, or package README | `npm run build` then `npm run test:package` |
| Svelte renderer or its example | `npm run check:svelte` |
| Svelte UI adapters, generated sources, styles, or gallery | `npm run check:svelte-ui` |
| Vanilla playground | `npm run test:playground` |
| Package metadata or license files only | Build the affected package and run its existing package consumer check: `test:package`, `test:svelte:package`, or `test:svelte-ui:package` |
| Community documentation or templates only | Check links, examples, JSON/YAML syntax where applicable, and `git diff --check` |

Tests that render Svelte or UI components consume built package exports. Rebuild
the affected packages before running a browser test directly. Report the commands
and results in your pull request, including any checks you could not run. Do not
describe a skipped check or a written scenario as a passing test.

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

## Contribution licensing

By intentionally submitting a contribution for inclusion, you agree to license
your contribution under the project's [MIT License](LICENSE), unless an existing
third-party file specifies otherwise. You retain copyright in your contribution.
Only submit material you have the right to contribute; preserve third-party
licenses and attribution, and identify new third-party material in the pull request.

No separate contributor license agreement (CLA), copyright assignment, or DCO
sign-off is required. A `Signed-off-by` line is optional.

The root `LICENSE` is the reference for Viewstem's own license. The three package
directories carry identical copies so installed packages include the license.
Keep those copies and the package `license` fields aligned. Existing package
consumer tests check the installed license and third-party notices.
