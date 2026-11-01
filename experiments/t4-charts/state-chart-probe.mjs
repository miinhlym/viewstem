// T4-only integration fixture: reuse the existing State/port models, no new SDK.
import { compilePorts } from '../t3-state/ports-probe.mjs';
import { compile } from './probe.mjs';

export const rowsSchema = {
  type: 'array', items: { type: 'object', required: ['seriesId', 'x', 'y'], additionalProperties: false,
    properties: { seriesId: { type: 'string', minLength: 1 }, x: { type: 'number' }, y: { type: ['number', 'null'] } } },
};
const objectSchema = { type: 'object' };

export function registerChartComponent(registry, id, { engine, kind, store }) {
  const inputs = {
    rows: { kind: 'Value', schema: rowsSchema, required: true },
    option: { kind: 'Value', schema: objectSchema, default: {} },
    series: { kind: 'Value', schema: objectSchema, default: {} },
    sharedData: { kind: 'State', schema: rowsSchema },
  };
  const ports = compilePorts({ resourceKind: 'Component', ports: inputs, store });
  const descriptor = {
    resourceKind: 'Component', engine, kind,
    // Explicit base schemas plus the same engine-specific recursive runtime
    // validation as the standalone chart probe. No selection event semantics.
    inputs: structuredClone(inputs), events: Object.freeze({}),
    prepare(connections) {
      const prepared = ports.prepare(connections);
      const plan = compile({ engine, kind, rows: prepared.ports.rows, option: prepared.ports.option, series: prepared.ports.series });
      return { plan, ports: prepared.ports, states: prepared.states };
    },
  };
  registry.register(id, descriptor); return registry.get(id);
}

export function connectChart({ descriptor, inputs, store, watch, render }) {
  // The host supplies all input expressions/State handles and watched addresses.
  // No ambient State discovery, data writes, or chart-event policy is introduced.
  descriptor.prepare(inputs); // Reject bad connections before subscribe/drawing.
  let current, renders = 0, alive = true, lastError;
  const unsubscribe = store.subscribe(watch.map(handle => handle.address), () => {
    if (!alive) return;
    try {
      current = descriptor.prepare(inputs); render(current.plan); renders++; lastError = undefined;
    } catch (error) { lastError = error; throw error; }
  });
  return {
    snapshot: () => current, get renders() { return renders; }, get error() { return lastError; },
    dispose() { if (!alive) return; alive = false; unsubscribe(); },
  };
}
