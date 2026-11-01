import { runScenarios } from './scenarios.mjs';
import { harness, report } from '../verification/report.mjs';

export const sources = ['ui-probe.mjs', 'value-evaluator.mjs', 'action-bridge.mjs', 'dynamic-scenarios.mjs', 'scenarios.mjs', 'run.mjs', 'browser-run.mjs',
  '../t2-http-boundary/value-expressions.mjs', '../verification/errors.mjs', '../t3-action/action-probe.mjs', '../t3-state/state-probe.mjs', '../t3-state/ports-probe.mjs', '../t3-state/immutable.mjs',
  '../verification/report.mjs', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package-lock.json',
  '../../docs/spec/05-component-view.md', '../../docs/spec/10-value-contracts.md', '../../docs/VIEWSTEM-SPEC.md'];
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const { test, results } = harness();
  await runScenarios(test);
  await report({ base: import.meta.url, name: process.argv[2] ?? `node${process.versions.node.split('.')[0]}.json`,
    scope: 'Independent UI model plus existing ActionProbe snapshot fixture; no production core/Svelte or actual UI Query scheduler.', results, sources });
}
