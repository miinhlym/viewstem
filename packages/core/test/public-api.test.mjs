import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '@viewstem/core';
import * as http from '@viewstem/core/http';
import * as cel from '@viewstem/core/cel';

const integer = { type: 'integer' };
const path = value => ({ '@path': value });
const leaf = { kind: 'Component', id: 'Leaf', spec: { ports: { value: { kind: 'Value', schema: integer } } } };
const definition = { render: { id: 'leaf', componentRef: 'Leaf' } };
const registry = () => core.createRegistry().registerComponentContract(leaf);
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code);
const throwsCode = (run, code = 'INVALID_DEFINITION') => assert.throws(run, error => error.code === code);
function surface(value, names) {
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...names].sort());
  assert.equal(Object.getPrototypeOf(value), null);
  assert.equal(Object.isFrozen(value), true);
}

test('public package exports only the selected root and optional subpath APIs', async () => {
  assert.deepEqual(Object.keys(core).sort(), ['createRegistry', 'createRuntime', 'createStateStore', "computeGridLayout", 'mergeOwnedUrl'].sort());
  assert.deepEqual(Object.keys(http), ['createHttpExecutor']);
  assert.deepEqual(Object.keys(cel).sort(), ['compileCel', 'evaluateCel', "defaultCelLimits"].sort());
  assert.equal(cel.compileCel('n + 1', { inputs: { n: integer } })({ n: 1 }), 2);
  assert.equal(cel.evaluateCel('true', {}), true);
  assert.equal(typeof http.createHttpExecutor(), 'function');
  // Root and CEL must share the protected-value identity tables in the tarball.
  const store = core.createStateStore();
  const schema = { 'x-viewstem-type': 'set', items: { type: 'array', items: integer } };
  const stored = store.createScope().registerState('items', { schema, initial: new Set([[1, 2]]) }).read();
  const contains = cel.compileCel('setHas(items, item)', { inputs: { items: schema, item: schema.items } });
  assert.equal(contains({ items: stored, item: [...stored][0] }), true);
  assert.equal(contains({ items: stored, item: [1, 2] }), false);
  store.dispose();
  for (const subpath of ['registry', 'state', 'runtime', 'schema', 'query', 'api', 'src/api.mjs', 'dist/index.js', 'chunks/chunk-private.js', 'http/index.mjs', 'cel/index.mjs', 'package.json']) {
    await rejectsCode(import(`@viewstem/core/${subpath}`), 'ERR_PACKAGE_PATH_NOT_EXPORTED');
  }
});

