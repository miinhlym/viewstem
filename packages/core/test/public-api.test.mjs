import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from '@viewstem/core';
import * as http from '@viewstem/core/http';
import * as cel from '@viewstem/core/cel';
import * as renderer from '@viewstem/core/renderer';

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
  assert.deepEqual(Object.keys(renderer).sort(), ['createRenderWaiter', 'createRendererHost', 'prepareOwnedView']);
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
  const view = await runtime.createView({ ...definition, queries: { rows: { query: { sources: {}, transform: { input: [] } } } } });
  await view.whenSettled(view.initial);
  surface(r, ['registerResources', 'registerComponentContract', 'registerComponentContracts', 'registerAction', 'updateResource', 'get', 'list', 'exportResource', 'isCode']);
  surface(store, ['createScope', 'transaction', 'subscribe', "writeBatch", "registerReaction", 'connectUrl', "getDiagnostics", 'dispose']);
  surface(runtime, ['registry', 'stateStore', 'createView', 'dispose']);
  surface(view, ['initial', 'setInputs', 'updateDefinition', 'replace', 'whenSettled', 'invokeAction', 'exportDefinition', 'getState', 'getQuery', 'getSnapshot', 'subscribe', 'emit', 'dispose']);
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
  assert.deepEqual(runtime.registry.exportResource('Type', 'Int'), r.exportResource('Type', 'Int'));
  assert.equal(runtime.registry.list('Component').length, 2);
  const exported = runtime.registry.exportResource('Type', 'Int'); exported.spec.schema.type = 'string';
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
  const created = await runtime.createView({
    states: { result: { kind: 'Derived', typeRef: 'Int', variableRef: 'answer' } },
    render: { id: 'typed', componentRef: typed.id, inputs: { value: path('/states/result') } },
  });
  await created.whenSettled(created.initial);
  assert.equal(created.getSnapshot().roots[0].inputs.value, 6);
});

test('createView, update and replace expose application handles and retain initial State fields', async t => {
  const runtime = core.createRuntime({ registry: registry() }); t.after(() => runtime.dispose());
  const spec = { ...definition, states: { count: { kind: 'State', schema: integer, initial: 2 } } };
  const view = await runtime.createView(spec);
  assert.deepEqual(await view.whenSettled(view.initial), { generation: 1, queryErrors: [] });
  view.getState('count').write(3);
  const update = await view.updateDefinition(spec);
  assert.deepEqual(await view.whenSettled(update), { generation: 2, queryErrors: [] });
  assert.equal(view.getState('count').read(), 3);
  const replace = await view.replace(spec);
  assert.deepEqual(await view.whenSettled(replace), { generation: 3, queryErrors: [] });
  await rejectsCode(view.whenSettled({}), 'INVALID_DEFINITION');
  const other = await runtime.createView(spec);
  await rejectsCode(other.whenSettled(replace), 'INVALID_DEFINITION');
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
  const view = await runtime.createView(definition); await view.whenSettled(view.initial);
  await rejectsCode(runtime.createView({ view: definition }), 'INVALID_DEFINITION');
  for (const target of [{ ...count }, Object.create(count)]) throwsCode(() => store.writeBatch([[target, 9]]), 'CANCELLED');
  assert.equal(count.read(), 1); assert.equal(other.read(), 2);
  const otherRuntime = core.createRuntime({ registry: r, stateStore: store }); t.after(() => otherRuntime.dispose());
  await rejectsCode((await otherRuntime.createView(definition)).whenSettled(view.initial), 'INVALID_DEFINITION');
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
  const view = await runtime.createView(definition); await view.whenSettled(view.initial);
  await view.whenSettled(await view.updateDefinition(definition));
  await view.whenSettled(await view.replace(definition));
  for (const context of contexts) { assert.equal(context.operation, 'update'); assert.equal(context.owner, view); assert.deepEqual(context.definition, definition); }
  assert.equal(contexts.length, 2); contexts.length = 0;
  assert.equal(await view.invokeAction({ actionRef: 'parent' }), 7);
  assert.equal(await view.invokeAction({ actionRef: 'answer' }), 7);
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
  view.dispose(); await rejectsCode(view.invokeAction({ actionRef: 'answer' }), 'CANCELLED');
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
  const a = await first.createView(sharedView, { inputs: { shared } }), b = await second.createView(sharedView, { inputs: { shared } });
  await Promise.all([a.whenSettled(a.initial), b.whenSettled(b.initial)]);
  await a.invokeAction({ actionRef: 'set', inputs: { target: shared } });
  assert.equal(shared.read(), 3);
  assert.equal(a.getSnapshot().roots[0].inputs.value, 3); assert.equal(b.getSnapshot().roots[0].inputs.value, 3);
  const local = a.getState('local');
  const pending = a.invokeAction({ actionRef: 'wait', inputs: { target: shared } });
  const cancelled = rejectsCode(pending, 'CANCELLED');
  assert.equal(captured.signal.aborted, false);
  first.dispose();
  assert.equal(captured.signal.aborted, true); await cancelled;
  throwsCode(() => captured.inputs.target.write(99), 'CANCELLED');
  throwsCode(() => local.read(), 'CANCELLED');
  resolveLate(99); await Promise.resolve();
  shared.write(4); assert.equal(b.getSnapshot().roots[0].inputs.value, 4);
  assert.equal(shared.read(), 4);
  scope.dispose(); throwsCode(() => shared.read(), 'CANCELLED');
});

