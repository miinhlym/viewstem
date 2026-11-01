import { ProbeHost } from '../t2-query-races/query-probe.mjs';
import { FakeClock, deferred, flush, observe } from '../t2-query-races/harness.mjs';
import { createValueEvaluator } from '../t2-http-boundary/value-expressions.mjs';
import { CompositeEngine, compositeTransport } from './composite-probe.mjs';
export { flush, observe, CompositeEngine };
export const ref = path => ({ '@path': path });
export function leaf(path) {
  return { ports: { value: { required: true } }, sources: { main: {
    datasource: { kind: 'Http', baseUrl: 'http://fixture.invalid' },
    request: { method: 'GET', path, params: { value: ref('/ports/value') } },
  } }, transform: { input: ref('/sources/main') } };
}
export function definitions() {
  return { left: leaf('/left'), right: leaf('/right'), root: {
    sources: {
      left: { queryRef: 'left', inputs: { value: ref('/ports/a') } },
      right: { queryRef: 'right', inputs: { value: ref('/ports/b') } },
    }, transform: { input: { left: ref('/sources/left'), right: ref('/sources/right') } },
  } };
}
export function setup(options = {}, mutation = {}) {
  const requests = [], trace = [], engineTrace = [], clock = new FakeClock();
  const executeHttp = async (plan, meta) => {
    const request = await createValueEvaluator(() => {})(plan.request, { values: { ports: plan.inputs } });
    const completion = deferred();
    const row = { id: requests.length + 1, request, inputs: structuredClone(plan.inputs), ...meta, completion, completed: false };
    requests.push(row);
    // Ignore cooperative cancellation on purpose: stale completion must be harmless.
    return completion.promise;
  };
  const engine = new CompositeEngine({ queries: options.queries ?? definitions(), executeHttp, trace: engineTrace, mutation });
  let host;
  const transport = compositeTransport(engine, options.root ?? 'root', (owner, generation) => {
    const slot = [...host.slots.values()].find(slot => slot.owner === owner);
    return slot?.query.alive && slot.query.gate && slot.query.ready && slot.query.generation === generation;
  });
  host = new (options.Host ?? ProbeHost)(clock, transport, trace);
  const query = host.mount('search', { inputs: { a: 1, b: 1 }, ...options.query });
  return { requests, trace, engineTrace, clock, engine, transport, host, query,
    async reply(id, value, code) {
      const row = requests[id - 1];
      if (!row || row.completed) throw new Error(`Invalid fixture completion ${id}`);
      row.completed = true;
      if (code) row.completion.reject({ code, message: 'raw transport text must not escape' });
      else row.completion.resolve({ status: 200, headers: { fixture: 'envelope' }, body: value });
      await flush();
    },
    async close() {
      for (const slot of host.slots.values()) slot.query.dispose();
      for (const row of requests) if (!row.completed) { row.completed = true; row.completion.resolve({ body: null }); }
      await flush();
      if (clock.tasks.size) throw new Error('Leaked timer');
      if (engine.caches.size) throw new Error('Leaked owner cache');
      for (const slot of host.slots.values()) if (slot.query.tickets.size) throw new Error('Leaked waiter');
    },
    evidence() { return { trace, engineTrace, requests: requests.map(({ id, request, inputs, sourceLocation, runId, signal }) => ({
      id, path: request.path, inputs, sourceLocation, runId, aborted: signal.aborted,
    })) }; },
  };
}
