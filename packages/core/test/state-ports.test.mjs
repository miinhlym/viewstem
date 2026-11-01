// Expectations promoted from experiments/t3-state/ports-tests.mjs; execution uses production modules only.
import assert from 'node:assert/strict';
import { compilePorts, expression, stateValue, createQueryHandle as queryFixture, sameContract, boundedState, boundedQuery } from '../src/ports.mjs';
import { StateStore } from '../src/state.mjs';
import test from 'node:test';

const integer = { type: 'integer' }, number = { type: 'number' };
const value = (schema = integer, extra = {}) => ({ kind: 'Value', schema, ...extra });
const state = (schema = integer, extra = {}) => ({ kind: 'State', schema, ...extra });
const compile = (ports, extra = {}) => compilePorts({ resourceKind: 'Action', ports, ...extra });
const code = (run, expected) => assert.throws(run, error => error.code === expected);
const fixture = () => { const store = new StateStore(); return { store, scope: store.createScope() }; };
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { resolve, reject, promise }; };
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

await test('C01/schema-typeRef-exactly-one-and-query-untyped', () => {
  for (const kind of ['Value', 'State']) {
    code(() => compile({ input: { kind } }), 'INVALID_DEFINITION');
    code(() => compile({ input: { kind, schema: integer, typeRef: 'Int' } }, { types: { Int: integer } }), 'INVALID_DEFINITION');
    code(() => compile({ input: { kind, typeRef: 'Absent' } }), 'REFERENCE_NOT_FOUND');
  }
  assert.equal(compile({ input: { kind: 'Value', typeRef: 'Int' } }, { types: { Int: integer } }).prepare({ input: 2 }).ports.input, 2);
  for (const extra of [{ schema: integer }, { typeRef: 'Int' }]) code(() => compile({ input: { kind: 'Query', ...extra } }), 'INVALID_DEFINITION');
});
await test('C01/schema-registration-profile-and-json-admission', () => {
  for (const schema of [{ type: 7 }, { type: 'float' }, { minimum: '1' }, { format: 'email' }, { $ref: 'https://example.test/schema' }, { $defs: { self: { $ref: '#/$defs/self' } }, $ref: '#/$defs/self' }]) assert.throws(() => compile({ input: value(schema) }));
  const cyclic = {}; cyclic.const = cyclic; assert.throws(() => compile({ input: value(cyclic) }));
  let calls = 0; const hostile = Object.defineProperty({}, 'type', { enumerable: true, get() { calls++; return 'integer'; } });
  assert.throws(() => compile({ input: value(hostile) })); assert.equal(calls, 0);
});
await test('C02/port-required-and-object-required-are-separate', () => {
  const object = { type: 'object', properties: { id: integer }, required: ['id'] };
  const optional = compile({ input: value(object) });
  assert.equal(optional.prepare({}).states.input.status, 'missing');
  code(() => optional.prepare({ input: {} }), 'TYPE_MISMATCH');
  const required = compile({ input: value(object, { required: true }) });
  code(() => required.prepare({}), 'INVALID_DEFINITION');
  code(() => required.prepare({ input: {} }), 'TYPE_MISMATCH');
  assert.equal(required.prepare({ input: { id: 1 } }).ports.input.id, 1);
});
await test('C04/all-resource-kind-port-matrix', () => {
  for (const resourceKind of ['Query', 'Variable', 'Action', 'Component', 'View', 'Datasource', 'Type']) {
    assert.doesNotThrow(() => compilePorts({ resourceKind }));
    for (const kind of ['Value', 'State', 'Query']) {
      const run = () => compilePorts({ resourceKind, ports: { p: kind === 'Query' ? { kind } : { kind, schema: integer } } });
      const permitted = ['Action', 'Component', 'View'].includes(resourceKind) || (['Query', 'Variable'].includes(resourceKind) && kind === 'Value');
      if (permitted) assert.doesNotThrow(run); else code(run, 'INVALID_DEFINITION');
    }
  }
});
await test('K02/default-only-on-omission-and-falsy-values', () => {
  const ports = compile({ input: value({ type: ['integer', 'null', 'boolean', 'string'] }, { default: 7 }) });
  assert.equal(ports.prepare({}).ports.input, 7);
  for (const input of [null, 0, false, '']) assert.equal(ports.prepare({ input }).ports.input, input);
  code(() => compile({ input: value(integer, { default: 7 }) }).prepare({ input: null }), 'TYPE_MISMATCH');
  code(() => ports.prepare({ input: undefined }), 'TYPE_MISMATCH');
  code(() => compile({ input: value(integer, { default: '7' }) }), 'TYPE_MISMATCH');
});
await test('K02/invalid-default-declarations-and-unknown-inputs', () => {
  for (const declaration of [value(integer, { required: true, default: 0 }), state(integer, { default: 0 }), { kind: 'Query', default: 0 }, value(integer, { required: 'true' }), value(integer, { access: 'read' })]) code(() => compile({ input: declaration }), 'INVALID_DEFINITION');
  code(() => compile({}).prepare({ unknown: 1 }), 'INVALID_DEFINITION');
  const { store, scope } = fixture();
  const prepared = compile({ state: state(), query: { kind: 'Query' }, value: value({ ...integer, default: 8 }) }, { store }).prepare({});
  assert.deepEqual(Object.keys(prepared.ports), []); assert.equal(prepared.states.state.status, 'missing');
  assert.throws(() => scope.getState('state'), { code: 'REFERENCE_NOT_FOUND' });
});
await test('K02/defaults-are-literals-and-isolated-between-calls', () => {
  const source = { '@path': '/states/private', nested: { n: 1 }, set: new Set([{ id: 1 }]), map: new Map([['a', { n: 1 }]]) };
  const declarations = { input: value(true, { default: source }) }, ports = compile(declarations);
  source.nested.n = 9; source.set.clear(); source.map.clear(); declarations.input.default = null;
  const a = ports.prepare({}).ports.input, b = ports.prepare({}).ports.input;
  assert.equal(a['@path'], '/states/private'); assert.equal(a.nested.n, 1); assert.equal(a.set.size, 1); assert.equal(a.map.get('a').n, 1);
  assert.notEqual(a, b); assert.notEqual(a.nested, b.nested); assert.notEqual([...a.set][0], [...b.set][0]);
  for (const mutate of [() => { a.nested.n = 3; }, () => a.set.clear(), () => a.map.set('a', 3), () => { [...a.set][0].id = 3; }]) assert.throws(mutate);
  assert.equal(b.nested.n, 1); assert.equal(Object.isFrozen(source), false);
});
await test('K03/required-structural-failure-precedes-expression-evaluation', () => {
  let evaluations = 0, executions = 0;
  const ports = compile({ input: value(integer, { required: true }), other: value() });
  for (const mode of ['automatic', 'explicit']) code(() => { const ready = ports.prepare({ other: expression(() => { evaluations++; return { status: 'ready', value: 1 }; }) }, { mode }); if (ready.status === 'ready') executions++; }, 'INVALID_DEFINITION');
  assert.equal(evaluations, 0); assert.equal(executions, 0);
});
await test('K03/missing-pending-auto-wait-and-explicit-zero-execution', () => {
  for (const status of ['missing', 'pending']) {
    const ports = compile({ input: value(integer, { required: true }) }); let executions = 0;
    const inputs = { input: expression(() => ({ status })) };
    assert.equal(ports.prepare(inputs, { mode: 'automatic' }).status, 'waiting');
    code(() => { ports.prepare(inputs); executions++; }, 'INPUT_NOT_READY'); assert.equal(executions, 0);
  }
});
await test('K02-K03/explicit-dependency-states-never-use-default', () => {
  const ports = compile({ input: value(integer, { default: 9 }) });
  const missing = ports.prepare({ input: expression(() => ({ status: 'missing' })) });
  assert.equal(missing.states.input.status, 'missing'); assert.equal(Object.hasOwn(missing.ports, 'input'), false);
  assert.equal(ports.prepare({ input: expression(() => ({ status: 'pending' })) }, { mode: 'automatic' }).status, 'waiting');
  code(() => ports.prepare({ input: expression(() => ({ status: 'pending' })) }), 'INPUT_NOT_READY');
  for (const mode of ['automatic', 'explicit']) code(() => ports.prepare({ input: expression(() => ({ status: 'error', error: { code: 'HTTP_ERROR' } })) }, { mode }), 'HTTP_ERROR');
});
await test('K03/schema-validation-waits-until-value-ready', () => {
  let snapshot = { status: 'pending' }; const input = expression(() => snapshot), ports = compile({ input: value(integer, { required: true }) });
  assert.equal(ports.prepare({ input }, { mode: 'automatic' }).status, 'waiting');
  snapshot = { status: 'ready', value: 'bad' }; code(() => ports.prepare({ input }), 'TYPE_MISMATCH');
  snapshot = { status: 'ready', value: 0 }; assert.equal(ports.prepare({ input }).ports.input, 0);
  snapshot = { status: 'error', error: { code: 'TIMEOUT' } }; code(() => ports.prepare({ input }), 'TIMEOUT');
});
await test('C05/value-object-native-input-cannot-mutate-source-state', () => {
  const { store, scope } = fixture(), cell = scope.registerState('source', { schema: true, initial: { nested: { n: 1 }, array: [{ n: 1 }], set: new Set([{ n: 1 }]), map: new Map([['a', { n: 1 }]]) } });
  const prepared = compile({ input: value(true) }, { store }).prepare({ input: stateValue(cell) }).ports.input;
  assert.equal(Object.hasOwn(prepared, 'write'), false);
  for (const mutate of [() => { prepared.nested.n = 2; }, () => prepared.array.push(2), () => prepared.set.clear(), () => prepared.map.clear(), () => { prepared.map.get('a').n = 2; }, () => Set.prototype.add.call(prepared.set, 1)]) assert.throws(mutate);
  assert.equal(cell.read().nested.n, 1); assert.equal(cell.read().set.size, 1); assert.equal(cell.read().map.get('a').n, 1);
});
await test('C05/external-value-source-is-not-frozen-or-retained', () => {
  const source = { nested: { n: 1 }, map: new Map([['a', { n: 1 }]]) }, result = compile({ input: value(true) }).prepare({ input: source }).ports.input;
  source.nested.n = 2; source.map.get('a').n = 2; assert.equal(result.nested.n, 1); assert.equal(result.map.get('a').n, 1);
  assert.equal(Object.isFrozen(source), false); assert.equal(Object.isFrozen(source.nested), false);
});
await test('K04/number-cell-current-integer-does-not-pass-integer-contract', () => {
  const { store, scope } = fixture(), cell = scope.registerState('source', { schema: number, initial: 1 });
  code(() => compile({ input: state() }, { store }).prepare({ input: cell }), 'TYPE_CONTRACT_MISMATCH');
  const same = compile({ input: state(number) }, { store }).prepare({ input: cell }).ports.input; same.write(1.5); assert.equal(cell.read(), 1.5);
});
await test('K04/common-Type-missing-cell-connects-before-readiness', () => {
  const { store, scope } = fixture(), cell = scope.registerState('source', { schema: integer }), ports = compile({ input: { kind: 'State', typeRef: 'Int', required: true } }, { store, types: { Int: integer } });
  const connected = ports.prepare({ input: cell }); assert.equal(connected.status, 'ready'); assert.equal(connected.ports.input.snapshot().status, 'missing');
  const reader = compile({ input: value(integer, { required: true }) });
  assert.equal(reader.prepare({ input: stateValue(connected.ports.input) }, { mode: 'automatic' }).status, 'waiting');
  connected.ports.input.write(3); assert.equal(reader.prepare({ input: stateValue(cell) }).ports.input, 3);
});
await test('K04/contracts-ignore-key-required-enum-type-order-and-annotations', () => {
  const left = { title: 'old', type: ['object', 'null'], properties: { b: { type: 'string', enum: ['b', 'a'] }, a: integer }, required: ['b', 'a'], additionalProperties: false };
  const right = { additionalProperties: false, required: ['a', 'b'], properties: { a: { description: 'count', type: ['integer'] }, b: { enum: ['a', 'b'], type: 'string', default: 'a' } }, type: ['null', 'object'], examples: [null], readOnly: true };
  assert.equal(sameContract(left, right), true);
  const { store, scope } = fixture(), cell = scope.registerState('source', { schema: left, initial: { a: 1, b: 'a' } });
  compile({ input: state(right) }, { store }).prepare({ input: cell }).ports.input.write({ b: 'b', a: 2 }); assert.equal(cell.read().a, 2);
});
await test('K04/local-refs-expand-with-escaped-pointers-and-siblings', () => {
  const referenced = { $defs: { 'a/b~c': { type: 'integer' } }, $ref: '#/$defs/a~1b~0c', minimum: 0 };
  assert.equal(sameContract(referenced, { minimum: 0, type: 'integer' }), true);
  const nested = { type: 'object', properties: { n: { $ref: '#/$defs/N' } }, $defs: { N: integer, Unused: { type: 'string' } } };
  assert.equal(sameContract(nested, { properties: { n: integer }, type: 'object' }), true);
});
await test('K04/const-enum-data-annotation-names-remain-constraints', () => {
  for (const keyword of ['const', 'enum']) {
    const a = { [keyword]: keyword === 'const' ? { title: 'A', description: 'kept', $ref: 'data' } : [{ title: 'A', default: 1 }, { title: 'B' }] };
    const b = structuredClone(a); if (keyword === 'const') b.const.title = 'B'; else b.enum[0].title = 'C';
    assert.equal(sameContract(a, b), false);
  }
  assert.equal(sameContract({ enum: [{ title: 'A', n: 1 }, { title: 'B' }] }, { enum: [{ title: 'B' }, { n: 1, title: 'A' }] }), true);
  assert.equal(sameContract({ properties: { title: integer } }, { properties: { title: number } }), false);
});
await test('K04/no-general-logical-equivalence-or-subsumption-inference', () => {
  for (const [a, b] of [[integer, number], [{ type: 'integer', minimum: 0 }, integer], [{ type: 'integer', minimum: 0 }, { type: 'integer', exclusiveMinimum: -1 }], [{ allOf: [integer] }, integer], [{ anyOf: [integer, { type: 'string' }] }, { type: ['integer', 'string'] }]]) assert.equal(sameContract(a, b), false);
  assert.equal(sameContract({ prefixItems: [integer, { type: 'string' }] }, { prefixItems: [{ type: 'string' }, integer] }), false);
});
await test('K04/readonly-derived-values-and-query-results-are-not-state-targets', () => {
  const { store, scope } = fixture(), source = scope.registerState('source', { schema: integer, initial: 1 }), derived = scope.registerState('derived', { schema: integer, dependencies: [source], derived: x => x * 2 });
  const ports = compile({ input: state() }, { store });
  for (const input of [derived, 1, null, { data: 1 }, queryFixture(), source.read()]) code(() => ports.prepare({ input }), 'TYPE_CONTRACT_MISMATCH');
  assert.equal(compile({ input: value() }).prepare({ input: stateValue(derived) }).ports.input, 2);
});
await test('K04/followup-write-revalidates-value-permissions-and-generation', () => {
  const { store, scope } = fixture(), schema = { ...integer, minimum: 0 }, source = scope.registerState('source', { schema, initial: 1 });
  const ports = compile({ input: state(schema) }, { store }), linked = ports.prepare({ input: source }).ports.input;
  const before = source.snapshot(); code(() => linked.write(-1), 'TYPE_MISMATCH'); code(() => linked.write('2'), 'TYPE_MISMATCH'); assert.equal(source.snapshot(), before);
  linked.write(3); linked.reset(); assert.equal(source.read(), 1);
  scope.replaceState('source', { schema, initial: 9 }); code(() => linked.write(2), 'CANCELLED'); code(() => linked.reset(), 'CANCELLED'); assert.equal(scope.getState('source').read(), 9);
  const checks = [], target = { address: { scopeId: 'private', name: 'target' }, generation: 1, snapshot: () => ({ status: 'ready', value: 1 }), read: () => 1, write: () => checks.push('write'), reset: () => checks.push('reset') };
  let writable = true, currentSchema = integer; const checkingStore = { contract: () => ({ schema: currentSchema, writable }) };
  const port = compile({ input: state() }, { store: checkingStore }).prepare({ input: target }).ports.input;
  writable = false; code(() => port.write(1), 'TYPE_CONTRACT_MISMATCH'); writable = true; currentSchema = number; code(() => port.write(1), 'TYPE_CONTRACT_MISMATCH'); assert.deepEqual(checks, []);
});
await test('integration/state-value-query-identities-and-preparation-transition', async () => {
  const { store, scope } = fixture(), delayed = defer(), source = scope.registerState('source', { schema: integer, pendingInitial: delayed.promise }), query = queryFixture();
  const ports = compile({ value: value(integer, { required: true }), state: state(), query: { kind: 'Query', required: true } }, { store });
  const inputs = { value: stateValue(source), state: source, query };
  assert.equal(ports.prepare(inputs, { mode: 'automatic' }).status, 'waiting'); code(() => ports.prepare(inputs), 'INPUT_NOT_READY');
  delayed.resolve(4); await tick(); const ready = ports.prepare(inputs); assert.equal(ready.status, 'ready'); assert.equal(ready.ports.value, 4); assert.equal(ready.ports.query, query);
  ready.ports.state.write(5); assert.equal(ready.ports.value, 4); assert.equal(ports.prepare(inputs).ports.value, 5);
  code(() => ports.prepare({ ...inputs, query: { ...query } }), 'TYPE_CONTRACT_MISMATCH');
});
await test('integration/pending-initial-error-propagates-without-default-or-execution', async () => {
  const { scope } = fixture(), delayed = defer(), source = scope.registerState('source', { schema: integer, pendingInitial: delayed.promise });
  const ports = compile({ input: value(integer, { default: 7 }) }); const inputs = { input: stateValue(source) }; let executions = 0;
  code(() => { ports.prepare(inputs); executions++; }, 'INPUT_NOT_READY'); delayed.reject({ code: 'TIMEOUT' }); await tick();
  code(() => { ports.prepare(inputs); executions++; }, 'TIMEOUT'); assert.equal(executions, 0);
});
await test('integration/nested-State-ports-reconnect-without-bypassing-ancestor-guards', () => {
  const { store, scope } = fixture(), cell = scope.registerState('source', { schema: integer, initial: 1 });
  const ports = compile({ input: state() }, { store }), parent = ports.prepare({ input: cell }).ports.input;
  const calls = []; let alive = true;
  const action = boundedState(parent, operation => { calls.push(operation); if (!alive) throw { code: 'CANCELLED' }; });
  const child = ports.prepare({ input: action }).ports.input;
  const grandchild = ports.prepare({ input: boundedState(child, operation => calls.push(`child:${operation}`)) }).ports.input;
  grandchild.write(4); assert.equal(cell.read(), 4); assert.deepEqual(calls, ['child:write', 'write']);
  code(() => grandchild.write('bad'), 'TYPE_MISMATCH'); assert.equal(cell.read(), 4);
  grandchild.reset(); assert.equal(cell.read(), 1); alive = false;
  for (const operation of [() => grandchild.write(8), () => grandchild.reset(), () => grandchild.read(), () => grandchild.snapshot()]) code(operation, 'CANCELLED');
  assert.equal(cell.read(), 1); cell.write(9); assert.equal(cell.read(), 9);
});
await test('integration/nested-State-handles-retain-store-and-generation-boundaries', () => {
  const { store, scope } = fixture(), cell = scope.registerState('source', { schema: integer, initial: 1 });
  const ports = compile({ input: state() }, { store }), parent = ports.prepare({ input: cell }).ports.input;
  const wrapped = boundedState(parent, () => {}), nested = ports.prepare({ input: wrapped }).ports.input;
  code(() => compile({ input: state() }, { store: new StateStore() }).prepare({ input: wrapped }), 'TYPE_CONTRACT_MISMATCH');
  const forged = { ...cell }, brandedForgery = boundedState(forged, () => {});
  code(() => ports.prepare({ input: brandedForgery }), 'CANCELLED');
  scope.replaceState('source', { schema: integer, initial: 7 });
  code(() => nested.write(3), 'CANCELLED'); code(() => ports.prepare({ input: wrapped }), 'CANCELLED'); assert.equal(scope.getState('source').read(), 7);
});
await test('integration/Query-delegate-branding-identity-and-nested-cancellation', async () => {
  const calls = [], snapshot = { status: 'success', data: 1 }, signal = new AbortController().signal;
  const delegate = { snapshot() { assert.equal(this, delegate); calls.push('snapshot'); return snapshot; }, async refresh(arg) { assert.equal(this, delegate); calls.push(['refresh', arg]); return 2; }, async retry(arg) { calls.push(['retry', arg]); return 3; } };
  const query = queryFixture(delegate), ports = compile({ input: { kind: 'Query' } }); let alive = true;
  const guarded = boundedQuery(query, () => { if (!alive) throw { code: 'CANCELLED' }; });
  const child = boundedQuery(ports.prepare({ input: guarded }).ports.input, () => {});
  assert.equal(child.identity, query.identity); assert.equal(child.snapshot(), snapshot);
  assert.equal(await child.refresh(signal), 2); assert.equal(await child.retry(signal), 3);
  assert.deepEqual(calls, ['snapshot', ['refresh', signal], ['retry', signal]]);
  code(() => ports.prepare({ input: delegate }), 'TYPE_CONTRACT_MISMATCH'); code(() => boundedQuery(delegate, () => {}), 'TYPE_CONTRACT_MISMATCH');
  code(() => ports.prepare({ input: { ...child } }), 'TYPE_CONTRACT_MISMATCH');
  alive = false; for (const method of ['snapshot', 'refresh', 'retry']) code(() => child[method](), 'CANCELLED');
  assert.equal(calls.length, 3); assert.equal(await query.refresh(), 2);
});
await test('A22/preparation-errors-identify-exact-structural-type-and-expression-input', () => {
  const expect = (run, expectedCode, input) => assert.throws(run, error => error.code === expectedCode && error.input === input && ownString(error, 'input'));
  const ports = compile({ first: value(), wanted: value(integer, { required: true }) });
  expect(() => ports.prepare({ first: 1 }), 'INVALID_DEFINITION', 'wanted');
  expect(() => ports.prepare({ wanted: 1, unknown: 2 }), 'INVALID_DEFINITION', 'unknown');
  expect(() => ports.prepare({ first: 1, wanted: 'bad' }), 'TYPE_MISMATCH', 'wanted');
  expect(() => ports.prepare({ wanted: expression(() => ({ status: 'nonsense' })) }), 'INVALID_EXPRESSION', 'wanted');
  expect(() => ports.prepare({ wanted: expression(() => { throw { code: 'TIMEOUT' }; }) }), 'TIMEOUT', 'wanted');
  expect(() => ports.prepare({ wanted: expression(() => ({ status: 'pending' })) }), 'INPUT_NOT_READY', 'wanted');
  expect(() => ports.prepare({ first: expression(() => ({ status: 'pending' })), wanted: expression(() => ({ status: 'missing' })) }), 'INPUT_NOT_READY', 'first');
  const { store } = fixture(); expect(() => compile({ target: state() }, { store }).prepare({ target: null }), 'TYPE_CONTRACT_MISMATCH', 'target');
  expect(() => compile({ query: { kind: 'Query' } }).prepare({ query: {} }), 'TYPE_CONTRACT_MISMATCH', 'query');
  function ownString(object, key) { const descriptor = Object.getOwnPropertyDescriptor(object, key); return descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string'; }
});
await test('A22/error-input-metadata-is-owned-and-does-not-copy-hostile-error-fields', () => {
  let reads = 0; const hostile = Object.defineProperties({ code: 'HTTP_ERROR', input: 'forged-input', message: 'secret' }, { cause: { get() { reads++; throw Error('secret'); } } });
  const ports = compile({ input: value() });
  assert.throws(() => ports.prepare({ input: expression(() => ({ status: 'error', error: hostile })) }), error => {
    assert.equal(error.input, 'input'); assert.deepEqual(Object.keys(error).sort(), ['cause', 'code', 'input', 'message']); assert.deepEqual(error.cause, { code: 'HTTP_ERROR', message: 'HTTP_ERROR' }); assert.equal(JSON.stringify(error).includes('secret'), false); return error.code === 'HTTP_ERROR';
  });
  assert.equal(reads, 0);
  const weird = Object.fromEntries([['__proto__', value()]]);
  assert.throws(() => compile(weird).prepare(Object.fromEntries([['__proto__', 'bad']])), error => error.input === '__proto__' && error.code === 'TYPE_MISMATCH');
});
