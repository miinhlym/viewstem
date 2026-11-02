# Viewstem documentation map

English | [한국어](README.ko.md)

The detailed specifications, handoffs, and decision history linked from this map are in Korean. See the [documentation language policy](../CONTRIBUTING.md#documentation-languages).

See the [U42 public API naming migration](handoff/public-api-naming-2026-11-02.md) for the current public names and the [Svelte UI handoff](handoff/svelte-ui-shadcn-implementation-2026-11-03.md) for the batch registration APIs added in U44. The [U42 verification record](handoff/public-api-naming-verification-results.json) and earlier API names and hashes remain evidence for their original revisions.

Use this map to find the reference for your task. The language-independent contracts are in `VIEWSTEM-SPEC.md` and `spec/`, the JS/TS usage guides are in the package READMEs, and execution results are in the product verification records. The repository documentation can be read independently of earlier chats and private source material.

<a id="처음-참여했다면"></a>

## Getting started

| Task | Start here |
|---|---|
| Contribute, check license terms, or get help | [MIT license](../LICENSE), [contributing](../CONTRIBUTING.md), [support](../SUPPORT.md), [security reporting](../SECURITY.md), [code of conduct](../CODE_OF_CONDUCT.md) |
| Understand CI checks, browser shards, and the time budget | [CI guide](ci.md), [optimization evidence](handoff/ci-optimization-2026-11-03.md) (Korean) |
| Use a package or integrate it with a host | [Core package guide](../packages/core/README.md), [host integration contract](spec/07-host-integration.md) |
| Edit JSON and inspect the view and its execution state | [Core playground guide](../playground/README.md), [implementation and verification handoff](handoff/playground-implementation-2026-11-02.md) |
| Connect the renderer to a Svelte app | [Svelte package guide](../packages/svelte/README.md), [runnable example](../packages/svelte/example/README.md), [implementation handoff](handoff/svelte-implementation-2026-11-02.md) |
| Register shadcn UI for Svelte and run the full gallery | [UI package guide](../packages/svelte-ui/README.md), [U44 implementation and verification handoff](handoff/svelte-ui-shadcn-implementation-2026-11-03.md), [inventory of 66 catalog entries and 386 parts](handoff/shadcn-component-inventory.json) |
| Compose a view from several components | [Five example screens](../packages/svelte-ui/example/README.md), [example implementation and verification](handoff/svelte-ui-examples-2026-11-03.md), [JSON editing by resource kind](handoff/svelte-ui-kind-editor-2026-11-03.md), [form State setup](handoff/svelte-ui-form-state-2026-11-03.md) |
| Understand resources and execution rules | [Full specification](VIEWSTEM-SPEC.md) and the topic specifications below |
| Modify and verify the existing core | [Current setup procedure](handoff/implementation-start.md#새-채팅에서-시작할-때) |
| Check support and limits | [Implementation handoff](handoff/core-implementation-2026-11-02.md), [CEL support](handoff/core-cel-support.md) |
| Find the next implementation tasks | [Remaining work](handoff/open-contracts.md#실제-남은-작업) |
| Find the rationale for a previous decision | [Decision register](history/decision-register.md), [evidence index](history/evidence-index.md) |

<a id="현재-인계-상태--2026-11-03"></a>

## Handoff status as of 2026-11-03

See the [U37 implementation handoff](handoff/core-implementation-2026-11-02.md) for the implemented scope, limitations, and the distinction between committing and publishing. The [product verification results](handoff/core-verification-results.json) record the execution environment, pass counts, and source and artifact hashes. This map leaves changing test counts in their source records. Notes describing core as unimplemented in dated standalone experiments refer to those points in time.

See the [U41 public API refactor](handoff/public-api-refactor-2026-11-02.md) for the public API boundaries and migration from earlier usage, and the [API verification record](handoff/public-api-verification-results.json) for rerun results and hashes after that change. Earlier product and Svelte verification JSON files remain evidence for their original revisions.

The [U39–U40 Svelte handoff](handoff/svelte-implementation-2026-11-02.md) covers the client-side renderer. Start by importing `@viewstem/svelte`, which depends on core internally. The renderer registers no default UI. Optional UI sets are registered explicitly from the separate package described in the [U44 Svelte UI handoff](handoff/svelte-ui-shadcn-implementation-2026-11-03.md).

The [U44 verification record](handoff/svelte-ui-shadcn-verification-results.json) contains re-verification of the changed Registry and Svelte batch registration APIs and the post-disposal emit contract, along with core, Svelte, and playground regression results and hashes from that revision. Keep the verification files from earlier stages.

See the [branch preflight handoff](handoff/svelte-ui-preflight-2026-11-03.md) for the full Svelte UI review and the lifecycle, custom function, and gallery restoration fixes after the split commits. The [preflight results](handoff/svelte-ui-preflight-verification-results.json) record the package checks run after those fixes.

<a id="현재-명세"></a>

## Current specifications

Each row points to the authoritative document for its topic. Examples illustrate the contracts. The verification records contain the actual execution results. For JS/TS signatures, consult the [public types](../packages/core/src/index.d.ts), [HTTP types](../packages/core/src/http.d.ts), and [CEL types](../packages/core/src/cel.d.ts).

| Topic | Reference (Korean) | Implementation and verification |
|---|---|---|
| Shared resources, references, State, Ports, and ownership | [Full specification](VIEWSTEM-SPEC.md) | Registry, State, and Port product tests |
| HTTP requests, authentication, secrets, and destination authorization | [Datasource and authentication](spec/01-datasource-auth.md) | HTTP contract, path, and Query–HTTP tests |
| Query execution, transformation, caching, and refresh | [Query](spec/02-query.md) | Query race, composition, and polling tests |
| Variable, JSON Schema, and typeRef | [Variable and Type](spec/03-variable-type.md) | Schema registration and execution tests |
| Action steps, results, cancellation, and child invocations | [Action](spec/04-action.md) | Action and lifecycle integration tests |
| Views, slots, events, when/repeat, and Grid | [Component and View](spec/05-component-view.md) | Runtime, Grid, and browser tests |
| Examples of resources working together | [Composition examples](spec/06-composition-examples.md) | Examples illustrate the contracts above and have no independent authority |
| Host SDK, permissions, and initial completion | [Host integration](spec/07-host-integration.md) | Public types, runtime, and standalone package consumer checks |
| How to organize conformance verification | [Conformance guide](spec/08-readiness-conformance.md) | See the expected behavior, test mapping, and execution results below |
| StateStore observation, reactions, and URLs | [Current Store and URL contracts](spec/09-preserved-contracts.md) | State integration, URL, and real History API tests |
| Missing values, native values, equality, snapshots, and dates | [Value contracts](spec/10-value-contracts.md) | Value, schema, date, and CEL tests |
| Features and limits of CEL in JS | [CEL support](handoff/core-cel-support.md) | [Exact function list](../packages/core/src/cel/supported-functions.json), CEL and browser checks |
| Separate scope for optional charts | [Optional charts](spec/11-optional-charts.md) | Only standalone experimental evidence is available. Remaining product work is tracked in the open tasks. |

Use the [change verification procedure](handoff/implementation-start.md#수정-후-검증) for commands and run order. The product acceptance mapping below lists exact test files and names for each acceptance item. The HTTP and host contracts define security boundaries. Product verification results specify the environments tested. Production performance is outside that evidence.

<a id="실행-검증의-현재-위치"></a>

## Verification records

| What to verify | Record | How to maintain it |
|---|---|---|
| Expected behavior by acceptance ID | [Acceptance matrix](handoff/acceptance-matrix.md) | Update expectations and evidence when a contract changes |
| Mapping from expected behavior to product tests | [Product acceptance coverage](handoff/core-acceptance-coverage.json) | [build-coverage.mjs](../packages/core/scripts/build-coverage.mjs) combines the original inventory and product test mapping. Regenerate the output to update it. |
| Actual execution environment, results, and hashes | [Product verification results](handoff/core-verification-results.json) | Update using execution reports and evidence. The `test:report` command leaves this summary JSON as-is. |
| Browser flows and views in the vanilla playground | [Playground verification results](handoff/playground-verification-results.json), [feature checklist](handoff/playground-audit-2026-11-02.md) | Run `test:playground` and inspect the views. Track separately from core acceptance items. |
| Svelte renderer, public types, and tarball consumer | [Svelte verification results](handoff/svelte-verification-results.json), [implemented scope](handoff/svelte-implementation-2026-11-02.md) | Run `check:svelte` and inspect the example. Track separately from core acceptance counts. |
| Svelte UI catalog, behavior, source/CSS, and bundles | [U44 verification record](handoff/svelte-ui-shadcn-verification-results.json), [supported scope](../packages/svelte-ui/README.md) | Run `check:svelte-ui` and distinguish the full catalog from JSON-compatible and native-only parts |
| Inputs, events, State, nesting, and keyboard behavior for each of the 66 shadcn entries | [Behavior matrix](handoff/svelte-ui-audit-matrix.md), [audit handoff](handoff/svelte-ui-audit-2026-11-03.md), [execution results](handoff/svelte-ui-audit-verification-results.json) | Use browser checks of the public package and review unexecuted cases. Track separately from earlier U44 mount and reference counts. |
| Full Svelte UI branch preflight and follow-up fixes | [Review and fixes handoff](handoff/svelte-ui-preflight-2026-11-03.md), [execution results](handoff/svelte-ui-preflight-verification-results.json) | Distinguish the comparison baseline, reused evidence, regression checks after fixes, and uncommitted handoff status |
| Standalone experiments before implementation | [Verification ledger](handoff/verification-ledger.md), [original acceptance inventory](../experiments/verification/coverage.json) | Keep the original experiments and failure evidence separate from passing product test evidence |

<a id="배경과-이력"></a>

## Background and history

- [Decision register](history/decision-register.md) records decisions that were adopted, superseded, rejected, or deferred, with their rationale.
- [Patchboard migration table](history/patchboard-migration.md) records where earlier requirements are preserved and which decisions explicitly superseded them.
- [Evidence index](history/evidence-index.md) distinguishes original E-series evidence from project U-series decisions, and source material from recovered summaries.
- [Source-to-contract matrix](handoff/source-contract-matrix.md) tracks where meaning, rationale, exceptions, and acceptance criteria were migrated.
- [Semantic reconstruction review](handoff/semantic-review-2026-10-29.md), [full review](handoff/full-review-2026-10-29.md), and [file transfer verification](handoff/transfer-verification.md) preserve dated audit findings. See the execution records for current execution status.

The [verification ledger](handoff/verification-ledger.md) indexes the dated T1–T4 experiments and subsequent boundary checks. Read their limitations, failures, and implementation gaps in the context of those revisions.

<a id="상세-대화-기록"></a>

## Conversation archive

`context-archive/` contains local source material excluded from Git, clones, and packages. See the [local archive guide](../context-archive/README.md) only in an environment where it exists. This `docs/` directory provides the public contracts, decision rationale, and implementation tasks. Leave gaps where source material is unavailable.

<a id="문서-상태를-읽는-방법"></a>

## How to read document status

- **Current contracts** are the agreed semantics in `VIEWSTEM-SPEC.md` and `spec/`, along with the JS/TS support documentation. `09-preserved-contracts.md` is the current reference for Store and URL behavior and retains its migration-era filename.
- **Implementation proposals** use illustrative SDKs or pseudocode. Consult package declarations for actual signatures.
- **Follow-up and open work** is tracked in the [open contracts](handoff/open-contracts.md). Q1–Q3 and U35 are closed.
- **Historical records** cover the stated dates of decisions, experiments, and reviews. Refer to current contracts and verification records for implementation status and supported behavior.

<a id="이후-유지-방법"></a>

## Maintaining the documentation

When a contract changes, update its specification, decision history, and acceptance expectations together. Put execution results in verification records and follow-up work in open contracts. Link to those sources from the entry points and preserve existing anchors and experiment evidence.

The `docs/` directory and experiment records are repository documentation. The [package manifest](../packages/core/package.json) `files` list governs the README, types, CEL support list, and license notices included in the npm package. Detailed specifications live separately in the repository. The [publication follow-up](handoff/open-contracts.md#실제-남은-작업) tracks which tag or commit to link to when publishing.
