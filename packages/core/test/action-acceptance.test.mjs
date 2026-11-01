import test from 'node:test';
import assert from 'node:assert/strict';
// Exercise the built package consumer surface; run npm run build first.
import { createRegistry, createRuntime, createStateStore } from '@viewstem/core';
const integer = { type: 'integer' }, string = { type: 'string' }, boolean = { type: 'boolean' }, object = { type: 'object' };
const path = value => ({ '@path': value }), call = name => ({ '@call': name, args: [] });
const value = (schema = true, required = true) => ({ kind: 'Value', schema, required });
const state = (schema = true, required = true) => ({ kind: 'State', schema, required });
const resource = (kind, id, spec) => ({ kind, id, spec });
const declarative = (registry, id, spec) => registry.registerResources([resource('Action', id, spec)]);
const native = (registry, id, spec, run) => registry.registerAction(resource('Action', id, spec), run);
const step = (actionRef, extra = {}) => ({ kind: 'Action', actionRef, ...extra });
const set = (newValue, target = path('/ports/cell')) => ({ kind: 'SetState', target, value: newValue });
const assertion = (condition, message) => ({ kind: 'Assert', condition, ...(message === undefined ? {} : { message }) });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function registry(functions = []) {
  const registry = createRegistry({ functions });
  registry.registerComponent(resource('Component', 'Empty', {}));
  registry.registerComponent(resource('Component', 'Button', { events: { click: { schema: true } } }));
  registry.registerComponent(resource('Component', 'Row', { slots: { default: {} } }));
  return registry;
}
async function mount(t, registry, spec = { render: { id: 'empty', componentRef: 'Empty' } }, options = {}, inputs) {
  const runtime = createRuntime({ registry, ...options }); t.after(() => runtime.dispose());
  const { view, initial } = await runtime.mount({ view: spec, ...(inputs ? { inputs } : {}) }); await initial;
  return { registry, runtime, view, invoke: (actionRef, inputs = {}) => runtime.invokeAction({ owner: view, actionRef, inputs }) };
}
const buttonView = (actionRef, inputs = {}, extra = {}) => ({ ...extra, render: { id: 'button', componentRef: 'Button', on: { click: { id: 'observed', actionRef, inputs } } } });
const emit = (view, event = null) => view.emit(view.snapshot().roots[0], 'click', event);
const snapshot = view => view.snapshot().actions.observed;

