import assert from 'node:assert/strict';
import test from 'node:test';
import { createRegistry, createRuntime, defineResourceSet } from '@viewstem/core';
import { createRegistry as localRegistry, createRuntime as localRuntime, createStateStore as localStore, rendererView } from '../src/api.mjs';
import { defineResourceSet as localSet } from '../src/resource-set.mjs';
import { Registry } from '../src/registry.mjs';
import { memoryUrl, tick } from './fixtures/state/url-adapter.mjs';

const schema = { type: 'integer' };
const leaf = id => ({ kind: 'Component', id, spec: { events: { click: { schema: true } } } });
const binding = id => ({ contract: leaf(id), connectorId: 'test', implementation: {} });
const resource = (id, value = 1) => ({ kind: 'Type', id, spec: { schema: { const: value } } });
const definition = (id = 'Base', initial = 1) => ({
  states: { count: { kind: 'State', schema, initial } }, render: { id: 'leaf', componentRef: id },
});
const code = (id, implementation, requires) => ({ definition: { kind: 'Action', id, spec: { output: { schema } } }, implementation, requires });
const codeIs = code => failure => failure.code === code;

test('View refresh reuses port compilation and validates current inputs against the applied Type', async t => {
  const type = pattern => ({ kind: 'Type', id: 'EntryValue', spec: { schema: { type: 'string', pattern } } });
  const row = binding('Row');
  row.contract.spec.slots = { default: {} };
  const registry = localRegistry()
    .registerResourceSet(localSet({ id: 'components', version: '1', components: [row, binding('Leaf')] }))
    .registerResources([type('^old-'), {
      kind: 'Component', id: 'Entry', spec: {
        ports: { value: { kind: 'Value', typeRef: 'EntryValue', required: true } },
        render: { id: 'leaf', componentRef: 'Leaf' },
      },
    }]);
  const runtime = localRuntime({ registry });
  t.after(() => runtime.dispose());
  const source = {
    states: { entries: { kind: 'State', schema: { type: 'array' }, initial: [
      { id: 1, value: 'old-a' }, { id: 2, value: 'old-b' },
    ] } },
    render: { id: 'row', componentRef: 'Row', slots: { default: [{
      id: 'entry', componentRef: 'Entry',
      repeat: { items: { '@path': '/states/entries' }, as: 'item', key: { '@path': '/repeat/item/id' } },
      inputs: { value: { '@path': '/repeat/item/value' } },
    }] } },
  };
  const view = await runtime.createView(source);
  const entries = () => view.getSnapshot().roots[0].children.map(node => [node.status, node.inputs.value, node.error?.code]);
  assert.deepEqual(entries(), [['ready', 'old-a', undefined], ['ready', 'old-b', undefined]]);

  const update = (first, second) => view.getState('entries').write([{ id: 1, value: first }, { id: 2, value: second }]);
  const typeLookups = t.mock.method(Registry.prototype, 'types');
  update('old-c', 'new-d');
  update('old-e', 'new-f');
  assert.deepEqual(entries(), [['ready', 'old-e', undefined], ['error', undefined, 'TYPE_MISMATCH']]);
  assert.equal(typeLookups.mock.callCount(), 0);
  typeLookups.mock.restore();

  registry.updateResource(type('^new-'));
  update('old-g', 'new-h');
  assert.deepEqual(entries(), [['ready', 'old-g', undefined], ['error', undefined, 'TYPE_MISMATCH']]);
  await view.replace(source);
  update('old-g', 'new-h');
  assert.deepEqual(entries(), [['error', undefined, 'TYPE_MISMATCH'], ['ready', 'new-h', undefined]]);
});

