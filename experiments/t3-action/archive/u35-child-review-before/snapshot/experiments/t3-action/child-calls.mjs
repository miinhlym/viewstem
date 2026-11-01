import assert from 'node:assert/strict';
import { ActionProbe } from './action-probe.mjs';
import { StateProbe } from '../t3-state/state-probe.mjs';
import { queryFixture } from '../t3-state/ports-probe.mjs';
import { deferred, flush, FakeClock, ControlledTransport, observe } from '../t2-query-races/harness.mjs';
import { ProbeHost } from '../t2-query-races/query-probe.mjs';
import { harness, report } from '../verification/report.mjs';

const { test, results } = harness();
const value = { kind: 'Value', schema: { type: 'integer' }, required: true };
const state = { kind: 'State', schema: { type: 'integer' }, required: true };
const path = p => ({ '@path': p });
const reject = (promise, code) => assert.rejects(promise, error => error.code === code);
function fixture(options = {}) {
  const store = new StateProbe(), engine = new ActionProbe({ store, ...options });
  return { store, engine, owner: engine.owner() };
}

await test('K05/async-direct-and-mutual-child-recursion', async () => {
  for (const mutual of [false, true]) {
    const f = fixture(); let calls = 0;
    const action = target => ({ native: async ({ invokeAction }) => {
      calls++; await Promise.resolve();
      if (calls < 4) await invokeAction({ actionRef: target });
    } });
    f.engine.register([['a', action(mutual ? 'b' : 'a')], ['b', action('a')]]);
    await reject(f.engine.invoke(f.owner, 'a'), 'ACTION_RECURSION');
    assert.equal(calls, mutual ? 2 : 1);
  }
});
await test('K05/native-declarative-inline-call-stack', async () => {
  for (const inline of [false, true]) {
    const f = fixture(); let calls = 0;
    f.engine.register([
      ['a', { native: async ({ invokeAction }) => {
        if (++calls > 3) return;
        await Promise.resolve();
        await invokeAction(inline ? { action: { steps: [{ kind: 'Action', actionRef: 'a' }] } } : { actionRef: 'b' });
      } }],
      ['b', { steps: [{ kind: 'Action', actionRef: 'a' }] }],
    ]);
    await reject(f.engine.invoke(f.owner, 'a'), 'ACTION_RECURSION'); assert.equal(calls, 1);
  }
});
await test('K05/noncyclic-reuse-parallel-children-and-independent-roots', async () => {
  const f = fixture(), wait = deferred(); let calls = 0;
  f.engine.register([
    ['leaf', { ports: { n: value }, native: async ({ inputs }) => { calls++; await wait.promise; return inputs.n; }, output: { schema: { type: 'integer' } } }],
    ['parent', { native: async ({ invokeAction }) => {
      const numbers = await Promise.all([1, 2].map(n => invokeAction({ actionRef: 'leaf', inputs: { n } })));
      numbers.push(await invokeAction({ actionRef: 'leaf', inputs: { n: 3 } })); return numbers;
    }, output: { schema: { type: 'array', items: { type: 'integer' } } } }],
  ]);
  const parent = f.engine.invoke(f.owner, 'parent'), external = f.engine.invoke(f.owner, 'leaf', { n: 4 });
  await flush(); assert.equal(calls, 3); wait.resolve();
  assert.deepEqual(await parent, [1, 2, 3]); assert.equal(await external, 4); assert.equal(calls, 4);
});
await test('A12-A13-K16/parent-cancel-stops-child-not-independent-call', async () => {
  const f = fixture(), wait = deferred(), contexts = [];
  const cell = f.store.scope().register('shared', { schema: { type: 'integer' }, initial: 0 });
  f.engine.register([
    ['leaf', { ports: { cell: state }, native: async context => { contexts.push(context); await wait.promise; context.inputs.cell.write(7); } }],
    ['parent', { ports: { cell: state }, native: async ({ inputs, invokeAction }) => { await invokeAction({ actionRef: 'leaf', inputs }); } }],
  ]);
  const link = f.engine.connect(f.owner, { actionRef: 'parent', inputs: { cell } });
  const cancelled = reject(link.invoke(), 'CANCELLED'), other = f.engine.invoke(f.owner, 'leaf', { cell });
  await flush(); link.dispose(); await cancelled;
  assert.equal(contexts[0].signal.aborted, true); assert.equal(contexts[1].signal.aborted, false);
  assert.throws(() => contexts[0].inputs.cell.write(9), error => error.code === 'CANCELLED');
  wait.resolve(); await other; await flush(); assert.equal(cell.read(), 7);
});
await test('A12-K16/transitive-child-cancel-blocks-state-and-query', async () => {
  const f = fixture(), wait = deferred(); let captured, refreshes = 0, later = 0;
  const cell = f.store.scope().register('cell', { schema: { type: 'integer' }, initial: 0 });
  const q = queryFixture({ snapshot: () => ({}), refresh: () => ++refreshes, retry: () => ++refreshes });
  const ports = { cell: state, q: { kind: 'Query', required: true } };
  f.engine.register([
    ['leaf', { ports, native: async context => { captured = context; await wait.promise; context.inputs.cell.write(1); } }],
    ['middle', { ports, native: async ({ inputs, invokeAction }) => { await invokeAction({ actionRef: 'leaf', inputs }); later++; } }],
    ['parent', { ports, native: async ({ inputs, invokeAction }) => { await invokeAction({ actionRef: 'middle', inputs }); later++; } }],
  ]);
  const link = f.engine.connect(f.owner, { actionRef: 'parent', inputs: { cell, q } });
  const stopped = reject(link.invoke(), 'CANCELLED'); await flush(); link.dispose(); await stopped;
  assert.equal(captured.signal.aborted, true);
  for (const method of ['refresh', 'retry']) assert.throws(() => captured.inputs.q[method](), error => error.code === 'CANCELLED');
  wait.resolve(); await flush(); assert.equal(later, 0); assert.equal(refreshes, 0); assert.equal(cell.read(), 0);
});
await test('A04-A08-K36/child-result-validation-and-explicit-recovery', async () => {
  const f = fixture();
  f.engine.register([
    ['false', { native: () => false, output: { schema: { type: 'boolean' } } }],
    ['bad', { native: () => undefined, output: { schema: { type: 'integer' } } }],
    ['parent', { native: async ({ invokeAction }) => {
      assert.equal(await invokeAction({ actionRef: 'false' }), false);
      try { await invokeAction({ actionRef: 'bad' }); } catch (error) {
        assert.equal(error.code, 'TYPE_MISMATCH'); assert.equal(error.location, '/output'); return false;
      }
      throw Error('missing rejection');
    }, output: { schema: { type: 'boolean' } } }],
  ]);
  assert.equal(await f.engine.invoke(f.owner, 'parent'), false);
});
await test('A02-K01/child-input-snapshot-and-inline-output', async () => {
  const f = fixture(), wait = deferred(); let captured;
  f.engine.register([
    ['leaf', { ports: { n: value }, native: async ({ inputs }) => { captured = inputs; await wait.promise; return inputs.n; }, output: { schema: { type: 'integer' } } }],
    ['parent', { native: async ({ invokeAction }) => {
      const inputs = { n: 1 }, pending = invokeAction({ actionRef: 'leaf', inputs }); inputs.n = 8;
      wait.resolve(); assert.equal(await pending, 1);
      return invokeAction({ action: { ports: { n: value }, steps: [], output: { schema: { type: 'integer' }, value: path('/ports/n') } }, inputs: { n: 2 } });
    }, output: { schema: { type: 'integer' } } }],
  ]);
  assert.equal(await f.engine.invoke(f.owner, 'parent'), 2); assert.equal(captured.n, 1);
});
await test('K01-K16/child-target-input-authority-validation', async () => {
  let runs = 0;
  const f = fixture({ authorize: ({ definition }) => definition.allowed !== false });
  f.engine.register([
    ['leaf', { ports: { n: value }, native: () => { runs++; } }],
    ['denied', { allowed: false, native: () => { runs++; } }],
    ['parent', { ports: { n: value }, native: async ({ invokeAction }) => {
      for (const request of [{}, { actionRef: 'leaf', action: { steps: [] } }, { actionRef: 'leaf', owner: f.owner }, { actionRef: '' }, { action: { native() {} } }]) await reject(invokeAction(request), 'INVALID_DEFINITION');
      await reject(invokeAction({ actionRef: 'absent' }), 'REFERENCE_NOT_FOUND');
      await reject(invokeAction({ actionRef: 'denied' }), 'EXECUTION_BLOCKED');
      // A parent input is not implicitly captured by its child's ports.
      await assert.rejects(invokeAction({ actionRef: 'leaf' }));
      await assert.rejects(invokeAction({ actionRef: 'leaf', inputs: null }));
      await invokeAction({ actionRef: 'leaf', inputs: { n: 3 } });
    } }],
  ]);
  await f.engine.invoke(f.owner, 'parent', { n: 1 }); assert.equal(runs, 1);
});
await test('K16/retained-child-capability-ends-with-parent', async () => {
  for (const ending of ['success', 'failure', 'cancel']) {
    const f = fixture(), wait = deferred(); let invoke, calls = 0;
    f.engine.register([
      ['leaf', { native: () => { calls++; } }],
      ['parent', { native: async ({ invokeAction }) => { invoke = invokeAction; await wait.promise; if (ending === 'failure') throw Error('failed'); } }],
    ]);
    const link = f.engine.connect(f.owner, { actionRef: 'parent' }), run = link.invoke();
    const settled = ending === 'success' ? run : reject(run, ending === 'cancel' ? 'CANCELLED' : 'INTERNAL_ERROR');
    if (ending === 'cancel') link.dispose(); wait.resolve(); await settled;
    await reject(invoke({ actionRef: 'leaf' }), 'CANCELLED'); assert.equal(calls, 0);
  }
});
await test('K16/unawaited-child-is-cancelled-when-parent-settles', async () => {
  for (const failure of [false, true]) {
    const f = fixture(), wait = deferred(); let childSignal, parentSignal, settled;
    f.engine.register([
      ['leaf', { native: async ({ signal }) => { childSignal = signal; await wait.promise; } }],
      ['parent', { native: ({ signal, invokeAction }) => {
        parentSignal = signal; settled = invokeAction({ actionRef: 'leaf' }).then(() => 'unexpected', error => error.code);
        if (failure) throw Error('failed');
      } }],
    ]);
    const run = f.engine.invoke(f.owner, 'parent'); if (failure) await reject(run, 'INTERNAL_ERROR'); else await run;
    assert.equal(await settled, 'CANCELLED'); assert.equal(childSignal.aborted, true);
    assert.equal(parentSignal.aborted, false); wait.resolve(); await flush();
  }
});
await test('K05/unrelated-registration-preserves-active-recursion-identity', async () => {
  const f = fixture(); let calls = 0;
  f.engine.register([['parent', { native: async ({ invokeAction }) => {
    calls++; await Promise.resolve(); f.engine.register([[`new-${calls}`, { steps: [] }]]);
    if (calls < 4) await invokeAction({ actionRef: 'parent' });
  } }]]);
  await reject(f.engine.invoke(f.owner, 'parent'), 'ACTION_RECURSION'); assert.equal(calls, 1);
});
await test('K05/public-invoke-remains-independent-after-await', async () => {
  const f = fixture(); let calls = 0;
  f.engine.register([['same', { ports: { n: value }, native: async ({ inputs }) => {
    calls++; await Promise.resolve();
    if (inputs.n === 0) await f.engine.invoke(f.owner, 'same', { n: 1 });
  } }]]);
  await f.engine.invoke(f.owner, 'same', { n: 0 }); assert.equal(calls, 2);
});

