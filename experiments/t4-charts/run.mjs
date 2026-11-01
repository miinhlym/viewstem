import { runScenarios } from './scenarios.mjs';
import { report } from '../verification/report.mjs';
export const sources = ['probe.mjs', 'scenarios.mjs', 'state-chart-probe.mjs', 'state-scenarios.mjs', 'browser-scenarios.mjs', 'browser-run.mjs', 'run.mjs', 'update-coverage.mjs', 'package.json', 'package-lock.json',
  'node_modules/echarts/package.json', 'node_modules/zrender/package.json',
  '../t3-state/state-probe.mjs', '../t3-state/ports-probe.mjs', '../t3-state/immutable.mjs',
  '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package-lock.json',
  '../verification/errors.mjs',
  '../verification/report.mjs', '../verification/node_modules/esbuild/package.json', '../t2-url-races/node_modules/playwright/package.json'];
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const results = [];
  await runScenarios(async (id, run) => {
    try { const evidence = await run(); results.push({ id, passed: true, ...(evidence ? { evidence } : {}) }); }
    catch (error) { results.push({ id, passed: false, error: { name: error.name, message: error.message, stack: error.stack } }); }
  });
  await report({ base: import.meta.url, name: process.argv[2] ?? 'node.json', sources, results,
    scope: 'Independent T4 contract/validation/plan and existing StateProbe/compilePorts integration; no production core, component SDK, StateStore or Svelte renderer.', extra: { echarts: '6.1.0' } });
}