test('State writes publish owning and connected Views and follow State port replacement', async t => {
  const p = value => ({ '@path': value });
  const number = binding('Number');
  number.contract.spec.ports = { value: { kind: 'Value', schema, required: true } };
  const registry = localRegistry().registerResourceSet(localSet({
    id: 'components', version: '1', components: [number],
  }));
  const store = localStore();
  const runtime = localRuntime({ registry, stateStore: store });
  t.after(async () => { await runtime.dispose(); await store.dispose(); });
  const source = initial => ({
    states: { value: { kind: 'State', schema, initial } },
    render: { id: 'number', componentRef: 'Number', inputs: { value: p('/states/value') } },
  });
  const own = await runtime.createView(source(1));
  const unrelated = await runtime.createView(source(2));
  const first = own.getState('value'), second = unrelated.getState('value');
  const connected = await runtime.createView({
    ports: { value: { kind: 'State', schema, required: true } },
    render: { id: 'number', componentRef: 'Number', inputs: { value: p('/ports/value') } },
  }, { inputs: { value: first } });
  await tick();
  const numbers = view => {
    const values = [];
    view.subscribe(snapshot => values.push(snapshot.roots[0].inputs.value));
    return values;
  };
  const ownValues = numbers(own), otherValues = numbers(unrelated), connectedValues = numbers(connected);
  first.write(3);
  assert.deepEqual(ownValues, [1, 3]);
  assert.deepEqual(otherValues, [2]);
  assert.deepEqual(connectedValues, [1, 3]);
  await connected.setInputs({ value: second });
  await tick();
  const previous = connectedValues.length;
  first.write(4);
  assert.equal(connectedValues.length, previous);
  second.write(5);
  assert.deepEqual(connectedValues.slice(previous), [5]);
});

test('sets and definitions apply to one View together and reject invalid State or code bindings atomically', async t => {
  const registry = createRegistry().registerResourceSet(defineResourceSet({ id: 'base', version: '1', components: [binding('Base')] }));
  const runtime = createRuntime({ registry });
  t.after(() => runtime.dispose());
  const left = await runtime.createView(definition()), right = await runtime.createView(definition());
  const cell = left.getState('count');
  cell.write(8);
  const before = left.getSnapshot();
  const nextDefinition = { ...definition(), queries: { result: { queryRef: 'QueryNew' } } };
  const staged = defineResourceSet({ id: 'new', version: '1', actions: [code('newAction', () => 2)],
    resources: [{ kind: 'Query', id: 'QueryNew', spec: { sources: {}, transform: { input: 2 } } }] });
  registry.registerResourceSet(staged).registerComponentContract(leaf('Legacy'));
  await assert.rejects(left.applyResourceSets({ setIds: ['new'], definition: nextDefinition, states: { count: 'invalid' } }), codeIs('TYPE_MISMATCH'));
  await assert.rejects(left.applyResourceSets({ setIds: ['missing'] }), codeIs('REFERENCE_NOT_FOUND'));
  await assert.rejects(left.applyResourceSets({ setIds: ['new'], definition: definition('Legacy') }), codeIs('REFERENCE_NOT_FOUND'));
  assert.deepEqual(left.exportDefinition(), definition());
  assert.equal(cell.read(), 8);
  await assert.rejects(left.invokeAction({ actionRef: 'newAction' }), codeIs('REFERENCE_NOT_FOUND'));
  const application = await left.applyResourceSets({ setIds: ['new', 'new'], definition: nextDefinition, states: { count: 9 } });
  await left.whenSettled(application);
  const after = left.getSnapshot();
  assert.deepEqual(left.exportDefinition(), nextDefinition);
  assert.equal(after.lifetime, before.lifetime);
  assert.equal(after.roots[0].generation, before.roots[0].generation);
  assert.equal(cell.read(), 9);
  assert.equal(await left.invokeAction({ actionRef: 'newAction' }), 2);
  assert.equal(left.getQuery('result').getSnapshot().data, 2);
  await assert.rejects(right.invokeAction({ actionRef: 'newAction' }), codeIs('REFERENCE_NOT_FOUND'));
  assert.equal(await (await runtime.createView(definition())).invokeAction({ actionRef: 'newAction' }), 2);
});

