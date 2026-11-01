import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, createRuntime, createStateStore } from '@viewstem/core';

const path = value => ({ '@path': value });
const resource = (kind, id, spec) => ({ kind, id, spec });
const port = (kind = 'Value', schema = true) => ({ kind, schema, required: true });
const state = (initial, schema = true) => ({ kind: 'State', schema, initial });
const text = (id, value) => ({ id, componentRef: 'Text', inputs: { text: value } });
const row = (id, children) => ({ id, componentRef: 'Row', slots: { default: children } });
const button = (id, handler, extra = {}) => ({ id, componentRef: 'Button', on: { click: handler }, ...extra });
const flatten = snapshot => {
  const output = [];
  const visit = node => { output.push(node); node.children.forEach(visit); };
  snapshot.roots.forEach(visit); return output;
};
const find = (view, id) => flatten(view.snapshot()).find(node => node.id === id);
const findAll = (view, id) => flatten(view.snapshot()).filter(node => node.id === id);
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
function registry() {
  const registry = createRegistry();
  registry.registerComponent(resource('Component', 'Text', { ports: { text: port() } }));
  registry.registerComponent(resource('Component', 'Button', { events: { click: { schema: true } } }));
  registry.registerComponent(resource('Component', 'Row', { slots: { default: {} } }));
  registry.registerResources([resource('Component', 'Counter', { ports: { label: { kind: 'Value', schema: true } }, states: { count: state(0, { type: 'number' }) }, render: text('inside', path('/states/count')) })]);
  return registry;
}
async function mount(t, spec, r = registry(), extra = {}) {
  const runtime = createRuntime({ registry: r, ...extra }); t.after(() => runtime.dispose());
  const result = await runtime.mount({ view: spec }); await result.initial; await flush();
  return { runtime, view: result.view, registry: r };
}
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }

test('U07 moving a stateful node between Row slots preserves its handle and instance', async t => {
  const make = moved => ({ render: row('root', [row('left', moved ? [] : [{ id: 'counter', componentRef: 'Counter' }]), row('right', moved ? [{ id: 'counter', componentRef: 'Counter' }] : [])]) });
  const { view } = await mount(t, make(false));
  const before = find(view, 'counter'), handle = view.getState('count', before.instanceId); handle.write(9);
  await (await view.update(make(true))).initial;
  const after = find(view, 'counter');
  assert.equal(after.instanceId, before.instanceId); assert.equal(after.generation, before.generation);
  assert.equal(view.getState('count', after.instanceId), handle); assert.equal(handle.read(), 9);
});

test('U06 repeat reorder preserves key-owned state; remove and re-add creates a fresh lifetime', async t => {
  const spec = { states: { items: state([{ id: 'a' }, { id: 'b' }], { type: 'array' }) }, render: row('root', [{ id: 'counter', componentRef: 'Counter', inputs: { label: path('/repeat/item/id') }, repeat: { items: path('/states/items'), as: 'item', key: path('/repeat/item/id') } }]) };
  const { view } = await mount(t, spec); const [a, b] = findAll(view, 'counter');
  const handle = view.getState('count', a.instanceId); handle.write(7);
  view.getState('items').write([{ id: 'b' }, { id: 'a' }]);
  assert.deepEqual(findAll(view, 'counter').map(item => item.instanceId), [b.instanceId, a.instanceId]);
  assert.equal(handle.read(), 7);
  view.getState('items').write([{ id: 'b' }]); assert.throws(() => handle.read(), error => error.code === 'CANCELLED');
  view.getState('items').write([{ id: 'a' }, { id: 'b' }]);
  const [readded] = findAll(view, 'counter'); assert.notEqual(readded.instanceId, a.instanceId); assert.equal(view.getState('count', readded.instanceId).read(), 0);
});

test('U13 nested repeat reads outer and inner aliases and scopes equal keys under each parent', async t => {
  const spec = { states: { groups: state([{ id: 'a', children: [{ id: 'same' }] }, { id: 'b', children: [{ id: 'same' }] }], { type: 'array' }) }, render: row('root', [{ id: 'group', componentRef: 'Row', repeat: { items: path('/states/groups'), as: 'group', key: path('/repeat/group/id') }, slots: { default: [{ ...text('item', { '@call': 'concat', args: [path('/repeat/group/id'), ':', path('/repeat/item/id')] }), repeat: { items: path('/repeat/group/children'), as: 'item', key: path('/repeat/item/id') } }] } }]) };
  const { view } = await mount(t, spec);
  assert.deepEqual(findAll(view, 'item').map(node => node.inputs.text), ['a:same', 'b:same']);
});

