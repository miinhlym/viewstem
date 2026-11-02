# Continuous integration

English | [한국어](ci.ko.md)

The [core workflow](../.github/workflows/core.yml) runs on pushes to `main`, pull
requests, and manual dispatch. A newer run cancels an older run for the same PR
or branch. Required checks should use **CI complete**, which depends on every
compatibility job and every browser shard, including their merged audit.

## Checks and environments

| Job | Environment | Checks |
|---|---|---|
| Node compatibility | Node 22.21.1 and 24.1.0, Ubuntu | Build all three packages, core tests/types/acceptance mapping, CI tooling regressions, Svelte/UI types, reproducible generated sources, all three installed tarball consumers |
| Browser integration | Inside the Node 24.1.0 compatibility job | Core browser behavior, Svelte renderer, vanilla playground |
| UI browser | Node 24.1.0, Chromium, three Ubuntu jobs | Every Svelte UI browser file, with a fresh context/page per case and sequential files inside each shard |
| CI complete | Node 24.1.0, Ubuntu | All prerequisite jobs succeeded; all shards have matching source/revision/environment; no missing files, duplicate cases, failures, skips or todos; all 66 family contracts verified |

Browser behavior runs once across the shards. Node-specific build and package
installation checks run on both Node versions. This changes test scheduling,
not the package API or supported component behavior. Tests still consume built
public package exports. The catalog, gallery and tarball checks register the
full component collection; individual behavior cases register the complete
families referenced by their View.

## Local checks and shard maintenance

Existing commands such as `npm run check:svelte-ui` still run the complete local
suite. To reproduce the CI browser distribution after building the packages:

```sh
npm run build:svelte-ui
npx playwright install chromium
npm run test:ci
npm run test -w @viewstem/svelte-ui -- --shard=1/3
npm run test -w @viewstem/svelte-ui -- --shard=2/3
npm run test -w @viewstem/svelte-ui -- --shard=3/3
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

CI uploads individual shard reports and a merged `ui-browser-results` artifact
for 14 days. A partial shard is not a complete family audit. Full local runs and
successful merges write `packages/svelte-ui/test/results/current.json`.

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