test('a missing input reference keeps the open View and leaves resolver candidates unpublished', async t => {
  const registry = createRegistry().registerResourceSet(defineResourceSet({
    id: 'base', version: '1', components: [binding('Base')],
    actions: [{
      definition: { kind: 'Action', id: 'increment', spec: { ports: { count: { kind: 'State', schema, required: true } } } },
      implementation: ({ inputs }) => inputs.count.write(inputs.count.read() + 1),
    }],
  }));
  let resolved = 0;
  const runtime = createRuntime({ registry, resourceResolver(kind, id) {
    if (kind === 'Type' && id === 'Retrieved') { resolved++; return resource(id); }
  } });
  t.after(() => runtime.dispose());
  const source = definition();
  source.render.on = { click: { actionRef: 'increment', inputs: { count: { '@path': '/states/count' } } } };
  const view = await runtime.createView(source);
  const cell = view.getState('count');
  await view.emit(view.getSnapshot().roots[0], 'click', null);
  assert.equal(cell.read(), 2);
  registry.registerResourceSet(defineResourceSet({ id: 'new', version: '1', actions: [code('newAction', () => 2)] }));

  const invalid = structuredClone(source);
  invalid.render.on.click.inputs.count['@path'] = '/states/coutn';
  const replacement = structuredClone(invalid);
  replacement.states.extra = { kind: 'State', typeRef: 'Retrieved', initial: 1 };
  const attempts = [
    () => view.updateDefinition(invalid, { states: { count: 99 } }),
    () => view.applyResourceSets({ setIds: ['new'], definition: invalid, states: { count: 99 } }),
    () => view.replace(replacement),
  ];
  const original = view.getSnapshot();
  const application = view.initial;
  for (const apply of attempts) {
    await assert.rejects(apply(), { code: 'REFERENCE_NOT_FOUND', location: '/render/on/click/inputs/count/@path' });
    assert.deepEqual(view.exportDefinition(), source);
    assert.equal(view.initial, application);
    assert.equal(view.getSnapshot().roots[0].generation, original.roots[0].generation);
    assert.equal(view.getState('count'), cell);
    assert.equal(cell.read(), 2);
  }
  await assert.rejects(view.invokeAction({ actionRef: 'newAction' }), codeIs('REFERENCE_NOT_FOUND'));
  assert.equal(resolved, 1);
  assert.throws(() => registry.get('Type', 'Retrieved'), codeIs('REFERENCE_NOT_FOUND'));
  await view.emit(view.getSnapshot().roots[0], 'click', null);
  assert.equal(cell.read(), 3);
});

test('View prepare rejects event paths outside handlers and preserves the current View', async t => {
  const parent = binding('Parent');
  parent.contract.spec.slots = { default: {} };
  const child = binding('Child');
  child.contract.spec.ports = { label: { kind: 'Value', schema: { type: 'string' }, required: true } };
  const registry = createRegistry().registerResourceSet(defineResourceSet({ id: 'components', version: '1', components: [parent, child] }));
  const runtime = createRuntime({ registry });
  t.after(() => runtime.dispose());
  const source = definition('Parent');
  source.render.slots = { default: [{ id: 'label', componentRef: 'Child', inputs: { label: 'keep' } }] };
  const event = { '@path': '/event' };
  const cases = [
    ['inputs/label/@path', node => { node.inputs.label = event; }],
    ['inputs/@path', node => { node.inputs = event; }],
    ['inputs/label/args/value', node => { node.inputs.label = { '@call': 'formatString', args: { value: 'received ${/event}' } }; }],
    ['when/@path', node => { node.when = event; }],
    ['repeat/items/@path', node => { node.repeat = { items: event, as: 'row', key: { '@path': '/repeat/row' } }; }],
    ['repeat/key/@path', node => { node.repeat = { items: [1], as: 'row', key: event }; }],
  ];
  for (const [field, introduce] of cases) await t.test(field, async () => {
    const view = await runtime.createView(source);
    const count = view.getState('count');
    count.write(7);
    const originalApplication = view.initial;
    const originalNode = view.getSnapshot().roots[0].slots.default[0];
    const invalid = structuredClone(source);
    introduce(invalid.render.slots.default[0]);
    const failure = { code: 'REFERENCE_NOT_FOUND', location: `/render/slots/default/0/${field}` };
    await assert.rejects(view.updateDefinition(invalid, { states: { count: 99 } }), failure);
    await assert.rejects(runtime.createView(invalid), failure);
    assert.deepEqual(view.exportDefinition(), source);
    assert.equal(view.initial, originalApplication);
    const node = view.getSnapshot().roots[0].slots.default[0];
    assert.deepEqual([node.generation, node.status, node.inputs.label], [originalNode.generation, 'ready', 'keep']);
    assert.equal(view.getState('count'), count);
    assert.equal(count.read(), 7);
    await view.dispose();
  });
});

