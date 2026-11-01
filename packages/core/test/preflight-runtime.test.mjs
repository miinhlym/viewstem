import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, createRuntime, createStateStore } from '../src/index.mjs';
import { createQueryHandle } from '../src/ports.mjs';

const number = { type: 'number' };
const path = value => ({ '@path': value });
const state = initial => ({ kind: 'State', schema: number, initial });
const derived = { kind: 'Derived', schema: number, variable: { expression: '1.0' } };
const leaf = { id: 'leaf', componentRef: 'Leaf' };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function registry() {
  const result = createRegistry();
  result.registerComponent({ kind: 'Component', id: 'Leaf', spec: { ports: { value: { kind: 'Value', schema: true } } } });
  return result;
}

test('preflight: disposing View from commit observer prevents new Query work and scope leaks', async t => {
  const registrations = registry(), store = createStateStore();
  const requests = [];
  const runtime = createRuntime({ registry: registrations, stateStore: store,
    requestExecutor: (plan, options) => { requests.push({ plan, options }); return new Promise(() => {}); } });
  t.after(() => { runtime.dispose(); store.dispose(); });
  const spec = { states: { x: state(1) }, render: leaf };
  const { view, initial } = await runtime.mount({ view: spec }); await initial;
  const stop = store.subscribe(view.getState('x').address, event => { if (event.changes.length) view.dispose(); });
  t.after(stop);
  const updated = { ...spec, queries: { q: { query: { sources: { a: {
    datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/' },
  } }, transform: { input: path('/sources/a') } } } } };
  await assert.rejects(view.update(updated, { states: { x: 2 } }), { code: 'CANCELLED' });
  await flush();
  assert.equal(requests.length, 0);
  let remaining;
  store.subscribe(null, event => { remaining = Object.keys(event.states); })();
  assert.deepEqual(remaining, []);
});

test('preflight: failed transaction restores scope lifetime, clocks, handles and final Store cleanup', () => {
  const store = createStateStore(), scope = store.createScope();
  const value = scope.registerState('value', { schema: number, initial: 1 });
  const listeners = new Set();
  scope.connectClock(value, { now: () => 1, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } });
  const baseline = value.snapshot(); let rolledBack, discarded, transient;
  assert.throws(() => store.transaction(() => {
    scope.dispose();
    rolledBack = store.createScope(); discarded = rolledBack.registerState('x', { schema: number, initial: 8 });
    transient = store.createScope(); transient.dispose();
    throw Error('rollback');
  }), /rollback/);
  assert.equal(scope.getState('value'), value);
  assert.equal(value.snapshot(), baseline);
  assert.equal(listeners.size, 1);
  for (const listener of listeners) listener(2);
  assert.equal(value.read(), 2);
  assert.throws(() => rolledBack.registerState('new', { schema: number }), { code: 'CANCELLED' });
  assert.throws(() => transient.registerState('new', { schema: number }), { code: 'CANCELLED' });
  assert.throws(() => discarded.read(), { code: 'CANCELLED' });
  store.dispose();
  assert.equal(listeners.size, 0);
  assert.throws(() => value.read(), { code: 'CANCELLED' });
});

test('preflight: committed scope disposal releases clock and cells exactly once', () => {
  const store = createStateStore(), scope = store.createScope(); let stops = 0;
  const value = scope.registerState('value', { schema: number, initial: 1 });
  scope.connectClock(value, { now: () => 1, subscribe: () => () => { stops++; } });
  store.transaction(() => scope.dispose());
  assert.equal(stops, 1); assert.throws(() => value.read(), { code: 'CANCELLED' });
  store.dispose(); assert.equal(stops, 1);
});

