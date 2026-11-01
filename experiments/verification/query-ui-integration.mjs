import assert from 'node:assert/strict';
import { setup, flush, ref } from '../t2-composite-query/harness.mjs';
import { Registry, UIProbe } from '../t3-ui/ui-probe.mjs';
import { harness, report } from './report.mjs';

const { test, results } = harness();
const component = (id, spec) => ({ kind: 'Component', id, spec });
function uiFixture(f) {
  const registry = new Registry([
    component('Row', { slots: { default: {} } }),
    component('Text', { ports: { text: { kind: 'Value', schema: { type: ['string', 'number'] } } } }),
    component('Counter', { states: { count: { kind: 'State', schema: { type: 'integer' }, initial: 0 } },
      render: { id: 'count-text', componentRef: 'Text', inputs: { text: ref('/states/count') } } }),
  ], { Row: { layout: 'row' }, Text: { tag: 'span', text: 'text' } });
  const ui = new UIProbe(registry), view = { ports: { current: { kind: 'Value', schema: { type: 'string' } }, other: { kind: 'Value', schema: { type: 'string' } } },
    render: { id: 'root', componentRef: 'Row', slots: { default: [
      { id: 'result', componentRef: 'Text', inputs: { text: ref('/ports/current') } },
      { id: 'other-result', componentRef: 'Text', inputs: { text: ref('/ports/other') } },
      { id: 'unrelated', componentRef: 'Counter' },
    ] } } };
  const shown = state => JSON.stringify({ status: state?.status, stale: state?.stale, data: state?.data, error: state?.error?.code });
  const render = () => { ui.ports = { current: shown(f.query.snapshot()), other: shown(f.host.snapshot('other')) }; ui.apply(view); };
  render(); const counter = ui.find('unrelated')[0]; counter.states.count = 42; render();
  const initial = { generation: counter.generation, address: counter.address, states: counter.states };
  // Private event bridge: the existing scheduler records every published snapshot.
  // Observe that hook to project each publication; no new public observer API.
  const originalPush = f.trace.push;
  f.trace.push = function (...events) { const size = originalPush.apply(this, events); if (events.some(row => row.kind === 'snapshot')) render(); return size; };
  return { ui, render, assertPreserved() {
    const now = ui.find('unrelated')[0]; assert.equal(now.generation, initial.generation); assert.equal(now.address, initial.address); assert.equal(now.states, initial.states);
    assert.equal(now.states.count, 42); assert.equal(ui.find('count-text')[0].inputs.text, 42);
  }, current: () => JSON.parse(ui.find('result')[0].inputs.text), other: () => JSON.parse(ui.find('other-result')[0].inputs.text),
  close() { f.trace.push = originalPush; } };
}
await test('Q16/composite-failure-keeps-unrelated-query-and-ui-state', async () => {
  const f = setup(), screen = uiFixture(f);
  try {
    await flush(); const other = f.host.mount('other', { inputs: { a: 9, b: 9 } }); await flush();
    await f.reply(3, ['other-left']); await f.reply(4, ['other-right']); const otherSnapshot = other.snapshot();
    await f.reply(1, ['left-1']); await f.reply(2, ['right-1']); screen.assertPreserved();
    f.query.configure({ inputs: { a: 2, b: 2 } }); await flush();
    await f.reply(5, ['partial-left']); assert.equal(screen.current().status, 'running');
    assert.deepEqual(screen.current().data, { left: ['left-1'], right: ['right-1'] });
    await f.reply(6, null, 'HTTP_ERROR');
    assert.equal(screen.current().status, 'error'); assert.equal(screen.current().error, 'HTTP_ERROR'); assert.equal(screen.current().stale, true);
    assert.equal(f.query.snapshot().error.location, '/spec/sources/right');
    assert.deepEqual(screen.current().data, { left: ['left-1'], right: ['right-1'] });
    screen.assertPreserved(); assert.equal(other.snapshot(), otherSnapshot); assert.equal(screen.other().status, 'success');
    assert.deepEqual(screen.other().data, { left: ['other-left'], right: ['other-right'] }); assert.equal(f.requests.length, 6);
  } finally { screen.close(); await f.close(); }
});
await test('Q22/child-reuse-and-stale-pair-preserve-unrelated-ui', async () => {
  const f = setup(), screen = uiFixture(f);
  try {
    await flush(); await f.reply(1, ['left-1']); await f.reply(2, ['right-1']);
    f.query.configure({ inputs: { a: 2, b: 1 } }); await flush();
    assert.deepEqual(f.requests.map(row => [row.request.path, row.inputs.value]), [['/left', 1], ['/right', 1], ['/left', 2]]);
    assert.equal(screen.current().status, 'running'); assert.equal(screen.current().stale, true);
    assert.deepEqual(screen.current().data, { left: ['left-1'], right: ['right-1'] }); screen.assertPreserved();
    await f.reply(3, ['left-2']); assert.deepEqual(screen.current().data, { left: ['left-2'], right: ['right-1'] });
    assert.equal(screen.current().status, 'success'); assert.equal(screen.current().stale, false); screen.assertPreserved(); assert.equal(f.requests.length, 3);
  } finally { screen.close(); await f.close(); }
});
await report({ base: import.meta.url, name: process.argv[2] ?? 'query-ui-node24.json', scope: 'Actual composite scheduler snapshots projected through independent UI model; core-owned UI state lifetime only, no production renderer, focus or scroll guarantee', results,
  sources: ['query-ui-integration.mjs', 'report.mjs', 'errors.mjs', '../t2-composite-query/harness.mjs', '../t2-composite-query/composite-probe.mjs', '../t2-query-races/query-probe.mjs', '../t2-query-races/harness.mjs', '../t2-http-boundary/value-expressions.mjs', '../t3-ui/ui-probe.mjs', '../t3-ui/value-evaluator.mjs', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package-lock.json'] });
