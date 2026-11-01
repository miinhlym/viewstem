import assert from 'node:assert/strict';
import { ActionProbe } from './action-probe.mjs';
import { StateProbe } from '../t3-state/state-probe.mjs';
import { queryFixture, stateValue } from '../t3-state/ports-probe.mjs';
import { deferred, flush, FakeClock, ControlledTransport } from '../t2-query-races/harness.mjs';
import { ProbeHost } from '../t2-query-races/query-probe.mjs';
import { harness, report } from '../verification/report.mjs';
const { test, results } = harness();
const integer = { type: 'integer' }, bool = { type: 'boolean' }, port = (kind, schema) => ({ kind, ...(schema === undefined ? {} : { schema }), required: true });
const path = p => ({ '@path': p }), write = value => ({ kind: 'SetState', target: path('/ports/target'), value });
let connectionId = 0;
function fixture(options = {}) { const store = new StateProbe(), scope = store.scope(), runtime = new ActionProbe({ store, ...options }); return { store, scope, runtime, owner: runtime.owner() }; }
const connect = (f, spec, inputs = {}, id = 'run', owner = f.owner) => f.runtime.connect(owner, { id, spec, inputs });
const rejected = (promise, code) => assert.rejects(promise, error => error.code === code);

await test('A08/output-evaluation-fails-after-state-and-external-success', async () => {
  let writes = 0; const f = fixture({ query: async () => { writes++; return false; } }), target = f.scope.register('target', { schema: integer, initial: 0 });
  const c = connect(f, { ports: { target: port('State', integer) }, steps: [write(1), { kind: 'Query', queryRef: 'external' }], output: { schema: true, value: path('/steps/noResult') } }, { target });
  await rejected(c.invoke(), 'REFERENCE_NOT_FOUND'); assert.equal(target.read(), 1); assert.equal(writes, 1); assert.equal(c.snapshot().status, 'error');
});
await test('A10-A18/opposite-branch-local-result-is-not-visible', async () => {
  const f = fixture({ variable: async () => true });
  const c = connect(f, { steps: [{ kind: 'If', condition: false, then: [{ kind: 'Variable', variableRef: 'value', id: 'thenResult' }], else: [{ kind: 'Assert', condition: path('/steps/thenResult') }] }] });
  await rejected(c.invoke(), 'REFERENCE_NOT_FOUND');
  const positive = connect(f, { steps: [{ kind: 'Variable', variableRef: 'value', id: 'outer' }, { kind: 'If', condition: true, then: [{ kind: 'Assert', condition: path('/steps/outer') }] }] }, {}, 'positive');
  await positive.invoke(); assert.equal(positive.snapshot().status, 'success');
});
await test('A21/same-id-different-owners-have-independent-observation', async () => {
  const f = fixture(), wait = deferred(), other = f.runtime.owner();
  const a = connect(f, { native: async () => { await wait.promise; return true; }, output: { schema: bool } });
  const b = connect(f, { native: () => false, output: { schema: bool } }, {}, 'run', other);
  const run = a.invoke(); assert.equal(f.owner.snapshot('run').status, 'running'); assert.equal(other.snapshot('run').status, 'idle');
  await b.invoke(); assert.equal(other.snapshot('run').data, false); assert.equal(other.snapshot('run').status, 'success'); assert.equal(f.owner.snapshot('run').data, null);
  wait.resolve(); await run; assert.equal(f.owner.snapshot('run').data, true); assert.equal(other.snapshot('run').data, false);
});
await test('A25/invalid-targets-and-invalid-write-preserve-state', async () => {
  const f = fixture(), source = f.scope.register('source', { schema: integer, initial: 2 }), target = f.scope.register('target', { schema: integer, initial: 7 });
  const derived = f.scope.register('derived', { schema: integer, dependencies: [source], derived: x => x * 2 });
  for (const input of [derived, { ...target }, null, { value: 1 }]) {
    const c = connect(f, { ports: { target: port('State', integer) }, steps: [write(9)] }, { target: input }, `invalid-${++connectionId}`);
    await assert.rejects(c.invoke()); assert.equal(target.read(), 7); c.dispose();
  }
  const missing = connect(f, { ports: { target: port('State', integer) }, steps: [write(9)] }, {}, 'missing'); await rejected(missing.invoke(), 'INVALID_DEFINITION');
  const wrongValue = connect(f, { ports: { target: port('State', integer) }, steps: [write('9')] }, { target }, 'wrong-value'); await rejected(wrongValue.invoke(), 'TYPE_MISMATCH'); assert.equal(target.read(), 7);
  for (const targetExpression of [path('/ports/q/data'), path('/ports/value'), { '@call': 'concat', args: ['target'] }, path('/states/absent')]) {
    const c = connect(f, { ports: { q: port('Query'), value: port('Value', integer) }, steps: [{ kind: 'SetState', target: targetExpression, value: 9 }] }, { q: queryFixture({ snapshot: () => ({ data: 1 }) }), value: 1 }, `path-${++connectionId}`);
    await assert.rejects(c.invoke()); assert.equal(target.read(), 7); c.dispose();
  }
});
await test('Q12-K28/explicit-query-runs-independently-and-never-returns-old-data', async () => {
  const calls = [], f = fixture({ query: ({ inputs, signal }) => { const wait = deferred(); calls.push({ inputs, signal, wait }); return wait.promise; } });
  const spec = { ports: { n: port('Value', integer) }, steps: [{ id: 'result', kind: 'Query', queryRef: 'request', inputs: { n: path('/ports/n') } }], output: { schema: true, value: path('/steps/result') } };
  const source = f.scope.register('input', { schema: integer, initial: 1 });
  const a = connect(f, spec, { n: stateValue(source) }), b = connect(f, spec, { n: stateValue(source) }, 'other');
  const one = a.invoke(), two = b.invoke(); await flush(); assert.equal(calls.length, 2); assert.notEqual(calls[0].signal, calls[1].signal);
  calls[0].wait.resolve('first'); calls[1].wait.resolve('second'); assert.equal(await one, 'first'); assert.equal(await two, 'second');
  const next = a.invoke(); const failed = rejected(next, 'HTTP_ERROR'); await flush(); assert.equal(calls.length, 3); assert.equal(a.snapshot().data, null);
  calls[2].wait.reject({ code: 'HTTP_ERROR' }); await failed; await flush(); await flush();
  assert.equal(calls.length, 3); assert.equal(a.snapshot().status, 'error'); assert.equal(a.snapshot().data, null); assert.equal(b.snapshot().data, 'second');
  // A real State input change does not subscribe or restart an explicit call.
  source.write(10); await flush(); assert.equal(calls.length, 3);
  const explicit = a.invoke(); await flush(); assert.equal(calls.length, 4); assert.equal(calls[3].inputs.n, 10);
  calls[3].wait.resolve('explicit'); assert.equal(await explicit, 'explicit');
});
await test('K37/catching-call-cancellation-cannot-resurrect-result-or-handle', async () => {
  const f = fixture(), target = f.scope.register('target', { schema: integer, initial: 7 }); let caught = false, writeCode;
  const c = connect(f, { ports: { target: port('State', integer) }, native: async ({ inputs, signal }) => {
    try { await new Promise((_, reject) => signal.addEventListener('abort', () => reject({ code: 'CANCELLED' }), { once: true })); }
    catch { caught = true; try { inputs.target.write(10); } catch (error) { writeCode = error.code; } return true; }
  }, output: { schema: bool } }, { target });
  const run = c.invoke(), failed = rejected(run, 'CANCELLED'); c.dispose(); await failed; await flush();
  assert.equal(caught, true); assert.equal(writeCode, 'CANCELLED'); assert.equal(target.read(), 7);
});
await test('K14/retry-gate-cancel-and-error-only-boundaries', async () => {
  const clock = new FakeClock(), trace = [], transport = new ControlledTransport(clock, trace), host = new ProbeHost(clock, transport, trace), query = host.mount('q', { refresh: false });
  transport.respond(1, 'old'); await flush(); query.configure({ inputs: { term: 'B' } }); transport.respond(2, null, 'HTTP_ERROR'); await flush();
  const controller = new AbortController(), bound = query.handle(controller.signal); controller.abort(); await rejected(bound.retry(), 'CANCELLED'); assert.equal(transport.requests.length, 2);
  query.configure({ executeWhen: false }); await rejected(query.retry(), 'EXECUTION_BLOCKED'); assert.equal(transport.requests.length, 2);
  query.dispose(); await rejected(query.retry(), 'CANCELLED');
});
await test('K27/retry-start-success-and-refailure-keep-atomic-pair', async () => {
  const clock = new FakeClock(), trace = [], transport = new ControlledTransport(clock, trace), host = new ProbeHost(clock, transport, trace), query = host.mount('q', { inputs: { term: 'A' } });
  transport.respond(1, 'A'); await flush(); query.configure({ inputs: { term: 'B' } }); transport.respond(2, null, 'HTTP_ERROR'); await flush();
  const first = query.retry(), firstFailure = rejected(first, 'HTTP_ERROR');
  assert.equal(query.snapshot().status, 'running'); assert.equal(query.snapshot().error, null); assert.equal(query.snapshot().data, 'A'); assert.deepEqual(query.snapshot().dataInputs, { term: 'A' }); assert.equal(query.snapshot().stale, true);
  transport.respond(3, null, 'HTTP_ERROR'); await firstFailure; assert.equal(query.snapshot().data, 'A'); assert.deepEqual(query.snapshot().dataInputs, { term: 'A' });
  const second = query.retry(); assert.equal(query.snapshot().error, null); transport.respond(4, 'B'); await second;
  assert.equal(query.snapshot().data, 'B'); assert.deepEqual(query.snapshot().dataInputs, { term: 'B' }); assert.equal(query.snapshot().stale, false); assert.equal(query.snapshot().error, null);
  const successful = trace.filter(event => event.kind === 'snapshot' && event.state.status === 'success').at(-1).state;
  assert.equal(successful.data, 'B'); assert.deepEqual(successful.dataInputs, { term: 'B' }); query.dispose();
});
await report({ base: import.meta.url, name: process.argv[2] ?? 'boundaries-node24.json', scope: 'Additional Action/Query acceptance clauses; unresolved K05 dynamic native invocation remains in separate failing report', results,
  sources: ['boundaries.mjs', 'action-probe.mjs', '../t3-state/state-probe.mjs', '../t3-state/ports-probe.mjs', '../t3-state/immutable.mjs', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package-lock.json', '../t2-query-races/query-probe.mjs', '../t2-query-races/harness.mjs', '../t2-http-boundary/value-expressions.mjs', '../verification/errors.mjs', '../verification/report.mjs'] });