await test('K01/inline-nested-native-implementation-is-not-a-registration', async () => {
  const f = fixture(); let calls = 0;
  const injected = { kind: 'Action', spec: { native() { calls++; } } };
  f.engine.register([['parent', { native: async ({ invokeAction }) => {
    for (const steps of [[injected], [{ kind: 'If', condition: false, then: [injected] }], [{ kind: 'If', condition: true, then: [], else: [injected] }]])
      await reject(invokeAction({ action: { steps } }), 'INVALID_DEFINITION');
  } }]]);
  await f.engine.invoke(f.owner, 'parent'); assert.equal(calls, 0);
});
await test('K16/child-query-pending-ticket-cancellation-through-parent-handle', async () => {
  for (const sharedWaiter of [false, true]) {
    const clock = new FakeClock(), trace = [], transport = new ControlledTransport(clock, trace), host = new ProbeHost(clock, transport, trace), target = host.mount('q');
    const f = fixture(), q = queryFixture(target); let child, captured;
    const ports = { q: { kind: 'Query', required: true } };
    f.engine.register([
      ['leaf', { ports, native: async context => { captured = context; await context.inputs.q.refresh(); } }],
      ['parent', { ports, native: ({ inputs, invokeAction }) => { child = observe(invokeAction({ actionRef: 'leaf', inputs })); } }],
    ]);
    const other = sharedWaiter ? observe(target.refresh()) : null;
    await f.engine.invoke(f.owner, 'parent', { q }); await child.settled; await flush();
    assert.equal(child.code, 'CANCELLED'); assert.equal(captured.signal.aborted, true);
    assert.equal(Boolean(target.pending), sharedWaiter);
    if (sharedWaiter) assert.equal(target.pending.tickets.filter(ticket => !ticket.done).length, 1);
    transport.respond(1, 'initial'); await flush();
    assert.equal(transport.requests.length, sharedWaiter ? 2 : 1);
    if (sharedWaiter) { transport.respond(2, 'shared'); await other.settled; assert.equal(other.status, 'fulfilled'); }
    assert.throws(() => captured.inputs.q.refresh(), error => error.code === 'CANCELLED');
    assert.throws(() => captured.inputs.q.retry(), error => error.code === 'CANCELLED');
  }
});
await test('K16/child-query-active-refresh-and-retry-cancel-only-own-ticket', async () => {
  for (const method of ['refresh', 'retry']) {
    const clock = new FakeClock(), trace = [], transport = new ControlledTransport(clock, trace), host = new ProbeHost(clock, transport, trace), target = host.mount('q');
    transport.respond(1, 'initial', method === 'retry' ? 'HTTP_ERROR' : null); await flush();
    const f = fixture(), q = queryFixture(target); let child, request;
    const ports = { q: { kind: 'Query', required: true } };
    f.engine.register([
      ['leaf', { ports, native: async ({ inputs }) => { request = observe(inputs.q[method]()); await request.settled; } }],
      ['parent', { ports, native: ({ inputs, invokeAction }) => { child = observe(invokeAction({ actionRef: 'leaf', inputs })); } }],
    ]);
    await f.engine.invoke(f.owner, 'parent', { q }); await child.settled; await flush();
    assert.equal(child.code, 'CANCELLED'); assert.equal(request.status, 'rejected'); assert.equal(request.code, 'CANCELLED');
    assert.equal(transport.requests.length, 2); assert.equal(transport.requests[1].signal.aborted, false);
    transport.respond(2, 'shared-data'); await flush(); assert.equal(target.snapshot().data, 'shared-data');
    assert.equal(target.snapshot().status, 'success'); assert.equal(transport.requests.length, 2);
  }
});

await report({ base: import.meta.url, name: process.argv[2] ?? 'child-calls-node24.json', scope: 'Invocation-bound native child calls with recursion/cancellation, explicit inputs and independent public roots; experimental API, no production SDK', results,
  sources: ['child-calls.mjs', 'action-probe.mjs', '../t3-state/ports-probe.mjs', '../t3-state/state-probe.mjs', '../t3-state/immutable.mjs', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package-lock.json', '../t2-http-boundary/value-expressions.mjs', '../t2-query-races/harness.mjs', '../t2-query-races/query-probe.mjs', '../verification/report.mjs', '../verification/errors.mjs'] });
