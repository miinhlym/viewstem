import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileCel, evaluateCel } from '../src/cel/index.mjs';
import { protect } from '../src/immutable.mjs';
import * as engine from '../vendor/cel-js/lib/index.js';
import { runCases } from './cel-engine-cases.mjs';
import { prepareCel } from '../scripts/prepare-cel.mjs';
const integer = { type: 'integer' }, number = { type: 'number' }, string = { type: 'string' }, boolean = { type: 'boolean' };
const array = items => ({ type: 'array', items });
const set = items => ({ 'x-viewstem-type': 'set', items });
const map = (keys, values) => ({ 'x-viewstem-type': 'map', keys, values });
const date = kind => ({ 'x-viewstem-type': kind });
const run = (source, inputs = {}, bindings = {}, output, extra = {}) => compileCel(source, { inputs, output, ...extra })(bindings);
const throwsCode = (callback, code) => assert.throws(callback, error => error.code === code);

test('vendored source rebuild verifies all 25 upstream/patched files and fixed patch', async () => {
  const result = await prepareCel();
  assert.equal(result.verifiedFiles, 25);
  assert.equal(result.patchSha256, '62dd517376de54a08018f6166b250d9013b907e87b11ab75d0f07e264de0da63');
});
test('candidate catalog is identical to audited baseline (larger than public profile)', async () => {
  const catalog = JSON.parse(await readFile(new URL('../vendor/upstream-function-catalog.json', import.meta.url), 'utf8'));
  const environment = new engine.Environment();
  assert.deepEqual(environment.getDefinitions().functions.map(row => row.signature), catalog.functionSignatures);
  assert.equal(environment.opts.enableOptionalTypes, false);
  const supported = JSON.parse(await readFile(new URL('../src/cel/supported-functions.json', import.meta.url), 'utf8'));
  assert.deepEqual(supported.upstream, catalog.functionSignatures.filter(signature => !signature.startsWith('type(') && !['bytes', 'uint', 'optional', 'OptionalNamespace', 'CelNamespace'].some(token => signature.includes(token))));
  assert.equal(supported.native.length, 19);
});
test('complete copied candidate regression suite executes against production vendor', async () => {
  const golden = JSON.parse(await readFile(new URL('./cel-golden.json', import.meta.url), 'utf8'));
  const results = await runCases(engine, golden);
  assert.equal(results.length, 216);
  assert.deepEqual(results.filter(row => !row.passed), []);
});
test('registration validates syntax, unknown names/functions and declared schemas', () => {
  assert.throws(() => compileCel('missing()'));
  assert.throws(() => compileCel('missing + 1'));
  assert.throws(() => compileCel('1 +'));
  assert.throws(() => compileCel('1', { output: null }));
  assert.throws(() => compileCel('x', { inputs: { x: { unknown: true } } }));
  assert.throws(() => compileCel('x + 1.0', { inputs: { x: integer } }));
  assert.throws(() => run('x', { x: integer }, { x: '1' }));
  throwsCode(() => run('x', { x: integer }, { x: 1, extra: 2 }), 'INVALID_DEFINITION');
});
test('integer and double remain distinct at nested inputs and outputs', () => {
  assert.equal(run('x + 1', { x: integer }, { x: 2 }, integer), 3);
  assert.equal(run('x + 1.0', { x: number }, { x: 2 }, number), 3);
  throwsCode(() => run('1', {}, {}, number), 'TYPE_MISMATCH');
  throwsCode(() => run('1.0', {}, {}, integer), 'TYPE_MISMATCH');
  assert.throws(() => run('9007199254740992', {}, {}, integer));
  const object = { type: 'object', properties: { count: integer, ratio: number }, required: ['count', 'ratio'], additionalProperties: false };
  assert.equal(run('x.count + 1', { x: object }, { x: { count: 3, ratio: 2 } }, integer), 4);
  assert.equal(run('x.ratio + 1.0', { x: object }, { x: { count: 3, ratio: 2 } }, number), 3);
  throwsCode(() => run('{"count": 1.0, "ratio": 2.0}', {}, {}, object), 'TYPE_MISMATCH');
  assert.deepEqual([...run('[1, 2]', {}, {}, array(integer))], [1, 2]);
  throwsCode(() => run('[1, 2.0]', {}, {}, array(integer)), 'TYPE_MISMATCH');
});
test('all admitted schema forms use shared projection rather than fixture rejection', () => {
  const schemas = [
    { $defs: { n: integer }, $ref: '#/$defs/n' },
    { allOf: [{ type: 'number' }, { type: 'integer', minimum: 1 }] },
    { anyOf: [integer, { type: 'null' }] },
    { oneOf: [integer, string] },
    { if: { type: 'integer' }, then: integer, else: string, type: ['integer', 'string'] },
    { type: 'integer', not: { const: 0 } },
  ];
  for (const schema of schemas) assert.equal(run('x + 1', { x: schema }, { x: 2 }, integer), 3);
  assert.equal(run('x', { x: true }, { x: 'free' }), 'free');
  assert.equal(run('x', { x: { const: 3 } }, { x: 3 }), 3);
  const tuple = { type: 'array', prefixItems: [integer, string], items: number };
  assert.equal(run('xs[0] + 1', { xs: tuple }, { xs: [3, 'a', 2] }, integer), 4);
  const open = { type: 'object', properties: { count: integer }, additionalProperties: number };
  assert.equal(run('o.extra + 1.0', { o: open }, { o: { count: 1, extra: 2 } }, number), 3);
});
test('native Set identity, nested arrays/objects and read protection', () => {
  const schema = set(array(integer));
  const source = protect(new Set([[1, 2]])), member = [...source][0];
  assert.equal(run('setHas(s, item)', { s: schema, item: array(integer) }, { s: source, item: member }, boolean), true);
  assert.equal(run('setHas(s, item)', { s: schema, item: array(integer) }, { s: source, item: [1, 2] }, boolean), false);
  assert.equal(run('setHas(s, [1, 2])', { s: schema }, { s: source }, boolean), false);
  const object = { type: 'object', properties: { n: integer }, additionalProperties: false };
  const objects = protect(new Set([{ n: 1 }])), item = [...objects][0];
  assert.equal(run('setHas(s, o)', { s: set(object), o: object }, { s: objects, o: item }, boolean), true);
  assert.equal(run('a == b', { a: set(integer), b: set(integer) }, { a: new Set([1, 2]), b: new Set([2, 1]) }, boolean), true);
  assert.equal(run('a != b', { a: set(integer), b: set(integer) }, { a: new Set([1]), b: new Set([2]) }, boolean), true);
  assert.equal(run('setSize(s)', { s: schema }, { s: source }, integer), 1);
  const output = run('s', { s: schema }, { s: source }, schema);
  throwsCode(() => output.add([3]), 'READ_ONLY');
  assert.throws(() => [...output][0].push(3));
});
test('native Map preserves fractional keys, missing/null and nested numeric schemas', () => {
  const schema = map({ type: ['string', 'number'] }, { anyOf: [integer, { type: 'null' }] });
  const source = new Map([[1.5, 2], ['nil', null]]);
  assert.equal(run('mapGet(m, 1.5) + 1', { m: schema }, { m: source }, integer), 3);
  assert.equal(run('mapHas(m, "nil")', { m: schema }, { m: source }, boolean), true);
  assert.equal(run('mapGet(m, "nil")', { m: schema }, { m: source }, { type: 'null' }), null);
  throwsCode(() => run('mapGet(m, "missing")', { m: schema }, { m: source }), 'REFERENCE_NOT_FOUND');
  assert.equal(run('mapSame(a, b)', { a: schema, b: schema }, { a: source, b: new Map([...source].reverse()) }, boolean), true);
  assert.equal(run('a == b', { a: schema, b: schema }, { a: source, b: new Map([...source].reverse()) }, boolean), true);
  assert.equal(run('mapSize(m)', { m: schema }, { m: source }, integer), 2);
  const output = run('m', { m: schema }, { m: source }, schema);
  assert.equal(output.get(1.5), 2);
  throwsCode(() => output.set('x', 4), 'READ_ONLY');
});
test('dates are explicit strings, opaque in CEL, normalized at admission', () => {
  assert.equal(run('dateText(d)', { d: date('datetime') }, { d: '2026-10-29T09:30:00+09:00' }, string), '2026-10-29T00:30:00.000Z');
  assert.equal(run('dateKind(d)', { d: date('date') }, { d: '2026-10-29' }, string), 'date');
  assert.equal(run('d', { d: date('time') }, { d: '09:30' }, date('time')), '09:30:00.000');
  assert.equal(run('s', { s: string }, { s: '2026-10-29T09:30:00+09:00' }, string), '2026-10-29T09:30:00+09:00');
  assert.throws(() => run('dateText(s)', { s: string }, { s: '2026-10-29' }));
  assert.throws(() => run('d', { d: date('datetime') }, { d: new Date() }));
  assert.throws(() => run('timestamp("2026-10-29T00:00:00Z")'));
  assert.throws(() => run('dateText(d)', { d: date('date') }, { d: '2026-02-30' }));
});
test('explicit calendar functions enforce integer additions and timezone/DST boundaries', () => {
  assert.equal(run('addDate("2026-10-29", 1)', {}, {}, date('date')), '2026-10-30');
  assert.equal(run('parseYY("68")', {}, {}, integer), 2068);
  assert.equal(run('parseYY("69")', {}, {}, integer), 1969);
  assert.equal(run('atLocal("2026-10-29", "09:30", "Asia/Seoul")', {}, {}, date('datetime')), '2026-10-29T00:30:00.000Z');
  assert.throws(() => compileCel('addDate("2026-10-29", 1.5)'));
  assert.throws(() => run('atLocal("2026-11-01", "01:30", "America/New_York")'));
  assert.throws(() => run('atLocal("2026-03-08", "02:30", "America/New_York")'));
  assert.throws(() => run('localDate(0, "invalid/zone")'));
  assert.equal(run('startOfDay("2026-03-08", "America/New_York")', {}, {}, date('datetime')), '2026-03-08T05:00:00.000Z');
  assert.equal(run('nextDayStart("2026-03-08", "America/New_York")', {}, {}, date('datetime')), '2026-03-09T04:00:00.000Z');
});
test('trusted pure functions validate arguments/results and reject async', () => {
  const functions = [{ name: 'twice', inputs: [integer], output: integer, run: value => value * 2 }];
  assert.equal(run('twice(x)', { x: integer }, { x: 3 }, integer, { functions }), 6);
  assert.throws(() => compileCel('twice(1.0)', { functions }));
  const invalid = [{ name: 'bad', inputs: [], output: integer, run: () => 'bad' }];
  assert.throws(() => run('bad() == 1 || true', {}, {}, boolean, { functions: invalid }));
  const async = [{ name: 'later', inputs: [], output: boolean, run: async () => true }];
  throwsCode(() => run('later() || true', {}, {}, boolean, { functions: async }), 'ASYNC_CEL_FUNCTION');
});
test('size, cost, expression, input/output and depth controls survive error masking', () => {
  const evaluate = compileCel('xs.all(x, x > 0) || true', { inputs: { xs: array(integer) }, output: boolean, cost: 30 });
  throwsCode(() => evaluate({ xs: Array(100).fill(1) }), 'LIMIT_EXCEEDED');
  const fresh = compileCel('1 + 2', { cost: 5 });
  assert.equal(fresh({}), 3); assert.equal(fresh({}), 3);
  throwsCode(() => compileCel('true', { limits: { expressionChars: 3 } }), 'LIMIT_EXCEEDED');
  throwsCode(() => run('x', { x: string }, { x: '😀😀' }, string, { limits: { valueBytes: 7 } }), 'LIMIT_EXCEEDED');
  throwsCode(() => run('x', { x: array(integer) }, { x: [1, 2, 3] }, undefined, { limits: { inputNodes: 3 } }), 'LIMIT_EXCEEDED');
  throwsCode(() => run('[1, 2, 3]', {}, {}, undefined, { limits: { outputNodes: 3 } }), 'LIMIT_EXCEEDED');
  throwsCode(() => run('x', { x: true }, { x: [[[1]]] }, undefined, { limits: { depth: 2 } }), 'LIMIT_EXCEEDED');
  throwsCode(() => compileCel('true', { limits: { unknown: 1 } }), 'INVALID_LIMIT');
  throwsCode(() => compileCel('true', { cost: 0 }), 'INVALID_LIMIT');
  const producer = [{ name: 'large', inputs: [], output: string, run: () => 'x'.repeat(100) }];
  throwsCode(() => run('large() == "" || true', {}, {}, boolean, { functions: producer, limits: { valueBytes: 20 } }), 'LIMIT_EXCEEDED');
});
test('RE2 matches and bounded unsupported language surface', () => {
  assert.equal(run('matches(s, "a+$")', { s: string }, { s: `${'a'.repeat(50)}!` }, boolean), false);
  assert.equal(run('"😀".matches(".")', {}, {}, boolean), true);
  assert.throws(() => run('"aa".matches("(a)\\\\1")'));
  assert.throws(() => run('"a".matches("(?=a)")'));
  for (const expression of ['bytes("x")', 'b"x"', '1u', 'uint(1)', 'type(1)', 'int == int', 'optional.of(1)', 'cel.bind(x, 1, x)', 'true || bytes("x").size() == 1']) {
    assert.throws(() => compileCel(expression), expression);
  }
  assert.equal(evaluateCel('size(xs)', { xs: [1, 2] }, { inputs: { xs: array(integer) }, output: integer }), 2);
});

