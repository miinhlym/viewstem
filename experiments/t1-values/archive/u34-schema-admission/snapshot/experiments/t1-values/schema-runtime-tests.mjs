import assert from 'node:assert/strict';
import { compileSchema, equal } from './schema-runtime.mjs';
import { ajv, normalize } from './values.mjs';
import { schemaCases } from './schema-probe.mjs';
import { harness, report } from '../verification/report.mjs';

const { test, results } = harness();
const accepts = (schema, input) => { try { compileSchema(schema).accept(input); return true; } catch { return false; } };
const date = { 'x-viewstem-type': 'date' }, time = { 'x-viewstem-type': 'time' }, stamp = { 'x-viewstem-type': 'datetime' };
const input = '2026-10-30T09:30:00+09:00', canonical = '2026-10-30T00:30:00.000Z';
const values = [null, false, true, 0, 1, 2, -1, 1.25, '', 'a', 'baa', '😀', '42', [], [1], [1, '2'], ['x', 1],
  [{ a: 1, b: 2 }, { b: 2, a: 1 }], {}, { n: 1 }, { n: '1' }, { n: 1, extra: 2 }, { a: 1, b: 2 }];
for (const [id, schema] of schemaCases) await test(`json-differential/${id}`, () => {
  const validator = ajv.compile(schema), runtime = compileSchema(schema);
  for (const value of values) {
    let accepted = false;
    try { const actual = runtime.accept(value); accepted = true; assert.ok(equal(actual, value)); } catch (error) { if (error.message !== 'SCHEMA') throw error; }
    assert.equal(accepted, validator(value), JSON.stringify({ id, schema, value }));
  }
});
for (const [id, schema, value, expected] of [
  ['native', stamp, input, canonical], ['nullable', { anyOf: [stamp, { type: 'null' }] }, input, canonical],
  ['nullable-null', { anyOf: [stamp, { type: 'null' }] }, null, null],
  ['ref', { $defs: { stamp }, $ref: '#/$defs/stamp' }, input, canonical],
  ['allOf', { allOf: [stamp, { type: 'string', const: canonical }] }, input, canonical],
  ['anyOf-same-kind', { anyOf: [{ ...stamp, const: canonical }, { ...stamp, const: '2000-01-01T00:00:00.000Z' }] }, input, canonical],
  ['oneOf', { oneOf: [{ ...stamp, const: canonical }, { type: 'null' }] }, input, canonical],
  ['if-canonical', { ...stamp, if: { const: canonical }, then: { minLength: 24 }, else: false }, input, canonical],
  ['then-else-same', { if: { pattern: '^2026' }, then: stamp, else: stamp }, input, canonical],
  ['not-const', { ...stamp, not: { const: '2000-01-01T00:00:00.000Z' } }, input, canonical],
  ['object-no-explicit-type', { properties: { when: stamp } }, { when: input }, { when: canonical }],
  ['object-ref', { $defs: { stamp }, type: 'object', properties: { when: { $ref: '#/$defs/stamp' } } }, { when: input }, { when: canonical }],
  ['additional', { type: 'object', additionalProperties: stamp }, { when: input }, { when: canonical }],
  ['array', { type: 'array', items: stamp }, [input], [canonical]],
  ['prefix', { type: 'array', prefixItems: [time], items: stamp }, ['09:30', input], ['09:30:00.000', canonical]],
  ['untyped-prefix', { type: 'array', prefixItems: [true], items: stamp }, ['plain', input], ['plain', canonical]],
  ['nested-union', { anyOf: [{ type: 'object', properties: { when: stamp } }, { type: 'null' }] }, { when: input }, { when: canonical }],
  ['set', { 'x-viewstem-type': 'set', items: stamp }, new Set([input]), new Set([canonical])],
  ['map', { 'x-viewstem-type': 'map', keys: { type: ['string', 'number'] }, values: stamp }, new Map([[1.5, input]]), new Map([[1.5, canonical]])],
  ['native-in-array', { type: 'array', items: { 'x-viewstem-type': 'set', items: { type: 'integer' } } }, [new Set([1, 2])], [new Set([1, 2])]],
  ['ordinary-string', { type: 'string' }, input, input],
]) await test(`normalize/${id}`, () => {
  const before = structuredClone(value), output = compileSchema(schema).accept(value);
  assert.ok(equal(output, expected)); assert.deepEqual(value, before);
});
for (const [id, schema] of [
  ['date-or-string', { anyOf: [date, { type: 'string' }] }],
  ['date-or-true', { anyOf: [date, true] }],
  ['date-or-time', { oneOf: [date, time] }],
  ['nested', { type: 'object', properties: { day: { anyOf: [date, { type: 'string' }] } } }],
  ['variant-property', { anyOf: [{ type: 'object', properties: { day: date } }, { type: 'object', properties: { day: { type: 'string' } } }] }],
  ['additional-branch', { anyOf: [{ type: 'object', properties: { day: date } }, { type: 'object' }] }],
  ['conditional', { if: { pattern: '^2' }, then: date, else: { type: 'string' } }],
  ['local-ref', { $defs: { day: date }, anyOf: [{ $ref: '#/$defs/day' }, { type: 'string' }] }],
  ['map-value', { 'x-viewstem-type': 'map', keys: true, values: { anyOf: [stamp, { type: 'string' }] } }],
  ['set-item', { 'x-viewstem-type': 'set', items: { anyOf: [date, { type: 'string' }] } }],
]) await test(`reject-ambiguous/${id}`, () => assert.throws(() => compileSchema(schema), /AMBIGUOUS_DATE_NORMALIZATION/));
for (const [id, schema, value] of [
  ['nullable-sibling-const', { anyOf: [date, { type: 'null' }], const: '2000-01-01' }, null],
  ['oneOf-two-matches', { oneOf: [stamp, stamp] }, input],
  ['const-not-rewritten', { ...stamp, const: input }, input],
  ['native-date-invalid', date, '2026-04-31'],
  ['allOf-extra', { allOf: [time, { const: '09:30' }] }, '09:30'],
  ['integer-union', { type: ['integer', 'null'] }, 9007199254740992],
  ['integer-ref', { $defs: { n: { type: 'integer' } }, $ref: '#/$defs/n' }, 9007199254740992],
  ['integer-nested', { properties: { n: { type: 'integer' } } }, { n: 9007199254740992 }],
  ['set-size', { 'x-viewstem-type': 'set', items: true, minItems: 2 }, new Set([1])],
  ['map-value', { 'x-viewstem-type': 'map', keys: true, values: { type: 'integer' } }, new Map([['n', 1.5]])],
  ['map-key', { 'x-viewstem-type': 'map', keys: { type: 'number' }, values: true }, new Map([['1', 2]])],
  ['not-native', { not: stamp }, input],
]) await test(`reject-value/${id}`, () => assert.throws(() => compileSchema(schema).accept(value), /SCHEMA|date|range/i));
await test('enum/empty-is-unsatisfiable-schema', () => { const runtime = compileSchema({ enum: [] }); for (const value of values) assert.throws(() => runtime.accept(value), /SCHEMA/); });
await test('enum/duplicate-is-valid', () => assert.equal(compileSchema({ enum: [1, 1] }).accept(1), 1));
await test('integer/number-union-permits-binary64', () => assert.equal(compileSchema({ type: ['integer', 'number'] }).accept(1e100), 1e100));
await test('annotations/no-native-detection-in-data', () => assert.equal(compileSchema({ default: { 'x-viewstem-type': 'date' } }).accept(1), 1));
await test('schema/snapshot-isolation', () => {
  const schema = { type: 'integer', minimum: 0 }, runtime = compileSchema(schema); schema.minimum = 99;
  assert.equal(runtime.accept(1), 1); assert.throws(() => runtime.accept(-1), /SCHEMA/);
});
await test('normalization/map-key-collision', () => {
  const value = new Map([[input, 'first'], [canonical, 'second']]), before = structuredClone(value);
  assert.throws(() => compileSchema({ 'x-viewstem-type': 'map', keys: stamp, values: { type: 'string' } }).accept(value), /NORMALIZATION_KEY_COLLISION/);
  assert.deepEqual(value, before);
});
await test('normalization/non-string-negative-branch', () => {
  const runtime = compileSchema({ anyOf: [stamp, { not: { type: 'string' } }] });
  assert.equal(runtime.accept(input), canonical); assert.equal(runtime.accept(3), 3);
});
await test('set/no-object-deduplication', () => {
  const value = new Set([{}, { name: undefined }]);
  const output = compileSchema({ 'x-viewstem-type': 'set', items: { type: 'object' }, uniqueItems: true }).accept(value);
  assert.equal(output.size, 2); assert.ok([...output].every(item => !own(item, 'name')));
  assert.ok(Object.hasOwn([...value][1], 'name'));
});
function own(value, key) { return Object.hasOwn(value, key); }
await test('isolation/failed-validation-preserves-input', () => {
  const value = { when: input, extra: undefined, n: 'bad' }, before = structuredClone(value);
  assert.throws(() => compileSchema({ properties: { when: stamp, n: { type: 'integer' } } }).accept(value), /SCHEMA/);
  assert.deepEqual(value, before);
});
await test('normalization/shared-graph-distinct-paths', () => {
  const shared = { x: '09:30' }, value = { typed: shared, raw: shared };
  const output = compileSchema({ properties: { typed: { properties: { x: time } }, raw: { properties: { x: { type: 'string' } } } } }).accept(value);
  assert.equal(output.typed.x, '09:30:00.000'); assert.equal(output.raw.x, '09:30'); assert.equal(shared.x, '09:30');
});
await test('json/generated-boundary-combinations', () => {
  let count = 0;
  const atoms = [{ type: 'integer', minimum: 0 }, { type: 'string', minLength: 1 }, { type: 'null' }, { enum: [0, false, 'a'] }, { const: 'a' }, { not: { type: 'array' } }];
  for (const left of atoms) for (const right of atoms) for (const key of ['allOf', 'anyOf', 'oneOf']) {
    const schema = { [key]: [left, right] }, validator = ajv.compile(schema), runtime = compileSchema(schema);
    for (const value of values) { let actual; try { runtime.accept(value); actual = true; } catch { actual = false; } assert.equal(actual, validator(value), JSON.stringify({ schema, value })); count++; }
  }
  assert.equal(count, 2484);
});
await test('admission/branch-explosion', () => {
  const schema = { allOf: Array.from({ length: 12 }, () => ({ anyOf: [{ minimum: 0 }, { minimum: 1 }] })) };
  assert.throws(() => compileSchema(schema), /LIMIT_EXCEEDED/);
});
await test('admission/deep-schema', () => {
  let schema = true; for (let i = 0; i < 200; i++) schema = { items: schema };
  assert.throws(() => compileSchema(schema), /LIMIT_EXCEEDED/);
});
await test('admission/large-annotation', () => assert.throws(() => compileSchema({ description: 'x'.repeat(300000) }), /LIMIT_EXCEEDED/));
await test('admission/annotation-accessor', () => {
  let calls = 0; const schema = Object.defineProperty({}, 'default', { enumerable: true, get() { calls++; return 1; } });
  assert.throws(() => compileSchema(schema), /INVALID_SCHEMA/); assert.equal(calls, 0);
});
await test('admission/long-reference-chain', () => {
  const $defs = { n100: true }; for (let i = 99; i >= 0; i--) $defs[`n${i}`] = { $ref: `#/$defs/n${i + 1}` };
  assert.throws(() => compileSchema({ $defs, $ref: '#/$defs/n0' }), /LIMIT_EXCEEDED/);
});
await report({ base: import.meta.url, name: process.argv[2] ?? 'schema-runtime-node24.json', scope: 'Independent v1 normalization/schema prototype; bounded differential corpus, not production or arbitrary-schema completeness', results,
  sources: ['schema-runtime-tests.mjs', 'schema-runtime.mjs', 'schema-profile.mjs', 'schema-probe.mjs', 'values.mjs', '../verification/report.mjs', 'package.json', 'package-lock.json'],
  extra: { jsonDifferentialInputs: schemaCases.length * values.length + 2484 } });
