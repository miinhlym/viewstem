import { StateProbe } from '../t3-state/state-probe.mjs';
import { stateValue } from '../t3-state/ports-probe.mjs';
import { registry, kinds } from './probe.mjs';
import { rowsSchema, registerChartComponent, connectChart } from './state-chart-probe.mjs';

function assert(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(left, right) { assert(JSON.stringify(left) === JSON.stringify(right), `expected ${JSON.stringify(right)}, got ${JSON.stringify(left)}`); }
function rejects(run, code) { let error; try { run(); } catch (caught) { error = caught; } assert(error?.code === code, `expected ${code}, got ${error?.code ?? error}`); }
export const initialRows = () => [
  { seriesId: 'a', x: 3, y: 2 }, { seriesId: 'b', x: 1, y: 3 }, { seriesId: 'a', x: 1, y: null }, { seriesId: 'a', x: 1, y: 0 },
];
export const changedRows = () => [
  { seriesId: 'b', x: 4, y: 1 }, { seriesId: 'a', x: 2, y: 4 }, { seriesId: 'c', x: 3, y: 2 }, { seriesId: 'a', x: 1, y: 0 },
];
export function seriesSettings(kind) {
  return kind === 'BarChart'
    ? { defaults: { itemStyle: { color: '#112233' }, barWidth: 10 }, overrides: { b: { itemStyle: { color: '#ff0000' } } } }
    : { defaults: { lineStyle: { color: '#112233', width: 4 }, connectNulls: false }, overrides: { b: { lineStyle: { color: '#ff0000' } } } };
}

export async function runStateScenarios(test) {
  for (const engine of ['canvas', 'echarts']) for (const kind of kinds) {
    await test(`X01.state.${engine}.${kind}.explicit-component-ports-reactivity`, () => {
      const store = new StateProbe(), service = store.scope(), registration = registry(), source = initialRows();
      const data = service.register('data', { schema: rowsSchema, initial: source });
      const descriptor = registerChartComponent(registration, `${engine}.${kind}`, { engine, kind, store });
      equal(registration.size, 1); equal(descriptor.resourceKind, 'Component'); equal(descriptor.events, {});
      equal(descriptor.inputs.rows.kind, 'Value'); equal(descriptor.inputs.sharedData.kind, 'State');
      equal(descriptor.inputs.rows.schema, descriptor.inputs.sharedData.schema);
      const settings = seriesSettings(kind), beforeSettings = structuredClone(settings), historyA = [], historyB = [];
      const inputs = { rows: stateValue(data), sharedData: data, series: settings };
      const a = connectChart({ descriptor, inputs, store, watch: [data], render: plan => historyA.push(plan) });
      const b = connectChart({ descriptor, inputs, store, watch: [data], render: plan => historyB.push(plan) });
      equal([a.renders, b.renders], [1,1]);
      const firstSnapshot = data.read();
      equal(a.snapshot().ports.rows, firstSnapshot); assert(!('write' in a.snapshot().ports.rows), 'Value unexpectedly carries write access');
      assert(a.snapshot().ports.sharedData.address === data.address && b.snapshot().ports.sharedData.address === data.address);
      equal(a.snapshot().ports.sharedData.generation, b.snapshot().ports.sharedData.generation);
      // The service's caller-owned object is isolated and remains mutable.
      source[0].y = 99; assert(!Object.isFrozen(source)); equal(data.read()[0].y, 2);
      historyA[0].option.series[0].data[0][1] = 88; equal(data.read()[0].y, 2); equal(historyB[0].option.series[0].data[0][1], 2);
      data.write(changedRows()); equal([a.renders,b.renders], [2,2]);
      for (const binding of [a,b]) {
        equal(binding.snapshot().plan.option.series.map(s => s.id), ['b','a','c']);
        equal(binding.snapshot().plan.option.series.find(s => s.id === 'a').data, [[2,4],[1,0]]);
        equal(binding.snapshot().plan.option.series.find(s => s.id === 'b')[kind === 'BarChart' ? 'itemStyle' : 'lineStyle'].color, '#ff0000');
      }
      // Both State ports address the same original cell, not synchronized copies.
      a.snapshot().ports.sharedData.write(initialRows()); equal([a.renders,b.renders], [3,3]);
      assert(a.snapshot().ports.sharedData.read() === b.snapshot().ports.sharedData.read());
      equal(firstSnapshot[0].y, 2); equal(firstSnapshot[2].y, null); equal(firstSnapshot[3].y, 0);
      equal(settings, beforeSettings);
      a.dispose(); a.dispose(); data.write(changedRows()); equal([a.renders,b.renders], [3,4]);
      b.dispose(); data.write(initialRows()); equal([a.renders,b.renders], [3,4]);
      equal(data.read(), initialRows()); equal(store.diagnostics(), []);
      return { registered: `${engine}.${kind}`, sameAddress: data.address, renderCounts: [a.renders,b.renders], externalStateAfterDispose: data.read(), initialSnapshotStable: firstSnapshot };
    });
    await test(`X01.state.${engine}.${kind}.schema-mismatch-and-no-implicit-inputs`, () => {
      const store = new StateProbe(), service = store.scope(), registration = registry();
      const data = service.register('data', { schema: rowsSchema, initial: initialRows() });
      const descriptor = registerChartComponent(registration, `${engine}.${kind}`, { engine, kind, store });
      const integerSchema = structuredClone(rowsSchema); integerSchema.items.properties.y.type = ['integer','null'];
      const integer = service.register('integer', { schema: integerSchema, initial: initialRows() });
      const derived = service.register('derived', { schema: rowsSchema, dependencies: [data], derived: rows => rows });
      let renderCalls = 0;
      const mount = inputs => connectChart({ descriptor, inputs, store, watch: [data], render: () => renderCalls++ });
      rejects(() => mount({ sharedData: data }), 'INVALID_DEFINITION');
      rejects(() => mount({ rows: stateValue(data), sharedData: integer }), 'TYPE_CONTRACT_MISMATCH');
      rejects(() => mount({ rows: stateValue(data), sharedData: derived }), 'TYPE_CONTRACT_MISMATCH');
      rejects(() => mount({ rows: [{ seriesId: 'a', x: 1, y: '2' }] }), 'TYPE_MISMATCH');
      rejects(() => mount({ rows: [{ seriesId: 'a', x: 1 }] }), 'TYPE_MISMATCH');
      rejects(() => mount({ rows: stateValue(data), unrelated: data }), 'INVALID_DEFINITION');
      rejects(() => mount({ rows: data }), 'TYPE_MISMATCH');
      equal(renderCalls, 0);
      const readOnly = mount({ rows: stateValue(data) }); equal(readOnly.renders, 1); equal(readOnly.snapshot().states.sharedData.status, 'missing');
      const before = data.read(); rejects(() => data.write([{ seriesId: 'a', x: 1, y: '2' }]), 'TYPE_MISMATCH');
      assert(data.read() === before); equal(readOnly.renders, 1); readOnly.dispose(); equal(store.diagnostics(), []);
      return { rejectedBeforeRender: 7, validValueOnlyRender: 1, originalStatePreserved: true };
    });
  }
}