test('event paths pass payloads through an emit handler and into a View Action', async t => {
  const registry = createRegistry().registerResourceSet(defineResourceSet({ id: 'relay', version: '1', components: [binding('Base')],
    resources: [{ kind: 'Component', id: 'Relay', spec: {
      events: { changed: { schema } },
      render: { id: 'source', componentRef: 'Base', on: { click: { emit: 'changed', payload: { '@path': '/event/value' } } } },
    } }],
    actions: [{ definition: { kind: 'Action', id: 'record', spec: { ports: {
      value: { kind: 'Value', schema, required: true }, count: { kind: 'State', schema, required: true },
    } } }, implementation: ({ inputs }) => inputs.count.write(inputs.value) }],
  }));
  const runtime = createRuntime({ registry });
  t.after(() => runtime.dispose());
  const source = definition('Relay');
  source.render.on = { changed: { actionRef: 'record', inputs: { value: { '@path': '/event' }, count: { '@path': '/states/count' } } } };
  const view = await runtime.createView(source);
  const emitter = view.getSnapshot().roots[0].children[0];
  await view.emit(emitter, 'click', { value: 17 });
  assert.equal(view.getState('count').read(), 17);
});

test('an in-flight Action resolves descendant calls from its starting configuration', async t => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const registry = createRegistry().registerResourceSet(defineResourceSet({ id: 'base', version: '1', components: [binding('Base')],
    actions: [code('parent', async ({ invokeAction }) => { await held; return invokeAction({ actionRef: 'child' }); })] }));
  const runtime = createRuntime({ registry });
  t.after(() => runtime.dispose());
  const view = await runtime.createView(definition());
  const running = view.invokeAction({ actionRef: 'parent' });
  const rejected = assert.rejects(running, codeIs('REFERENCE_NOT_FOUND'));
  registry.registerResourceSet(defineResourceSet({ id: 'new', version: '1', actions: [code('child', () => 5)] }));
  await view.applyResourceSets({ setIds: ['new'] });
  release();
  await rejected;
  assert.equal(await view.invokeAction({ actionRef: 'parent' }), 5);
});

test('adding a set keeps the active Query usage and does not dispatch its request again', async t => {
  const registry = createRegistry().registerResourceSet(defineResourceSet({ id: 'base', version: '1', components: [binding('Base')] }));
  const requests = [];
  const runtime = createRuntime({ registry, requestExecutor(plan, { signal }) {
    return new Promise(resolve => requests.push({ plan, signal, resolve }));
  } });
  t.after(() => runtime.dispose());
  const view = await runtime.createView({ ...definition(), queries: { results: { query: {
    sources: { data: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/old' } } },
    transform: { input: { '@path': '/sources/data' } },
  } } } });
  const usage = view.getQuery('results');
  assert.equal(requests.length, 1);
  registry.registerResourceSet(defineResourceSet({ id: 'extra', version: '1', actions: [code('new', () => 5)] }));
  const application = await view.applyResourceSets({ setIds: ['extra'] });
  assert.equal(view.getQuery('results'), usage);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].signal.aborted, false);
  requests[0].resolve({ body: 17 });
  await view.whenSettled(application);
  assert.equal(usage.getSnapshot().data, 17);
  assert.equal(await view.invokeAction({ actionRef: 'new' }), 5);
});

