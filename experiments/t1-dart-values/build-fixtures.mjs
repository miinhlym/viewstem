// Hand-authored golden expectations. Tags construct host values for this test only.
import { writeFile } from 'node:fs/promises';
const rows = [], i = { type: 'integer' }, n = { type: 'number' }, s = { type: 'string' };
const obj = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const arr = items => ({ type: 'array', items });
const set = items => ({ 'x-viewstem-type': 'set', items });
const map = values => ({ 'x-viewstem-type': 'map', keys: { type: ['string', 'number'] }, values });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const tag = (kind, extra = {}) => ({ $fixture: kind, ...extra });
const st = values => tag('set', { values }), mp = entries => tag('map', { entries });
const error = category => ({ status: 'error', category });
function accept(id, schema, input, expected) { rows.push({ id, op: 'accept', schema, input, expected: { status: 'ready', value: expected } }); }
function reject(id, schema, input, category) { rows.push({ id, op: 'accept', schema, input, expected: error(category) }); }
accept('D01/null-explicit', nullable(s), null, null);
for (const [label, schema, input] of [['zero', i, 0], ['false', { type: 'boolean' }, false], ['empty', s, '']]) accept(`D02/falsy-${label}`, schema, input, input);
reject('D03/undefined-top', true, tag('undefined'), 'UNSUPPORTED_VALUE');
accept('D04/object-undefined-omitted', obj({ n: i }), { n: tag('undefined') }, {});
reject('D05/required-undefined-omitted', obj({ n: i }, ['n']), { n: tag('undefined') }, 'TYPE_MISMATCH');
accept('D06/nested-undefined-object-retained', obj({ profile: obj({ n: i }) }), { profile: { n: tag('undefined') } }, { profile: {} });
accept('D07/array-object-undefined', arr(obj({ n: i })), [{ n: tag('undefined') }], [{}]);
reject('D08/array-undefined', arr(nullable(i)), [1, tag('undefined'), 3], 'UNSUPPORTED_VALUE');
reject('D09/array-hole', arr(nullable(i)), [1, tag('hole'), 3], 'UNSUPPORTED_VALUE');
accept('D10/array-null-position', arr(nullable(i)), [1, null, 3], [1, null, 3]);
reject('D11/Set-undefined', set(nullable(i)), st([1, tag('undefined')]), 'UNSUPPORTED_VALUE');
accept('D12/Set-null', set(nullable(i)), st([null]), { $set: [null] });
accept('D13/Set-separate-normalized-objects', set(obj({ n: i })), st([{}, { n: tag('undefined') }]), { $set: [{}, {}] });
accept('D14/Set-repeated-reference', set(obj({ n: i })), st([tag('object', { id: 'a', value: { n: 1 } }), tag('ref', { id: 'a' })]), { $set: [{ n: 1 }] });
reject('D15/Map-undefined-value', map(nullable(i)), mp([['a', tag('undefined')]]), 'UNSUPPORTED_VALUE');
accept('D16/Map-null-value', map(nullable(i)), mp([['a', null]]), { $map: [['a', null]] });
accept('D17/Map-object-normalized', map(obj({ n: i })), mp([['a', { n: tag('undefined') }]]), { $map: [['a', {}]] });
accept('D18/Map-string-number-fraction', map(s), mp([[1, 'number'], ['1', 'string'], [1.5, 'fraction']]), { $map: [[1, 'number'], ['1', 'string'], [1.5, 'fraction']] });
for (const key of [null, true, {}, tag('undefined')]) reject(`D19/Map-invalid-key-${rows.length}`, map(i), mp([[key, 1]]), 'MAP_KEY');
for (const input of [-9007199254740991, 9007199254740991]) accept(`D20/safe-integer-${input}`, i, input, input);
for (const input of [-9007199254740992, 9007199254740992, 1.5, '42']) reject(`D21/invalid-integer-${input}`, i, input, 'TYPE_MISMATCH');
accept('D22/number-large-finite', n, 1e100, 1e100);
accept('D23/number-binary64', n, tag('sum', { a: 0.1, b: 0.2 }), 0.30000000000000004);
for (const kind of ['nan', 'infinity', 'negativeInfinity']) {
  reject(`D24/nonfinite-${kind}`, n, tag(kind), 'NON_FINITE');
  reject(`D25/nested-nonfinite-${kind}`, map(n), mp([['n', tag(kind)]]), 'NON_FINITE');
}
accept('D26/negative-zero', n, tag('negativeZero'), 0);
accept('D27/native-zero-merging', map(s), mp([[tag('negativeZero'), 'numeric'], ['-0', 'string'], [0, 'replaced']]), { $map: [[0, 'replaced'], ['-0', 'string']] });
for (const kind of ['bigint', 'function', 'future', 'dateObject', 'symbol']) reject(`D28/unsupported-${kind}`, true, tag(kind), 'UNSUPPORTED_VALUE');
for (const kind of ['object', 'array', 'set', 'map']) reject(`D29/cycle-${kind}`, true, tag('cycle', { kind }), 'CYCLIC_VALUE');
for (const [kind, input, expected] of [['date', '2026-10-29', '2026-10-29'], ['time', '09:30', '09:30:00.000'], ['time', '09:30:01.1', '09:30:01.100'], ['datetime', '2026-10-29T09:30:00+09:00', '2026-10-29T00:30:00.000Z'], ['datetime', '0099-01-01T01:00:00+01:00', '0099-01-01T00:00:00.000Z'], ['datetime', '0001-01-01T00:00:00.001Z', '0001-01-01T00:00:00.001Z'], ['date', '2000-02-29', '2000-02-29']]) accept(`D30/date-valid-${rows.length}`, { 'x-viewstem-type': kind }, input, expected);
for (const [kind, input] of [['date', '2026-02-30'], ['date', '1900-02-29'], ['date', '0000-01-01'], ['time', '24:00'], ['time', '09:30:00.0001'], ['datetime', '2026-10-29T09:30:00'], ['datetime', '2026-10-29T09:30:60Z'], ['datetime', '2026-10-29T09:30:00-00:00'], ['datetime', '2026-10-29T09:30:00+24:00'], ['datetime', '0001-01-01T00:00:00+00:01'], ['datetime', '9999-12-31T23:59:59-00:01']]) reject(`D31/date-invalid-${rows.length}`, { 'x-viewstem-type': kind }, input, 'DATE_INVALID');
accept('D32/ordinary-string-not-date', s, '2026-02-30T09:30:00', '2026-02-30T09:30:00');
accept('D33/nullable-date-null', nullable({ 'x-viewstem-type': 'date' }), null, null);
for (const [id, op, expected, extra] of [
  ['D34/native-collection-equality', 'nativeEquality', { setObjects: 2, sameReference: true, sameContent: false, mapKeys: 3 }, {}],
  ['D35/stored-Set-membership', 'setIdentity', { size: 2, sameReference: true, sameContent: false, reorderedEqual: true }, {}],
  ['D36/Map-order-null-absence', 'mapIdentity', { reorderedEqual: true, hasNull: true, nullValue: null, hasAbsent: false }, {}],
  ['D37/snapshot-readonly-source-stable', 'readonly', { sourceMutable: true, sourceIsolated: true, blockedMutations: 8, stableRead: true, oldSnapshotStable: true }, {}],
  ['D38/negative-zero-normalized-deep', 'zero', { negativeZero: false, setSize: 1, mapSize: 2 }, {}],
  ['D39/missing-read', 'readiness', { status: 'missing', simple: 'missing' }, { state: 'missing' }],
  ['D40/pending-read', 'readiness', { status: 'pending', simpleError: 'VALUE_PENDING' }, { state: 'pending' }],
  ['D41/error-read', 'readiness', { status: 'error', simpleError: 'TIMEOUT' }, { state: 'error' }],
  ['D42/null-ready', 'readiness', { status: 'ready', value: null, simple: null }, { state: 'ready', value: null }],
  ['D43/required-missing-auto', 'prepare', { status: 'waiting' }, { state: 'missing', mode: 'automatic' }],
  ['D44/required-pending-explicit', 'prepare', error('INPUT_NOT_READY'), { state: 'pending', mode: 'explicit' }],
  ['D45/error-propagated', 'prepare', error('TIMEOUT'), { state: 'error', mode: 'automatic' }],
  ['D46/async-result-is-not-data-Future', 'asyncResult', { status: 'ready', value: 3 }, { input: 3, schema: i }],
  ['D47/integer-adapter-result', 'intResult', { status: 'ready', value: 3 }, { input: 2 }],
  ['D48/integer-adapter-result-range', 'intResult', error('TYPE_MISMATCH'), { input: 9007199254740991 }],
  ['D49/typed-native-roundtrip', 'adapterRoundtrip', { status: 'ready', value: { $map: [[1.5, 'fraction'], ['1.5', 'text']] } }, { schema: map(s), input: mp([[1.5, 'fraction'], ['1.5', 'text']]) }],
]) rows.push({ id, op, ...extra, expected });
for (const [input, expected] of [['00', 2000], ['68', 2068], ['69', 1969], ['99', 1999]]) rows.push({ id: `D50/YY-${input}`, op: 'yy', input, expected });
for (const [id, date, time, zone, value] of [['seoul', '2026-10-29', '09:30', 'Asia/Seoul', '2026-10-29T00:30:00.000Z'], ['ny-valid', '2026-03-08', '03:30', 'America/New_York', '2026-03-08T07:30:00.000Z'], ['ny-gap', '2026-03-08', '02:30', 'America/New_York', null], ['ny-overlap', '2026-11-01', '01:30', 'America/New_York', null], ['bad-zone', '2026-10-29', '09:30', 'Not/AZone', null], ['year-underflow', '0001-01-01', '00:00', 'Asia/Seoul', null]]) rows.push({ id: `D51/timezone-${id}`, op: 'timezone', date, time, zone, expected: value === null ? error('DATE_INVALID') : { status: 'ready', value } });
for (const [kind, itemSchema, input, canonical] of [
  ['array', arr(i), [1, 2], [1, 2]],
  ['object-array', obj({ a: arr(i) }), { a: [1, 2] }, { a: [1, 2] }],
  ['object-datetime', obj({ a: { 'x-viewstem-type': 'datetime' } }), { a: '2026-10-29T09:30:00+09:00' }, { a: '2026-10-29T00:30:00.000Z' }],
  ['object-time', obj({ a: { 'x-viewstem-type': 'time' } }), { a: '09:30' }, { a: '09:30:00.000' }],
  ['object-date', obj({ a: { 'x-viewstem-type': 'date' } }), { a: '2026-10-29' }, { a: '2026-10-29' }],
]) rows.push({ id: `D52/stored-Set-reinput-${kind}`, op: 'setElementReinput', kind, schema: set(itemSchema), input: st([input, structuredClone(input)]), expected: { size: 2, sameMember: true, keptSnapshot: true, equal: true, newSetHasOldMember: true, readonly: true, sourceIsolated: true, canonical } });
const additionalInteger = { type: 'object', properties: { name: s }, additionalProperties: i };
accept('D53/additionalProperties-integer-valid', additionalInteger, { name: 'kept', extra: 3 }, { name: 'kept', extra: 3 });
reject('D53/additionalProperties-integer-invalid', additionalInteger, { name: 'kept', bad: 'text' }, 'TYPE_MISMATCH');
const nestedAdditional = { type: 'object', additionalProperties: { type: 'object', additionalProperties: arr(i) } };
accept('D54/additionalProperties-nested-valid', nestedAdditional, { outer: { rows: [1, 2] } }, { outer: { rows: [1, 2] } });
reject('D54/additionalProperties-nested-invalid', nestedAdditional, { outer: { rows: [1, 'text'] } }, 'TYPE_MISMATCH');
const additionalDate = { type: 'object', additionalProperties: { 'x-viewstem-type': 'datetime' } };
accept('D55/additionalProperties-date-normalization', additionalDate, { instant: '2026-10-29T09:30:00+09:00' }, { instant: '2026-10-29T00:30:00.000Z' });
reject('D55/additionalProperties-date-invalid', additionalDate, { instant: '2026-02-30T09:30:00Z' }, 'DATE_INVALID');
accept('D56/additionalProperties-true', { type: 'object', additionalProperties: true }, { free: [1, 'text'] }, { free: [1, 'text'] });
reject('D56/additionalProperties-false', { type: 'object', properties: { name: s }, additionalProperties: false }, { name: 'kept', extra: 1 }, 'TYPE_MISMATCH');
rows.push({ id: 'D57/native-adapter-array-membership', op: 'adapterSetArrayMember', expected: { sameStored: true, newEqualContent: false, nativeReturnOrigin: true, readonly: true } });
await writeFile(new URL('fixtures.json', import.meta.url), JSON.stringify({ format: 'private-host-fixture-v1-not-production-wire', cases: rows }, null, 2) + '\n');
console.log(JSON.stringify({ cases: rows.length }));
