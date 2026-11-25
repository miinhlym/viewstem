# Viewstem performance scenarios

Build the workspace with its locked dependencies before measuring.

```sh
npm ci
npm run build:svelte
npm run build:docs
npx playwright install chromium
node bench/run.mjs all --warmup=1 --samples=3
```

The runner prints the path of the JSON report, including build and fixture fingerprints,
warmups, every measured sample, and assertion failures. Supply `--out=/path/to/results.json`
to keep the report at a specific location. Use `core`, `browser`, or `docs` to run one
group and `--match` to select scenario IDs.

```sh
node bench/run.mjs core --match='join-left|retained-state' --samples=7
node bench/run.mjs browser --match='native-select|data-table'
node bench/run.mjs docs --match='search|playground|workbench'
```

Run `core` and `browser` with `--match=query-projection` to measure a single Query
response beside 50 or 1,000 unchanged options from a second Query. The fixture
checks that the catalog is fetched once, the summary updates, and option identity
is preserved.

The State, Query, and DataTable follow-up cases report observations alongside
elapsed time. These include View publications, source requests, and retained DOM
rows. Use `--match='cross-view|scoped-subscribers|borrowed-view|burst|component[.]shared|unrelated-table'`
to run those cases. A sample that misses a completion signal records the failed
phase. Use `--timeout-ms` to set the per-sample limit, which defaults to 60,000 ms.

## Compare a revision with the current source

Export the reference revision into a temporary directory and copy the same
`bench/` directory into it. The reference must install dependencies in that
directory so workspace package links resolve to its own build. Capture the
current Node executable by absolute path so both runs use it after changing
directories.

```sh
viewstem_export="$(mktemp -d)"
viewstem_node="$(node -p 'process.execPath')"
git archive --format=tar -o "$viewstem_export/source.tar" 4cc2d04
mkdir "$viewstem_export/base"
tar -xf "$viewstem_export/source.tar" -C "$viewstem_export/base"
cp -R bench "$viewstem_export/base/bench"
(
  cd "$viewstem_export/base"
  export PATH="$(dirname "$viewstem_node"):$PATH"
  npm ci
  npm run build:svelte
  npm run build:docs
  "$viewstem_node" bench/run.mjs all --source-archive=../source.tar --warmup=1 --samples=3 --out=../before.json
)
"$viewstem_node" bench/run.mjs all --warmup=1 --samples=3 --out="$viewstem_export/after.json"
```

Build the current source with the commands above before starting the paired
runs. Compare fixture and lock hashes, scenario IDs, workloads, environment,
and completion checks. The archive report records the source commit, archive
hash, changed tracked files outside `bench/`, and package source and build
fingerprints.

| Area | Examples and completion checks |
| --- | --- |
| Core registry and resources | Batch registration, updates, a resource set and reference resolution |
| Core state and values | Batched derived State, snapshots, native values, writable State ports, retained owners, URL restoration and merge |
| Core expressions and layout | CEL compilation and evaluation, automatic Grid placement, repeated and conditional Views |
| Core execution | Code and declarative Actions, cancellation, authorized HTTP and login, nested Query reuse, polling, refresh and joins |
| DOM | Native and custom connectors, keyed slot mount/update/reorder, event delivery, teardown, runtime and PostCSS style scoping |
| Svelte | Adapter mount/update/replacement/teardown, mixed Svelte and DOM, declarative host source changes |
| UI | Each catalog family, Native Select scaling, table mount and interactions, inputs, calendar and menu events |
| Docs | Home, guides, example index, all English lessons and component pages, Korean and mobile samples, Pagefind search, playground and workbench interactions |

Core durations use the Node monotonic clock. Browser durations use Chromium's
monotonic clock at the operation boundary. Renderer scenarios check completion
through renderer promises. Docs navigation observes DOM milestones from the
navigation start. Docs interactions observe state or DOM completion from the
input event. Pixel presentation requires separate frame capture. HTTP examples
use deterministic mock responses. See each workload label for its timed scope.

Run repeats sequentially with the same build commands, browser, fixtures and
machine. The report presents the median and maximum of the measured samples.
Small blocks expose run-to-run variability. Use larger independent repeats to estimate p95.
Profile separately to find the work behind a slow scenario.