test('preflight: mount/update Value inputs stay isolated through reevaluation; defaults stay omitted', async t => {
  const registrations = registry(), runtime = createRuntime({ registry: registrations }); t.after(() => runtime.dispose());
  const config = { n: 1, omitted: undefined }, inputs = { config };
  const spec = { ports: { config: { kind: 'Value', schema: { type: 'object' } }, fallback: { kind: 'Value', schema: number, default: 3 } },
    states: { tick: state(0) }, render: { ...leaf, inputs: { value: path('/ports') } } };
  const { view, initial } = await runtime.mount({ view: spec, inputs }); await initial;
  const current = () => view.snapshot().roots[0].inputs.value;
  config.n = 9; inputs.config = { n: 10 }; view.getState('tick').write(1);
  assert.equal(current().config.n, 1); assert.equal(Object.hasOwn(current().config, 'omitted'), false);
  const next = structuredClone(spec); next.ports.fallback.default = 4;
  await (await view.update(next)).initial;
  assert.equal(current().fallback, 4);
  const updateInputs = { config: { n: 2 } };
  await (await view.update(next, { inputs: updateInputs })).initial;
  updateInputs.config.n = 7; view.getState('tick').write(2);
  assert.equal(current().config.n, 2);
  assert.equal(Object.isFrozen(config), false); assert.equal(config.n, 9);
});

test('preflight: retained State and Query inputs preserve capabilities', async t => {
  const registrations = registry(), store = createStateStore(), scope = store.createScope();
  const shared = scope.registerState('shared', { schema: number, initial: 1 }); let refreshes = 0;
  const query = createQueryHandle({ snapshot: () => ({ status: 'success', data: 3 }), refresh: async () => { refreshes++; } });
  const runtime = createRuntime({ registry: registrations, stateStore: store }); t.after(() => { runtime.dispose(); store.dispose(); });
  const spec = { ports: { shared: { kind: 'State', schema: number }, query: { kind: 'Query' } },
    render: { ...leaf, inputs: { value: path('/ports/shared') } } };
  const { view, initial } = await runtime.mount({ view: spec, inputs: { shared, query } }); await initial;
  shared.write(2); assert.equal(view.snapshot().roots[0].inputs.value, 2);
  await runtime.invokeAction({ owner: view, action: { ports: { target: { kind: 'State', schema: number }, q: { kind: 'Query' } },
    steps: [{ kind: 'SetState', target: path('/ports/target'), value: 4 }, { kind: 'RefreshQuery', target: path('/ports/q') }] }, inputs: { target: shared, q: query } });
  assert.equal(shared.read(), 4); assert.equal(refreshes, 1);
  await (await view.update(spec)).initial;
  assert.equal(view.snapshot().roots[0].inputs.value, 4);
});

test('preflight: inline Action definitions are isolated while an awaited child runs', async t => {
  const registrations = registry(); let release;
  registrations.registerAction({ kind: 'Action', id: 'wait', spec: {} }, () => new Promise(resolve => { release = resolve; }));
  const runtime = createRuntime({ registry: registrations }); t.after(() => runtime.dispose());
  const { view, initial } = await runtime.mount({ view: { states: { tick: state(0) }, render: leaf } }); await initial;
  const action = { ports: { target: { kind: 'State', schema: number, required: true } }, steps: [
    { kind: 'Action', actionRef: 'wait' }, { kind: 'SetState', target: path('/ports/target'), value: 2 },
  ] };
  const pending = runtime.invokeAction({ owner: view, action, inputs: { target: view.getState('tick') } });
  action.steps[1].value = 7; action.steps.push({ kind: 'SetState', target: path('/ports/target'), value: 9 });
  release(); await pending;
  assert.equal(view.getState('tick').read(), 2); assert.equal(Object.isFrozen(action), false);
});

for (const before of ['State', 'Derived']) for (const nested of [false, true]) {
  test(`preflight: maintained ${nested ? 'Component' : 'View'} rejects ${before} kind flip atomically`, async t => {
    const registrations = registry(), runtime = createRuntime({ registry: registrations }); t.after(() => runtime.dispose());
    const owner = { states: { value: before === 'State' ? state(4) : derived }, render: leaf };
    const spec = nested ? { render: { id: 'panel', component: owner } } : owner;
    const { view, initial } = await runtime.mount({ view: spec }); await initial;
    const instanceId = nested ? view.snapshot().roots[0].instanceId : undefined;
    const handle = view.getState('value', instanceId), snapshot = handle.snapshot(), definition = view.exportDefinition(), generation = view.snapshot().generation;
    const next = structuredClone(spec), target = nested ? next.render.component : next;
    target.states.value = before === 'State' ? derived : state(8);
    await assert.rejects(view.update(next), { code: 'TYPE_CONTRACT_MISMATCH' });
    assert.deepEqual(view.exportDefinition(), definition); assert.equal(view.snapshot().generation, generation);
    assert.equal(view.getState('value', instanceId), handle); assert.equal(handle.snapshot(), snapshot);
    if (before === 'State') { handle.write(6); assert.equal(handle.read(), 6); }
    else assert.throws(() => handle.write(6), { code: 'TYPE_MISMATCH' });
  });
}

