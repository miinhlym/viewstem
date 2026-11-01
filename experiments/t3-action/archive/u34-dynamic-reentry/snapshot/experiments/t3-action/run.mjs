import assert from 'node:assert/strict';
import { ActionProbe } from './action-probe.mjs';
import { StateProbe } from '../t3-state/state-probe.mjs';
import { expression, queryFixture } from '../t3-state/ports-probe.mjs';
import { harness, report } from '../verification/report.mjs';
import { ProbeHost } from '../t2-query-races/query-probe.mjs';
import { FakeClock, ControlledTransport, deferred, flush } from '../t2-query-races/harness.mjs';
const { test, results } = harness();
const integer = { type: 'integer' }, boolean = { type: 'boolean' };
const value = (schema = true, more = {}) => ({ kind: 'Value', schema, ...more });
const state = schema => ({ kind: 'State', schema, required: true });
const path = name => ({ '@path': name });
const set = (v, target = 'cell') => ({ kind: 'SetState', target: path(`/ports/${target}`), value: v });
const query = (id = 'q') => ({ kind: 'Query', queryRef: 'request', id });
const assertStep = (condition, message) => ({ kind: 'Assert', condition, ...(message === undefined ? {} : { message }) });
function fixture(options = {}) { const store = new StateProbe(), scope = store.scope(), runtime = new ActionProbe({ store, ...options }); return { store, scope, runtime, owner: runtime.owner() }; }
function connect(f, definition, inputs = {}, id = 'on') { f.runtime.register([['main', definition]]); return f.runtime.connect(f.owner, { id, actionRef: 'main', inputs }); }
async function rejects(promise, code) { await assert.rejects(promise, error => error.code === code); }