test('U02 forwarded slots retain author state and original child ordering', async t => {
  const r = registry();
  r.registerResources([
    resource('Component', 'Receiver', { slots: { body: { required: true } }, states: { label: state('receiver') }, render: { id: 'receiver-row', componentRef: 'Row', slots: { default: path('/slots/body') } } }),
    resource('Component', 'Forwarder', { slots: { body: { required: true } }, render: { id: 'receiver', componentRef: 'Receiver', slots: { body: path('/slots/body') } } }),
  ]);
  const { view } = await mount(t, { states: { label: state('author') }, render: { id: 'forward', componentRef: 'Forwarder', slots: { body: [text('first', path('/states/label')), text('second', 'second')] } } }, r);
  assert.deepEqual(findAll(view, 'first').map(node => node.inputs.text), ['author']);
  assert.deepEqual(find(view, 'receiver-row').children.map(node => node.id), ['first', 'second']);
  view.getState('label').write('changed-author'); assert.equal(find(view, 'first').inputs.text, 'changed-author');
});

test('M03 replacing only instance A preserves B state and the common definition', async t => {
  const r = registry(), original = r.export('Component', 'Counter');
  const spec = { render: row('root', [{ id: 'A', componentRef: 'Counter' }, { id: 'B', componentRef: 'Counter' }]) };
  const { view } = await mount(t, spec, r); const before = find(view, 'B'), handle = view.getState('count', before.instanceId); handle.write(8);
  const next = structuredClone(spec); next.render.slots.default[0] = { id: 'A', component: { render: text('only-A', 'changed') } };
  await (await view.update(next)).initial;
  assert.equal(find(view, 'B').instanceId, before.instanceId); assert.equal(handle.read(), 8); assert.deepEqual(r.export('Component', 'Counter'), original);
});

test('U05 input reevaluation preserves settled local State and its initial reset baseline', async t => {
  const r = registry(); r.registerResources([resource('Component', 'Seeded', { ports: { seed: port('Value', { type: 'number' }) }, states: { count: state(path('/ports/seed'), { type: 'number' }) }, render: text('value', path('/states/count')) })]);
  const spec = { states: { seed: state(1, { type: 'number' }), tick: state(0) }, render: { id: 'seeded', componentRef: 'Seeded', inputs: { seed: path('/states/seed') } } };
  const { view } = await mount(t, spec, r); const node = find(view, 'seeded'), count = view.getState('count', node.instanceId); count.write(9);
  view.getState('seed').write(2); view.getState('tick').write(1); await (await view.update(spec)).initial;
  assert.equal(count.read(), 9); assert.equal(find(view, 'value').inputs.text, 9); count.reset(); assert.equal(count.read(), 1);
});

test('A14 action observations exist before earlier sibling inputs and remain current while running', async t => {
  const r = registry(), pending = deferred(); r.registerAction(resource('Action', 'wait', { output: { schema: true } }), () => pending.promise);
  const spec = { render: row('root', [text('status', path('/actions/waiting/status')), button('button', { id: 'waiting', actionRef: 'wait' })]) };
  const { view } = await mount(t, spec, r);
  assert.equal(find(view, 'status').inputs.text, 'idle');
  const running = view.emit(find(view, 'button'), 'click', null); running.catch(() => {});
  assert.equal(view.snapshot().actions.waiting.status, 'running');
  assert.equal(find(view, 'status').inputs.text, 'running');
  pending.resolve(false); await running; assert.equal(find(view, 'status').inputs.text, 'success');
});

test('A20 realized repeated action connection ids are rejected atomically', async t => {
  const r = registry(); r.registerAction(resource('Action', 'noop', {}), () => undefined);
  const { view } = await mount(t, { render: text('old', 'old') }, r); const before = view.snapshot();
  const next = { render: row('root', [button('repeated', { id: 'same', actionRef: 'noop' }, { repeat: { items: [1, 2], as: 'item', key: path('/repeat/item') } })]) };
  await assert.rejects(view.update(next), error => error.code === 'INVALID_DEFINITION');
  assert.equal(view.snapshot().generation, before.generation); assert.equal(find(view, 'old').inputs.text, 'old');
});

test('A20 projecting one author slot twice rejects duplicate realized connections', async t => {
  const r = registry(); r.registerAction(resource('Action', 'noop', {}), () => undefined);
  r.registerResources([resource('Component', 'Twice', { slots: { body: {} }, render: row('twice', [{ id: 'first', componentRef: 'Row', slots: { default: path('/slots/body') } }, { id: 'second', componentRef: 'Row', slots: { default: path('/slots/body') } }]) })]);
  const { runtime } = await mount(t, { render: text('old', 'old') }, r);
  await assert.rejects(runtime.mount({ view: { render: { id: 'twice', componentRef: 'Twice', slots: { body: [button('button', { id: 'same', actionRef: 'noop' })] } } } }), error => error.code === 'INVALID_DEFINITION');
});

