# Vendored CEL engine

`cel-js/` is the audited `@marcbachmann/cel-js@8.0.0` source plus the preserved
Viewstem experiment patch and a narrow production integration fix. The original
MIT license is `cel-js/LICENSE`. No experiment/archive files are runtime imports.

Reproduce with `node packages/core/scripts/prepare-cel.mjs` after root `npm ci`.
The script verifies 23 upstream file hashes, the fixed experiment patch hash,
25 intermediate hashes, the production patch hash, and 25 final hashes. Both
patches require clean application without fuzz or offsets. Existing vendor
content is verified, never silently replaced. The [public CEL reference](../../../docs/core-cel.md)
describes functions, value conversion and limits.

| Patch | SHA-256 |
|---|---|
| `cel-js-8.0.0.patch` | `62dd517376de54a08018f6166b250d9013b907e87b11ab75d0f07e264de0da63` |
| `production-fixes.patch` | `ae10b2b12750ee2f6d75d0c2592f57a4b3b8dee8a3159b901965ed1fbfafcf26` |

The production fix removes a handler cache shared by global and receiver calls.
A global `matches(s, p)` followed by `s.matches(p)` could fail with
`ev.chargeArguments is not a function`. Each AST now receives its own call
adapter. The regression tests cover both orders and shared `size` overloads.

RE2JS 2.9.1 is a pinned normal runtime dependency, not vendored here. Its license
and source are distributed by that package. No claim of full CEL conformance is
made by vendoring the candidate's larger default registry.