test('View authorization cannot start a candidate Action even when the configuration passes validation', async t => {
  const registry = createRegistry().registerResourceSet(defineResourceSet({ id: 'base', version: '1', components: [binding('Base')] }));
  let blocked, calls = 0;
  const runtime = createRuntime({ registry, authorize({ operation, owner }) {
    if (operation === 'update') blocked = owner.invokeAction({ actionRef: 'candidate' }).catch(failure => failure.code);
    return true;
  } });
  t.after(() => runtime.dispose());
  const view = await runtime.createView(definition());
  registry.registerResourceSet(defineResourceSet({ id: 'new', version: '1', actions: [code('candidate', () => ++calls)] }));
  await view.applyResourceSets({ setIds: ['new'] });
  assert.equal(await blocked, 'EXECUTION_BLOCKED');
  assert.equal(calls, 0);
  assert.equal(await view.invokeAction({ actionRef: 'candidate' }), 1);
});

test('headless required capabilities are checked before entry and Runtime cancellation is independent', async t => {
  let calls = 0, complete;
  const wait = new Promise(resolve => { complete = resolve; });
  const registry = createRegistry().registerResourceSet(defineResourceSet({ id: 'actions', version: '1', actions: [
    code('routing', ({ capabilities }) => { calls++; return capabilities['route/name'](); }, ['route/name']),
    code('hold', async () => wait),
  ] }));
  const a = createRuntime({ registry }), b = createRuntime({ registry, hostCapabilities: { 'route/name': () => 7 } });
  t.after(() => { a.dispose(); b.dispose(); });
  await assert.rejects(a.invokeAction({ actionRef: 'routing' }), failure => failure.code === 'REFERENCE_NOT_FOUND'
    && failure.location === '/capabilities/route~1name' && failure.resource?.id === 'routing');
  assert.equal(calls, 0);
  assert.equal(await b.invokeAction({ actionRef: 'routing' }), 7);
  const first = a.invokeAction({ actionRef: 'hold' }), second = b.invokeAction({ actionRef: 'hold' });
  const cancelled = assert.rejects(first, codeIs('CANCELLED'));
  a.dispose();
  complete(11);
  await cancelled;
  assert.equal(await second, 11);
});

function replacementFixture(t) {
  const registry = localRegistry().registerResourceSet(localSet({ id: 'base', version: '1', components: [binding('Base')] }));
  const endpoint = memoryUrl();
  const calls = { resolve: 0, subscribe: 0, query: 0 };
  const adapter = { ...endpoint.adapter, subscribe(listener) { calls.subscribe++; return endpoint.adapter.subscribe(listener); } };
  const runtime = localRuntime({ registry, resourceResolver(kind, id) {
    calls.resolve++;
    return kind === 'Type' && id === 'Retrieved' ? resource(id) : undefined;
  }, async requestExecutor() { calls.query++; return { body: 15 }; } });
  t.after(() => runtime.dispose());
  const url = key => ({ adapter, bindings: [{ state: 'count', key }] });
  const view = runtime.createView(definition(), { url: url('old') });
  const retrievedDefinition = definition('Base', 3);
  retrievedDefinition.states.extra = { kind: 'State', typeRef: 'Retrieved', initial: 1 };
  retrievedDefinition.queries = { incoming: { query: {
    sources: { value: { datasource: { kind: 'Http', baseUrl: 'https://example.test/' }, request: { method: 'GET', path: '/data' } } },
    transform: { input: { '@path': '/sources/value' } },
  } } };
  return { registry, endpoint, view, calls, runtime, url, target: { view: retrievedDefinition, url: url('next') } };
}

