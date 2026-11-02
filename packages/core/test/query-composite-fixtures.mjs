import { createQueryEngine } from '../src/query/index.mjs';
import { createRegistry } from '../src/registry.mjs';
import { createValueEvaluator } from '../src/http/expressions.mjs';
import { FakeClock, deferred, flush, observe, check as assert } from './query-fixtures.mjs';
export { flush, observe };
export const ref = path => ({ '@path': path });
export const leaf = path => ({ ports: { value: { required: true } }, sources: { main: {
  datasource: { kind: 'Http', baseUrl: 'https://example.com' }, request: { method: 'GET', path, params: { value: ref('/ports/value') } },
} }, transform: { input: ref('/sources/main') } });
export const definitions = () => ({ left: leaf('/left'), right: leaf('/right'), root: { sources: {
  left: { queryRef: 'left', inputs: { value: ref('/ports/a') } }, right: { queryRef: 'right', inputs: { value: ref('/ports/b') } },
}, transform: { input: { left: ref('/sources/left'), right: ref('/sources/right') } } } });
function resources(queries) {
  const copied = structuredClone(queries);
  function adapt(spec) {
    if (spec.ports) for (const [name, port] of Object.entries(spec.ports)) spec.ports[name] = { kind: 'Value', schema: true, ...port };
    for (const source of Object.values(spec.sources ?? {})) if (source.query) adapt(source.query);
  }
  for (const [id, spec] of Object.entries(copied)) {
    adapt(spec);
    if (id === 'root') spec.ports = { ...Object.fromEntries(['a', 'b', 'supplied', 'base', 'right', 'value'].map(key => [key, { kind: 'Value', schema: true }])), ...spec.ports };
  }
  return Object.entries(copied).map(([id, spec]) => ({ kind: 'Query', id, spec }));
}
export class CompositeEngine {
  constructor({ queries, executeHttp, clock, requestTimeoutMs }) {
    this.runtime = createQueryEngine({ registry: createRegistry({ resources: resources(queries) }), requestExecutor: executeHttp, clock, requestTimeoutMs });
  }
  execute(id, inputs, options = {}) { return this.runtime.execute(id, { inputs, ...options, fresh: !options.reuse }); }
}
export function setup(options = {}) {
  const requests = [], trace = [], clock = new FakeClock();
  const engine = new CompositeEngine({ queries: options.queries ?? definitions(), clock, requestTimeoutMs: options.query?.timeoutMs,
    executeHttp: async (plan, meta) => {
      const request = await createValueEvaluator(() => {})(plan.request, { values: { ports: plan.inputs } });
      const completion = deferred();
      const row = { id: requests.length + 1, request, inputs: structuredClone(plan.inputs), ...meta, completion, completed: false };
      requests.push(row); return completion.promise;
    },
  });
  const host = { slots: new Map(), getSnapshot: (name = 'search') => host.slots.get(name)?.query.getSnapshot(), mount(name, settings = {}) {
    host.slots.get(name)?.query.dispose();
    const query = engine.runtime.createUsage(options.root ?? 'root', { inputs: { a: 1, b: 1 }, clock, ...settings,
      onChange: state => trace.push({ kind: 'getSnapshot', reason: state.status === 'success' ? 'run-success' : state.status, state }),
    });
    host.slots.set(name, { query }); return query;
  } };
  const query = host.mount('search', options.query);
  return { requests, trace, clock, engine, host, query,
    async reply(id, value, code) {
      const row = requests[id - 1]; if (!row || row.completed) throw Error(`Invalid completion ${id}`);
      row.completed = true;
      if (code) row.completion.reject({ code, message: 'raw transport text must not escape' });
      else row.completion.resolve({ status: 200, headers: {}, body: structuredClone(value) });
      await flush();
    },
    async close() {
      for (const slot of host.slots.values()) slot.query.dispose();
      for (const row of requests) if (!row.completed) { row.completed = true; row.completion.resolve({ body: null }); }
      await flush(); assert.equal(clock.tasks.size, 0);
      for (const slot of host.slots.values()) assert.equal(slot.query.tickets.size, 0);
    },
  };
}