test('A17 false If without else continues; missing then is rejected without execution', async t => {
  const r = registry(), trace = [];
  native(r, 'then', {}, () => { trace.push('then'); }); native(r, 'after', {}, () => { trace.push('after'); });
  declarative(r, 'falseIf', { steps: [{ kind: 'If', condition: false, then: [step('then')] }, step('after')] });
  const f = await mount(t, r); await f.invoke('falseIf'); assert.deepEqual(trace, ['after']);
  assert.throws(() => declarative(r, 'missingThen', { steps: [{ kind: 'If', condition: false, else: [] }] }), { code: 'INVALID_DEFINITION' }); assert.deepEqual(trace, ['after']);
});
test('A17 branch failure stops after and never treats else as catch', async t => {
  const r = registry(), trace = [];
  for (const name of ['then', 'else', 'after']) native(r, name, {}, () => { trace.push(name); });
  declarative(r, 'failure', { steps: [{ kind: 'If', condition: true, then: [step('then'), assertion(false, 'branch failed')], else: [step('else')] }, step('after')] });
  const f = await mount(t, r); await assert.rejects(f.invoke('failure'), { code: 'ASSERTION_FAILED', message: 'branch failed', location: '/steps/0' }); assert.deepEqual(trace, ['then']);
});
test('A10/A18 branch locals stay lexical; both branches can read earlier outer success', async t => {
  const r = registry(); let executed = 0;
  native(r, 'truth', { output: { schema: boolean } }, () => { executed++; return true; });
  declarative(r, 'scope', { ports: { branch: value(boolean) }, steps: [step('truth', { id: 'outer' }), { kind: 'If', condition: path('/ports/branch'), then: [assertion(path('/steps/outer')), step('truth', { id: 'inside' }), assertion(path('/steps/inside'))], else: [assertion(path('/steps/outer'))] }], output: { schema: boolean, value: path('/steps/outer') } });
  const invalid = [
    { steps: [assertion(path('/steps/future')), step('truth', { id: 'future' })] },
    { steps: [{ kind: 'If', condition: true, then: [step('truth', { id: 'inside' })] }], output: { schema: boolean, value: path('/steps/inside') } },
    { steps: [{ kind: 'If', condition: true, then: [step('truth', { id: 'inside' })], else: [assertion(path('/steps/inside'))] }] },
    { steps: [{ kind: 'If', id: 'branch', condition: true, then: [] }], output: { schema: true, value: path('/steps/branch') } },
  ];
  for (let i = 0; i < invalid.length; i++) assert.throws(() => declarative(r, `invalid-${i}`, invalid[i]), { code: 'REFERENCE_NOT_FOUND' });
  assert.equal(executed, 0); const f = await mount(t, r); assert.equal(await f.invoke('scope', { branch: true }), true); assert.equal(await f.invoke('scope', { branch: false }), true); assert.equal(executed, 3);
});
test('A03 Query step reference and inline spec are exclusive including omitted forms', () => {
  const r = registry(), query = { sources: {}, transform: { input: [] } }; r.registerResources([resource('Query', 'q', query)]);
  for (const spec of [{ steps: [{ kind: 'Query' }] }, { steps: [{ kind: 'Query', queryRef: 'q', spec: query }] }]) assert.throws(() => declarative(r, 'invalid', spec), { code: 'INVALID_DEFINITION' });
  assert.equal(r.list('Action').length, 0);
});
test('A04/A05/A07 code and declared false stay raw success; implicit return is void and null is real', async t => {
  const r = registry(); let branches = 0;
  native(r, 'nativeFalse', { output: { schema: boolean } }, () => false); declarative(r, 'declaredFalse', { steps: [], output: { schema: boolean, value: false } });
  native(r, 'else', {}, () => { branches++; }); native(r, 'nil', { output: { schema: { anyOf: [string, { type: 'null' }] } } }, () => null);
  for (const target of ['nativeFalse', 'declaredFalse']) declarative(r, `consume-${target}`, { steps: [step(target, { id: 'raw' }), { kind: 'If', condition: path('/steps/raw'), then: [assertion(false)], else: [step('else')] }], output: { schema: boolean, value: path('/steps/raw') } });
  declarative(r, 'void', { steps: [step('nativeFalse')] });
  const f = await mount(t, r, buttonView('consume-nativeFalse')); assert.equal(await emit(f.view), false); assert.equal(snapshot(f.view).status, 'success'); assert.equal(snapshot(f.view).data, false);
  assert.equal(await f.invoke('consume-declaredFalse'), false); assert.equal(branches, 2); assert.equal(await f.invoke('void'), undefined); assert.equal(await f.invoke('nil'), null);
  assert.throws(() => declarative(r, 'readVoid', { steps: [step('void', { id: 'none' })], output: { schema: true, value: path('/steps/none') } }), { code: 'REFERENCE_NOT_FOUND' });
});
test('A06 undefined declared native output fails and prevents parent continuation', async t => {
  const r = registry(); let continuation = 0;
  native(r, 'undefined', { output: { schema: true } }, () => undefined); native(r, 'after', {}, () => { continuation++; });
  declarative(r, 'parent', { steps: [step('undefined'), step('after')] }); const f = await mount(t, r);
  await assert.rejects(f.invoke('parent'), { code: 'TYPE_MISMATCH' }); assert.equal(continuation, 0);
});
test('A09/A19/K15 Assert message is lazy; false error/default/message-failure never evaluate output', async t => {
  let messages = 0, outputs = 0, after = 0;
  const r = registry([{ name: 'messageFailure', inputs: [], output: string, run() { messages++; throw { code: 'TIMEOUT' }; } }, { name: 'normalOutput', inputs: [], output: string, run() { outputs++; return 'output'; } }]);
  native(r, 'after', {}, () => { after++; });
  for (const [name, condition, message] of [['true', true, call('messageFailure')], ['false', false, 'stop here'], ['default', false, undefined], ['badMessage', false, call('messageFailure')]]) {
    declarative(r, name, { steps: [assertion(condition, message), step('after')], output: { schema: string, value: call('normalOutput') } });
  }
  const f = await mount(t, r); assert.equal(await f.invoke('true'), 'output'); assert.equal(messages, 0); assert.equal(outputs, 1); assert.equal(after, 1);
  for (const [name, code, message] of [['false', 'ASSERTION_FAILED', 'stop here'], ['default', 'ASSERTION_FAILED', 'Assertion failed'], ['badMessage', 'TIMEOUT', 'TIMEOUT']]) {
    await assert.rejects(f.invoke(name), { code, message }); assert.equal(outputs, 1); assert.equal(after, 1);
  }
  assert.equal(messages, 1);
});
for (const failure of ['evaluation', 'type']) test(`A08/A23/A24 output ${failure} failure retains object replacement and effects`, async t => {
  let effects = 0, after = 0, outputs = 0;
  const r = registry([{ name: 'outputValue', inputs: [], output: string, run() { outputs++; if (failure === 'evaluation') throw { code: 'TIMEOUT' }; return 'wrong'; } }]);
  native(r, 'effect', {}, () => { effects++; }); native(r, 'after', {}, () => { after++; });
  declarative(r, 'child', { ports: { cell: state(object) }, steps: [set({ a: 3 }), step('effect')], output: { schema: integer, value: call('outputValue') } });
  declarative(r, 'parent', { ports: { cell: state(object) }, steps: [step('child', { inputs: { cell: path('/ports/cell') } }), step('after')] });
  const store = createStateStore(), scope = store.createScope(), cell = scope.registerState('cell', { schema: object, initial: { a: 1, b: 2 } }), other = scope.registerState('other', { schema: integer, initial: 7 });
  const f = await mount(t, r, undefined, { stateStore: store }); await assert.rejects(f.invoke('parent', { cell }), { code: failure === 'evaluation' ? 'TIMEOUT' : 'TYPE_MISMATCH' });
  assert.deepEqual({ ...cell.read() }, { a: 3 }); assert.equal(other.read(), 7); assert.equal(outputs, 1); assert.equal(effects, 1); assert.equal(after, 0); scope.dispose();
});
test('A24 SetState replaces the addressed object only and returns its complete new value', async t => {
  const r = registry(); declarative(r, 'replace', { ports: { cell: state(object) }, steps: [set({ a: 3 })], output: { schema: object, value: path('/ports/cell') } });
  const store = createStateStore(), scope = store.createScope(), cell = scope.registerState('cell', { schema: object, initial: { a: 1, b: 2 } }), other = scope.registerState('other', { schema: integer, initial: 7 });
  const f = await mount(t, r, undefined, { stateStore: store }); assert.deepEqual({ ...await f.invoke('replace', { cell }) }, { a: 3 }); assert.equal(Object.hasOwn(cell.read(), 'b'), false); assert.equal(other.read(), 7); scope.dispose();
});
test('A25 SetState syntax rejects absent/Value/Query/data/computed/partial targets before execution', () => {
  const r = registry(), ports = { cell: state(), ordinary: value(), query: { kind: 'Query' } };
  for (const target of [undefined, path('/ports/absent'), path('/ports/ordinary'), path('/ports/query'), path('/ports/query/data'), path('/ports/cell/a'), path('/steps/generated'), { '@call': 'concat', args: [] }, 1, { a: 1 }]) {
    const action = { ports, steps: [{ kind: 'SetState', ...(target === undefined ? {} : { target }), value: 1 }] };
    assert.throws(() => declarative(r, 'invalid', action)); assert.equal(r.list('Action').length, 0);
  }
});
test('A25 actual target preparation rejects unconnected/Derived/Query/data/forged/stale and new value mismatches', async t => {
  const r = registry(); let after = 0;
  native(r, 'after', {}, () => { after++; }); declarative(r, 'write', { ports: { cell: state(integer, false), next: value() }, steps: [set(path('/ports/next')), step('after')] });
  r.registerResources([resource('Variable', 'calculated', { expression: '1' }), resource('Query', 'q', { sources: {}, transform: { input: { x: 1 } } })]);
  const store = createStateStore(), scope = store.createScope(), cell = scope.registerState('cell', { schema: integer, initial: 1 }), derived = scope.registerState('derived', { schema: integer, dependencies: [cell], derived: value => value + 1 });
  const f = await mount(t, r, { queries: { data: { queryRef: 'q' } }, render: { id: 'empty', componentRef: 'Empty' } }, { stateStore: store });
  const query = f.view.getQuery('data'), readonly = { address: cell.address, generation: cell.generation, read: () => cell.read(), snapshot: () => cell.snapshot() };
  for (const target of [undefined, null, 1, cell.read(), derived, query, query.snapshot().data, f.runtime.variable('calculated'), readonly, { ...cell }]) {
    const before = cell.snapshot(); await assert.rejects(f.invoke('write', { ...(target === undefined ? {} : { cell: target }), next: 3 })); assert.equal(cell.snapshot(), before); assert.equal(after, 0);
  }
  await assert.rejects(f.invoke('write', { cell, next: 'bad' }), { code: 'TYPE_MISMATCH' }); assert.equal(cell.read(), 1); assert.equal(after, 0);
  scope.replaceState('cell', { schema: integer, initial: 9 }); await assert.rejects(f.invoke('write', { cell, next: 3 }), { code: 'CANCELLED' }); assert.equal(scope.getState('cell').read(), 9); scope.dispose();
});
test('A02 Value snapshot and State target identity survive form mutation and port reconnection', async t => {
  const gate = deferred(), r = registry(); let held;
  native(r, 'capture', { ports: { form: value(object), cell: state(integer) }, output: { schema: integer } }, async context => { held = context.inputs; await gate.promise; context.inputs.cell.write(context.inputs.form.n); return context.inputs.form.n; });
  const store = createStateStore(), scope = store.createScope(), one = scope.registerState('one', { schema: integer, initial: 0 }), two = scope.registerState('two', { schema: integer, initial: 0 });
  const spec = buttonView('capture', { form: path('/ports/form'), cell: path('/ports/cell') }, { ports: { form: value(object), cell: state(integer) } }), form = { n: 1 };
  const f = await mount(t, r, spec, { stateStore: store }, { form, cell: one }); const running = emit(f.view); form.n = 9;
  await (await f.view.update(spec, { inputs: { form: { n: 7 }, cell: two } })).initial;
  assert.equal(held.form.n, 1); assert.deepEqual(held.cell.address, one.address); assert.throws(() => { held.form.n = 99; }); gate.resolve(); assert.equal(await running, 1); assert.equal(one.read(), 1); assert.equal(two.read(), 0); scope.dispose();
});
test('A11/A13/A15 active event connection ignores duplicate while independent shared-State call survives its removal', async t => {
  const eventGate = deferred(), externalGate = deferred(), r = registry(), contexts = new Map(); let calls = 0;
  native(r, 'work', { ports: { cell: state(integer), tag: value(string) }, output: { schema: string } }, async context => {
    calls++; const tag = context.inputs.tag; contexts.set(tag, context); context.inputs.cell.write(tag === 'event' ? 1 : 2);
    await (tag === 'event' ? eventGate.promise : externalGate.promise); context.inputs.cell.write(tag === 'event' ? 9 : 3); return tag;
  });
  const store = createStateStore(), scope = store.createScope(), shared = scope.registerState('shared', { schema: integer, initial: 0 }), spec = buttonView('work', { cell: path('/ports/cell'), tag: 'event' }, { ports: { cell: state(integer) } });
  const f = await mount(t, r, spec, { stateStore: store }, { cell: shared }); const event = emit(f.view), cancelled = assert.rejects(event, { code: 'CANCELLED' });
  const external = f.invoke('work', { cell: shared, tag: 'external' }); await emit(f.view); assert.equal(calls, 2);
  await (await f.view.update({ ...spec, render: { id: 'button', componentRef: 'Button' } })).initial; await cancelled;
  assert.equal(contexts.get('external').signal.aborted, false); assert.throws(() => contexts.get('event').inputs.cell.write(99), { code: 'CANCELLED' });
  externalGate.resolve(); assert.equal(await external, 'external');
  await (await f.view.update(spec)).initial; assert.equal(snapshot(f.view).status, 'idle');
  eventGate.resolve(); await flush(); assert.equal(snapshot(f.view).status, 'idle'); assert.equal(snapshot(f.view).data, null); assert.equal(shared.read(), 3);
  assert.equal(await emit(f.view), 'event'); assert.equal(snapshot(f.view).status, 'success'); shared.write(4); assert.equal(shared.read(), 4); scope.dispose();
});
test('A16 self-removing SetState cancels child steps and normal output evaluation', async t => {
  let children = 0, outputs = 0;
  const r = registry([{ name: 'outputMarker', inputs: [], output: string, run() { outputs++; return 'output'; } }]);
  native(r, 'child', {}, () => { children++; }); declarative(r, 'remove', { ports: { cell: state(boolean) }, steps: [set(false), step('child')], output: { schema: string, value: call('outputMarker') } });
  const spec = buttonView('remove', { cell: path('/states/show') }, { states: { show: { kind: 'State', schema: boolean, initial: true } } }); spec.render.when = path('/states/show');
  // A repeated root is disallowed, but a conditional single node is supported.
  const f = await mount(t, r, spec); await assert.rejects(emit(f.view), { code: 'CANCELLED' });
  assert.equal(f.view.getState('show').read(), false); assert.equal(children, 0); assert.equal(outputs, 0);
});
for (const failure of ['missing', 'type', 'omitted', 'evaluation']) test(`A22 input ${failure} failure observes error and evaluates no steps/output`, async t => {
  let steps = 0, outputs = 0, inputCalls = 0;
  const r = registry([{ name: 'outputMarker', inputs: [], output: string, run() { outputs++; return 'output'; } }, { name: 'inputFailure', inputs: [], output: string, run() { inputCalls++; throw { code: 'TIMEOUT' }; } }]); native(r, 'step', {}, () => { steps++; });
  declarative(r, 'prepare', { ports: { text: value(string) }, steps: [step('step')], output: { schema: string, value: call('outputMarker') } });
  const inputs = failure === 'omitted' ? path('/event') : { text: failure === 'evaluation' ? call('inputFailure') : path('/event/text') };
  const f = await mount(t, r, buttonView('prepare', inputs));
  const code = { missing: 'INPUT_NOT_READY', type: 'TYPE_MISMATCH', omitted: 'INVALID_DEFINITION', evaluation: 'TIMEOUT' }[failure];
  await assert.rejects(emit(f.view, failure === 'type' ? { text: 1 } : {}), { code });
  const observed = snapshot(f.view); assert.equal(observed.status, 'error'); assert.equal(observed.running, false); assert.equal(observed.data, null); assert.equal(observed.error.location, '/inputs'); assert.equal(observed.error.input, 'text'); assert.ok(observed.error.cause); assert.equal(steps, 0); assert.equal(outputs, 0); assert.equal(inputCalls, failure === 'evaluation' ? 1 : 0);
});
test('K36 declarative recovery syntax is rejected in branches and resource fields without code execution', () => {
  const r = registry(); let executions = 0; native(r, 'native', {}, () => { executions++; });
  for (const kind of ['Try', 'Catch', 'Finally']) assert.throws(() => declarative(r, 'invalid', { steps: [{ kind: 'If', condition: false, then: [{ kind }] }] }), { code: 'INVALID_DEFINITION' });
  for (const key of ['catch', 'finally']) assert.throws(() => declarative(r, 'invalid', { steps: [step('native')], [key]: [] }), { code: 'INVALID_DEFINITION' }); assert.equal(executions, 0);
});
test('K37 caught cancellation and a normal late return cannot recover an invalidated invocation', async t => {
  const r = registry(); let held, caught = false, writeCode;
  native(r, 'catch', { ports: { cell: state(integer) }, output: { schema: boolean } }, async context => {
    held = context; context.inputs.cell.write(1);
    try { await new Promise((_, reject) => context.signal.addEventListener('abort', () => reject({ code: 'CANCELLED' }), { once: true })); } catch { caught = true; }
    try { context.inputs.cell.write(9); } catch (error) { writeCode = error.code; }
    return false;
  });
  const store = createStateStore(), scope = store.createScope(), cell = scope.registerState('cell', { schema: integer, initial: 0 }), f = await mount(t, r, undefined, { stateStore: store });
  const pending = f.invoke('catch', { cell }), cancelled = assert.rejects(pending, { code: 'CANCELLED' }); await flush(); f.view.dispose(); await cancelled; await flush();
  assert.equal(held.signal.aborted, true); assert.equal(caught, true); assert.equal(writeCode, 'CANCELLED'); assert.equal(cell.read(), 1); cell.write(2); assert.equal(cell.read(), 2); scope.dispose();
});
test('K35 Action date admission normalizes outputs and rejects unsupported or ambiguous schemas', async t => {
  const r = registry(), dateTime = { 'x-viewstem-type': 'datetime' };
  declarative(r, 'date', { ports: { cell: state(dateTime), next: value(string) }, steps: [set(path('/ports/next'))], output: { schema: dateTime, value: path('/ports/cell') } });
  for (const schema of [{ type: 'string', format: 'date-time' }, { anyOf: [dateTime, string] }]) assert.throws(() => declarative(r, 'invalid', { steps: [], output: { schema, value: '2026-10-29' } }));
  native(r, 'nullableDate', { output: { schema: { anyOf: [dateTime, { type: 'null' }] } } }, () => null);
  const store = createStateStore(), scope = store.createScope(), cell = scope.registerState('cell', { schema: dateTime, initial: '2026-10-28T00:00:00Z' }), f = await mount(t, r, undefined, { stateStore: store });
  assert.equal(await f.invoke('date', { cell, next: '2026-10-29T09:30:00+09:00' }), '2026-10-29T00:30:00.000Z'); assert.equal(await f.invoke('nullableDate'), null); scope.dispose();
});
test('K21 item-local when skips hidden inputs/Queries; hidden duplicate keys still reject and aliases are scoped', async t => {
  const r = registry(); let requests = 0;
  r.registerResources([resource('Component', 'Consumer', { ports: { text: value(string) }, queries: { q: { query: { sources: { main: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: 'items' } } }, transform: { input: path('/sources/main') } } } }, render: { id: 'inside', componentRef: 'Empty' } })]);
  const node = { id: 'consumer', componentRef: 'Consumer', repeat: { items: [{ id: 'one', show: true, text: 'valid' }, { id: 'two', show: false }], as: 'item', key: path('/repeat/item/id') }, when: path('/repeat/item/show'), inputs: { text: path('/repeat/item/text') } };
  const spec = { render: { id: 'row', componentRef: 'Row', slots: { default: [node] } } }, f = await mount(t, r, spec, { requestExecutor: async () => { requests++; return { status: 200, headers: {}, body: null }; } });
  assert.equal(f.view.snapshot().roots[0].children.length, 1); assert.equal(requests, 1);
  const invalid = structuredClone(spec); invalid.render.slots.default[0].repeat.items[1].id = 'one';
  await assert.rejects(f.runtime.mount({ view: invalid }), { code: 'INVALID_DEFINITION' }); assert.equal(requests, 1);
  const repeated = alias => ({ id: alias, componentRef: 'Row', repeat: { items: [], as: alias, key: 'x' }, slots: { default: [] } });
  const nested = repeated('same'); nested.slots.default.push({ ...repeated('same'), id: 'nested' });
  assert.throws(() => r.validateDefinition('View', { render: { id: 'root', componentRef: 'Row', slots: { default: [nested] } } }), { code: 'INVALID_DEFINITION' });
  r.validateDefinition('View', { render: { id: 'root', componentRef: 'Row', slots: { default: [{ ...repeated('same'), id: 'first' }, { ...repeated('same'), id: 'second' }] } } });
});
test('A21 same observation id in two Component instances has independently visible running/success states', async t => {
  const r = registry(), gates = { one: deferred(), two: deferred() };
  r.registerComponent(resource('Component', 'Status', { ports: { value: value(string) } }));
  native(r, 'wait', { ports: { tag: value(string) }, output: { schema: string } }, async ({ inputs }) => { await gates[inputs.tag].promise; return inputs.tag; });
  r.registerResources([resource('Component', 'Caller', { ports: { tag: value(string) }, render: { id: 'row', componentRef: 'Row', slots: { default: [
    { id: 'status', componentRef: 'Status', inputs: { value: path('/actions/local/status') } },
    { id: 'inner', componentRef: 'Button', on: { click: { id: 'local', actionRef: 'wait', inputs: { tag: path('/ports/tag') } } } },
  ] } } })]);
  const spec = { render: { id: 'root', componentRef: 'Row', slots: { default: [{ id: 'one', componentRef: 'Caller', inputs: { tag: 'one' } }, { id: 'two', componentRef: 'Caller', inputs: { tag: 'two' } }] } } }, f = await mount(t, r, spec);
  const named = id => { const all = []; const walk = node => { if (node.id === id) all.push(node); node.children.forEach(walk); }; f.view.snapshot().roots.forEach(walk); return all; };
  const statuses = () => named('status').map(node => node.inputs.value); assert.deepEqual(statuses(), ['idle', 'idle']);
  const one = f.view.emit(named('inner')[0], 'click', null); assert.deepEqual(statuses(), ['running', 'idle']);
  const two = f.view.emit(named('inner')[1], 'click', null); assert.deepEqual(statuses(), ['running', 'running']);
  gates.one.resolve(); assert.equal(await one, 'one'); assert.deepEqual(statuses(), ['success', 'running']);
  gates.two.resolve(); assert.equal(await two, 'two'); assert.deepEqual(statuses(), ['success', 'success']);
});
