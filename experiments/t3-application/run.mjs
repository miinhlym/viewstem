import { scenarios } from './scenarios.mjs';
import { harness, report } from '../verification/report.mjs';

export const sources = ['application-probe.mjs', 'scenarios.mjs', 'run.mjs', 'browser-run.mjs',
  '../t3-ui/ui-probe.mjs', '../t3-ui/value-evaluator.mjs', '../t2-http-boundary/value-expressions.mjs', '../t3-state/state-probe.mjs', '../t3-state/immutable.mjs', '../verification/errors.mjs',
  '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package-lock.json',
  '../t2-query-races/query-probe.mjs', '../t2-query-races/harness.mjs', '../t2-url-races/url-probe.mjs', '../verification/report.mjs',
  '../../docs/spec/07-host-integration.md', '../../docs/spec/09-preserved-contracts.md', '../../docs/VIEWSTEM-SPEC.md'];
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const { test, results } = harness();
  await scenarios(test);
  await report({ base: import.meta.url, name: process.argv[2] ?? `node${process.versions.node.split('.')[0]}.json`, sources, results,
    scope: 'Private application protocol plus existing independent UI/State/T2 Query probes. No production registry/Store/core/SDK; host authorization is an explicit fixture.' });
}