test('actual handles expose only public methods and preserve chains and injected identities', async t => {
  const r = registry(), store = core.createStateStore();
  const runtime = core.createRuntime({ registry: r, stateStore: store });
  t.after(() => { runtime.dispose(); store.dispose(); });
  const { view, initialComplete: initial } = await runtime.createView({ view: { ...definition, queries: { rows: { query: { sources: {}, transform: { input: [] } } } } } }); await initial;
  surface(r, ['registerResources', 'registerComponentContract', 'registerComponentContracts', 'registerAction', 'updateResource', 'get', 'list', 'exportResource', 'isCode']);
  surface(store, ['createScope', 'transaction', 'subscribe', "writeBatch", "registerReaction", 'connectUrl', "getDiagnostics", 'dispose']);
  surface(runtime, ['registry', 'stateStore', 'createView', 'invokeAction', 'listResources', "exportResource", 'dispose']);
  surface(view, ['update', 'replace', 'exportDefinition', 'getState', 'getQuery', "getSnapshot", 'subscribe', 'emit', 'dispose']);
  assert.deepEqual(Reflect.ownKeys(view.getQuery('rows')).sort(), ['getSnapshot', 'refresh', 'retry']);
  const scope = store.createScope(), cell = scope.registerState('count', { schema: integer, initial: 1 });
  assert.deepEqual(Reflect.ownKeys(cell).sort(), ['address', 'generation', 'getSnapshot', 'read', 'reset', 'write']);
  assert.deepEqual(cell.getSnapshot(), { status: 'ready', value: 1 });
  const connection = store.connectUrl({ adapter: { read: () => 'https://example.test/', subscribe: () => () => {}, writeOwned() {} }, bindings: [{ target: cell }] });
  await connection.ready;
  assert.deepEqual(Reflect.ownKeys(connection).sort(), ['dispose', 'getDiagnostics', 'isReady', 'ready', 'removeOwned', 'restore']);
  assert.deepEqual(connection.getDiagnostics(), []); assert.deepEqual(store.getDiagnostics(), []);
  connection.dispose();
  surface(store.createScope(), ['scopeId', 'registerState', 'replaceState', 'getState', 'connectClock', 'removeState', 'dispose']);
  assert.equal(runtime.registry, r); assert.equal(runtime.stateStore, store);
  assert.equal(r.registerResources([{ kind: 'Type', id: 'Int', spec: { schema: integer } }]), r);
  assert.equal(r.registerComponentContract({ kind: 'Component', id: 'Other', spec: {} }), r);
  assert.equal(r.registerAction({ kind: 'Action', id: 'answer', spec: { output: { schema: integer } } }, () => 7), r);
  assert.equal(r.updateResource({ kind: 'Type', id: 'Int', spec: { schema: { type: 'number' } } }), r);
  assert.equal(r.isCode('Action', 'answer'), true);
  assert.equal(runtime.registry.get('Type', 'Int').spec.schema.type, 'number');
  assert.deepEqual(runtime.exportResource('Type', 'Int'), r.exportResource('Type', 'Int'));
  assert.equal(runtime.listResources('Component').length, 2);
  const exported = runtime.exportResource('Type', 'Int'); exported.spec.schema.type = 'string';
  assert.equal(r.get('Type', 'Int').spec.schema.type, 'number');
  assert.throws(() => { runtime.registry = {}; }, TypeError);
  assert.throws(() => { view.runtime = runtime; }, TypeError);
});

test('Component contract batches roll back completely and retain existing Registry configuration', async t => {
  const r = core.createRegistry({ functions: [{ name: 'twiceForBatch', inputs: [integer], output: integer, run: n => n * 2 }] });
  r.registerResources([
    { kind: 'Type', id: 'Int', spec: { schema: integer } },
    { kind: 'Variable', id: 'answer', spec: { expression: 'twiceForBatch(3)' } },
  ]);
  r.registerComponentContract(leaf);
  const typed = { kind: 'Component', id: 'Typed', spec: { ports: { value: { kind: 'Value', typeRef: 'Int', required: true } } } };
  for (const later of [leaf, typed, { kind: 'Component', id: 'Invalid', spec: { render: definition.render } }]) {
    const before = r.list();
    throwsCode(() => r.registerComponentContracts([typed, later]));
    assert.deepEqual(r.list(), before);
    assert.equal(r.isCode('Component', typed.id), false);
  }
  const other = { ...typed, id: 'Other' };
  assert.equal(r.registerComponentContracts([typed, other]), r);
  assert.equal(r.isCode('Component', typed.id), true);
  assert.equal(r.isCode('Component', other.id), true);
  const runtime = core.createRuntime({ registry: r }); t.after(() => runtime.dispose());
  const created = await runtime.createView({ view: {
    states: { result: { kind: 'Derived', typeRef: 'Int', variableRef: 'answer' } },
    render: { id: 'typed', componentRef: typed.id, inputs: { value: path('/states/result') } },
  } });
  await created.initialComplete;
  assert.equal(created.view.getSnapshot().roots[0].inputs.value, 6);
});