test('a URL key reserved by another StateStore in the final callback prevents the Registry and View commit', async t => {
  const f = replacementFixture(t), view = await f.view;
  await view.whenSettled(view.initial);
  const oldCell = view.getState('count');
  oldCell.write(6);
  await tick();
  const other = localStore(), cell = other.createScope().registerState('value', { schema, initial: 1 });
  t.after(() => other.dispose());
  await assert.rejects(rendererView(view).replace(f.target, undefined, () => {
    other.connectUrl({ adapter: f.url('next').adapter, bindings: [{ target: cell, key: 'next' }] });
  }), codeIs('INVALID_DEFINITION'));
  assert.throws(() => f.registry.get('Type', 'Retrieved'), codeIs('REFERENCE_NOT_FOUND'));
  assert.deepEqual(view.exportDefinition(), definition());
  assert.equal(oldCell.read(), 6);
  assert.equal(f.calls.subscribe, 2);
  assert.equal(f.calls.query, 0);
  assert.deepEqual(f.endpoint.attempts.map(item => item.patch), [{ old: '6' }]);
  cell.write(4);
  await tick();
  assert.equal(new URL(f.endpoint.read()).searchParams.get('next'), '4');
});

for (const method of ['registerResources', 'registerComponentContracts']) {
  test(`an empty ${method} in an update callback does not restart set application`, async t => {
    const registry = createRegistry().registerResourceSet(defineResourceSet({ id: 'base', version: '1', components: [binding('Base')] }));
    let attempts = 0;
    const runtime = createRuntime({ registry, authorize({ operation }) {
      if (operation === 'update' && ++attempts <= 3) assert.equal(registry[method]([]), registry);
      return true;
    } });
    t.after(() => runtime.dispose());
    const view = await runtime.createView(definition());
    registry.registerResourceSet(defineResourceSet({ id: 'new', version: '1', actions: [code('fresh', () => 2)] }));
    await view.whenSettled(await view.applyResourceSets({ setIds: ['new'] }));
    assert.equal(attempts, 1);
    assert.equal(await view.invokeAction({ actionRef: 'fresh' }), 2);
  });
}

test('a host timer can cancel replacement during repeated real Registry conflicts', async t => {
  const f = replacementFixture(t), view = await f.view;
  await view.whenSettled(view.initial);
  const controller = new AbortController(), initial = view.initial, oldCount = view.getState('count');
  let attempts = 0, timer, attemptsAtCancellation;
  t.after(() => clearTimeout(timer));
  const result = rendererView(view).replace(f.target, controller.signal, () => {
    if (++attempts === 1) {
      timer = setTimeout(() => { attemptsAtCancellation = attempts; controller.abort(); }, 0);
    }
    if (attempts <= 16) f.registry.registerResources([resource(`Winner-${attempts}`)]);
  });
  await assert.rejects(result, { code: 'CANCELLED' });
  assert.ok(attempts > 0 && attempts <= 16);
  assert.equal(attemptsAtCancellation, attempts);
  assert.equal(f.registry.get('Type', `Winner-${attempts}`).id, `Winner-${attempts}`);
  assert.throws(() => f.registry.get('Type', 'Retrieved'), { code: 'REFERENCE_NOT_FOUND' });
  assert.equal(view.initial, initial);
  assert.equal(view.getState('count'), oldCount);
  assert.equal(oldCount.read(), 1);
  assert.deepEqual(view.exportDefinition(), definition());
  assert.deepEqual(f.calls, { resolve: 1, subscribe: 1, query: 0 });
  assert.deepEqual(f.endpoint.attempts, []);
  await view.whenSettled(await view.updateDefinition(definition(), { states: { count: 5 } }));
  assert.equal(oldCount.read(), 5);
});