await test('A01-A08-A23/sequence-stops-and-preserves-completed-effects', async () => {
  for (const failureAt of ['assert', 'query', 'output']) {
    let requests = 0; const f = fixture({ query: async () => { requests++; if (failureAt === 'query') throw { code: 'HTTP_ERROR' }; return 1; } });
    const cell = f.scope.register('cell', { schema: integer, initial: 0 });
    const definition = { ports: { cell: state(integer) }, steps: [set(1), query(), assertStep(failureAt !== 'assert'), set(2)],
      output: { schema: integer, value: failureAt === 'output' ? 'bad' : 1 } };
    const connection = connect(f, definition, { cell });
    await rejects(connection.invoke(), failureAt === 'assert' ? 'ASSERTION_FAILED' : failureAt === 'query' ? 'HTTP_ERROR' : 'TYPE_MISMATCH');
    assert.equal(requests, 1); assert.equal(cell.read(), failureAt === 'output' ? 2 : 1); assert.equal(connection.snapshot().status, 'error'); assert.equal(connection.snapshot().data, null);
  }
});
await test('A01/first-failure-runs-no-later-step-or-output', async () => {
  let requests = 0; const f = fixture({ query: async () => { requests++; return 1; } });
  const connection = connect(f, { steps: [assertStep(false), query()], output: { schema: true, value: path('/steps/nonexistent') } });
  await rejects(connection.invoke(), 'ASSERTION_FAILED'); assert.equal(requests, 0);
});
await test('A02/value-snapshot-and-state-target-identity', async () => {
  const wait = deferred(); let captured; const f = fixture(), a = f.scope.register('a', { schema: integer, initial: 0 }), b = f.scope.register('b', { schema: integer, initial: 0 });
  let inputs = { form: { n: 1 }, cell: a };
  const connection = connect(f, { ports: { form: value(), cell: state(integer) }, native: async context => { captured = context; await wait.promise; context.inputs.cell.write(context.inputs.form.n); } }, () => inputs);
  const run = connection.invoke(); inputs.form.n = 8; inputs = { form: { n: 9 }, cell: b }; wait.resolve(); await run;
  assert.equal(captured.inputs.form.n, 1); assert.equal(a.read(), 1); assert.equal(b.read(), 0); assert.deepEqual(Object.keys(captured).sort(), ['inputs', 'signal']);
});
await test('A03-K05/registration-xor-cycles-and-unused-definitions', () => {
  let calls = 0; const f = fixture({ query: () => calls++ });
  for (const step of [{ kind: 'Query' }, { kind: 'Query', queryRef: 'x', spec: {} }, { kind: 'If', condition: true }, { kind: 'Try', steps: [] }]) assert.throws(() => f.runtime.register([['bad', { steps: [step] }]]));
  assert.throws(() => f.runtime.register([['a', { steps: [{ kind: 'If', condition: false, then: [{ kind: 'Action', actionRef: 'b' }] }] }], ['b', { steps: [{ kind: 'Action', actionRef: 'a' }] }]]), error => error.code === 'ACTION_RECURSION');
  f.runtime.register([['leaf', { steps: [] }], ['a', { steps: [{ kind: 'Action', actionRef: 'leaf' }, { kind: 'Action', actionRef: 'leaf' }] }]]);
  assert.equal(calls, 0); assert.throws(() => f.runtime.register([['leaf', { native: () => {} }]]));
});
await test('A04/native-and-declared-false-is-successful-raw-step-value', async () => {
  for (const native of [true, false]) {
    const f = fixture();
    f.runtime.register([['child', native ? { native: () => false, output: { schema: boolean } } : { steps: [], output: { schema: boolean, value: false } }]]);
    const connection = connect(f, { steps: [{ id: 'child', kind: 'Action', actionRef: 'child' }], output: { schema: boolean, value: path('/steps/child') } });
    assert.equal(await connection.invoke(), false); assert.equal(connection.snapshot().status, 'success'); assert.equal(connection.snapshot().data, false);
  }
});
await test('A05-A06/explicit-output-and-void', async () => {
  const f = fixture({ query: async () => 99 }); const connection = connect(f, { steps: [query()] });
  assert.equal(await connection.invoke(), undefined); assert.equal(connection.snapshot().data, null);
  for (const definition of [{ native: () => 1 }, { native: () => undefined, output: { schema: true } }]) {
    const other = fixture(); await rejects(connect(other, definition).invoke(), 'TYPE_MISMATCH');
  }
});
await test('A07/nullable-output-and-void-reference-error', async () => {
  const f = fixture(); assert.equal(await connect(f, { steps: [], output: { schema: { type: ['integer', 'null'] }, value: null } }).invoke(), null);
  for (const step of [{ kind: 'If', condition: false, then: [], id: 'void' }, { ...assertStep(true), id: 'void' }]) {
    const other = fixture(); await rejects(connect(other, { steps: [step], output: { schema: true, value: path('/steps/void') } }).invoke(), 'REFERENCE_NOT_FOUND');
  }
});
await test('A09-A17-K15/strict-conditions-lazy-message-and-no-catch', async () => {
  for (const condition of [0, 1, null, '', 'true', [], {}]) for (const kind of ['If', 'Assert']) {
    const f = fixture(); await rejects(connect(f, { steps: [{ kind, condition, ...(kind === 'If' ? { then: [] } : {}) }] }).invoke(), 'TYPE_MISMATCH');
  }
  const f = fixture(); await connect(f, { steps: [assertStep(true, path('/steps/unread')), { kind: 'If', condition: false, then: [assertStep(false)] }] }).invoke();
  const other = fixture(); const c = connect(other, { steps: [{ kind: 'If', condition: true, then: [assertStep(false, 'declared reason')], else: [] }] });
  await assert.rejects(c.invoke(), error => error.code === 'ASSERTION_FAILED' && error.message === 'declared reason');
});
await test('A10-A18/branch-results-lexical-scope', async () => {
  const f = fixture({ variable: async ({ reference }) => reference === 'false' ? false : 1 });
  const variable = (id, ref) => ({ id, kind: 'Variable', variableRef: ref });
  const connection = connect(f, { steps: [variable('outer', 'false'), { kind: 'If', condition: true, then: [assertStep({ '@path': '/steps/outer' }, 'false remains false')] }] });
  await rejects(connection.invoke(), 'ASSERTION_FAILED');
  for (const steps of [[{ kind: 'If', condition: true, then: [variable('inner', 'one')] }, assertStep(path('/steps/inner'))], [assertStep(path('/steps/future')), variable('future', 'false')]]) {
    const other = fixture({ variable: async () => false }); await rejects(connect(other, { steps }).invoke(), 'REFERENCE_NOT_FOUND');
  }
});
await test('A11-A21/duplicates-ignored-per-connection-without-id', async () => {
  let calls = 0; const wait = deferred(), f = fixture(); f.runtime.register([['task', { native: async () => { calls++; await wait.promise; } }]]);
  const a = f.runtime.connect(f.owner, { actionRef: 'task' }), b = f.runtime.connect(f.owner, { actionRef: 'task' });
  const first = a.invoke(), second = b.invoke(); assert.equal(await a.invoke(), undefined); assert.equal(calls, 2); assert.equal(a.snapshot().running, true);
  wait.resolve(); await Promise.all([first, second]); assert.equal(a.snapshot().running, false); await a.invoke(); assert.equal(calls, 3);
});
await test('A12-A13-A15-K16/removed-call-late-value-and-shared-state', async () => {
  const wait = deferred(); const contexts = [], f = fixture(), cell = f.scope.register('shared', { schema: integer, initial: 0 });
  f.runtime.register([['task', { ports: { cell: state(integer) }, native: async context => { contexts.push(context); await wait.promise; return 9; }, output: { schema: integer } }]]);
  const a = f.runtime.connect(f.owner, { id: 'on', actionRef: 'task', inputs: { cell } }), other = f.runtime.connect(f.runtime.owner(), { id: 'on', actionRef: 'task', inputs: { cell } });
  const cancelled = a.invoke(); const expected = rejects(cancelled, 'CANCELLED'), active = other.invoke(); a.dispose(); await expected;
  const next = f.runtime.connect(f.owner, { id: 'on', actionRef: 'task', inputs: { cell } });
  assert.throws(() => contexts[0].inputs.cell.write(100), error => error.code === 'CANCELLED'); contexts[1].inputs.cell.write(2); assert.equal(cell.read(), 2);
  wait.resolve(); assert.equal(await active, 9); await flush(); assert.equal(next.snapshot().status, 'idle'); assert.equal(contexts[0].signal.aborted, true);
});
await test('A16/self-removal-after-write-stops-child-output', async () => {
  let calls = 0; const f = fixture({ query: async () => { calls++; return 1; } }), cell = f.scope.register('cell', { schema: integer, initial: 0 });
  const connection = connect(f, { ports: { cell: state(integer) }, steps: [set(1), query()], output: { schema: true, value: path('/steps/q') } }, { cell });
  f.store.subscribe(cell.address, payload => { if (payload.changes.length) connection.dispose(); });
  await rejects(connection.invoke(), 'CANCELLED'); assert.equal(cell.read(), 1); assert.equal(calls, 0);
});
await test('A19-K15/assert-message-failure-default-and-nonstring', async () => {
  for (const [message, code] of [[undefined, 'ASSERTION_FAILED'], [42, 'TYPE_MISMATCH'], [path('/steps/no'), 'REFERENCE_NOT_FOUND']]) {
    const f = fixture(); const connection = connect(f, { steps: [assertStep(false, message)] });
    await rejects(connection.invoke(), code); if (message === undefined) assert.equal(connection.snapshot().error.message, 'Assertion failed');
  }
});
await test('A20-A21/owner-observation-ids', () => {
  const f = fixture(); f.runtime.register([['task', { steps: [] }]]); const a = f.runtime.connect(f.owner, { id: 'click', actionRef: 'task' });
  assert.equal(f.owner.snapshot('click').status, 'idle'); assert.throws(() => f.runtime.connect(f.owner, { id: 'click', actionRef: 'task' }));
  const other = f.runtime.owner(); f.runtime.connect(other, { id: 'click', actionRef: 'task' }); a.dispose(); const next = f.runtime.connect(f.owner, { id: 'click', actionRef: 'task' }); assert.equal(next.snapshot().status, 'idle');
});
await test('A22/input-errors-run-zero-steps-and-identify-port', async () => {
  for (const input of [{}, { name: 1 }, { name: expression(() => ({ status: 'pending' })) }, { name: expression(() => { throw { code: 'HTTP_ERROR' }; }) }]) {
    let calls = 0; const f = fixture({ query: async () => calls++ });
    const connection = connect(f, { ports: { name: value({ type: 'string' }, { required: true }) }, steps: [query()], output: { schema: true, value: path('/steps/q') } }, input);
    await assert.rejects(connection.invoke()); assert.equal(calls, 0); assert.equal(connection.snapshot().running, false); assert.equal(connection.snapshot().data, null); assert.equal(connection.snapshot().error.input, 'name');
  }
});
await test('A24-A25/full-replacement-and-invalid-targets', async () => {
  const f = fixture(), cell = f.scope.register('cell', { schema: { type: 'object' }, initial: { a: 1, b: 2 } });
  await connect(f, { ports: { cell: state({ type: 'object' }) }, steps: [set({ a: 3 })] }, { cell }).invoke(); assert.deepEqual(JSON.parse(JSON.stringify(cell.read())), { a: 3 });
  for (const [port, input] of [[value(), { a: 1 }], [state(integer), cell]]) {
    const other = fixture(); const connection = connect(other, { ports: { cell: port }, steps: [set(1)] }, { cell: input }); await assert.rejects(connection.invoke());
  }
});
await test('Q15/query-callback-native-conversion-and-state-isolation', async () => {
  let sent; const f = fixture({ query: async ({ inputs }) => { sent = inputs; inputs.data[0][1].push(99); return null; } });
  const source = new Map([['set', new Set([1, 2])]]), cell = f.scope.register('cell', { schema: true, initial: source });
  await connect(f, { ports: { data: value() }, steps: [{ ...query(), inputs: { data: path('/ports/data') } }] }, { data: cell.read() }).invoke();
  assert.deepEqual(sent, { data: [['set', [1, 2, 99]]] }); assert.deepEqual([...cell.read().get('set')], [1, 2]); assert.equal(source.get('set').size, 2);
});
await test('Q09-Q13-K12/refresh-failure-stops-action-and-keeps-write', async () => {
  for (const options of [{ executeWhen: false }, { refresh: false }]) {
    const clock = new FakeClock(), trace = [], transport = new ControlledTransport(clock, trace), host = new ProbeHost(clock, transport, trace), target = host.mount('q', options);
    if (transport.requests.length) { transport.respond(1, { old: true }); await flush(); }
    let requests = 0; const f = fixture({ query: async () => requests++ }), cell = f.scope.register('cell', { schema: integer, initial: 0 });
    const q = queryFixture(target), connection = connect(f, { ports: { cell: state(integer), q: { kind: 'Query', required: true } }, steps: [set(1), { kind: 'RefreshQuery', target: path('/ports/q') }, query()], output: { schema: true, value: path('/steps/q') } }, { cell, q });
    await rejects(connection.invoke(), options.refresh === false ? 'QUERY_REFRESH_DISABLED' : 'EXECUTION_BLOCKED'); assert.equal(requests, 0); assert.equal(cell.read(), 1);
  }
});
await test('Q11/action-awaits-fresh-run-not-old-active', async () => {
  const clock = new FakeClock(), trace = [], transport = new ControlledTransport(clock, trace), host = new ProbeHost(clock, transport, trace), target = host.mount('q');
  const f = fixture(), cell = f.scope.register('cell', { schema: integer, initial: 0 });
  const connection = connect(f, { ports: { cell: state(integer), q: { kind: 'Query', required: true } }, steps: [{ kind: 'RefreshQuery', target: path('/ports/q') }, set(1)] }, { cell, q: queryFixture(target) });
  const run = connection.invoke(); await flush(); transport.respond(1, 'old'); await flush(); assert.equal(cell.read(), 0); assert.equal(transport.requests.length, 2);
  transport.respond(2, 'fresh'); await run; assert.equal(cell.read(), 1);
});
await test('native/error-sanitization-cancellation-finally-and-permission', async () => {
  let getters = 0; const hostile = Object.defineProperty({}, 'code', { get() { getters++; throw Error('secret'); } });
  const f = fixture(); f.runtime.register([['bad', { native: () => { throw hostile; } }]]); await rejects(f.runtime.invoke(f.owner, 'bad'), 'INTERNAL_ERROR'); assert.equal(getters, 0);
  let calls = 0; const denied = fixture({ authorize: () => false }); const connection = connect(denied, { native: () => calls++ }); await rejects(connection.invoke(), 'EXECUTION_BLOCKED'); assert.equal(calls, 0);
  const wait = deferred(), other = fixture(), cell = other.scope.register('cell', { schema: integer, initial: 0 }); let finallyRan = false, blocked = false;
  const action = connect(other, { ports: { cell: state(integer) }, native: async ({ inputs }) => { try { await wait.promise; } finally { finallyRan = true; try { inputs.cell.write(2); } catch (error) { blocked = error.code === 'CANCELLED'; } } } }, { cell });
  const run = action.invoke(); const rejected = rejects(run, 'CANCELLED'); other.owner.dispose(); await rejected; wait.resolve(); await flush(); assert.equal(finallyRan, true); assert.equal(blocked, true); assert.equal(cell.read(), 0);
});
await test('K16/nested-action-capabilities-and-query-cancellation', async () => {
  const f = fixture(), wait = deferred(), cell = f.scope.register('cell', { schema: integer, initial: 0 }); let context, refreshes = 0;
  f.runtime.register([['child', { ports: { cell: state(integer), q: { kind: 'Query', required: true } }, native: async captured => { context = captured; await wait.promise; captured.inputs.cell.write(1); } }]]);
  const q = queryFixture({ snapshot: () => ({}), refresh: () => ++refreshes, retry: () => ++refreshes });
  const connection = connect(f, { ports: { cell: state(integer), q: { kind: 'Query', required: true } }, steps: [{ kind: 'Action', actionRef: 'child', inputs: { cell: path('/ports/cell'), q: path('/ports/q') } }] }, { cell, q });
  const run = connection.invoke(); const stopped = rejects(run, 'CANCELLED'); await flush(); connection.dispose(); await stopped;
  for (const method of ['refresh', 'retry']) assert.throws(() => context.inputs.q[method](), error => error.code === 'CANCELLED');
  wait.resolve(); await flush(); assert.equal(cell.read(), 0); assert.equal(refreshes, 0);
});
await test('K36/native-handled-error-and-finally-failure', async () => {
  const f = fixture(); const action = connect(f, { native: async () => { try { throw Error('caught'); } catch { return false; } }, output: { schema: boolean } });
  assert.equal(await action.invoke(), false);
  const other = fixture(); await rejects(connect(other, { native: async () => { try { return false; } finally { throw Error('cleanup'); } }, output: { schema: boolean } }).invoke(), 'INTERNAL_ERROR');
  for (const declaration of [{ steps: [], catch: [] }, { steps: [], finally: [] }, { steps: [{ kind: 'Finally', steps: [] }] }]) assert.throws(() => fixture().runtime.register([['invalid', declaration]]));
});
await test('K05/dynamic-native-reentry-after-await', async () => {
  const f = fixture(); let calls = 0;
  f.runtime.register([['recursive', { native: async () => {
    calls++; await Promise.resolve();
    // Bound the reproducer so a broken guard never causes unbounded recursion.
    if (calls < 3) return f.runtime.invoke(f.owner, 'recursive');
  } }]]);
  await rejects(f.runtime.invoke(f.owner, 'recursive'), 'ACTION_RECURSION');
  assert.equal(calls, 1);
});
await report({ base: import.meta.url, name: process.argv[2] ?? 'node24.json', scope: 'Independent Action sequence/call lifetime with State/ports/Query scheduler integration; no production Action SDK or renderer', results,
  sources: ['action-probe.mjs', 'run.mjs', '../t3-state/ports-probe.mjs', '../t3-state/state-probe.mjs', '../t3-state/immutable.mjs', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package.json', '../t1-values/package-lock.json', '../t2-http-boundary/value-expressions.mjs', '../t2-query-races/query-probe.mjs', '../t2-query-races/harness.mjs', '../verification/report.mjs', '../verification/errors.mjs'] });