test('createView, update and replace expose initialComplete and retain initial State fields', async t => {
  const runtime = core.createRuntime({ registry: registry() }); t.after(() => runtime.dispose());
  const spec = { ...definition, states: { count: { kind: 'State', schema: integer, initial: 2 } } };
  const created = await runtime.createView({ view: spec });
  assert.deepEqual(Object.keys(created).sort(), ['initialComplete', 'view']);
  const { view } = created;
  assert.deepEqual(await created.initialComplete, { generation: 1, queryErrors: [] });
  view.getState('count').write(3);
  const update = await view.update(spec);
  assert.deepEqual(Object.keys(update), ['initialComplete']);
  assert.deepEqual(await update.initialComplete, { generation: 2, queryErrors: [] });
  assert.equal(view.getState('count').read(), 3);
  const replace = await view.replace({ view: spec });
  assert.deepEqual(Object.keys(replace), ['initialComplete']);
  assert.deepEqual(await replace.initialComplete, { generation: 3, queryErrors: [] });
  assert.equal(view.getState('count').read(), 2);
  assert.equal(view.exportDefinition().states.count.initial, 2);
  assert.equal(Object.isFrozen(cel.defaultCelLimits), true);
  assert.deepEqual(core.computeGridLayout([{ id: 'leaf' }], [{ id: 'leaf', address: 'node' }]).get('node'), { row: 1, column: 1, rowSpan: 1, columnSpan: 12 });
});

test('copied and fabricated handles cannot enter Registry, Store, Scope, View or State boundaries', async t => {
  const r = registry(), store = core.createStateStore(), scope = store.createScope();
  const count = scope.registerState('count', { schema: integer, initial: 1 });
  const other = scope.registerState('other', { schema: integer, initial: 2 });
  for (const candidate of [{}, { ...r }, Object.create(r)]) throwsCode(() => core.createRuntime({ registry: candidate }));
  for (const candidate of [{}, { ...store }, Object.create(store)]) throwsCode(() => core.createRuntime({ registry: r, stateStore: candidate }));
  for (const owner of [{ scopeId: scope.scopeId }, { ...scope }, Object.create(scope)]) {
    throwsCode(() => store.registerReaction(owner, { watch: [count], target: other, value: 0 }));
  }
  const runtime = core.createRuntime({ registry: r, stateStore: store });
  t.after(() => { runtime.dispose(); store.dispose(); });
  const { view, initialComplete: initial } = await runtime.createView({ view: definition }); await initial;
  for (const owner of [{}, { ...view }, Object.create(view)]) await rejectsCode(runtime.invokeAction({ owner, action: { steps: [] } }), 'CANCELLED');
  for (const target of [{ ...count }, Object.create(count)]) throwsCode(() => store.writeBatch([[target, 9]]), 'CANCELLED');
  assert.equal(count.read(), 1); assert.equal(other.read(), 2);
  const otherRuntime = core.createRuntime({ registry: r, stateStore: store }); t.after(() => otherRuntime.dispose());
  await rejectsCode(otherRuntime.invokeAction({ owner: view, action: { steps: [] } }), 'CANCELLED');
});

test('public Scope declarations and batch writes cannot enable internal initialization or derived policies', t => {
  const store = core.createStateStore(); t.after(() => store.dispose());
  const scope = store.createScope(), count = scope.registerState('count', { schema: integer, initial: 1 });
  const dependent = scope.registerState('dependent', { schema: integer, initial: 9 });
  store.registerReaction(scope, { watch: [count], target: dependent, value: 0 });
  for (const extra of [{ derived: () => 2 }, { dependencies: [count] }, { pendingInitial: Promise.resolve(2) }]) {
    throwsCode(() => scope.registerState('hidden', { schema: integer, ...extra }));
    throwsCode(() => scope.replaceState('count', { schema: integer, ...extra }));
  }
  throwsCode(() => scope.getState('hidden'), 'REFERENCE_NOT_FOUND');
  for (const options of [{ origin: 'initial' }, { origin: 'stage' }]) throwsCode(() => store.writeBatch([[count, 2]], options));
  assert.equal(count.read(), 1); assert.equal(dependent.read(), 9);
  store.writeBatch([[count, 2]]);
  assert.equal(count.read(), 2); assert.equal(dependent.read(), 0);
  count.reset(); assert.equal(count.read(), 1);
});

