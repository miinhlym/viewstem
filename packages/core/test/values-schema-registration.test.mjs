// Expectations promoted from experiments/t1-values/schema-registration.mjs; execution uses production modules only.
import assert from 'node:assert/strict';
import { ajv } from '../src/values.mjs';
import { compileSchema } from '../src/schema.mjs';
import { profileGuard, resolveRef, allowed, dialect } from '../src/schema-profile.mjs';
import { schemaCases } from './fixtures/state/schema-cases.mjs';
import test from 'node:test';


const register = schema => compileSchema(schema);

const covered = new Set();
for (const [id, schema] of schemaCases) await test(`standard/${id}`, () => register(schema));
const valid = [
  ['dialect', { $schema: dialect }], ['annotations', { title: 't', description: 'd', default: { arbitrary: true }, examples: [{ unexpected: 1 }], readOnly: true, writeOnly: false, deprecated: true, $comment: 'c' }],
  ['bounds', { minimum: 0, maximum: 3, exclusiveMinimum: -1, exclusiveMaximum: 4 }],
  ['all-keywords', { $defs: { number: { type: 'number' } }, $ref: '#/$defs/number', type: ['integer', 'null'], enum: [1, null], const: 1,
    allOf: [true], anyOf: [true], oneOf: [true], not: false, if: true, then: true, else: false, minLength: 0, maxLength: 10, pattern: '.',
    properties: { x: true }, required: ['x'], additionalProperties: false, minProperties: 0, maxProperties: 10,
    items: true, prefixItems: [true], minItems: 0, maxItems: 10, uniqueItems: true }],
  ['native-set', { 'x-viewstem-type': 'set', items: { type: 'integer' }, minItems: 0 }],
  ['native-map', { 'x-viewstem-type': 'map', keys: { type: ['string', 'number'] }, values: true, maxItems: 9 }],
  ...['date', 'time', 'datetime'].map(kind => [`native-${kind}`, { 'x-viewstem-type': kind }]),
  ['native-local-ref', { $defs: { stamp: { 'x-viewstem-type': 'datetime' } }, type: 'object', properties: { stamp: { $ref: '#/$defs/stamp' } } }],
  ['escaped-local-ref', { $defs: { 'a/b~c': true }, $ref: '#/$defs/a~1b~0c' }],
  ['percent-local-ref', { $defs: { space: { properties: { 'a b': true } } }, $ref: '#/$defs/space%2Fproperties%2Fa%20b' }],
  ['empty-enum', { enum: [] }],
  ['annotation-not-schema', { default: { type: 'wrong', 'x-viewstem-type': 'wrong' }, enum: [{ typo: 1 }], const: { $ref: 'https://invalid/' } }],
];
for (const [id, schema] of valid) await test(`registration/${id}`, () => {
  register(schema); for (const node of profileGuard(schema)) for (const key of Object.keys(node)) covered.add(key);
});
await test('registration/complete-keyword-inventory', () => assert.deepEqual([...covered].sort(), [...allowed].sort()));
const invalid = [
  ['undefined', undefined, 'INVALID_SCHEMA'], ['null', null, 'SCHEMA_OBJECT'], ['array', [], 'SCHEMA_OBJECT'],
  ['unknown', { typo: 1 }, 'UNSUPPORTED_KEYWORD'], ['format', { format: 'date' }, 'UNSUPPORTED_KEYWORD'],
  ['unknown-native', { 'x-viewstem-type': 'list' }, 'NATIVE_KIND'], ['native-null', { 'x-viewstem-type': null }, 'NATIVE_KIND'],
  ...[false, null, '', 'http://json-schema.org/draft-07/schema#'].map((value, i) => [`dialect-${i}`, { $schema: value }, 'DIALECT']),
  ['type-and-native', { type: 'string', 'x-viewstem-type': 'date' }, 'NATIVE_WITH_TYPE'],
  ['set-without-items', { 'x-viewstem-type': 'set' }, 'SET_ITEMS_REQUIRED'],
  ['map-without-keys', { 'x-viewstem-type': 'map', values: true }, 'MAP_SCHEMAS_REQUIRED'],
  ['map-without-values', { 'x-viewstem-type': 'map', keys: true }, 'MAP_SCHEMAS_REQUIRED'],
  ['native-key-null', { 'x-viewstem-type': 'map', keys: null, values: true }, 'SCHEMA_OBJECT'],
  ['native-value-syntax', { 'x-viewstem-type': 'map', keys: true, values: { type: 'typo' } }, 'INVALID_SCHEMA'],
  ['map-fields-on-json', { keys: true }, 'MAP_FIELDS_WITHOUT_MAP'],
  ['external-ref', { $ref: 'https://example.invalid/schema' }, 'LOCAL_REF_REQUIRED'],
  ['root-ref', { $ref: '#' }, 'LOCAL_REF_REQUIRED'], ['null-ref', { $ref: null }, 'LOCAL_REF_REQUIRED'],
  ['absent-ref', { $ref: '#/$defs/missing' }, 'MISSING_REF'],
  ['prototype-ref', { $defs: {}, $ref: '#/$defs/constructor' }, 'MISSING_REF'],
  ['bad-escape', { $defs: { 'a~2': true }, $ref: '#/$defs/a~2' }, 'REF_ESCAPE'],
  ['bad-percent', { $ref: '#/$defs/%ZZ' }, 'REF_ENCODING'],
  ['self-cycle', { $defs: { a: { $ref: '#/$defs/a' } } }, 'CYCLIC_REF'],
  ['indirect-cycle', { $defs: { a: { $ref: '#/$defs/b' }, b: { $ref: '#/$defs/a' } } }, 'CYCLIC_REF'],
  ['properties-null', { properties: null }, 'SCHEMA_MAP'], ['defs-list', { $defs: [] }, 'SCHEMA_MAP'],
  ['anyOf-object', { anyOf: {} }, 'SCHEMA_LIST'], ['oneOf-empty', { oneOf: [] }, 'SCHEMA_LIST'],
  ['items-null', { items: null }, 'SCHEMA_OBJECT'], ['bad-min', { minItems: -1 }, 'INVALID_SCHEMA'],
  ['bad-type', { type: 'typo' }, 'INVALID_SCHEMA'], ['duplicate-required', { required: ['a', 'a'] }, 'INVALID_SCHEMA'],
  ['bad-regex', { pattern: '[' }, 'INVALID_PATTERN'],
];
for (const [id, schema, code] of invalid) await test(`reject/${id}`, () => assert.throws(() => register(schema), new RegExp(code)));
await test('pointer/uri-decoding-before-tokenization', () => assert.equal(resolveRef({ a: { b: true }, 'a/b': false }, '#/a%2Fb'), true));
await test('pointer/tilde-before-percent-key', () => assert.equal(resolveRef({ 'a/b': false }, '#/a~1b'), false));
await test('declaration-before-input', () => {
  let visited = false; const input = Object.defineProperty({}, 'x', { enumerable: true, get() { visited = true; throw Error('INPUT_TOUCHED'); } });
  assert.throws(() => compileSchema({ type: 'string', 'x-viewstem-type': 'time' }).accept(input), /NATIVE_WITH_TYPE/);
  assert.equal(visited, false);
});