test('a resolver publication conflict leaves a host turn for cancellation before retry', async t => {
  const registry = createRegistry().registerResourceSet(defineResourceSet({ id: 'base', version: '1', components: [binding('Base')] }));
  const controller = new AbortController();
  let timer, lookups = 0;
  const runtime = createRuntime({ registry, resourceResolver(kind, id) {
    assert.deepEqual([kind, id], ['Type', 'Retrieved']);
    lookups++;
    registry.registerResources([resource('Winner')]);
    timer = setTimeout(() => controller.abort(), 0);
    return resource(id);
  } });
  t.after(async () => { clearTimeout(timer); await runtime.dispose(); });
  const source = definition();
  source.states.extra = { kind: 'State', typeRef: 'Retrieved', initial: 1 };
  await assert.rejects(runtime.createView(source, { signal: controller.signal }), { code: 'CANCELLED' });
  assert.equal(lookups, 1);
  assert.equal(registry.get('Type', 'Winner').id, 'Winner');
  assert.throws(() => registry.get('Type', 'Retrieved'), { code: 'REFERENCE_NOT_FOUND' });
});

for (const cancel of [true, false]) {
  test(`rechecking a changed Registry ${cancel ? 'discards the cancelled candidate' : 'publishes both nonconflicting changes'}`, async t => {
    const f = replacementFixture(t), view = await f.view;
    await view.whenSettled(view.initial);
    const controller = new AbortController(), initial = view.getState('count');
    let attempts = 0, notification;
    const stop = f.runtime.stateStore.subscribe(null, ({ changes }) => {
      if (!changes.some(change => change.kind === 'added' && change.target.name === 'extra')) return;
      notification = [f.registry.get('Type', 'Retrieved').id, view.exportDefinition(), view.getState('count').read()];
    });
    t.after(stop);
    const result = rendererView(view).replace(f.target, controller.signal, () => {
      if (++attempts !== 1) return;
      f.registry.registerResourceSet(localSet({ id: 'winner', version: '1', resources: [resource('Winner')] }));
      if (cancel) queueMicrotask(() => controller.abort());
    });
    if (cancel) {
      await assert.rejects(result, codeIs('CANCELLED'));
      assert.equal(attempts, 1);
      assert.throws(() => f.registry.get('Type', 'Retrieved'), codeIs('REFERENCE_NOT_FOUND'));
      assert.deepEqual(view.exportDefinition(), definition());
      assert.equal(initial.read(), 1);
      assert.equal(notification, undefined);
      assert.equal(f.calls.subscribe, 1);
      assert.equal(f.endpoint.attempts.length, 0);
    } else {
      await view.whenSettled(await result);
      assert.deepEqual(notification, ['Retrieved', f.target.view, 3]);
      assert.equal(attempts, 2);
      assert.equal(f.calls.subscribe, 2);
    }
    assert.equal(f.registry.get('Type', 'Winner').id, 'Winner');
    assert.equal(f.calls.resolve, 1);
    assert.equal(f.calls.query, cancel ? 0 : 1);
  });
}

test('the first published definition survives both resolver and resource-set conflicts', async t => {
  const f = replacementFixture(t), view = await f.view;
  await view.whenSettled(view.initial);
  const contender = localSet({ id: 'contender', version: '1', resources: [resource('Retrieved', 2)] });
  await assert.rejects(rendererView(view).replace({ view: f.target.view }, undefined, () => {
    f.registry.registerResourceSet(contender);
  }), codeIs('INVALID_DEFINITION'));
  assert.equal(f.registry.get('Type', 'Retrieved').spec.schema.const, 2);
  assert.deepEqual(view.exportDefinition(), definition());

  const other = replacementFixture(t), otherView = await other.view;
  await otherView.whenSettled(await rendererView(otherView).replace({ view: other.target.view }));
  assert.throws(() => other.registry.registerResourceSet(contender), codeIs('INVALID_DEFINITION'));
  assert.equal(other.registry.get('Type', 'Retrieved').spec.schema.const, 1);
});