test('authorization sees the public View and stable opaque invoke owners without native callbacks', async t => {
  const r = registry(), contexts = []; let executed = 0;
  const action = { kind: 'Action', id: 'answer', spec: { output: { schema: integer } } };
  r.registerAction(action, () => { executed++; return 7; });
  r.registerAction({ kind: 'Action', id: 'parent', spec: { output: { schema: integer } } }, ({ invokeAction }) => invokeAction({ actionRef: 'answer' }));
  const runtime = core.createRuntime({ registry: r, authorize: context => { contexts.push(context); return true; } });
  t.after(() => runtime.dispose());
  const { view, initialComplete: initial } = await runtime.createView({ view: definition }); await initial;
  await (await view.update(definition)).initialComplete;
  await (await view.replace({ view: definition })).initialComplete;
  for (const context of contexts) { assert.equal(context.operation, 'update'); assert.equal(context.owner, view); assert.deepEqual(context.definition, definition); }
  assert.equal(contexts.length, 2); contexts.length = 0;
  assert.equal(await runtime.invokeAction({ owner: view, actionRef: 'parent' }), 7);
  assert.equal(await runtime.invokeAction({ owner: view, actionRef: 'answer' }), 7);
  assert.equal(executed, 2); assert.equal(contexts.length, 3);
  const owner = contexts[0].owner;
  surface(owner, []);
  assert.notEqual(owner, view);
  for (const context of contexts) {
    assert.equal(context.operation, 'invoke'); assert.equal(context.owner, owner);
    assert.deepEqual(context.definition, action.spec);
    assert.equal(Object.isFrozen(context.definition), true);
    assert.equal('native' in context.definition, false);
    assert.equal(Object.values(context.definition).some(value => typeof value === 'function'), false);
  }
  await rejectsCode(runtime.invokeAction({ owner, actionRef: 'answer' }), 'CANCELLED');
});

test('shared external State remains reactive across public runtimes while owned calls and scopes cancel', { timeout: 2000 }, async t => {
  const r = registry(), store = core.createStateStore(), scope = store.createScope();
  const shared = scope.registerState('shared', { schema: integer, initial: 1 });
  const sharedPort = { kind: 'State', schema: integer, required: true };
  let resolveLate, captured;
  r.registerAction({ kind: 'Action', id: 'wait', spec: { ports: { target: sharedPort }, output: { schema: integer } } }, context => {
    captured = context; return new Promise(resolve => { resolveLate = resolve; });
  });
  r.registerAction({ kind: 'Action', id: 'set', spec: { ports: { target: sharedPort } } }, ({ inputs }) => { inputs.target.write(3); });
  const first = core.createRuntime({ registry: r, stateStore: store }), second = core.createRuntime({ registry: r, stateStore: store });
  t.after(() => { first.dispose(); second.dispose(); store.dispose(); });
  const sharedView = { ports: { shared: sharedPort }, states: { local: { kind: 'State', schema: integer, initial: 0 } }, render: { id: 'leaf', componentRef: 'Leaf', inputs: { value: path('/ports/shared') } } };
  const a = await first.createView({ view: sharedView, inputs: { shared } }), b = await second.createView({ view: sharedView, inputs: { shared } });
  await Promise.all([a.initialComplete, b.initialComplete]);
  await first.invokeAction({ owner: a.view, actionRef: 'set', inputs: { target: shared } });
  assert.equal(shared.read(), 3);
  assert.equal(a.view.getSnapshot().roots[0].inputs.value, 3); assert.equal(b.view.getSnapshot().roots[0].inputs.value, 3);
  const local = a.view.getState('local');
  const pending = first.invokeAction({ owner: a.view, actionRef: 'wait', inputs: { target: shared } });
  const cancelled = rejectsCode(pending, 'CANCELLED');
  assert.equal(captured.signal.aborted, false);
  first.dispose();
  assert.equal(captured.signal.aborted, true); await cancelled;
  throwsCode(() => captured.inputs.target.write(99), 'CANCELLED');
  throwsCode(() => local.read(), 'CANCELLED');
  resolveLate(99); await Promise.resolve();
  shared.write(4); assert.equal(b.view.getSnapshot().roots[0].inputs.value, 4);
  assert.equal(shared.read(), 4);
  scope.dispose(); throwsCode(() => shared.read(), 'CANCELLED');
});