test('preflight: child Action/Query input templates unescape @ names once', async t => {
  const registrations = registry();
  registrations.registerResources([
    { kind: 'Action', id: 'echo', spec: { ports: { '@x': { kind: 'Value', schema: number, required: true } }, steps: [], output: { schema: number, value: path('/ports/@x') } } },
    { kind: 'Query', id: 'echoQuery', spec: { ports: { '@x': { kind: 'Value', schema: number, required: true } }, sources: {}, transform: { input: path('/ports/@x') } } },
  ]);
  const runtime = createRuntime({ registry: registrations }); t.after(() => runtime.dispose());
  const { view, initial } = await runtime.mount({ view: { render: leaf } }); await initial;
  for (const kind of ['Action', 'Query']) {
    assert.equal(await runtime.invokeAction({ owner: view, action: { steps: [{ id: 'child', kind, [`${kind.toLowerCase()}Ref`]: kind === 'Action' ? 'echo' : 'echoQuery', inputs: { '@@x': 1 } }], output: { schema: number, value: path('/steps/child') } } }), 1);
  }
  // Whole expression results already contain data keys and must not be decoded again.
  const action = { ports: { data: { kind: 'Value', schema: { type: 'object' } } }, steps: [{ id: 'child', kind: 'Action', actionRef: 'echo', inputs: path('/ports/data') }], output: { schema: number, value: path('/steps/child') } };
  assert.equal(await runtime.invokeAction({ owner: view, action, inputs: { data: { '@x': 2 } } }), 2);
});

test('preflight: escaped child State and Query names retain capability routing', async t => {
  const registrations = registry(), runtime = createRuntime({ registry: registrations }); t.after(() => runtime.dispose());
  const { view, initial } = await runtime.mount({ view: { states: { value: state(0) }, render: leaf } }); await initial;
  let refreshes = 0; const q = createQueryHandle({ refresh: async () => { refreshes++; } });
  const ports = { '@state': { kind: 'State', schema: number }, '@query': { kind: 'Query' } };
  const child = { ports, steps: [{ kind: 'SetState', target: path('/ports/@state'), value: 5 }, { kind: 'RefreshQuery', target: path('/ports/@query') }] };
  await runtime.invokeAction({ owner: view, action: { ports, steps: [{ kind: 'Action', spec: child, inputs: { '@@state': path('/ports/@state'), '@@query': path('/ports/@query') } }] }, inputs: { '@state': view.getState('value'), '@query': q } });
  assert.equal(view.getState('value').read(), 5); assert.equal(refreshes, 1);
});

test('preflight: shared inline spec validates independently for Query and Component kinds', async () => {
  const registrations = registry(), shared = { sources: {}, transform: { input: 1 } };
  const spec = { queries: { q: { query: shared } }, render: { id: 'invalid', component: shared } };
  for (const candidate of [spec, structuredClone(spec), JSON.parse(JSON.stringify(spec))]) {
    assert.throws(() => registrations.validateDefinition('View', candidate), { code: 'INVALID_DEFINITION' });
  }
  const runtime = createRuntime({ registry: registrations });
  try { await assert.rejects(runtime.mount({ view: spec }), { code: 'INVALID_DEFINITION' }); }
  finally { runtime.dispose(); }
  const valid = { sources: {}, transform: { input: 1 } };
  assert.doesNotThrow(() => registrations.validateDefinition('View', { queries: { a: { query: valid }, b: { query: valid } }, render: leaf }));
});
