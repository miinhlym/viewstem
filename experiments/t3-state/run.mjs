import assert from 'node:assert/strict';
import { StateProbe, keyOf } from './state-probe.mjs';
import { harness, report } from '../verification/report.mjs';
const { test, results } = harness();
const integer = { type: 'integer' }, number = { type: 'number' };
const set = items => ({ 'x-viewstem-type': 'set', items });
const map = values => ({ 'x-viewstem-type': 'map', keys: { type: ['string', 'number'] }, values });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const fixture = () => { const store = new StateProbe(); return { store, scope: store.scope() }; };
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function rejectedWrite(cell, value) { const before = cell.snapshot(); assert.throws(() => cell.write(value)); assert.equal(cell.snapshot(), before); }
const plain = value => JSON.parse(JSON.stringify(value));

await test('V31-V35/missing-null-falsy-reference', () => {
  const { scope } = fixture(), cell = scope.register('value', { schema: true });
  assert.equal(cell.read(), undefined); assert.deepEqual(cell.snapshot(), { status: 'missing' });
  rejectedWrite(cell, cell.read());
  assert.throws(() => scope.get('absent'), /REFERENCE_NOT_FOUND/);
  for (const value of ['device-1', null, 0, false, '']) { cell.write(value); assert.equal(cell.read(), value); }
  rejectedWrite(cell, undefined); cell.reset(); assert.equal(cell.read(), undefined);
});
await test('V13-V18/object-normalization-and-atomic-failure', () => {
  const { scope } = fixture(), cell = scope.register('value', { schema: { type: 'object' }, initial: {} });
  const source = { name: undefined, age: 20, profile: { name: undefined } }; cell.write(source);
  assert.deepEqual(plain(cell.read()), { age: 20, profile: {} }); assert.ok(Object.hasOwn(source, 'name')); assert.equal(Object.isFrozen(source), false);
  cell.write({}); const snapshot = cell.snapshot(); cell.write({ name: undefined }); assert.equal(cell.snapshot(), snapshot);
  const required = scope.register('required', { schema: { properties: { name: { type: 'string' } }, required: ['name'] }, initial: { name: 'old' } });
  rejectedWrite(required, { name: undefined }); rejectedWrite(required, { name: null });
  const optional = scope.register('optional', { schema: { properties: { name: nullable({ type: 'string' }) } } });
  optional.write({ name: null }); assert.equal(optional.read().name, null);
  cell.write({ rows: [{ name: undefined }] }); assert.deepEqual(plain(cell.read()), { rows: [{}] });
});
await test('V19-V22/arrays-and-positions', () => {
  const { scope } = fixture(), cell = scope.register('value', { schema: { type: 'array', items: nullable(integer) }, initial: [10, null, 30] });
  assert.deepEqual([...cell.read()], [10, null, 30]);
  for (const value of [[10, undefined, 30], [10, , 30], new Array(2)]) {
    const keys = Object.keys(value), length = value.length; rejectedWrite(cell, value); assert.deepEqual(Object.keys(value), keys); assert.equal(value.length, length);
  }
  cell.write([]); assert.equal(cell.read().length, 0);
  const nonnull = scope.register('nonnull', { schema: { type: 'array', items: integer }, initial: [1] }); rejectedWrite(nonnull, [10, null, 30]);
  const nested = scope.register('nested', { schema: true, initial: { saved: true } }); rejectedWrite(nested, { rows: [[10, undefined]] });
});
await test('V23-V26/sets-undefined-null-identity', () => {
  const { scope } = fixture(), cell = scope.register('value', { schema: set(nullable(integer)), initial: new Set([1]) });
  const source = new Set([1, undefined]); rejectedWrite(cell, source); assert.equal(source.size, 2); assert.ok(source.has(undefined));
  cell.write(new Set([null])); assert.deepEqual([...cell.read()], [null]);
  const nonnull = scope.register('nonnull', { schema: set(integer), initial: new Set([1]) }); rejectedWrite(nonnull, new Set([null]));
  const nested = scope.register('nested', { schema: true, initial: 1 }); rejectedWrite(nested, [{ selected: new Set([undefined]) }]);
  const object = { name: undefined }, objects = scope.register('objects', { schema: set({ type: 'object' }), initial: new Set([{}, object]) });
  assert.equal(objects.read().size, 2); assert.ok([...objects.read()].every(item => Object.keys(item).length === 0)); assert.ok(Object.hasOwn(object, 'name'));
});
await test('V27-V30/maps-undefined-null-objects', () => {
  const { scope } = fixture(), cell = scope.register('value', { schema: map(nullable(integer)), initial: new Map([['old', 1]]) });
  const source = new Map([['a', undefined]]); rejectedWrite(cell, source); assert.equal(source.size, 1); assert.ok(source.has('a'));
  cell.write(new Map([['a', null]])); assert.ok(cell.read().has('a')); assert.equal(cell.read().get('a'), null);
  const nonnull = scope.register('nonnull', { schema: map(integer), initial: new Map() }); rejectedWrite(nonnull, new Map([['a', null]]));
  const object = { name: undefined }, nested = scope.register('nested', { schema: true, initial: new Map([['a', object]]) });
  assert.deepEqual(plain(nested.read().get('a')), {}); assert.ok(Object.hasOwn(object, 'name')); rejectedWrite(nested, { lookup: new Map([['a', undefined]]) });
});
await test('V36-V40/nonfinite-recursive-and-map-keys', () => {
  const { scope } = fixture(), cell = scope.register('value', { schema: true, initial: 0 });
  for (const value of [NaN, Infinity, -Infinity]) for (const input of [value, { value }, [value], new Set([value]), new Map([['value', value]]), new Map([[value, 1]])]) rejectedWrite(cell, input);
  for (const value of [0, -1, 1.25, 'NaN', 'Infinity']) { cell.write(value); assert.equal(cell.read(), value); }
  cell.write(new Map([['Infinity', 1]])); assert.equal(cell.read().get('Infinity'), 1);
});
await test('V41-V45/safe-integer-recursive', () => {
  const { scope } = fixture(), cell = scope.register('value', { schema: integer, initial: 0 });
  for (const value of [-9007199254740991, 0, 9007199254740991]) { cell.write(value); assert.equal(cell.read(), value); }
  for (const value of [-9007199254740992, 9007199254740992, 1.5, '42']) rejectedWrite(cell, value);
  for (const [name, schema, initial, invalid] of [
    ['object', { properties: { count: integer } }, { count: 1 }, { count: 9007199254740992 }],
    ['array', { type: 'array', items: integer }, [1], [9007199254740992]],
  ]) rejectedWrite(scope.register(name, { schema, initial }), invalid);
  const text = scope.register('text', { schema: { type: 'string' }, initial: '9007199254740993' }); assert.equal(text.read(), '9007199254740993');
});
await test('V46-V49/binary64-preserved', () => {
  const { scope } = fixture(), cell = scope.register('value', { schema: true, initial: 0 });
  for (const value of [0.1 + 0.2, 0.3, 1e100]) { cell.write(value); assert.equal(cell.read(), value); }
  const number = 0.1 + 0.2; cell.write({ object: { number }, array: [number], set: new Set([number]), map: new Map([[number, number]]) });
  assert.equal(cell.read().object.number, number); assert.equal(cell.read().array[0], number); assert.ok(cell.read().set.has(number)); assert.equal(cell.read().map.get(number), number);
  rejectedWrite(cell, Number.MAX_VALUE * 2); rejectedWrite(scope.register('int', { schema: integer, initial: 0 }), 1e100);
});
await test('V50-V55/negative-zero-and-notifications', () => {
  const { store, scope } = fixture(), cell = scope.register('value', { schema: number, initial: -0 });
  let notices = 0; store.subscribe(cell.address, () => notices++);
  assert.equal(Object.is(cell.read(), -0), false); cell.write(-0); assert.equal(notices, 1);
  for (const value of [Math.round(-0.1), -0.0001]) { cell.write(value); assert.equal(Object.is(cell.read(), -0), false); }
  const all = scope.register('all', { schema: true, initial: { n: -0, a: [-0], m: new Map([[-0, -0], ['-0', 'text']]), s: new Set([{ x: -0 }, { x: 0 }]) } });
  assert.equal(Object.is(all.read().n, -0), false); assert.equal(Object.is(all.read().a[0], -0), false); assert.equal(Object.is(all.read().m.get(0), -0), false); assert.equal(all.read().m.get('-0'), 'text'); assert.equal(all.read().s.size, 2);
  const positive = scope.register('positive', { schema: { ...number, exclusiveMinimum: 0 }, initial: 1 }); rejectedWrite(positive, -0);
});
await test('V56/unsupported-values-not-executed', () => {
  const { scope } = fixture(), cell = scope.register('value', { schema: true, initial: 'old' });
  let calls = 0; const fn = () => calls++;
  for (const value of [1n, Symbol('x'), fn, Promise.resolve(1), new WeakMap(), new WeakSet(), new Date()]) {
    for (const input of [value, { value }, [value], new Set([value]), new Map([['value', value]])]) rejectedWrite(cell, input);
  }
  assert.equal(calls, 0);
});
await test('V58-V59/cycles-and-shared-graph', () => {
  const { scope } = fixture(), cell = scope.register('value', { schema: true, initial: 'old' });
  const object = {}; object.self = object; const array = []; array.push(array); const set = new Set(); set.add(set); const map = new Map(); map.set('self', map);
  const a = {}, b = { a }; a.b = b;
  for (const value of [object, array, set, map, a]) rejectedWrite(cell, value);
  const shared = { n: 1 }; cell.write([shared, shared]); assert.equal(cell.read().length, 2); assert.equal(cell.read()[0].n, 1);
  shared.n = 2; assert.equal(cell.read()[0].n, 1);
});
await test('V60-V62/equality-coercion-default-extra', () => {
  const { store, scope } = fixture(), cell = scope.register('value', { schema: true, initial: 0.3 });
  let notices = 0; store.subscribe(cell.address, () => notices++); cell.write(0.30000000000000004); assert.equal(notices, 2);
  cell.write({ a: 1, b: 2 }); const snapshot = cell.snapshot(); cell.write({ b: 2, a: 1 }); assert.equal(cell.snapshot(), snapshot);
  rejectedWrite(scope.register('number', { schema: number, initial: 1 }), '42'); rejectedWrite(scope.register('boolean', { schema: { type: 'boolean' }, initial: false }), 'false');
  const strict = scope.register('strict', { schema: { type: 'object', properties: { n: { ...integer, default: 1 } }, required: ['n'], additionalProperties: false }, initial: { n: 0 } });
  rejectedWrite(strict, {}); rejectedWrite(strict, { n: 1, extra: true });
  const optional = scope.register('optional', { schema: { properties: { n: { default: 1 } } }, initial: {} }); assert.equal(Object.hasOwn(optional.read(), 'n'), false);
});
await test('V05-V07/content-and-native-membership', () => {
  const { scope } = fixture(), cell = scope.register('value', { schema: true, initial: new Set([{ x: 1 }, { x: 1 }]) });
  const saved = cell.snapshot(), items = [...cell.read()]; assert.ok(cell.read().has(items[0])); assert.equal(cell.read().has({ x: 1 }), false);
  cell.write(new Set([items[1], items[0]])); assert.equal(cell.snapshot(), saved);
  cell.write(new Set([{ x: 1 }, { x: 1 }])); assert.notEqual(cell.snapshot(), saved);
  cell.write(new Map([[1, { a: 1 }], ['1', { b: 2 }]])); const mapSnapshot = cell.snapshot(); cell.write(new Map([['1', { b: 2 }], [1, { a: 1 }]])); assert.equal(cell.snapshot(), mapSnapshot);
  for (const key of [true, null, {}, undefined]) rejectedWrite(cell, new Map([[key, 1]]));
  cell.write([1, 2]); const arraySnapshot = cell.snapshot(); cell.write([2, 1]); assert.notEqual(cell.snapshot(), arraySnapshot);
});
await test('V08-V09/S06/protected-stable-snapshots', () => {
  const { store, scope } = fixture(), source = { list: [{ x: 1 }], set: new Set([{ x: 1 }]), map: new Map([[1, { x: 1 }]]) };
  const cell = scope.register('value', { schema: true, initial: source }), old = cell.read();
  source.list[0].x = 2; source.set.add(2); source.map.set(1, 2); assert.equal(old.list[0].x, 1); assert.equal(old.set.size, 1); assert.equal(old.map.get(1).x, 1); assert.equal(Object.isFrozen(source), false);
  for (const action of [() => old.list.push(1), () => { old.list[0].x = 2; }, () => old.set.add(2), () => old.set.delete([...old.set][0]), () => old.map.set(1, 2), () => old.map.clear(),
    () => Object.defineProperty(old.set, 'x', { value: 1 }), () => Set.prototype.add.call(old.set, 2), () => Map.prototype.set.call(old.map, 1, 2), () => old.set.valueOf().clear()]) assert.throws(action);
  old.set.forEach((_value, _key, exposed) => assert.equal(exposed, old.set)); old.map.forEach((_value, _key, exposed) => assert.equal(exposed, old.map));
  assert.equal(cell.read(), old); let payload; store.subscribe(cell.address, value => { payload = value; });
  assert.ok(payload.values[keyOf(cell.address)].set instanceof Set); assert.ok(payload.values[keyOf(cell.address)].map instanceof Map);
  cell.write({ next: true }); assert.equal(old.list[0].x, 1); assert.equal(old.set.size, 1);
});
await test('S01-S05/atomic-scoped-observation-and-generations', () => {
  const { store, scope } = fixture(), a = scope.register('a', { schema: true, initial: null }), b = scope.register('b', { schema: integer, initial: 0 });
  const all = [], pair = [], single = []; store.subscribe(null, value => all.push(value)); store.subscribe([a.address, b.address], value => pair.push(value)); const unsubscribe = store.subscribe(a.address, value => single.push(value));
  assert.equal(single.length, 1); assert.deepEqual(single[0].changes, []); assert.equal(single[0].values[keyOf(a.address)], null);
  store.batch([[a, 1], [b, 2]]); assert.equal(pair.length, 2); assert.equal(pair[1].changes.length, 2); assert.equal(pair[1].values[keyOf(b.address)], 2); assert.equal(single.length, 2);
  b.write(3); assert.equal(single.length, 2); assert.equal(pair.at(-1).values[keyOf(a.address)], 1);
  scope.remove('a'); assert.equal(Object.hasOwn(pair.at(-1).values, keyOf(a.address)), false); assert.equal(pair.at(-1).changes[0].kind, 'removed');
  const newA = scope.register('a', { schema: true, initial: 1 }); assert.equal(pair.at(-1).changes[0].kind, 'added'); assert.throws(() => a.write(9), /CANCELLED/);
  const replaced = scope.replace('a', { schema: true, initial: 1 }); assert.equal(pair.at(-1).changes[0].kind, 'replaced'); assert.notEqual(replaced.generation, newA.generation); assert.throws(() => newA.read(), /CANCELLED/);
  const count = single.length; unsubscribe(); replaced.write(4); assert.equal(single.length, count);
  assert.equal(all.at(-1).values[keyOf(b.address)], 3);
});
await test('S03/reentrant-writes-next-batch', () => {
  const { store, scope } = fixture(), cell = scope.register('value', { schema: integer, initial: 0 }), seen = [];
  store.subscribe(cell.address, payload => { if (payload.values[keyOf(cell.address)] === 1) cell.write(2); });
  store.subscribe(cell.address, payload => seen.push([payload.values[keyOf(cell.address)], cell.read()]));
  cell.write(1); assert.deepEqual(seen, [[0, 0], [1, 1], [2, 2]]);
});
await test('C08-C09/initial-write-race-reset-baseline', async () => {
  const { scope } = fixture(), deferred = defer(), cell = scope.register('value', { schema: integer, pendingInitial: deferred.promise });
  assert.equal(cell.snapshot().status, 'pending'); assert.throws(() => cell.read(), /VALUE_PENDING/);
  cell.write(9); assert.equal(cell.read(), 9); assert.throws(() => cell.reset(), /VALUE_PENDING/); assert.equal(cell.read(), 9);
  deferred.resolve(3); await tick(); assert.equal(cell.read(), 9); cell.reset(); assert.equal(cell.read(), 3); cell.write(4); cell.reset(); assert.equal(cell.read(), 3);
  const other = defer(), replaced = scope.register('old', { schema: integer, pendingInitial: other.promise }); scope.replace('old', { schema: integer, initial: 7 });
  other.resolve(100); await tick(); assert.equal(scope.get('old').read(), 7); assert.throws(() => replaced.read(), /CANCELLED/);
});
await test('K08/initial-error-and-snapshot-status', async () => {
  const { scope } = fixture(), deferred = defer(), cell = scope.register('value', { schema: integer, pendingInitial: deferred.promise });
  deferred.reject(Object.assign(new Error('internal'), { code: 'TYPE_MISMATCH' })); await tick();
  assert.equal(cell.snapshot().status, 'error'); assert.equal(Object.hasOwn(cell.snapshot(), 'value'), false); assert.throws(() => cell.read());
});
await test('C11-C13/reaction-explicit-priority-and-atomic-derived', () => {
  const { store, scope } = fixture(), org = scope.register('org', { schema: integer, initial: 1 }), selection = scope.register('selection', { schema: integer, initial: 7 });
  const derived = scope.register('total', { schema: integer, dependencies: [org, selection], derived: (a, b) => a + b });
  store.reaction(scope, { watch: [org], target: selection, value: 0 });
  assert.throws(() => store.reaction(store.scope(), { watch: [org], target: selection, value: 1 }), /DUPLICATE_REACTION/);
  const observed = []; store.subscribe(null, payload => observed.push(payload));
  store.batch([[org, 2], [selection, 7]]); assert.equal(selection.read(), 7); assert.equal(derived.read(), 9); assert.equal(observed.length, 2);
  org.write(3); assert.equal(selection.read(), 0); assert.equal(derived.read(), 3); assert.equal(observed.length, 3);
  store.batch([[org, 4], [selection, 8]], { origin: 'url' }); assert.equal(selection.read(), 8); assert.equal(derived.read(), 12);
  org.write(4); assert.equal(selection.read(), 8);
});
await test('C10/derived-failure-and-cycle', () => {
  const { store, scope } = fixture(), source = scope.register('source', { schema: integer, initial: 1 }), unrelated = scope.register('other', { schema: integer, initial: 7 });
  const derived = scope.register('derived', { schema: integer, dependencies: [source], derived: value => { if (!value) throw Error('bad'); return 10 / value; } });
  source.write(0); assert.equal(source.read(), 0); assert.equal(derived.snapshot().status, 'error'); assert.equal(unrelated.read(), 7); assert.throws(() => derived.write(1), /READ_ONLY/);
  assert.throws(() => store.reaction(scope, { watch: [derived], target: source, value: 1 }), /DEPENDENCY_CYCLE/);
  source.write(2); assert.equal(derived.read(), 5);
});
await test('C06-C07-C15/scope-ownership-and-shared-handles', () => {
  const { store, scope: service } = fixture(), first = store.scope(), second = store.scope();
  const shared = service.register('selected', { schema: integer, initial: 1 }), a = first.register('local', { schema: integer, initial: 1 }), b = second.register('local', { schema: integer, initial: 1 });
  const portsA = { selected: shared }, portsB = { selected: shared }; portsA.selected.write(4); assert.equal(portsB.selected.read(), 4);
  a.write(3); assert.equal(b.read(), 1); first.dispose(); first.dispose(); assert.throws(() => a.read(), /CANCELLED/); assert.equal(shared.read(), 4); assert.equal(b.read(), 1);
});
await test('atomic/reject-whole-batch-and-replacement', () => {
  const { store, scope } = fixture(), a = scope.register('a', { schema: integer, initial: 1 }), b = scope.register('b', { schema: integer, initial: 2 });
  const aBefore = a.snapshot(), bBefore = b.snapshot(); assert.throws(() => store.batch([[a, 3], [b, 'bad']])); assert.equal(a.snapshot(), aBefore); assert.equal(b.snapshot(), bBefore);
  assert.throws(() => scope.replace('a', { schema: integer, initial: 'bad' })); assert.equal(scope.get('a'), a); assert.equal(a.read(), 1);
});
await test('lifecycle/removed-dependency-cannot-retain-stale-success', () => {
  const { store, scope } = fixture(), other = store.scope(), source = scope.register('source', { schema: integer, initial: 1 });
  const derived = other.register('derived', { schema: integer, dependencies: [source], derived: x => x * 2 }), observed = [];
  store.subscribe(null, value => observed.push(value)); scope.remove('source');
  assert.equal(derived.snapshot().status, 'error'); assert.equal(derived.snapshot().error.code, 'CANCELLED');
  assert.equal(observed.length, 2); assert.equal(observed[1].changes.length, 2);
  scope.register('source', { schema: integer, initial: 3 }); assert.equal(derived.snapshot().status, 'error');
});
await test('lifecycle/replaced-and-disposed-dependency-invalidates-atomically', () => {
  for (const action of ['replace', 'dispose']) {
    const { store, scope } = fixture(), other = store.scope(), source = scope.register('source', { schema: integer, initial: 1 });
    const derived = other.register('derived', { schema: integer, dependencies: [source], derived: x => x + 1 });
    if (action === 'replace') scope.replace('source', { schema: integer, initial: 2 }); else scope.dispose();
    assert.equal(derived.snapshot().status, 'error'); assert.equal(derived.snapshot().error.code, 'CANCELLED');
    assert.throws(() => source.read(), /CANCELLED/);
  }
});
await test('errors/hostile-initial-error-does-not-stay-pending', async () => {
  let getters = 0; const getter = Object.defineProperty({}, 'code', { get() { getters++; throw Error('secret'); } });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const error of [getter, revoked.proxy, Object.create({ code: 'TYPE_MISMATCH' }), { code: 'private-secret' }, null, false, 0, 'secret']) {
    const { scope } = fixture(), deferred = defer(), cell = scope.register('value', { schema: true, pendingInitial: deferred.promise });
    deferred.reject(error); await tick();
    assert.equal(cell.snapshot().status, 'error'); assert.equal(cell.snapshot().error.code, 'INTERNAL_ERROR');
    assert.equal(JSON.stringify(cell.snapshot()).includes('secret'), false);
  }
  assert.equal(getters, 0);
});
await test('errors/observer-failure-cannot-prevent-other-observers', () => {
  const { store, scope } = fixture(), source = scope.register('value', { schema: integer, initial: 0 }), seen = [];
  let getters = 0; const hostile = Object.defineProperty({}, 'code', { get() { getters++; throw Error('secret'); } });
  store.subscribe(source.address, value => { if (value.changes.length) throw hostile; });
  store.subscribe(source.address, value => seen.push(value.values[keyOf(source.address)]));
  source.write(1); source.write(2); assert.deepEqual(seen, [0, 1, 2]); assert.equal(getters, 0);
  assert.ok(store.diagnostics().every(error => error.code === 'INTERNAL_ERROR'));
});
await test('observation/initial-listener-isolation-and-reentrancy', () => {
  const { store, scope } = fixture(), source = scope.register('value', { schema: integer, initial: 0 }), seen = [];
  store.subscribe(source.address, value => seen.push(value.values[keyOf(source.address)]));
  assert.doesNotThrow(() => store.subscribe(source.address, () => { throw Error('secret'); }));
  const initial = [];
  store.subscribe(source.address, value => { initial.push(value.values[keyOf(source.address)]); if (!value.changes.length) { source.write(1); assert.equal(source.read(), 0); } });
  assert.deepEqual(initial, [0, 1]); assert.deepEqual(seen, [0, 1]); assert.equal(source.read(), 1);
});
await report({ base: import.meta.url, name: process.argv[2] ?? 'node24.json', scope: 'Independent State lifecycle/immutable graph model, no production StateStore/renderer; explicit fixture hooks for initial and derived evaluation', results,
  sources: ['run.mjs', 'state-probe.mjs', 'immutable.mjs', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package.json', '../t1-values/package-lock.json', '../verification/report.mjs', '../verification/errors.mjs'] });
