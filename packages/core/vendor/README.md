# Vendored CEL engine

`cel-js/` is the audited `@marcbachmann/cel-js@8.0.0` source plus the preserved
Viewstem experiment patch and a narrow production integration fix. The original
MIT license is `cel-js/LICENSE`. No experiment/archive files are runtime imports.

Reproduce with `node packages/core/scripts/prepare-cel.mjs` after root `npm ci`.
The script verifies 23 upstream file hashes, the fixed experiment patch hash,
25 intermediate hashes, the production patch hash, and 25 final hashes. Both
patches require clean application without fuzz or offsets. Existing vendor
content is verified, never silently replaced. See
[`core-cel-support.md`](../../../docs/handoff/core-cel-support.md) for public
function admission, limits, evidence, and the cache bug fixed in production.

RE2JS 2.9.1 is a pinned normal runtime dependency, not vendored here. Its license
and source are distributed by that package. No claim of full CEL conformance is
made by vendoring the candidate's larger default registry.
