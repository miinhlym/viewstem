import test from 'node:test';
import assert from 'node:assert/strict';
import { createStateStore, keyOf } from '../src/state.mjs';
import { equal } from '../src/schema.mjs';
import { memoryUrl, tick, link } from './fixtures/state/url-adapter.mjs';
const integer = { type: 'integer' }, string = { type: 'string' }, number = { type: 'number' }, boolean = { type: 'boolean' };
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const array = items => ({ type: 'array', items });
const set = items => ({ 'x-viewstem-type': 'set', items });
function fixture(initial, options) { const endpoint = memoryUrl(initial, options), store = createStateStore(), scope = store.createScope(); return { ...endpoint, store, scope }; }
const bind = (f, target, extra = {}) => f.store.connectUrl({ adapter: f.adapter, bindings: [{ target, key: 'p.value' }], ...extra });
const valueAt = (f, key = 'p.value') => JSON.parse(new URL(f.read()).searchParams.get(key));

test('L01/K19 fixed pre-URL baseline, invalid diagnostics and missing stay distinct', async () => {
  const f = fixture(link({ 'p.a': 5 })), a = f.scope.registerState('a', { schema: integer, initial: 1 }), b = f.scope.registerState('b', { schema: string });
  const connection = f.store.connectUrl({ adapter: f.adapter, bindings: [{ target: a }, { target: b }] });
  assert.equal(a.read(), 5); assert.equal(b.read(), undefined); assert.equal(f.attempts.length, 0);
  for (const [x, y] of [[7, 'first'], [9, 'second']]) {
    f.store.writeBatch([[a, x], [b, y]]); await tick();
    f.navigate(link({ 'p.a': 'wrong' })); assert.equal(a.read(), 1); assert.equal(b.getSnapshot().status, 'missing');
  }
  assert.equal(connection.getDiagnostics().length, 2);
  assert.ok(connection.getDiagnostics().every(error => error.kind === 'restore' && error.key === 'p.a'));
  connection.dispose();
});
test('L03/L04 scalar/array/Set and nullable round trips preserve exact values', async () => {
  for (const [schema, value] of [[string, 'null'], [string, ''], [number, 0], [boolean, false], [array(string), ['a', 'a']], [array(number), [0, -2, 1.5]], [set(string), new Set(['x'])], [set(number), new Set([0, 1.5])]]) {
    const f = fixture(), cell = f.scope.registerState('value', { schema: nullable(schema) }), connection = bind(f, cell);
    cell.write(value); await tick(); assert.ok(equal(cell.read(), value));
    const shared = f.read(); connection.dispose();
    const next = fixture(shared), target = next.scope.registerState('value', { schema: nullable(schema) }), connected = bind(next, target);
    assert.ok(equal(target.read(), value)); target.write(null); await tick(); assert.equal(valueAt(next), null);
    next.navigate(shared); assert.ok(equal(target.read(), value)); assert.equal(next.commits.length, 1);
    connected.dispose();
  }
});
test('L03 unsupported collection profiles reject before installing observers', () => {
  for (const schema of [{ type: 'object' }, { 'x-viewstem-type': 'map', keys: string, values: integer }, set({ type: 'object' }), array(boolean), set(boolean), array(array(string)), { type: ['string', 'number'] }, { type: 'array', prefixItems: [string], items: string }]) {
    const f = fixture(), cell = f.scope.registerState('value', { schema });
    assert.throws(() => bind(f, cell), { code: 'INVALID_DEFINITION' }); assert.equal(f.listeners.size, 0);
  }
});
test('L04 duplicate owned key and malformed JSON restore baseline with diagnostics', () => {
  for (const search of ['p.value=1&p.value=2', 'p.value=not-json', 'p.value=%22wrong%22']) {
    const f = fixture(`https://example.test/view?${search}`), cell = f.scope.registerState('value', { schema: integer, initial: 7 }), connection = bind(f, cell);
    assert.equal(cell.read(), 7); assert.equal(connection.getDiagnostics().length, 1); assert.equal(f.attempts.length, 0); connection.dispose();
  }
});
test('L05 exact owned merge preserves raw external query bytes, path/hash and other stores', async () => {
  const endpoint = memoryUrl('https://example.test/path?external=%2f+%20&external=2&p.prefix=old#section'), aStore = createStateStore(), bStore = createStateStore();
  const a = aStore.createScope().registerState('a', { schema: string, initial: 'a' }), b = bStore.createScope().registerState('b', { schema: string, initial: 'b' });
  const one = aStore.connectUrl({ adapter: endpoint.adapter, bindings: [{ target: a, key: 'a' }] }), two = bStore.connectUrl({ adapter: endpoint.adapter, bindings: [{ target: b, key: 'b' }] });
  a.write('A'); b.write('B'); await tick();
  assert.equal(new URL(endpoint.read()).pathname, '/path'); assert.equal(new URL(endpoint.read()).hash, '#section');
  assert.ok(endpoint.read().includes('external=%2f+%20&external=2&p.prefix=old')); assert.equal(JSON.parse(new URL(endpoint.read()).searchParams.get('a')), 'A'); assert.equal(JSON.parse(new URL(endpoint.read()).searchParams.get('b')), 'B');
  one.dispose(); two.dispose();
});
test('L05/K19 duplicate owned keys/targets and derived binding reject configuration', () => {
  const f = fixture(), a = f.scope.registerState('a', { schema: integer, initial: 1 }), b = f.scope.registerState('b', { schema: integer, initial: 2 });
  for (const bindings of [[{ target: a, key: 'same' }, { target: b, key: 'same' }], [{ target: a, key: 'one' }, { target: a, key: 'two' }]]) assert.throws(() => f.store.connectUrl({ adapter: f.adapter, bindings }), { code: 'INVALID_DEFINITION' });
  const derived = f.scope.registerState('derived', { schema: integer, dependencies: [a], derived: x => x + 1 });
  assert.throws(() => bind(f, derived), { code: 'TYPE_MISMATCH' }); assert.equal(f.listeners.size, 0);
});
test('L06/K19 oversized encoded output keeps State and writes no partial patch', async () => {
  const f = fixture('https://example.test/view?external=keep'), a = f.scope.registerState('a', { schema: string, initial: '' }), b = f.scope.registerState('b', { schema: string, initial: '' });
  const connection = f.store.connectUrl({ adapter: f.adapter, bindings: [{ target: a }, { target: b }], limits: { maxValueBytes: 12 } });
  f.store.writeBatch([[a, 'ok'], [b, '😀'.repeat(10)]]); await tick(); assert.equal(a.read(), 'ok'); assert.equal(b.read(), '😀'.repeat(10)); assert.equal(f.attempts.length, 0); assert.equal(new URL(f.read()).search, '?external=keep');
  assert.equal(connection.getDiagnostics()[0].code, 'LIMIT_EXCEEDED'); connection.dispose();
});
test('L06/K19 input limits use baseline; external URL bytes are excluded from owned budget', () => {
  const huge = 'x'.repeat(10000), f = fixture(`${link({ 'p.value': [1, 2, 3] })}&outside=${huge}`), cell = f.scope.registerState('value', { schema: array(integer), initial: [7] });
  const connection = bind(f, cell, { limits: { maxItems: 2, maxOwnedBytes: 100 } });
  assert.deepEqual([...cell.read()], [7]); assert.equal(connection.getDiagnostics()[0].code, 'LIMIT_EXCEEDED'); connection.dispose();
  const other = fixture(`${link({ 'p.value': [1] })}&outside=${huge}`), target = other.scope.registerState('value', { schema: array(integer), initial: [7] }), connected = bind(other, target, { limits: { maxOwnedBytes: 100 } });
  assert.deepEqual([...target.read()], [1]); assert.equal(connected.getDiagnostics().length, 0); connected.dispose();
});
test('L06 output list and registration limits reject without truncation', async () => {
  const f = fixture(), cell = f.scope.registerState('value', { schema: set(integer), initial: new Set() });
  const connection = bind(f, cell, { limits: { maxItems: 2 } }); cell.write(new Set([1, 2, 3])); await tick();
  assert.equal(cell.read().size, 3); assert.equal(f.attempts.length, 0); assert.equal(connection.getDiagnostics()[0].code, 'LIMIT_EXCEEDED'); connection.dispose();
  for (const limits of [{ maxKeys: 0 }, { unknown: 2 }, { maxValueBytes: 1.5 }]) assert.throws(() => bind(f, cell, { limits }), { code: 'INVALID_DEFINITION' });
  const b = f.scope.registerState('b', { schema: integer }); assert.throws(() => f.store.connectUrl({ adapter: f.adapter, bindings: [{ target: cell }, { target: b }], limits: { maxKeys: 1 } }), { code: 'LIMIT_EXCEEDED' });
});
test('L06/L07 write and cleanup failure are synchronization errors; subsequent State writes still work', async () => {
  const f = fixture(), cell = f.scope.registerState('value', { schema: integer, initial: 1 }), connection = bind(f, cell);
  f.failNext(); cell.write(2); await tick(); assert.equal(cell.read(), 2); assert.equal(connection.getDiagnostics()[0].kind, 'write');
  cell.write(3); await tick(); assert.equal(valueAt(f), 3);
  f.failNext(); await connection.removeOwned(); assert.equal(valueAt(f), 3); assert.equal(connection.getDiagnostics().at(-1).kind, 'replace-cleanup');
  cell.write(4); await tick(); assert.equal(valueAt(f), 4); connection.dispose();
});
test('L07/L10 disposing connection preserves URL and shared service binding survives consumer scope disposal', async () => {
  const f = fixture(), cell = f.scope.registerState('value', { schema: integer, initial: 1 }), consumer = f.store.createScope(), connection = bind(f, cell);
  consumer.registerState('local', { schema: integer, initial: 0 }); consumer.dispose(); cell.write(2); await tick(); assert.equal(valueAt(f), 2);
  assert.throws(() => bind(f, cell), { code: 'INVALID_DEFINITION' }); connection.dispose(); const saved = f.read(); cell.write(3); await tick(); assert.equal(f.read(), saved); assert.equal(f.listeners.size, 0);
});
test('L07 replacement cleanup removes selected exact keys and retains external/prefix keys', async () => {
  const f = fixture('https://example.test/view?p.a=1&p.b=2&p.a.extra=3&external=4'), a = f.scope.registerState('a', { schema: integer }), b = f.scope.registerState('b', { schema: integer });
  const connection = f.store.connectUrl({ adapter: f.adapter, bindings: [{ target: a }, { target: b }] }); await connection.removeOwned([a]);
  const params = new URL(f.read()).searchParams; assert.equal(params.has('p.a'), false); assert.equal(params.get('p.b'), '2'); assert.equal(params.get('p.a.extra'), '3'); assert.equal(params.get('external'), '4'); assert.equal(f.commits[0].mode, 'replace'); connection.dispose();
});
test('L08/K18 atomic push+replace batch writes once; same values and restore do not repush', async () => {
  const f = fixture(), org = f.scope.registerState('org', { schema: integer, initial: 1 }), selection = f.scope.registerState('selection', { schema: integer, initial: 7 });
  f.store.registerReaction(f.scope, { watch: [org], target: selection, value: 0 });
  const connection = f.store.connectUrl({ adapter: f.adapter, bindings: [{ target: org, history: 'replace' }, { target: selection, history: 'push' }] });
  f.store.writeBatch([[org, 2], [selection, 7]]); await tick(); assert.equal(f.commits.length, 1); assert.equal(f.commits[0].mode, 'replace'); assert.equal(selection.read(), 7);
  org.write(3); await tick(); assert.equal(f.commits.length, 2); assert.equal(f.commits[1].mode, 'push'); assert.equal(selection.read(), 0);
  f.navigate(link({ 'p.org': 4, 'p.selection': 9 })); await tick(); assert.equal(selection.read(), 9); assert.equal(f.commits.length, 2);
  f.store.writeBatch([[org, 4], [selection, 9]]); await tick(); assert.equal(f.commits.length, 2); connection.dispose();
});
test('L09/K20 delayed newest write carries unapplied keys and invalidates old commit', async () => {
  const f = fixture(undefined, { delayed: true }), a = f.scope.registerState('a', { schema: integer, initial: 0 }), b = f.scope.registerState('b', { schema: integer, initial: 0 });
  const connection = f.store.connectUrl({ adapter: f.adapter, bindings: [{ target: a }, { target: b }] });
  a.write(1); b.write(2); assert.equal(f.pending.length, 2); assert.equal(f.pending[0].options.isCurrent(), false); assert.equal(f.pending[1].options.isCurrent(), true);
  f.release(1); await tick(); f.release(0); await tick(); assert.equal(JSON.parse(new URL(f.read()).searchParams.get('p.a')), 1); assert.equal(JSON.parse(new URL(f.read()).searchParams.get('p.b')), 2); assert.equal(f.commits.length, 1); connection.dispose();
});
test('L09/K20 delayed writes are checked again after restore/dispose/ABA', async () => {
  for (const event of ['restore', 'dispose', 'ABA']) {
    const f = fixture(undefined, { delayed: true }), cell = f.scope.registerState('value', { schema: integer, initial: 0 }), connection = bind(f, cell);
    cell.write(1); const stale = f.pending[0];
    if (event === 'restore') f.navigate(link({ 'p.value': 9 }));
    if (event === 'dispose') connection.dispose();
    if (event === 'ABA') { cell.write(2); cell.write(1); }
    assert.equal(stale.options.isCurrent(), false); f.release(0); await tick(); assert.equal(f.commits.length, 0);
    while (f.pending.length) { f.release(0); await tick(); }
    if (event === 'restore') assert.equal(cell.read(), 9); if (event === 'ABA') assert.equal(valueAt(f), 1); connection.dispose();
  }
});
test('L09 delayed old cleanup cannot remove newer values', async () => {
  const f = fixture(link({ 'p.value': 1 }), { delayed: true }), cell = f.scope.registerState('value', { schema: integer, initial: 0 }), connection = bind(f, cell);
  const cleanup = connection.removeOwned(); cell.write(2); assert.equal(f.pending[0].options.isCurrent(), false);
  f.release(1); await tick(); f.release(0); await cleanup; assert.equal(valueAt(f), 2); connection.dispose();
});
test('L11-L13 dates use fixed normalized baseline; explicit baseline value remains in share link', async () => {
  const f = fixture(link({ 'p.zone': 'America/Los_Angeles' })), day = f.scope.registerState('day', { schema: { 'x-viewstem-type': 'date' }, initial: '2026-10-14' }), zone = f.scope.registerState('zone', { schema: string, initial: 'Asia/Seoul' });
  const connection = f.store.connectUrl({ adapter: f.adapter, bindings: [{ target: day }, { target: zone }] });
  assert.equal(day.read(), '2026-10-14'); assert.equal(zone.read(), 'America/Los_Angeles'); assert.equal(f.commits.length, 0); assert.equal(new URL(f.read()).searchParams.has('p.day'), false);
  f.navigate(link({ 'p.day': '2026-10-13' })); assert.equal(day.read(), '2026-10-13'); day.write('2026-10-14'); await tick(); assert.equal(valueAt(f, 'p.day'), '2026-10-14');
  const next = fixture(f.read()), nextDay = next.scope.registerState('day', { schema: { 'x-viewstem-type': 'date' }, initial: '2026-10-15' }), nextConnection = next.store.connectUrl({ adapter: next.adapter, bindings: [{ target: nextDay }] });
  assert.equal(nextDay.read(), '2026-10-14'); next.navigate('https://example.test/view'); assert.equal(nextDay.read(), '2026-10-15'); assert.equal(next.commits.length, 0); connection.dispose(); nextConnection.dispose();
});
test('K30-K32 declared datetime URL normalization and same-instant notifications', () => {
  const f = fixture(link({ 'p.value': '2026-10-29T09:30:00+09:00' })), cell = f.scope.registerState('value', { schema: { 'x-viewstem-type': 'datetime' }, initial: '2026-10-28T00:00:00Z' }), connection = bind(f, cell);
  assert.equal(cell.read(), '2026-10-29T00:30:00.000Z'); let count = 0; f.store.subscribe(cell.address, () => count++);
  cell.write('2026-10-29T00:30:00.000Z'); assert.equal(count, 1); connection.dispose();
});
test('L02 pending initial settles before URL restoration, missing URL uses settled baseline', async () => {
  for (const urlValue of [undefined, 8]) {
    const f = fixture(urlValue === undefined ? undefined : link({ 'p.value': urlValue })); let resolve;
    const cell = f.scope.registerState('value', { schema: integer, pendingInitial: new Promise(done => { resolve = done; }) });
    const connection = bind(f, cell);
    resolve(3); await tick(); assert.equal(cell.read(), urlValue ?? 3);
    f.navigate('https://example.test/view'); await tick(); assert.equal(cell.read(), 3); assert.equal(f.commits.length, 0); connection.dispose();
  }
});
test('L05 cross-store collisions on same adapter owned keys reject before restoration', () => {
  const endpoint = memoryUrl(), a = createStateStore(), b = createStateStore();
  const one = a.createScope().registerState('one', { schema: integer, initial: 1 }), two = b.createScope().registerState('two', { schema: integer, initial: 2 });
  const connection = a.connectUrl({ adapter: endpoint.adapter, bindings: [{ target: one, key: 'owned' }] });
  assert.throws(() => b.connectUrl({ adapter: endpoint.adapter, bindings: [{ target: two, key: 'owned' }] }), { code: 'INVALID_DEFINITION' });
  assert.equal(two.read(), 2); assert.equal(endpoint.listeners.size, 1); connection.dispose();
});
test('L02/K08 failed initial remains error baseline when URL key is absent', async () => {
  const f = fixture(); let reject;
  const cell = f.scope.registerState('value', { schema: integer, pendingInitial: new Promise((_, fail) => { reject = fail; }) }), connection = bind(f, cell);
  reject({ code: 'HTTP_ERROR' }); await tick();
  assert.equal(cell.getSnapshot().status, 'error'); assert.throws(() => cell.read(), { code: 'HTTP_ERROR' });
  f.navigate('https://example.test/view'); assert.equal(cell.getSnapshot().status, 'error'); assert.equal(f.commits.length, 0); connection.dispose();
});
test('C08/L02 explicit write during pending baseline survives settlement and releases URL readiness', async () => {
  const f = fixture(); let resolve;
  const cell = f.scope.registerState('value', { schema: integer, pendingInitial: new Promise(done => { resolve = done; }) }), connection = bind(f, cell);
  cell.write(9); resolve(3); await tick();
  assert.equal(connection.isReady(), true); assert.equal(cell.read(), 9);
  cell.reset(); assert.equal(cell.read(), 3); connection.dispose();
});