test('concurrent resolution publishes one identical definition, and cancelled preparation publishes none', async t => {
  const r = registry();
  const requests = [];
  const runtime = core.createRuntime({ registry: r, resourceResolver(kind, id, { signal }) {
    return new Promise(resolve => requests.push({ kind, id, signal, resolve }));
  } });
  t.after(() => runtime.dispose());
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const one = runtime.createView({ ref: 'shared' });
  const two = runtime.createView({ ref: 'shared' });
  await tick();
  assert.equal(requests.length, 2);
  const resource = { kind: 'View', id: 'shared', spec: definition };
  requests[0].resolve(resource);
  requests[1].resolve(structuredClone(resource));
  const [first, second] = await Promise.all([one, two]);
  assert.notEqual(first, second);
  assert.equal(r.list('View').length, 1);

  const controller = new AbortController();
  const pending = runtime.createView({ ref: 'cancelled' }, { signal: controller.signal });
  await tick();
  controller.abort();
  await rejectsCode(pending, 'CANCELLED');
  assert.equal(requests[2].signal.aborted, true);
  requests[2].resolve({ ...resource, id: 'cancelled' });
  await tick();
  assert.equal(r.list('View').length, 1);
});

test('replacement preparation cannot overwrite a later update or publish a rejected definition', async t => {
  const r = registry();
  const requests = [];
  let authorized = true;
  const runtime = core.createRuntime({ registry: r, authorize: () => authorized,
    resourceResolver: (_kind, id) => new Promise(resolve => requests.push(() => resolve({
      kind: 'View', id, spec: definition,
    }))) });
  t.after(() => runtime.dispose());
  const view = await runtime.createView(definition);
  const pending = view.replace({ ref: 'late' });
  await new Promise(resolve => setImmediate(resolve));
  const newer = { render: { ...definition.render, id: 'newer' } };
  await view.updateDefinition(newer);
  await rejectsCode(pending, 'CANCELLED');
  requests[0]();
  authorized = false;
  const denied = view.replace({ ref: 'denied' });
  await new Promise(resolve => setImmediate(resolve));
  requests[1]();
  await rejectsCode(denied, 'EXECUTION_BLOCKED');
  assert.equal(view.exportDefinition().render.id, 'newer');
  assert.deepEqual(r.list('View'), []);
});

test('Store observers read the committed View, and failed URL subscribe preserves the new application', async t => {
  const r = registry();
  const store = core.createStateStore();
  const runtime = core.createRuntime({ registry: r, stateStore: store });
  t.after(() => { runtime.dispose(); store.dispose(); });
  const spec = value => ({ ...definition, states: { count: { kind: 'State', schema: integer, initial: value } } });
  const view = await runtime.createView(spec(1));
  const observations = [];
  const unsubscribe = store.subscribe(null, ({ changes }) => {
    if (changes.length) observations.push([view.exportDefinition().states.count.initial,
      view.getSnapshot().generation, view.getState('count').read()]);
  });
  t.after(unsubscribe);
  const application = await view.replace(spec(2), { url: {
    adapter: { read: () => 'https://example.test/', subscribe() { throw new Error('adapter failed'); }, writeOwned() {} },
    bindings: [{ state: 'count' }],
  } });
  assert.deepEqual(await view.whenSettled(application), { generation: 2, queryErrors: [] });
  assert.deepEqual(observations, [[2, 2, 2]]);
  assert.equal(view.getSnapshot().errors.some(error => error.kind === 'connect'), true);
});

test('mixed component contracts and resource definitions validate together', async t => {
  const runtime = core.createRuntime({
    componentContracts: [{ kind: 'Component', id: 'Typed', spec: { ports: { value: { kind: 'Value', typeRef: 'Integer' } } } }],
    resources: [
      { kind: 'View', id: 'example', spec: { render: { id: 'typed', componentRef: 'Typed', inputs: { value: 7 } } } },
      { kind: 'Type', id: 'Integer', spec: { schema: integer } },
    ],
  });
  t.after(() => runtime.dispose());
  const view = await runtime.createView({ ref: 'example' });
  assert.equal(view.getSnapshot().roots[0].inputs.value, 7);
});

test('a renderer can unmount pending work and reuse its target before an uncooperative resolver finishes', async t => {
  let finish;
  const runtime = core.createRuntime({
    registry: registry(),
    resourceResolver: () => new Promise(resolve => { finish = resolve; }),
  });
  t.after(() => runtime.dispose());
  const rendered = [];
  const host = renderer.createRendererHost(runtime, {
    ownsRuntime: false,
    validateTarget: () => true,
    connect(view) {
      rendered.push(view.exportDefinition().render.id);
      return { whenRendered() {}, dispose() { rendered.push('unmounted'); } };
    },
  });
  t.after(() => host.dispose());
  const target = {};
  const pending = host.mount({ target, source: { ref: 'delayed' } });
  await new Promise(resolve => setImmediate(resolve));
  const ready = rejectsCode(pending.ready, 'CANCELLED');
  await pending.unmount();
  const next = host.mount({ target, source: definition });
  const view = await next.ready;
  await next.whenSettled(view.initial);
  finish({ kind: 'View', id: 'delayed', spec: { render: { ...definition.render, id: 'stale' } } });
  await ready;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(rendered, ['leaf']);
  assert.deepEqual(runtime.registry.list('View'), []);
  await host.dispose();
  assert.deepEqual(rendered, ['leaf', 'unmounted']);
  assert.equal((await runtime.createView(definition)).getSnapshot().roots[0].id, 'leaf');
});
