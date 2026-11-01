import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, createRuntime, createStateStore, mergeOwnedUrl } from '@viewstem/core';

const path = value => ({ '@path': value });
const resource = (kind, id, spec) => ({ kind, id, spec });
const number = { type: 'number' };
const state = initial => ({ kind: 'State', schema: number, initial });
const text = (value, id = 'text') => ({ id, componentRef: 'Text', inputs: { text: value } });
const row = children => ({ id: 'root', componentRef: 'Row', slots: { default: children } });
const spec = label => ({ states: { count: state(1) }, render: text(label) });
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
const nodes = view => { const output = []; const walk = node => { output.push(node); node.children.forEach(walk); }; view.snapshot().roots.forEach(walk); return output; };
const find = (view, id) => nodes(view).find(node => node.id === id);
const bounded = async promise => { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('management fixture deadline')), 1500); })]); } finally { clearTimeout(timer); } };
function registry() {
  const r = createRegistry();
  r.registerComponent(resource('Component', 'Text', { ports: { text: { kind: 'Value', schema: true, required: true } } }));
  r.registerComponent(resource('Component', 'Row', { slots: { default: {} } }));
  return r;
}
function runtime(t, r = registry(), options = {}) { const runtime = createRuntime({ registry: r, ...options }); t.after(() => runtime.dispose()); return runtime; }
async function mounted(t, definition = spec('old'), r = registry(), options) { const instance = runtime(t, r, options); const { view, initial } = await instance.mount({ view: definition }); await bounded(initial); await flush(); return { runtime: instance, view, registry: r }; }
function url(initial) {
  let href = initial; const attempts = [], listeners = new Set();
  return { attempts, read: () => href, adapter: { read: () => href, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, async writeOwned(patch, context) { attempts.push({ patch: { ...patch }, mode: context.mode }); if (!context.isCurrent()) return { applied: false }; href = mergeOwnedUrl(href, patch); return { applied: true }; } } };
}
const query = (id = 'q') => resource('Query', id, { sources: { main: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/data' } } }, transform: { input: path('/sources/main') } });

test('M01 invalid State plus valid configuration and reverse have no partial effects', async t => {
  const { view } = await mounted(t), count = view.getState('count'); count.write(7); const seen = []; const off = view.subscribe(value => seen.push(value)); t.after(off);
  await assert.rejects(view.update(spec('new'), { states: { count: 'invalid' } }), error => error.code === 'TYPE_MISMATCH');
  assert.equal(count.read(), 7); assert.equal(view.exportDefinition().render.inputs.text, 'old'); assert.equal(seen.length, 1);
  await assert.rejects(view.update({ ...spec('bad'), render: { id: 'missing', componentRef: 'missing' } }, { states: { count: 8 } }), error => error.code === 'REFERENCE_NOT_FOUND');
  assert.equal(count.read(), 7); assert.equal(view.exportDefinition().render.inputs.text, 'old'); assert.equal(seen.length, 1);
});

test('M01 valid State and configuration publish one coherent new generation', async t => {
  const { view } = await mounted(t); const seen = []; const off = view.subscribe(value => seen.push(value)); t.after(off);
  const previous = view.snapshot().generation;
  await bounded((await view.update({ ...spec('new'), render: text(path('/states/count')) }, { states: { count: 9 } })).initial);
  const changed = seen.filter(value => value.generation > previous);
  assert.ok(changed.length > 0); for (const value of changed) { assert.equal(value.states.count.value, 9); assert.equal(value.roots[0].inputs.text, 9); }
});

test('M02 synchronous and asynchronous Query errors retain committed configuration and State', async t => {
  for (const mode of ['sync', 'async']) {
    const r = registry(); r.registerResources([query()]); let requests = 0;
    const instance = runtime(t, r, { requestExecutor() { requests++; if (mode === 'sync') throw { code: 'HTTP_ERROR', message: 'private executor detail' }; return Promise.reject({ code: 'HTTP_ERROR', message: 'private executor detail' }); } });
    const definition = { ...spec(mode), queries: { data: { queryRef: 'q' } } };
    const { view, initial } = await instance.mount({ view: definition }); const report = await bounded(initial);
    assert.equal(requests, 1); assert.deepEqual(view.exportDefinition(), definition); assert.equal(view.getState('count').read(), 1);
    assert.equal(report.queryErrors[0].error.code, 'HTTP_ERROR'); assert.equal(view.snapshot().queries.data.status, 'error'); assert.equal(JSON.stringify(report).includes('private executor detail'), false);
  }
});

test('M03 only instance A changes while B handle and shared definition remain intact', async t => {
  const r = registry(); r.registerResources([resource('Component', 'Panel', { states: { count: state(0) }, render: text('shared') })]); const original = r.export('Component', 'Panel');
  const definition = { render: row([{ id: 'A', componentRef: 'Panel' }, { id: 'B', componentRef: 'Panel' }]) };
  const { view } = await mounted(t, definition, r), b = find(view, 'B'), handle = view.getState('count', b.instanceId); handle.write(8);
  const next = structuredClone(definition); next.render.slots.default[0] = { id: 'A', component: { render: text('only-A') } }; await bounded((await view.update(next)).initial);
  assert.equal(find(view, 'B').instanceId, b.instanceId); assert.equal(handle.read(), 8); assert.equal(find(view, 'A').children[0].inputs.text, 'only-A'); assert.deepEqual(r.export('Component', 'Panel'), original);
});

test('M04 definition updates affect future injection while existing mounted definitions stay pinned', async t => {
  const r = registry(), database = resource('Component', 'Panel', { render: text('v1') }); r.registerResources([database]);
  const instance = runtime(t, r), definition = { ...spec('unused'), render: { id: 'panel', componentRef: 'Panel' } };
  const { view, initial } = await instance.mount({ view: definition }); await bounded(initial);
  database.spec.render.inputs.text = 'database-v2'; assert.equal(find(view, 'panel').children[0].inputs.text, 'v1');
  r.updateResource(resource('Component', 'Panel', { render: text('registry-v2') }));
  view.getState('count').write(2); assert.equal(find(view, 'panel').children[0].inputs.text, 'v1');
  await bounded((await view.update(view.exportDefinition())).initial); assert.equal(find(view, 'panel').children[0].inputs.text, 'v1');
  const future = await instance.mount({ view: definition }); await bounded(future.initial); assert.equal(find(future.view, 'panel').children[0].inputs.text, 'registry-v2');
  await bounded((await view.replace({ view: definition })).initial); assert.equal(find(view, 'panel').children[0].inputs.text, 'registry-v2');
});

test('M05 replacement cleans prior owned URL and State while service State and foreign URL survive', async t => {
  const store = createStateStore(), serviceScope = store.createScope(), service = serviceScope.registerState('service', { schema: number, initial: 40 }); t.after(() => store.dispose());
  const location = url('https://example.test/view?p.old=3&service=keep&foreign=z#anchor'); const instance = runtime(t, registry(), { stateStore: store });
  const { view, initial } = await instance.mount({ view: spec('old'), url: { adapter: location.adapter, bindings: [{ state: 'count', key: 'p.old' }] } }); await bounded(initial);
  const old = view.getState('count'); assert.equal(old.read(), 3); const previous = view.snapshot().lifetime;
  await bounded((await view.replace({ view: spec('new'), url: { adapter: location.adapter, bindings: [{ state: 'count', key: 'p.new' }] } })).initial);
  assert.throws(() => old.read(), error => error.code === 'CANCELLED'); assert.notEqual(view.snapshot().lifetime, previous); assert.equal(view.getState('count').read(), 1);
  const current = new URL(location.read()); assert.equal(current.searchParams.has('p.old'), false); assert.equal(current.searchParams.get('service'), 'keep'); assert.equal(current.searchParams.get('foreign'), 'z'); assert.equal(current.hash, '#anchor'); assert.equal(location.attempts[0].mode, 'replace');
  view.dispose(); assert.equal(service.read(), 40); service.write(41); assert.equal(service.read(), 41);
});

test('M06 State, current configuration and reusable definitions export independently without autosave', async t => {
  const r = registry(); r.registerResources([resource('Component', 'Panel', { render: text('shared') })]);
  const { view } = await mounted(t, spec('initial'), r); view.getState('count').write(9); await bounded((await view.update(spec('current'))).initial);
  r.updateResource(resource('Component', 'Panel', { render: text('edited-definition') }));
  const exported = view.exportDefinition(), registered = r.export('Component', 'Panel');
  assert.equal(exported.states.count.initial, 1); assert.equal(view.getState('count').read(), 9); assert.equal(exported.render.inputs.text, 'current'); assert.equal(registered.spec.render.inputs.text, 'edited-definition');
  assert.deepEqual(JSON.parse(JSON.stringify(exported)), exported); assert.deepEqual(JSON.parse(JSON.stringify(registered)), registered);
  exported.render.inputs.text = 'mutated-export'; registered.spec.render.inputs.text = 'mutated-resource-export';
  assert.equal(view.exportDefinition().render.inputs.text, 'current'); assert.equal(r.export('Component', 'Panel').spec.render.inputs.text, 'edited-definition');
  let saves = 0; const save = definition => { saves++; return JSON.stringify(definition); }; assert.equal(saves, 0); save(r.export('Component', 'Panel')); assert.equal(saves, 1);
});

test('M07 listing does not grant invoke or update rights; denied update starts no State/Query/URL effects', async t => {
  const r = registry(); let calls = 0, requests = 0, allowed = false; const checked = [];
  r.registerAction(resource('Action', 'public', { output: { schema: number } }), () => { calls++; return 7; }); r.registerResources([query()]);
  const location = url('https://example.test/view'); const instance = runtime(t, r, { authorize(context) { checked.push(context.operation); return allowed; }, requestExecutor() { requests++; return { status: 200, headers: {}, body: [] }; } });
  const { view, initial } = await instance.mount({ view: spec('old'), url: { adapter: location.adapter, bindings: [{ state: 'count' }] } }); await bounded(initial);
  assert.ok(instance.listResources('Action').some(definition => definition.id === 'public')); assert.equal(instance.describeResource('Action', 'public').id, 'public');
  await assert.rejects(instance.invokeAction({ owner: view, actionRef: 'public' }), error => error.code === 'EXECUTION_BLOCKED'); assert.equal(calls, 0);
  const before = view.snapshot(), writes = location.attempts.length;
  await assert.rejects(view.update({ ...spec('forbidden'), queries: { data: { queryRef: 'q' } } }, { states: { count: 99 } }), error => error.code === 'EXECUTION_BLOCKED');
  assert.equal(view.getState('count').read(), 1); assert.equal(view.snapshot().generation, before.generation); assert.equal(view.exportDefinition().render.inputs.text, 'old'); assert.equal(requests, 0); assert.equal(location.attempts.length, writes);
  allowed = true; assert.equal(await instance.invokeAction({ owner: view, actionRef: 'public' }), 7); await bounded((await view.update(spec('permitted'), { states: { count: 2 } })).initial);
  assert.equal(view.getState('count').read(), 2); assert.ok(checked.includes('invoke')); assert.ok(checked.includes('update'));
  await assert.rejects(instance.invokeAction({ owner: { alive: true }, actionRef: 'public' }), error => error.code === 'CANCELLED'); view.dispose(); await assert.rejects(instance.invokeAction({ owner: view, actionRef: 'public' }), error => error.code === 'CANCELLED');
});

test('C16/C17 same ids in different resource kinds coexist, same-kind duplicates are atomic', async t => {
  const r = registry(); r.registerResources([resource('Component', 'shared', { render: text('component') }), resource('Query', 'shared', { sources: {}, transform: { input: ['query'] } })]);
  const instance = runtime(t, r), { view, initial } = await instance.mount({ view: { render: { id: 'shared', componentRef: 'shared' }, queries: { shared: { queryRef: 'shared' } } } }); await bounded(initial);
  assert.equal(find(view, 'shared').children[0].inputs.text, 'component'); assert.deepEqual(view.snapshot().queries.shared.data, ['query']);
  const before = r.list(); assert.throws(() => r.registerResources([resource('Type', 'new', { schema: true }), resource('Query', 'shared', { sources: {}, transform: { input: [] } })]), error => error.code === 'INVALID_DEFINITION'); assert.deepEqual(r.list(), before);
});

test('N01 inline static business definitions mount without resolver or Query executor callbacks', async t => {
  const instance = runtime(t); const { view, initial } = await instance.mount({ view: { render: { id: 'inline', component: { render: text('static') } } } });
  assert.deepEqual((await bounded(initial)).queryErrors, []); assert.equal(find(view, 'text').inputs.text, 'static'); assert.deepEqual(Object.keys(view.snapshot().queries), []);
});

test('N02 referenced definitions resolve recursively in their expected kind and invalid resolution keeps current View', async t => {
  const r = registry(), resolutions = []; let requests = 0;
  const definitions = {
    'View:remote': resource('View', 'remote', { render: { id: 'panel', componentRef: 'resolved-panel' } }),
    'Component:resolved-panel': resource('Component', 'resolved-panel', { render: text('resolved') }),
  };
  const instance = runtime(t, r, { resourceResolver: async (kind, id) => { resolutions.push([kind, id]); return definitions[`${kind}:${id}`] ?? resource('Component', id, { render: text('wrong-kind') }); }, requestExecutor() { requests++; return { status: 200, headers: {}, body: [] }; } });
  const { view, initial } = await instance.mount({ viewRef: 'remote' }); await bounded(initial); assert.equal(find(view, 'text').inputs.text, 'resolved'); assert.deepEqual(resolutions, [['View', 'remote'], ['Component', 'resolved-panel']]);
  const before = view.exportDefinition(); await assert.rejects(view.replace({ viewRef: 'not-found' }), error => error.code === 'REFERENCE_NOT_FOUND'); assert.deepEqual(view.exportDefinition(), before); assert.equal(requests, 0);
  const withoutResolver = runtime(t); await assert.rejects(withoutResolver.mount({ viewRef: 'missing' }), error => error.code === 'REFERENCE_NOT_FOUND');
});

test('M07 UI events and explicit invocation use the same deny and allow Action policy', async t => {
  const r = registry(); let allowed = false, calls = 0;
  r.registerComponent(resource('Component', 'Button', { events: { click: { schema: true } } }));
  r.registerAction(resource('Action', 'action', { output: { schema: number } }), () => { calls++; return calls; });
  const { view, runtime: instance } = await mounted(t, { render: { id: 'button', componentRef: 'Button', on: { click: { id: 'observed', actionRef: 'action' } } } }, r, { authorize: () => allowed });
  await assert.rejects(view.emit(find(view, 'button'), 'click', null), error => error.code === 'EXECUTION_BLOCKED');
  await assert.rejects(instance.invokeAction({ owner: view, actionRef: 'action' }), error => error.code === 'EXECUTION_BLOCKED'); assert.equal(calls, 0);
  allowed = true; assert.equal(await view.emit(find(view, 'button'), 'click', null), 1); assert.equal(await instance.invokeAction({ owner: view, actionRef: 'action' }), 2); assert.equal(view.snapshot().actions.observed.status, 'success');
});

test('N02 malformed resolved graph never executes data or replaces the current screen', async t => {
  let requests = 0; const resolved = resource('View', 'bad', { render: text('would-be-new'), queries: { data: { queryRef: 'missing-query' } } });
  const instance = runtime(t, registry(), { resourceResolver: async (kind, id) => kind === 'View' ? resolved : undefined, requestExecutor: () => { requests++; return { status: 200, headers: {}, body: [] }; } });
  const { view, initial } = await instance.mount({ view: spec('current') }); await bounded(initial); const before = view.snapshot();
  await assert.rejects(view.replace({ viewRef: 'bad' }), error => error.code === 'REFERENCE_NOT_FOUND');
  assert.equal(view.snapshot().generation, before.generation); assert.equal(find(view, 'text').inputs.text, 'current'); assert.equal(requests, 0);
});

test('M04 Query, Variable, Type and Action references stay pinned across updates until explicit replacement', async t => {
  const r = registry();
  r.registerComponent(resource('Component', 'Button', { events: { click: { schema: true } } }));
  r.registerResources([
    resource('Type', 'Count', { schema: { type: 'number', maximum: 10 } }),
    resource('Variable', 'offset', { ports: { n: { kind: 'Value', schema: number, required: true } }, expression: 'n + 1.0' }),
    resource('Query', 'static', { sources: {}, transform: { input: 'query-v1' } }),
    resource('Action', 'label', { steps: [], output: { schema: true, value: 'action-v1' } }),
  ]);
  const definition = {
    states: { count: { kind: 'State', typeRef: 'Count', initial: 1 }, offset: { kind: 'Derived', schema: number, variableRef: 'offset', inputs: { n: path('/states/count') } } },
    queries: { data: { queryRef: 'static' } },
    render: row([text(path('/states/offset'), 'offset'), text(path('/queries/data/data'), 'query'), { id: 'button', componentRef: 'Button', on: { click: { id: 'labeled', actionRef: 'label' } } }]),
  };
  const { view, runtime: instance } = await mounted(t, definition, r);
  assert.equal(find(view, 'offset').inputs.text, 2); assert.equal(view.snapshot().queries.data.data, 'query-v1'); assert.equal(await instance.invokeAction({ owner: view, actionRef: 'label' }), 'action-v1');
  r.updateResource(resource('Type', 'Count', { schema: { type: 'number', maximum: 100 } }));
  r.updateResource(resource('Variable', 'offset', { ports: { n: { kind: 'Value', schema: number, required: true } }, expression: 'n + 100.0' }));
  r.updateResource(resource('Query', 'static', { sources: {}, transform: { input: 'query-v2' } }));
  r.updateResource(resource('Action', 'label', { steps: [], output: { schema: true, value: 'action-v2' } }));
  view.getState('count').write(2); await bounded((await view.update(view.exportDefinition())).initial); await view.getQuery('data').refresh(); await flush();
  assert.equal(find(view, 'offset').inputs.text, 3); assert.equal(view.snapshot().queries.data.data, 'query-v1');
  assert.equal(await view.emit(find(view, 'button'), 'click', null), 'action-v1'); assert.equal(await instance.invokeAction({ owner: view, actionRef: 'label' }), 'action-v1');
  assert.throws(() => view.getState('count').write(11), error => error.code === 'TYPE_MISMATCH');
  await bounded((await view.replace({ view: definition })).initial);
  assert.equal(find(view, 'offset').inputs.text, 101); assert.equal(view.snapshot().queries.data.data, 'query-v2');
  assert.equal(await view.emit(find(view, 'button'), 'click', null), 'action-v2'); assert.equal(await instance.invokeAction({ owner: view, actionRef: 'label' }), 'action-v2');
  view.getState('count').write(11); assert.equal(view.getState('count').read(), 11);
});

test('M07 denied existing-view replacement preserves State, URL, connections and data execution', async t => {
  const r = registry(); let requests = 0; const operations = [];
  r.registerResources([query()]);
  const location = url('https://example.test/view?p.old=3&foreign=keep');
  const instance = runtime(t, r, { authorize: context => { operations.push(context.operation); return false; }, requestExecutor: () => { requests++; return { status: 200, headers: {}, body: [] }; } });
  const original = { ...spec('old'), render: text(path('/states/count')) };
  const { view, initial } = await instance.mount({ view: original, url: { adapter: location.adapter, bindings: [{ state: 'count', key: 'p.old' }] } }); await bounded(initial);
  const handle = view.getState('count'), before = view.snapshot(), href = location.read(), writes = location.attempts.length;
  await assert.rejects(view.replace({ view: { ...spec('denied'), queries: { data: { queryRef: 'q' } } }, url: { adapter: location.adapter, bindings: [{ state: 'count', key: 'p.new' }] } }), error => error.code === 'EXECUTION_BLOCKED');
  assert.equal(view.getState('count'), handle); assert.equal(handle.read(), 3); assert.equal(view.snapshot().generation, before.generation); assert.equal(view.snapshot().lifetime, before.lifetime); assert.deepEqual(view.exportDefinition(), original);
  assert.equal(location.read(), href); assert.equal(location.attempts.length, writes); assert.equal(requests, 0); assert.deepEqual(operations, ['update']);
});

for (const unavailable of ['missing', 'error']) test(`U07/C07 temporarily ${unavailable} required input preserves the existing Component State lifetime`, async t => {
  const r = registry(); r.registerResources([resource('Component', 'Stateful', { ports: { seed: { kind: 'Value', schema: number, required: true } }, states: { count: state(0) }, render: text(path('/states/count')) })]);
  const definition = { ports: { seed: { kind: 'Value', schema: true } }, render: { id: 'stateful', componentRef: 'Stateful', inputs: { seed: path('/ports/seed') } } };
  const instance = runtime(t, r), { view, initial } = await instance.mount({ view: definition, inputs: { seed: 1 } }); await bounded(initial);
  const before = find(view, 'stateful'), handle = view.getState('count', before.instanceId); handle.write(9);
  await bounded((await view.update(definition, { inputs: unavailable === 'missing' ? {} : { seed: 'wrong-type' } })).initial);
  assert.equal(find(view, 'stateful').status, unavailable === 'missing' ? 'pending' : 'error');
  assert.equal(handle.read(), 9);
  await bounded((await view.update(definition, { inputs: { seed: 2 } })).initial);
  assert.equal(find(view, 'stateful').instanceId, before.instanceId); assert.equal(view.getState('count', before.instanceId), handle); assert.equal(handle.read(), 9);
});

test('M01 failed build after a retained Component input becomes pending preserves its live State', async t => {
  const r = registry(); r.registerResources([resource('Component', 'Stateful', { ports: { seed: { kind: 'Value', schema: number, required: true } }, states: { count: state(0) }, render: text(path('/states/count')) })]);
  const definition = { ports: { seed: { kind: 'Value', schema: true } }, render: row([{ id: 'stateful', componentRef: 'Stateful', inputs: { seed: path('/ports/seed') } }]) };
  const instance = runtime(t, r), { view, initial } = await instance.mount({ view: definition, inputs: { seed: 1 } }); await bounded(initial);
  const before = find(view, 'stateful'), handle = view.getState('count', before.instanceId); handle.write(9); const generation = view.snapshot().generation;
  const invalid = structuredClone(definition); invalid.render.slots.default.push({ id: 'bad', componentRef: 'Text', inputs: { text: 'bad' }, repeat: { items: [1, 1], as: 'item', key: path('/repeat/item') } });
  await assert.rejects(view.update(invalid, { inputs: {} }), error => error.code === 'INVALID_DEFINITION');
  assert.equal(view.snapshot().generation, generation); assert.equal(find(view, 'stateful').instanceId, before.instanceId); assert.equal(find(view, 'stateful').status, 'ready'); assert.equal(handle.read(), 9); assert.deepEqual(view.exportDefinition(), definition);
});

test('U07 suspended nested owner preserves active Action, local State and Query handle until resume', async t => {
  const r = registry(); r.registerComponent(resource('Component', 'Button', { events: { click: { schema: true } } }));
  let release, actionSignal; const requests = [];
  r.registerAction(resource('Action', 'wait', { output: { schema: true } }), context => { actionSignal = context.signal; return new Promise(resolve => { release = resolve; }); });
  r.registerResources([
    resource('Query', 'bySeed', { ports: { seed: { kind: 'Value', schema: number, required: true } }, sources: { main: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/seed' } } }, transform: { input: path('/sources/main') } }),
    resource('Component', 'Worker', { ports: { seed: { kind: 'Value', schema: number, required: true } }, states: { count: state(0) }, queries: { data: { queryRef: 'bySeed', inputs: { seed: path('/ports/seed') } } }, render: row([text(path('/actions/busy/status'), 'status'), { id: 'button', componentRef: 'Button', on: { click: { id: 'busy', actionRef: 'wait' } } }]) }),
    resource('Component', 'Parent', { ports: { seed: { kind: 'Value', schema: number, required: true } }, render: { id: 'worker', componentRef: 'Worker', inputs: { seed: path('/ports/seed') } } }),
  ]);
  const definition = { ports: { seed: { kind: 'Value', schema: true } }, render: { id: 'parent', componentRef: 'Parent', inputs: { seed: path('/ports/seed') } } };
  const instance = runtime(t, r, { requestExecutor: plan => { requests.push(plan.inputs.seed); return { status: 200, headers: {}, body: plan.inputs.seed }; } });
  const { view, initial } = await instance.mount({ view: definition, inputs: { seed: 1 } }); await bounded(initial); await flush();
  const worker = find(view, 'worker'), originalButton = find(view, 'button'), count = view.getState('count', worker.instanceId), handle = view.getQuery('data', worker.instanceId); count.write(9);
  const active = view.emit(originalButton, 'click', null); active.catch(() => {});
  await bounded((await view.update(definition, { inputs: {} })).initial); await flush();
  assert.equal(find(view, 'parent').status, 'pending'); assert.equal(count.read(), 9); assert.equal(actionSignal.aborted, false); assert.equal(handle.snapshot().status, 'waiting');
  await assert.rejects(handle.refresh(), error => error.code === 'INPUT_NOT_READY'); assert.deepEqual(requests, [1]);
  await bounded((await view.update(definition, { inputs: { seed: 2 } })).initial); await flush();
  assert.equal(find(view, 'worker').instanceId, worker.instanceId); assert.equal(find(view, 'button').generation, originalButton.generation); assert.equal(view.getQuery('data', worker.instanceId), handle); assert.equal(count.read(), 9); assert.deepEqual(requests, [1, 2]); assert.equal(find(view, 'status').inputs.text, 'running');
  release('done'); assert.equal(await bounded(active), 'done'); assert.equal(find(view, 'status').inputs.text, 'success');
});

test('U07/C07 reactions reconnect to actual State ports and pause while required input is unavailable', async t => {
  const r = registry(), store = createStateStore(), scope = store.createScope(); t.after(() => store.dispose());
  const watchA = scope.registerState('watchA', { schema: number, initial: 0 }), watchB = scope.registerState('watchB', { schema: number, initial: 0 }), targetA = scope.registerState('targetA', { schema: number, initial: 5 }), targetB = scope.registerState('targetB', { schema: number, initial: 6 });
  const statePort = { kind: 'State', schema: number, required: true };
  r.registerResources([resource('Component', 'Reactor', { ports: { source: statePort, target: statePort, gate: { kind: 'Value', schema: number, required: true } }, reactions: [{ watch: [path('/ports/source')], target: path('/ports/target'), value: 0 }], render: text('reactor') })]);
  const definition = { ports: { source: statePort, target: statePort, gate: { kind: 'Value', schema: true } }, render: { id: 'reactor', componentRef: 'Reactor', inputs: { source: path('/ports/source'), target: path('/ports/target'), gate: path('/ports/gate') } } };
  const instance = runtime(t, r, { stateStore: store }), { view, initial } = await instance.mount({ view: definition, inputs: { source: watchA, target: targetA, gate: 1 } }); await bounded(initial);
  const owner = find(view, 'reactor').instanceId;
  watchA.write(1); assert.equal(targetA.read(), 0); targetA.write(5);
  await bounded((await view.update(definition, { inputs: { source: watchB, target: targetB, gate: 1 } })).initial);
  assert.equal(find(view, 'reactor').instanceId, owner); watchA.write(2); assert.equal(targetA.read(), 5); assert.equal(targetB.read(), 6); watchB.write(1); assert.equal(targetB.read(), 0);
  targetB.write(7); await bounded((await view.update(definition, { inputs: { source: watchB, target: targetB } })).initial);
  watchB.write(2); assert.equal(targetB.read(), 7);
  await bounded((await view.update(definition, { inputs: { source: watchB, target: targetB, gate: 2 } })).initial); watchB.write(3); assert.equal(targetB.read(), 0); assert.equal(targetA.read(), 5);
});

test('U01 runtime accepts empty required slots and omitted optional slots as empty content', async t => {
  const r = registry(); r.registerResources([resource('Component', 'Receiver', { slots: { required: { required: true }, optional: {} }, render: row([{ id: 'required', componentRef: 'Row', slots: { default: path('/slots/required') } }, { id: 'optional', componentRef: 'Row', slots: { default: path('/slots/optional') } }]) })]);
  const { view } = await mounted(t, { render: { id: 'receiver', componentRef: 'Receiver', slots: { required: [] } } }, r);
  assert.deepEqual(find(view, 'required').children, []); assert.deepEqual(find(view, 'optional').children, []);
});

test('U07 moving the same local node id into another author Component creates a new lifetime', async t => {
  const r = registry(); r.registerResources([resource('Component', 'Counter', { states: { count: state(0) }, render: text(path('/states/count')) })]);
  const author = inside => ({ render: row(inside ? [{ id: 'counter', componentRef: 'Counter' }] : []) });
  const make = moved => ({ render: row([{ id: 'left', component: author(!moved) }, { id: 'right', component: author(moved) }]) });
  const { view } = await mounted(t, make(false), r), before = find(view, 'counter'), handle = view.getState('count', before.instanceId); handle.write(9);
  await bounded((await view.update(make(true))).initial);
  const after = find(view, 'counter'); assert.notEqual(after.instanceId, before.instanceId); assert.equal(view.getState('count', after.instanceId).read(), 0); assert.throws(() => handle.read(), error => error.code === 'CANCELLED');
});

test('U11 unused direct self and separate registered Component cycles fail before any execution', () => {
  const r = registry();
  assert.throws(() => r.registerResources([resource('Component', 'self', { render: { id: 'self', componentRef: 'self' } })]), error => error.code === 'INVALID_DEFINITION');
  assert.throws(() => r.registerResources([resource('Component', 'A', { render: { id: 'b', componentRef: 'B' } }), resource('Component', 'B', { render: { id: 'a', componentRef: 'A' } })]), error => error.code === 'INVALID_DEFINITION');
  assert.throws(() => r.get('Component', 'A'), error => error.code === 'REFERENCE_NOT_FOUND');
});

test('U12 node ids remain unique across two Row containers in one author owner', async t => {
  const r = registry(), instance = runtime(t, r);
  await assert.rejects(instance.mount({ view: { render: row([{ id: 'left', componentRef: 'Row', slots: { default: [text('left', 'duplicate')] } }, { id: 'right', componentRef: 'Row', slots: { default: [text('right', 'duplicate')] } }]) } }), error => error.code === 'INVALID_DEFINITION');
});
