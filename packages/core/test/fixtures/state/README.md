# Core State/value/URL acceptance fixtures

`core-acceptance-coverage.json` maps the 113 assigned acceptance IDs and the
additional M05 integration target to exact product test names. Grouped tests
can cover several acceptance rows; row count is not a separate test count.

These tests import `packages/core/src` only. The initial expectations were
promoted from the T3 State/port and T1 schema experiment corpora; experiments
and their archives remain unchanged. `schema-cases.mjs` is fixture data, not a
probe runtime. `url-adapter.mjs` controls host delivery and records history;
URL merging uses the actual core implementation and applies every delayed
operation only after a fresh `isCurrent()` check.

Run the focused product suites from the repository root:

```sh
node --test packages/core/test/state-*.test.mjs packages/core/test/values-*.test.mjs packages/core/test/url-*.test.mjs
```

The eight files contain 270 tests: State lifecycle 27, ports 28, schema
registration 78, schema runtime 83, State integration 10, expression/date 10,
Store URL 22, View URL 12. The schema runtime suite also compares 2,484
generated combinations against the independent JSON validator, in addition
to its named base corpus.

This manifest is an evidence index; test execution results are reported by
the task verification run. It does not claim full CEL/Dart conformance or
all-browser History/router behavior. The actual View URL tests cover initial
Query ordering, replacement preflight, cleanup failure, supersession, disposal,
and duplicate service Store connections. Real browser tests are maintained by
the parent integration task.