test('global and receiver function caches never share incompatible calling conventions', () => {
  for (const [global, receiver, expected] of [
    ['matches("abc", "b")', '"abc".matches("b")', true],
    ['size("abc")', '"abc".size()', 3],
    ['size([1,2])', '[1,2].size()', 2],
  ]) {
    for (const expressions of [[global, receiver, global], [receiver, global, receiver]]) {
      for (const expression of expressions) assert.equal(run(expression), expected);
    }
  }
});
test('opaque payloads stay private and declared output checks nested native boundaries', () => {
  const source = new Set([1]);
  assert.throws(() => run('s.raw', { s: set(integer) }, { s: source }));
  assert.throws(() => run('s.value', { s: set(integer) }, { s: source }));
  const schema = { type: 'object', properties: { data: set(integer) }, required: ['data'], additionalProperties: false };
  const value = run('{"data": s}', { s: set(integer) }, { s: source }, schema);
  assert.equal(value.data.has(1), true);
  assert.throws(() => value.data.add(2));
  const dateRef = { $defs: { d: date('date') }, $ref: '#/$defs/d' };
  assert.equal(run('dateText(d)', { d: dateRef }, { d: '2026-10-29' }, string), '2026-10-29');
  assert.equal(run('timestamp("0099-01-01T00:00:00Z").getFullYear("UTC")', {}, {}, integer), 99);
  assert.equal(run('duration("-1.001s").getMilliseconds()', {}, {}, integer), -1);
});
test('native Map int/double/string overloads retain key distinctions and safe-int conversion', () => {
  const schema = map({ type: ['string', 'number'] }, integer), source = new Map([[1, 10], [1.5, 15], ['1', 20], [Number.MAX_SAFE_INTEGER, 30], [9007199254740992, 40]]);
  for (const [expression, expected] of [['mapGet(m, 1)', 10], ['mapHas(m, 1)', true], ['mapGet(m, 1.5)', 15], ['mapHas(m, 1.5)', true], ['mapGet(m, "1")', 20], ['mapHas(m, "1")', true], ['mapHas(m, 2)', false], ['mapGet(m, 9007199254740991)', 30], ['mapGet(m, 9007199254740992.0)', 40]]) assert.equal(run(expression, { m: schema }, { m: source }), expected);
  assert.throws(() => run('mapGet(m, 9007199254740992)', { m: schema }, { m: source }));
  throwsCode(() => run('mapGet(m, 2)', { m: schema }, { m: source }), 'REFERENCE_NOT_FOUND');
  assert.equal(run('setSame(a, b)', { a: set(integer), b: set(integer) }, { a: new Set([1, 2]), b: new Set([2, 1]) }), true);
  assert.equal(run('a == b', { a: date('date'), b: date('date') }, { a: '2026-10-29', b: '2026-10-29' }), true);
});
