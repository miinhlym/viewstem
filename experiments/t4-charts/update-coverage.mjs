import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sources } from './run.mjs';
const read = file => readFile(new URL(file, import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const resultFiles = ['results/node22.json','results/node24.json','results/chromium22.json','results/chromium24.json'];
const currentSources = Object.fromEntries(await Promise.all(sources.map(async file => [file, sha(await read(file))])));
const environments = [];
for (const file of resultFiles) {
  const bytes = await read(file), result = JSON.parse(bytes);
  if (result.summary.failed || result.summary.passed !== result.results.length) throw new Error(`${file}: failing/incomplete result`);
  if (new Set(result.results.map(row => row.id)).size !== result.results.length) throw new Error(`${file}: duplicate test IDs`);
  for (const [source, hash] of Object.entries(currentSources)) if (result.sourceSha256[source] !== hash) throw new Error(`${file}: stale source ${source}`);
  if (result.screenshot && sha(await read(`results/${result.screenshot.file}`)) !== result.screenshot.sha256) throw new Error(`${file}: stale screenshot`);
  environments.push({ result: file, resultSha256: sha(bytes), runtime: result.runtime, browser: result.browser, echarts: result.echarts,
    summary: result.summary, populations: result.populations ?? { contract: result.results.length, actualBrowser: 0 },
    screenshot: result.screenshot, sourceSha256: result.sourceSha256 });
}
const acceptance = (await read('../../docs/spec/11-optional-charts.md')).toString().split('\n');
const meanings = {
  X01: ['verified-experiment', 'Separate explicit Component descriptors for LineChart/TimeSeries/BarChart, declared input schemas/empty events, empty initial registry and duplicate ID rejection. Existing StateProbe/compilePorts connect service data State reads through Value ports plus explicit identical-cell State ports for all three kinds/both engines. Store writes update actual Canvas/SVG pixels; mismatched schemas/read-only targets/bad Value input reject before rendering; input and historic snapshots stay intact and renderer disposal preserves external State.', 'Production Component SDK/Svelte/core integration and automatic expression dependency tracking are not asserted. Host explicitly supplies watched State addresses in this fixture. Option/series base object schemas are complemented by the existing recursive engine allowlist validator. TimeSeries additional behavior beyond the documented common contract is not inferred.'],
  X02: ['verified-experiment', 'Exact bounded leaf-option support list and recursive rejection outside it; Canvas rejects ECharts-only title/grid/smooth/symbol settings and does not switch engines. Supported styles/layout are actually rendered.', 'Only the published experimental allowlist is implemented, not the full ECharts option language, renderer event features or all option combinations.'],
  X03: ['verified-experiment', 'Both value/time LineChart preserve unsorted X and duplicate X in data and actual Canvas/SVG path vertex order.', 'Numeric x/epoch-millisecond fixture only; category axis, upstream Query transforms and production integration are outside the probe. No TimeSeries sorting policy is added.'],
  X04: ['verified-experiment', 'All three kinds preserve overrides on data-generated stable IDs through reorder/add/remove/re-add; deep defaults inheritance and same-live-renderer updates inspected.', 'Stable IDs are explicit data keys in this fixture API; production data-binding/State/resource integration remains unimplemented.'],
  X05: ['verified-experiment', 'option.series, series.data and nested defaults/override data are rejected; id/type injection also rejected; runtime series/data only comes from validated rows.', 'This is the independent validator, not the production module schema or a security audit of JavaScript proxy/accessor objects.'],
  X06: ['verified-experiment', 'Both engines/all three kinds accept finite doubles including signed zero/extremes and explicit null; NaN/Infinity/string/missing/undefined/bool/object Y are rejected with paths, without coercion.', 'Double extrema are validated/transferred in plan tests; numerical/visual stability across the entire finite-double domain is not established by the small browser fixtures. Production adapters remain separate.'],
  X07: ['verified-experiment', 'Both line kinds/engines retain null and 0 in actual renderer inputs; gap/connect selection verified by M segments, gap pixels, zero endpoint pixels and no fabricated zero at null X.', 'Representative static line fixtures only; stacked/area, smoothing plus null, animation, streaming and all boundary combinations are untested.'],
  X08: ['verified-experiment', 'Dynamic series uses whole-chart option plus defaults/ID overrides; plain widget accepts label without series structure; input isolation is verified.', 'The simple widget is a separate fixture, not a complete production widget or code Component schema registry.'],
};
const records = [];
for (const [id, [status, observed, remaining]] of Object.entries(meanings)) {
  const testIds = [...new Set((await Promise.all(resultFiles.map(async file => JSON.parse(await read(file)).results
    .filter(row => row.id.startsWith(`${id}.`) || row.id.startsWith(`DOM.${id}.`)).map(row => row.id)))).flat())];
  if (!testIds.length) throw new Error(`${id}: uncovered`);
  records.push({ id, source: ['../../docs/spec/11-optional-charts.md','../../docs/spec/09-preserved-contracts.md','../../docs/handoff/open-contracts.md','probe.mjs','scenarios.mjs','browser-scenarios.mjs',
    ...(id === 'X01' ? ['state-chart-probe.mjs','state-scenarios.mjs','../t3-state/state-probe.mjs','../t3-state/ports-probe.mjs','../../docs/VIEWSTEM-SPEC.md'] : [])],
    contractRow: acceptance.find(line => line.startsWith(`| ${id} |`)), result: resultFiles, testIds, status, observed, remaining });
}
await writeFile(new URL('coverage.json', import.meta.url), JSON.stringify({ scope: 'T4 optional charts only; independent disposable probe, no production core/SDK/Svelte integration or full-engine conformance.',
  statusMeaning: 'verified-experiment means the named clauses are observed within the explicitly bounded fixture/module support profile, including direct reuse of existing State/port models for X01. This status does not assert production conformance.',
  environments, records }, null, 2) + '\n');
console.log(JSON.stringify({ environments: environments.map(({ result, runtime, browser, summary }) => ({ result, runtime, browser, summary })), records: records.length, sourceHashesCurrent: true }));