test('A21 same internal action id in separate instances is independent and anonymous running duplicates are ignored', async t => {
  const r = registry(), pending = deferred(); let calls = 0;
  r.registerAction(resource('Action', 'wait', { output: { schema: true } }), () => { calls++; return pending.promise; });
  r.registerResources([resource('Component', 'Caller', { render: button('inner', { id: 'local', actionRef: 'wait' }) })]);
  const { view } = await mount(t, { render: row('root', [{ id: 'a', componentRef: 'Caller' }, { id: 'b', componentRef: 'Caller' }, button('anonymous', { actionRef: 'wait' })]) }, r);
  const [a, b] = findAll(view, 'inner');
  const one = view.emit(a, 'click', null), two = view.emit(b, 'click', null), three = view.emit(find(view, 'anonymous'), 'click', null); one.catch(() => {}); two.catch(() => {}); three.catch(() => {});
  await view.emit(find(view, 'anonymous'), 'click', null); assert.equal(calls, 3);
  pending.resolve('done'); assert.deepEqual(await Promise.all([one, two, three]), ['done', 'done', 'done']);
});

test('M01 failed dynamic update preserves State, old tree and an in-flight Action connection', async t => {
  const r = registry(), pending = deferred(); let signal;
  r.registerAction(resource('Action', 'wait', { output: { schema: true } }), context => { signal = context.signal; return pending.promise; });
  const spec = { states: { count: state(1, { type: 'number' }) }, render: row('root', [button('button', { id: 'waiting', actionRef: 'wait' }), text('count', path('/states/count'))]) };
  const { view } = await mount(t, spec, r); const count = view.getState('count'); count.write(7); const before = view.snapshot();
  const running = view.emit(find(view, 'button'), 'click', null); running.catch(() => {});
  const invalid = structuredClone(spec); invalid.render.slots.default.push({ id: 'invalid', componentRef: 'Counter', repeat: { items: [1, 1], as: 'item', key: path('/repeat/item') } });
  await assert.rejects(view.update(invalid, { states: { count: 99 } }), error => error.code === 'INVALID_DEFINITION');
  assert.equal(count.read(), 7); assert.equal(view.snapshot().generation, before.generation); assert.deepEqual(view.exportDefinition(), spec); assert.equal(signal.aborted, false);
  assert.equal(find(view, 'count').inputs.text, 7); pending.resolve('success'); assert.equal(await running, 'success'); assert.equal(view.snapshot().actions.waiting.status, 'success');
});

test('A22 failed dynamic action input reports preparation error and executes no implementation', async t => {
  const r = registry(); let calls = 0;
  r.registerAction(resource('Action', 'record', { ports: { text: port('Value', { type: 'string' }) }, output: { schema: { type: 'string' } } }), () => { calls++; return 'executed'; });
  const { view } = await mount(t, { render: button('button', { id: 'recording', actionRef: 'record', inputs: { text: path('/event/value') } }) }, r);
  await assert.rejects(view.emit(find(view, 'button'), 'click', { value: 123 }), error => error.code === 'TYPE_MISMATCH');
  assert.equal(calls, 0); const observed = view.snapshot().actions.recording;
  assert.equal(observed.status, 'error'); assert.equal(observed.running, false); assert.equal(observed.data, null);
  assert.equal(observed.error.location, '/inputs'); assert.equal(observed.error.input, 'text');
});

test('U04 invalid event payload calls no Action and preserves idle observation', async t => {
  const r = registry(); let calls = 0;
  r.registerComponent(resource('Component', 'Input', { events: { change: { schema: { type: 'string' } } } }));
  r.registerAction(resource('Action', 'record', {}), () => { calls++; });
  const { view } = await mount(t, { render: { id: 'input', componentRef: 'Input', on: { change: { id: 'recording', actionRef: 'record' } } } }, r);
  await assert.rejects(view.emit(find(view, 'input'), 'change', 123), error => error.code === 'TYPE_MISMATCH');
  assert.equal(calls, 0); assert.equal(view.snapshot().actions.recording.status, 'idle');
});

test('A15/A16 self-removing Action cancels remaining steps and recreates an idle connection', async t => {
  const r = registry(); let marks = 0;
  r.registerAction(resource('Action', 'mark', {}), () => { marks++; });
  r.registerResources([resource('Action', 'remove', {
    ports: { show: port('State', { type: 'boolean' }) },
    steps: [{ kind: 'SetState', target: path('/ports/show'), value: false }, { kind: 'Action', actionRef: 'mark' }],
  })]);
  const { view } = await mount(t, { states: { show: state(true, { type: 'boolean' }) }, render: row('root', [button('button', { id: 'removing', actionRef: 'remove', inputs: { show: path('/states/show') } }, { when: path('/states/show') })]) }, r);
  const original = find(view, 'button');
  await assert.rejects(view.emit(original, 'click', null), error => error.code === 'CANCELLED');
  assert.equal(marks, 0); assert.equal(view.getState('show').read(), false); assert.equal(find(view, 'button'), undefined);
  view.getState('show').write(true); const replacement = find(view, 'button');
  assert.notEqual(replacement.generation, original.generation); assert.equal(view.snapshot().actions.removing.status, 'idle');
  await assert.rejects(view.emit(original, 'click', null), error => error.code === 'CANCELLED');
});
