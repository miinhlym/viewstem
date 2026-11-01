import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, evaluateSnapshot, validateInitials } from '../src/expressions.mjs';
import { normalizeDate, localInstant, encodeBoundary } from '../src/values.mjs';
import { compileSchema } from '../src/schema.mjs';
import { createStateStore } from '../src/state.mjs';
import { compileCel } from '../src/cel/index.mjs';
import { addDate, parseYY } from '../src/cel/calendar.mjs';
const path = value => ({ '@path': value }), format = value => ({ '@call': 'formatString', args: { value } });
const plain = value => JSON.parse(JSON.stringify(value));

test('V02 ordinary path/call data, escaped operator keys and native data retain literal meaning', () => {
  const context = { ports: { name: 'data', returned: { '@call': 'notRegistered', args: {} } } };
  assert.deepEqual(plain(evaluate({ path: '/ports/name', call: 'anything' }, context)), { path: '/ports/name', call: 'anything' });
  assert.deepEqual(plain(evaluate({ '@@path': '/ports/name' }, context)), { '@path': '/ports/name' });
  assert.deepEqual(plain(evaluate({ '@@call': 'concat', args: { '@@path': 'literal' } }, context)), { '@call': 'concat', args: { '@path': 'literal' } });
  const native = new Set([{ '@path': '/ports/name' }]); assert.equal(evaluate(native, context), native);
});
test('V03 direct path preserves scalar/object types; interpolation produces only permitted strings', () => {
  const object = { n: 1 }, context = { ports: { n: 3, flag: false, nil: null, object } };
  assert.equal(evaluate(path('/ports/n'), context), 3); assert.equal(evaluate(path('/ports/flag'), context), false); assert.equal(evaluate(path('/ports/object'), context), object);
  assert.equal(evaluate(format('n=${/ports/n}; flag=${/ports/flag}; nil=${/ports/nil}; $$'), context), 'n=3; flag=false; nil=null; $');
  assert.throws(() => evaluate(format('${/ports/object}'), context), { code: 'TYPE_MISMATCH' });
});
test('V04 common evaluator enforces root-specific context, JSON Pointer and exact array positions', () => {
  for (const root of ['ports', 'states', 'queries', 'repeat', 'actions', 'event', 'steps', 'sources']) {
    assert.equal(evaluate(path(`/${root}/n`), { [root]: { n: 7 } }, { roots: [root] }), 7);
    assert.throws(() => evaluate(path(`/${root}/n`), { [root]: { n: 7 } }, { roots: [] }), { code: 'REFERENCE_NOT_FOUND' });
  }
  const values = [1, 2]; values.extra = 3;
  const context = { ports: { values, object: { length: 4, '01': 5, 'a/b~c': 6 } } };
  assert.equal(evaluate(path('/ports/values/0'), context), 1); assert.equal(evaluate(path('/ports/object/a~1b~0c'), context), 6);
  assert.equal(evaluate(path('/ports/object/length'), context), 4); assert.equal(evaluate(path('/ports/object/01'), context), 5);
  for (const key of ['length', '01', '-1', '1.5', 'extra', '2']) assert.throws(() => evaluate(path(`/ports/values/${key}`), context), { code: 'REFERENCE_NOT_FOUND' });
  assert.throws(() => evaluate(path('/ports/object/constructor'), context), { code: 'INPUT_NOT_READY' });
  assert.throws(() => evaluate(path('/ports/missing'), context), { code: 'REFERENCE_NOT_FOUND' });
  assert.throws(() => evaluate(path('/ports/object/a~2'), context), { code: 'INVALID_EXPRESSION' });
  for (const value of [null, 3, new Set([1]), new Map([['key', 1]])]) assert.throws(() => evaluate(path('/ports/value/key'), { ports: { value } }), { code: 'TYPE_MISMATCH' });
});
test('K07 returned data and unescaped result are never reexecuted; mixed operator syntax fails', () => {
  const returned = { '@call': 'private', args: { value: 'secret' } }, context = { ports: { returned } };
  assert.equal(evaluate(path('/ports/returned'), context), returned);
  assert.deepEqual(plain(evaluate({ '@@path': '/ports/returned' }, context)), { '@path': '/ports/returned' });
  assert.throws(() => evaluate({ '@path': '/ports/returned', extra: 1 }, context), { code: 'INVALID_EXPRESSION' });
  assert.throws(() => evaluate({ '@path': '/ports/returned', '@call': 'concat', args: [] }, context), { code: 'INVALID_EXPRESSION' });
  assert.equal(evaluateSnapshot(path('/ports/defined/missing'), { ports: { defined: {} } }).status, 'missing');
});
test('C10 initial dependency order rejects undeclared targets and cycles before execution', () => {
  assert.deepEqual(validateInitials({ states: { b: { initial: path('/states/a') }, a: { initial: 1 } } }), ['a', 'b']);
  assert.throws(() => validateInitials({ states: { b: { initial: path('/states/absent') } } }), { code: 'REFERENCE_NOT_FOUND' });
  assert.throws(() => validateInitials({ states: { a: { initial: path('/states/b') }, b: { initial: path('/states/a') } } }), { code: 'INVALID_DEFINITION' });
});
test('V10/V12/K30 date/time/datetime normalize explicit values and validate complete boundaries', () => {
  for (const [kind, input, expected] of [
    ['date', '2026-10-29', '2026-10-29'], ['date', '2024-02-29', '2024-02-29'],
    ['date', '0001-01-01', '0001-01-01'], ['date', '9999-12-31', '9999-12-31'],
    ['time', '09:30', '09:30:00.000'], ['time', '09:30:01.1', '09:30:01.100'], ['time', '23:59:59.999', '23:59:59.999'],
    ['datetime', '2026-10-29T09:30:00+09:00', '2026-10-29T00:30:00.000Z'], ['datetime', '0001-01-01T00:00:00Z', '0001-01-01T00:00:00.000Z'], ['datetime', '9999-12-31T23:59:59.999Z', '9999-12-31T23:59:59.999Z'],
  ]) {
    assert.equal(normalizeDate(input, kind), expected);
    assert.equal(compileSchema({ 'x-viewstem-type': kind }).accept(input), expected);
    assert.equal(compileSchema({ 'x-viewstem-type': kind }).accept(JSON.parse(JSON.stringify(expected))), expected);
  }
  for (const [kind, value] of [['date', '2026-02-29'], ['date', '2026-04-31'], ['date', '0000-01-01'], ['date', '10000-01-01'], ['time', '24:00'], ['time', '09:30:00.1234'], ['time', '09:30Z'], ['datetime', '2026-02-30T00:00:00Z'], ['datetime', '2026-10-29T09:30:00'], ['datetime', '2026-10-29T09:30:00-00:00'], ['datetime', '2026-10-29T09:30:60Z'], ['datetime', '2026-10-29T09:30:00.1234Z'], ['datetime', '0001-01-01T00:00:00+01:00'], ['datetime', '9999-12-31T23:59:59-01:00']]) assert.throws(() => normalizeDate(value, kind));
  for (const value of [new Date(), 0, null]) assert.throws(() => compileSchema({ 'x-viewstem-type': 'datetime' }).accept(value));
});
test('V10/V11 integer date addition rejects rounding and preserves YY 00/68/69/99 pivot', () => {
  for (const delta of [0.1, 1.5, -1.5, NaN, Infinity, '1']) assert.throws(() => addDate('2026-10-30', delta));
  assert.equal(addDate('2024-02-28', 1n), '2024-02-29'); assert.equal(addDate('2024-02-29', 1n), '2024-03-01'); assert.equal(addDate('2026-01-01', -1n), '2025-12-31');
  assert.throws(() => addDate('9999-12-31', 1n)); assert.throws(() => addDate('0001-01-01', -1n));
  for (const [value, year] of [['00', 2000n], ['68', 2068n], ['69', 1969n], ['99', 1999n]]) assert.equal(parseYY(value), year);
  for (const value of ['0', '100', ' 68', '68 ', 'ab', '６８']) assert.throws(() => parseYY(value));
});
test('K31/K35 declared-date constraints run after normalization and ordinary strings stay raw', () => {
  const input = '2026-10-29T09:30:00+09:00', canonical = '2026-10-29T00:30:00.000Z', schema = { 'x-viewstem-type': 'datetime' };
  assert.equal(compileSchema({ ...schema, const: canonical, minLength: 24, maxLength: 24, pattern: 'Z$' }).accept(input), canonical);
  for (const extra of [{ const: input }, { enum: [input] }, { maxLength: 23 }, { pattern: '\\+09:00$' }]) assert.throws(() => compileSchema({ ...schema, ...extra }).accept(input));
  assert.equal(compileSchema({ type: 'string' }).accept('2026-02-30'), '2026-02-30'); assert.equal(compileSchema({ type: 'string' }).accept(input), input);
  assert.throws(() => compileSchema({ type: 'string', format: 'date' }), /UNSUPPORTED_KEYWORD/);
  assert.equal(compileSchema({ anyOf: [schema, { type: 'null' }] }).accept(null), null);
  assert.throws(() => compileSchema({ anyOf: [schema, { type: 'string' }] }), /AMBIGUOUS_DATE_NORMALIZATION/);
});
test('K32 same instant has stable snapshot; service collection codec preserves strings and numeric keys', () => {
  const store = createStateStore(), scope = store.createScope();
  for (const [kind, initial, equivalent] of [['date', '2026-10-29', '2026-10-29'], ['time', '09:30', '09:30:00.000'], ['datetime', '2026-10-29T09:30:00+09:00', '2026-10-29T00:30:00.000Z']]) {
    const value = scope.registerState(kind, { schema: { 'x-viewstem-type': kind }, initial }), before = value.snapshot(); let count = 0;
    store.subscribe(value.address, () => count++); value.write(equivalent); assert.equal(value.snapshot(), before); assert.equal(count, 1);
  }
  assert.deepEqual(encodeBoundary({ set: new Set(['2026-10-29']), map: new Map([[1.5, '09:30:00.000']]) }), { set: ['2026-10-29'], map: [[1.5, '09:30:00.000']] });
});
test('K33/K34 explicit zone conversion rejects DST ambiguity; calendar next-day spans 23/25 hours', () => {
  assert.equal(localInstant('2026-10-29', '09:30', 'Asia/Seoul'), '2026-10-29T00:30:00.000Z');
  const originalZone = process.env.TZ;
  try {
    for (const ambient of ['UTC', 'America/Los_Angeles', 'Asia/Seoul']) {
      process.env.TZ = ambient; assert.equal(localInstant('2026-10-29', '09:30', 'Asia/Seoul'), '2026-10-29T00:30:00.000Z');
    }
  } finally { if (originalZone === undefined) delete process.env.TZ; else process.env.TZ = originalZone; }
  for (const zone of [undefined, '', 'Invalid/Zone', '+09:00']) assert.throws(() => localInstant('2026-10-29', '09:30', zone));
  for (const [day, time] of [['2026-03-08', '02:30'], ['2026-11-01', '01:30']]) assert.throws(() => localInstant(day, time, 'America/New_York'));
  const first = compileCel('startOfDay(day, zone)', { inputs: { day: { type: 'string' }, zone: { type: 'string' } } }), next = compileCel('nextDayStart(day, zone)', { inputs: { day: { type: 'string' }, zone: { type: 'string' } } });
  for (const [day, hours] of [['2026-03-08', 23], ['2026-11-01', 25], ['2026-10-30', 24]]) {
    const inputs = { day, zone: 'America/New_York' }; assert.equal((Date.parse(next(inputs)) - Date.parse(first(inputs))) / 3600000, hours);
  }
});
