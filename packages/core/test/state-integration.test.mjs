import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, createRuntime, createStateStore } from '@viewstem/core';
import { compilePorts, stateValue } from '../src/ports.mjs';
import { compileCel } from '@viewstem/core/cel';
const integer = { type: 'integer' }, string = { type: 'string' }, date = { 'x-viewstem-type': 'date' };
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('C03 expected-kind registry lookup never falls back to Component', () => {
  const registry = createRegistry(); registry.registerComponentContract({ kind: 'Component', id: 'same', spec: {} });
  assert.throws(() => registry.get('Query', 'same'), { code: 'REFERENCE_NOT_FOUND' });
  assert.throws(() => registry.get('Query', 'absent'), { code: 'REFERENCE_NOT_FOUND' });
});
test('C14 library Store injection accepts real capability and rejects method-shaped fake', () => {
  const registry = createRegistry(), stateStore = createStateStore(), runtime = createRuntime({ registry, stateStore });
  assert.equal(runtime.stateStore, stateStore);
  assert.throws(() => createRuntime({ registry, stateStore: Object.fromEntries(['subscribe', "writeBatch", 'createScope', 'transaction', 'dispose'].map(method => [method, () => {}])) }), { code: 'INVALID_DEFINITION' });
  runtime.dispose(); const scope = stateStore.createScope(); assert.equal(scope.registerState('service', { schema: integer, initial: 1 }).read(), 1); scope.dispose();
});
test('C06/C13 same cell connects twice; equal local names have independent reactions', async () => {
  const store = createStateStore(), scope = store.createScope(), other = store.createScope();
  const one = scope.registerState('value', { schema: integer, initial: 1 }), two = other.registerState('value', { schema: integer, initial: 2 });
  const ports = { one: { kind: 'State', schema: integer }, two: { kind: 'State', schema: integer } };
  const registry = createRegistry(); registry.registerComponentContract({ kind: 'Component', id: 'Pair', spec: { ports } });
  const runtime = createRuntime({ registry, stateStore: store });
  const { view, initialComplete: initial } = await runtime.createView({ view: { ports, render: { id: 'pair', componentRef: 'Pair', inputs: { one: { '@path': '/ports/one' }, two: { '@path': '/ports/two' } } } }, inputs: { one, two: one } }); await initial;
  const linked = view.getSnapshot().roots[0].inputs;
  linked.one.write(3); assert.equal(linked.two.read(), 3);
  const trigger = scope.registerState('trigger', { schema: integer, initial: 0 });
  store.registerReaction(scope, { watch: [trigger], target: one, value: 0 }); store.registerReaction(other, { watch: [trigger], target: two, value: 0 });
  trigger.write(1); assert.equal(one.read(), 0); assert.equal(two.read(), 0);
  runtime.dispose(); store.dispose();
});
test('S02/S03 transaction batches final notifications and rolls back structural/value failures', () => {
  const store = createStateStore(), scope = store.createScope(), a = scope.registerState('a', { schema: integer, initial: 1 }), b = scope.registerState('b', { schema: integer, initial: 2 }), changes = [];
  store.subscribe(null, payload => changes.push(payload));
  store.transaction(() => { a.write(3); b.write(4); });
  assert.equal(changes.length, 2); assert.equal(changes[1].changes.length, 2); assert.equal(a.read(), 3); assert.equal(b.read(), 4);
  const beforeA = a.getSnapshot(), beforeB = b.getSnapshot();
  assert.throws(() => store.transaction(() => { a.write(5); scope.removeState('b'); scope.registerState('new', { schema: integer, initial: 8 }); throw { code: 'ASSERTION_FAILED' }; }), { code: 'ASSERTION_FAILED' });
  assert.equal(a.getSnapshot(), beforeA); assert.equal(b.getSnapshot(), beforeB); assert.equal(scope.getState('b'), b); assert.throws(() => scope.getState('new'), { code: 'REFERENCE_NOT_FOUND' }); assert.equal(changes.length, 2);
  store.transaction(() => { scope.removeState('b'); scope.registerState('b', { schema: integer, initial: 4 }); });
  assert.equal(changes.at(-1).changes[0].kind, 'replaced'); assert.throws(() => b.read(), { code: 'CANCELLED' });
});
test('S02 transaction with no net value change emits no extra snapshot', () => {
  const store = createStateStore(), scope = store.createScope(), value = scope.registerState('value', { schema: integer, initial: 1 }), snapshots = [];
  store.subscribe(value.address, payload => snapshots.push(payload)); const before = value.getSnapshot();
  store.transaction(() => { value.write(2); value.write(1); });
  assert.equal(snapshots.length, 1); assert.equal(value.getSnapshot(), before);
});
test('V57 registered async Action is executable while function/Promise data remain rejected', async () => {
  const registry = createRegistry(), store = createStateStore(); let executions = 0;
  const run = async () => { executions++; return 7; };
  registry.registerAction({ kind: 'Action', id: 'code', spec: { output: { schema: integer } } }, run);
  registry.registerComponentContract({ kind: 'Component', id: 'Leaf', spec: {} });
  const runtime = createRuntime({ registry, stateStore: store });
  const { view, initialComplete: initial } = await runtime.createView({ view: { render: { id: 'leaf', componentRef: 'Leaf' } } }); await initial;
  assert.equal(await runtime.invokeAction({ owner: view, actionRef: 'code' }), 7); assert.equal(executions, 1);
  const value = store.createScope().registerState('value', { schema: true, initial: 1 }), before = value.getSnapshot();
  assert.throws(() => value.write(run), { code: 'TYPE_MISMATCH' }); assert.throws(() => value.write(Promise.resolve(7)), { code: 'TYPE_MISMATCH' });
  assert.equal(value.getSnapshot(), before); assert.equal(executions, 1); runtime.dispose(); store.dispose();
});
test('V01/C09/K24 explicit Clock drives dependent CEL only, reset keeps initial baseline and owner disposal unsubscribes', async () => {
  const store = createStateStore(), scope = store.createScope(), listeners = new Set(); let now = Date.parse('2026-10-29T23:30:00Z');
  const clock = { now: () => now, subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); }, tick(value) { now = value; for (const callback of [...listeners]) callback(value); } };
  const current = scope.registerState('now', { schema: integer, initial: now }), tz = scope.registerState('zone', { schema: string, initial: 'Asia/Seoul' });
  const connected = scope.connectClock(current, clock); let calls = 0, nextCalls = 0;
  const registry = createRegistry({ functions: [
    { name: 'observeDay', inputs: [string], output: string, run: day => { calls++; return day; } },
    { name: 'observeTomorrow', inputs: [string], output: string, run: day => { nextCalls++; return day; } },
  ] }); registry.registerComponentContract({ kind: 'Component', id: 'Leaf', spec: {} });
  const runtime = createRuntime({ registry, stateStore: store });
  const { view, initialComplete: initial } = await runtime.createView({ view: {
    ports: { now: { kind: 'State', schema: integer }, zone: { kind: 'State', schema: string } },
    states: {
      today: { kind: 'Derived', schema: date, variable: { ports: { now: { kind: 'Value', schema: integer, required: true }, zone: { kind: 'Value', schema: string, required: true } }, expression: 'observeDay(localDate(now, zone))' }, inputs: { now: { '@path': '/ports/now' }, zone: { '@path': '/ports/zone' } } },
      tomorrow: { kind: 'Derived', schema: date, variable: { ports: { day: { kind: 'Value', schema: date, required: true } }, expression: 'observeTomorrow(addDate(dateText(day), 1))' }, inputs: { day: { '@path': '/states/today' } } },
    }, render: { id: 'leaf', componentRef: 'Leaf' },
  }, inputs: { now: current, zone: tz } }); await initial;
  const day = view.getState('today'), tomorrow = view.getState('tomorrow');
  const selected = scope.registerState('selected', { schema: date, initial: day.read() }), other = scope.registerState('other', { schema: integer, initial: 7 }), counts = [calls, nextCalls];
  other.write(8); assert.deepEqual([calls, nextCalls], counts);
  clock.tick(Date.parse('2026-10-30T23:30:00Z')); assert.equal(day.read(), '2026-10-31'); assert.equal(tomorrow.read(), '2026-11-01'); assert.equal(other.read(), 8);
  assert.deepEqual([calls, nextCalls], counts.map(count => count + 1));
  const afterClock = [calls, nextCalls]; other.write(9); assert.deepEqual([calls, nextCalls], afterClock);
  clock.tick(now + 60_000); assert.deepEqual([calls, nextCalls], [afterClock[0] + 1, afterClock[1]]);
  tz.write('America/Los_Angeles'); assert.equal(day.read(), '2026-10-30'); assert.equal(tomorrow.read(), '2026-10-31');
  tz.write('Asia/Seoul'); assert.equal(day.read(), '2026-10-31'); assert.equal(tomorrow.read(), '2026-11-01');
  selected.write('2026-11-10'); selected.reset(); assert.equal(selected.read(), '2026-10-30');
  const before = current.read(); for (const bad of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => clock.tick(bad), { code: 'TYPE_MISMATCH' }); assert.equal(current.read(), before);
  assert.equal(listeners.size, 1); scope.dispose(); assert.equal(listeners.size, 0); clock.tick(0);
  if (typeof connected === 'function') connected(); else connected?.dispose();
  runtime.dispose(); store.dispose();
});
test('K33 explicit timezone required definition, waiting input and invalid value remain distinct', () => {
  assert.throws(() => compileCel('localDate(now)', { inputs: { now: integer } }));
  const store = createStateStore(), scope = store.createScope(), zone = scope.registerState('zone', { schema: string }), ports = compilePorts({ resourceKind: 'Variable', ports: { now: { kind: 'Value', schema: integer, required: true }, zone: { kind: 'Value', schema: string, required: true } } });
  const inputs = { now: Date.parse('2026-10-30T00:30:00Z'), zone: stateValue(zone) };
  assert.equal(ports.prepare(inputs, { mode: 'automatic' }).status, 'waiting'); assert.throws(() => ports.prepare(inputs), { code: 'INPUT_NOT_READY', input: 'zone' });
  const run = compileCel('localDate(now, zone)', { inputs: { now: integer, zone: string }, output: date });
  for (const bad of ['', 'Unknown/Zone', '+09:00']) assert.throws(() => run({ now: inputs.now, zone: bad }), { code: 'TYPE_MISMATCH' });
  assert.equal(run({ now: inputs.now, zone: 'America/Los_Angeles' }), '2026-10-29'); assert.equal(run({ now: inputs.now, zone: 'Asia/Seoul' }), '2026-10-30');
});
test('V39-V45 calculated nonfinite and unsafe integer results reject atomically through actual CEL and State', () => {
  const store = createStateStore(), scope = store.createScope(), cell = scope.registerState('value', { schema: integer, initial: 7 });
  for (const expression of ['1.0 / 0.0', '0.0 / 0.0', '1e308 * 1e308', '9007199254740992']) {
    const evaluate = compileCel(expression), before = cell.getSnapshot(); assert.throws(() => cell.write(evaluate({}))); assert.equal(cell.getSnapshot(), before);
  }
  for (const [schema, initial, invalid] of [
    [{ 'x-viewstem-type': 'set', items: integer }, new Set([1]), new Set([9007199254740992])],
    [{ 'x-viewstem-type': 'map', keys: string, values: integer }, new Map([['x', 1]]), new Map([['x', 9007199254740992]])],
    [{ 'x-viewstem-type': 'map', keys: integer, values: integer }, new Map([[1, 1]]), new Map([[9007199254740992, 1]])],
  ]) {
    const item = scope.registerState(`nested-${scope.scopeId}-${scopeNames++}`, { schema, initial }), before = item.getSnapshot(); assert.throws(() => item.write(invalid), { code: 'TYPE_MISMATCH' }); assert.equal(item.getSnapshot(), before);
  }
});
let scopeNames = 0;
test('V51 negative zero avoids downstream CEL/reaction/Query requests', async () => {
  let calculations = 0, requests = 0;
  const registry = createRegistry({ functions: [{ name: 'observeNumber', inputs: [{ type: 'number' }], output: { type: 'number' }, run: n => { calculations++; return n; } }] }), store = createStateStore(), scope = store.createScope(), source = scope.registerState('source', { schema: { type: 'number' }, initial: 0 }), selected = scope.registerState('selected', { schema: integer, initial: 9 });
  store.registerReaction(scope, { watch: [source], target: selected, value: 0 });
  registry.registerResources([{ kind: 'Query', id: 'q', spec: { ports: { n: { kind: 'Value', schema: { type: 'number' }, required: true } }, sources: { main: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: 'items' } } }, transform: { input: { '@path': '/sources/main' } } } }]);
  registry.registerComponentContract({ kind: 'Component', id: 'Leaf', spec: {} });
  const runtime = createRuntime({ registry, stateStore: store, requestExecutor: async () => { requests++; return { status: 200, headers: {}, body: 1 }; } });
  const { initialComplete: initial } = await runtime.createView({ view: {
    ports: { source: { kind: 'State', schema: { type: 'number' } } },
    states: { derived: { kind: 'Derived', schema: { type: 'number' }, variable: { ports: { source: { kind: 'Value', schema: { type: 'number' }, required: true } }, expression: 'observeNumber(source + 1.0)' }, inputs: { source: { '@path': '/ports/source' } } } },
    queries: { result: { queryRef: 'q', inputs: { n: { '@path': '/ports/source' } } } },
    render: { id: 'leaf', componentRef: 'Leaf' },
  }, inputs: { source } });
  await initial; const before = calculations; source.write(-0); await tick();
  assert.equal(calculations, before); assert.equal(selected.read(), 9); assert.equal(requests, 1); assert.equal(Object.is(source.read(), -0), false); runtime.dispose(); store.dispose();
});
