import { createTypedAdapter } from './adapter.mjs';
import { StateProbe } from '../t3-state/state-probe.mjs';
const integer = { type: 'integer' }, number = { type: 'number' }, string = { type: 'string' }, boolean = { type: 'boolean' };
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const object = properties => ({ type: 'object', properties, additionalProperties: false });
const set = items => ({ 'x-viewstem-type': 'set', items });
const map = values => ({ 'x-viewstem-type': 'map', keys: { type: ['number', 'string'] }, values });
const array = items => ({ type: 'array', items });
const assert = (condition, message = 'ASSERTION_FAILED') => { if (!condition) throw Error(message); };
const same = (a, b) => assert(Object.is(a, b), 'Values/references differ');
function rejects(run, pattern) {
  try { run(); } catch (error) { if (pattern) assert(pattern.test(String(error.code ?? error.message)), `Unexpected error: ${error.code ?? error.message}`); return; }
  throw Error('EXPECTED_REJECTION');
}
const stored = (schema, initial) => { const store = new StateProbe(), scope = store.scope(); return { store, scope, cell: scope.register('value', { schema, initial }) }; };

export async function runCases(Environment) {
  const results = [], test = async (id, run) => {
    try { await run(); results.push({ id, passed: true }); }
    catch (error) { results.push({ id, passed: false, error: { name: error.name, message: error.message, stack: error.stack } }); }
  };
  const adapter = (inputs, output, extra = {}) => createTypedAdapter(Environment, { inputs, output, ...extra });
  const evaluate = (expression, inputs, bindings, output, extra) => adapter(inputs, output, extra).compile(expression)(bindings);

  await test('N01/Set-stored-object-identity-survives-adapter', () => {
    const item = object({ n: integer }), { cell } = stored(set(item), new Set([{ n: 1 }, { n: 1 }]));
    const member = [...cell.read()][0], run = adapter({ s: set(item), member: item }, boolean).compile('probeSetHas(s,member)');
    same(run({ s: cell.read(), member }), true); same(run({ s: cell.read(), member: { n: 1 } }), false);
    same(evaluate('probeSetSize(s)', { s: set(item) }, { s: cell.read() }, integer), 2);
    same(cell.read().has(member), true); same(cell.read().has({ n: 1 }), false);
  });
  await test('N02/Set-order-ignored-separate-object-members-kept', () => {
    const item = object({ n: integer }), { cell } = stored(set(item), new Set([{ n: 1 }, { n: 1 }])), members = [...cell.read()];
    const run = adapter({ a: set(item), b: set(item) }, boolean).compile('probeSetSame(a,b)');
    const before = cell.snapshot(); cell.write(new Set(members.reverse())); same(cell.snapshot(), before);
    same(run({ a: cell.read(), b: new Set([...cell.read()].reverse()) }), true);
    same(run({ a: cell.read(), b: new Set([{ n: 1 }, { n: 1 }]) }), false); same(cell.read().size, 2);
  });
  await test('N03/Set-is-not-silently-a-CEL-list-and-has-no-value-field', () => {
    const runtime = adapter({ s: set(integer) }, integer);
    for (const expression of ['size(s)', 's[0]', 's.map(x,x)', 'unknownNative(s)']) rejects(() => runtime.compile(expression));
    rejects(() => runtime.compile('s.value')({ s: new Set([1, 2]) }));
    same(runtime.compile('probeSetSize(s)')({ s: new Set([1, 2]) }), 2);
  });
  await test('N04/native-primitive-Set-membership-null-and-negative-zero', () => {
    const schema = set(nullable(number)), { cell } = stored(schema, new Set([null, -0, 1.5]));
    same(evaluate('probeSetHas(s,null) && probeSetHas(s,0.0) && probeSetHas(s,1.5)', { s: schema }, { s: cell.read() }, boolean), true);
    same(cell.read().size, 3); same(Object.is([...cell.read()][1], -0), false);
  });
  await test('N05/Map-number-fractional-and-string-keys-stay-distinct', () => {
    const schema = map(string), { cell } = stored(schema, new Map([[1.5, 'fraction'], ['1.5', 'text'], [1, 'int-key'], ['1', 'string-key']]));
    const run = adapter({ m: schema }, string);
    for (const [key, expected] of [['1.5', 'fraction'], ['"1.5"', 'text'], ['1', 'int-key'], ['"1"', 'string-key']]) same(run.compile(`probeMapGet(m,${key})`)({ m: cell.read() }), expected);
    same(evaluate('probeMapSame(a,b)', { a: schema, b: schema }, { a: cell.read(), b: new Map([...cell.read()].reverse()) }, boolean), true);
  });
  await test('N06/Map-explicit-null-versus-absent-key', () => {
    const schema = map(nullable(integer)), { cell } = stored(schema, new Map([['null', null], ['zero', 0]])), runtime = adapter({ m: schema }, boolean);
    same(runtime.compile('probeMapHas(m,"null") && probeMapGet(m,"null") == null && !probeMapHas(m,"absent")')({ m: cell.read() }), true);
    rejects(() => evaluate('probeMapGet(m,"absent")', { m: schema }, { m: cell.read() }, nullable(integer)), /REFERENCE_NOT_FOUND/);
    same(evaluate('probeMapGet(m,"null")', { m: schema }, { m: cell.read() }, nullable(integer)), null);
  });
  await test('N07/nested-native-output-keeps-source-and-readonly-graph', () => {
    const schema = object({ rows: array(object({ n: integer })), selected: set(object({ n: integer })), lookup: map(object({ n: integer })) });
    const source = { rows: [{ n: 1 }], selected: new Set([{ n: 1 }]), lookup: new Map([['a', { n: 1 }]]) }, { cell } = stored(schema, source), saved = cell.read();
    const output = evaluate('root', { root: schema }, { root: saved }, schema); same(output, saved);
    source.rows[0].n = 8; source.selected.clear(); source.lookup.clear(); same(output.rows[0].n, 1); same(output.selected.size, 1);
    for (const change of [() => { output.rows[0].n = 9; }, () => output.selected.clear(), () => output.lookup.set('a', { n: 9 }), () => Map.prototype.set.call(output.lookup, 'a', 9)]) rejects(change);
    same(Object.isFrozen(source), false); same(cell.read(), saved); same(output.lookup.get('a').n, 1);
  });
  await test('N08/nested-field-and-Map-result-return-source-objects', () => {
    const item = object({ n: integer }), schema = object({ lookup: map(item), selected: set(item) }), { cell } = stored(schema, { lookup: new Map([['a', { n: 2 }]]), selected: new Set([{ n: 3 }]) });
    const output = evaluate('probeMapGet(probeField(root,"lookup"),"a")', { root: schema }, { root: cell.read() }, item);
    same(output, cell.read().lookup.get('a')); same(output.n, 2); rejects(() => { output.n = 9; });
    same(evaluate('probeField(root,"selected")', { root: schema }, { root: cell.read() }, set(item)), cell.read().selected);
  });
  await test('N09/typed-integer-versus-number-input-and-result', () => {
    same(evaluate('i+1', { i: integer }, { i: 2 }, integer), 3);
    same(evaluate('n+1.0', { n: number }, { n: 2 }, number), 3);
    same(evaluate('double(i)+n', { i: integer, n: number }, { i: 2, n: 0.5 }, number), 2.5);
    rejects(() => adapter({ i: integer }, integer).compile('i+1.0'));
    rejects(() => evaluate('i', { i: integer }, { i: 1.5 }, integer));
    rejects(() => evaluate('n', { n: number }, { n: 2 }, integer), /SAFE_INTEGER_RESULT/);
    rejects(() => evaluate('i', { i: integer }, { i: 2 }, number), /TYPE_MISMATCH/);
  });
  await test('N10/safe-integer-output-rejects-wider-CEL-int-and-keeps-State', () => {
    const { cell } = stored(integer, 7), saved = cell.snapshot();
    const run = adapter({ i: integer }, integer).compile('i+1');
    rejects(() => cell.write(run({ i: 9007199254740991 })), /SAFE_INTEGER_RESULT/); same(cell.snapshot(), saved);
    same(run({ i: -9007199254740991 }), -9007199254740990);
    rejects(() => adapter({}, integer).compile('9223372036854775807+1')({}), /overflow/i);
    rejects(() => evaluate('i', { i: integer }, { i: 9007199254740992 }, integer));
  });
  await test('N11/binary64-and-fractional-Map-key-preserved', () => {
    const n = 0.1 + 0.2; same(evaluate('n', { n: number }, { n }, number), n);
    same(evaluate('n', { n: number }, { n: 1e100 }, number), 1e100);
    const schema = map(number); same(evaluate('probeMapGet(m,0.30000000000000004)', { m: schema }, { m: new Map([[n, n]]) }, number), n);
    for (const n of [NaN, Infinity, -Infinity]) rejects(() => evaluate('n', { n: number }, { n }, number));
    rejects(() => adapter({}, number).compile('1.0/0.0')({}));
  });
  await test('N12/direct-typed-output-list-and-object-integer-conversion', () => {
    const schema = object({ count: integer, ratio: number, rows: array(integer) });
    const output = adapter({}, schema).compile('{"count":2,"ratio":0.5,"rows":[1,2]}')({});
    same(output.count, 2); same(typeof output.count, 'number'); same(output.rows[1], 2); rejects(() => output.rows.push(3));
  });
  await test('N13/date-time-datetime-explicit-types-and-canonical-strings', () => {
    for (const [kind, input, expected] of [['date', '2026-10-29', '2026-10-29'], ['time', '09:30', '09:30:00.000'], ['datetime', '2026-10-29T09:30:00+09:00', '2026-10-29T00:30:00.000Z']]) {
      const schema = { 'x-viewstem-type': kind }, { cell } = stored(schema, input);
      same(evaluate('d', { d: schema }, { d: cell.read() }, schema), expected);
      same(evaluate('probeDateText(d)', { d: schema }, { d: cell.read() }, string), expected);
      same(evaluate('probeDateKind(d)', { d: schema }, { d: cell.read() }, string), kind);
    }
  });
  await test('N14/ordinary-string-is-not-auto-parsed-as-date', () => {
    const invalid = '2026-02-30T09:30:00+09:00'; same(evaluate('s', { s: string }, { s: invalid }, string), invalid);
    rejects(() => adapter({ s: string }, string).compile('probeDateText(s)'));
    for (const input of [invalid, '2026-10-29T09:30:00', '2026-10-29T09:30:00.0001Z', new Date()]) rejects(() => evaluate('d', { d: { 'x-viewstem-type': 'datetime' } }, { d: input }, { 'x-viewstem-type': 'datetime' }));
  });
  await test('N15/nullable-date-null-and-explicit-timestamp-conversion', () => {
    const schema = nullable({ 'x-viewstem-type': 'datetime' }); same(evaluate('d', { d: schema }, { d: null }, schema), null);
    same(evaluate('timestamp(probeDateText(d)).getFullYear()', { d: { 'x-viewstem-type': 'datetime' } }, { d: '2026-10-29T09:30:00+09:00' }, integer), 2026);
  });
  await test('N16/reused-normalization-undefined-objects-and-native-rejections', () => {
    const schema = object({ n: integer }), source = { n: undefined };
    const output = evaluate('o', { o: schema }, { o: source }, schema); same(Object.keys(output).length, 0); assert(Object.hasOwn(source, 'n'));
    const setSchema = set(object({ n: integer })); same(evaluate('probeSetSize(s)', { s: setSchema }, { s: new Set([{}, { n: undefined }]) }, integer), 2);
    for (const [schema, input] of [[set(nullable(integer)), new Set([undefined])], [map(nullable(integer)), new Map([['x', undefined]])], [array(nullable(integer)), [undefined]], [integer, 1n], [map(integer), new Map([[{}, 1]])]]) rejects(() => evaluate('x', { x: schema }, { x: input }, schema));
  });
  await test('N17/registration-errors-and-unsupported-schema-subsets-are-visible', () => {
    let runs = 0; const runtime = adapter({}, integer, { producers: [{ name: 'probeGenerated', schema: integer, run: () => ++runs }] });
    rejects(() => runtime.compile('unknownFn()')); same(runs, 0); runtime.compile('probeGenerated()'); same(runs, 0);
    for (const schema of [{ type: 'integer', format: 'int64' }, { type: 'integer', minimum: 'bad' }, { $ref: '#/$defs/I', $defs: { I: integer } }, { type: ['integer', 'number'] }, { type: 'object' }, true]) rejects(() => adapter({ x: schema }, integer));
  });
  await test('N18/hidden-custom-input-payload-node-byte-depth-limits', () => {
    rejects(() => evaluate('probeSetSize(s)', { s: set(integer) }, { s: new Set([1, 2, 3, 4]) }, integer, { limits: { inputNodes: 4 } }), /LIMIT_EXCEEDED/);
    rejects(() => evaluate('m', { m: map(string) }, { m: new Map([['x', '한'.repeat(10)]]) }, map(string), { limits: { valueBytes: 12 } }), /LIMIT_EXCEEDED/);
    let schema = integer, value = 1; for (let i = 0; i < 6; i++) { schema = object({ child: schema }); value = { child: value }; }
    rejects(() => evaluate('root', { root: schema }, { root: value }, schema, { limits: { depth: 4 } }), /LIMIT_EXCEEDED/);
    rejects(() => evaluate('xs', { xs: array(integer) }, { xs: new Array(1000000000) }, array(integer)), /LIMIT_EXCEEDED/);
  });
  await test('N19/hidden-custom-output-payload-size-limits-not-wrapper-size', () => {
    const schema = set(integer), raw = new Set([1, 2, 3, 4]);
    rejects(() => evaluate('s', { s: schema }, { s: raw }, schema, { limits: { inputNodes: 20, outputNodes: 3 } }), /LIMIT_EXCEEDED/);
    rejects(() => evaluate('probeGenerated()', {}, {}, map(string), { limits: { valueBytes: 12 }, producers: [{ name: 'probeGenerated', schema: map(string), run: () => new Map([['x', '한'.repeat(10)]]) }] }), /LIMIT_EXCEEDED/);
  });
  await test('N20/native-payload-cycles-rejected-on-input-and-producer-output', () => {
    const cyclic = {}; cyclic.n = cyclic; const schema = object({ n: integer });
    rejects(() => evaluate('x', { x: schema }, { x: cyclic }, schema), /CYCLIC_VALUE/);
    rejects(() => evaluate('probeGenerated()', {}, {}, schema, { producers: [{ name: 'probeGenerated', schema, run: () => cyclic }] }), /CYCLIC_VALUE/);
    const nestedSet = new Set(); nestedSet.add(nestedSet); rejects(() => evaluate('s', { s: set(integer) }, { s: nestedSet }, set(integer)), /CYCLIC_VALUE/);
    const nativeMap = new Map(); nativeMap.set('self', nativeMap); rejects(() => evaluate('m', { m: map(integer) }, { m: nativeMap }, map(integer)), /CYCLIC_VALUE/);
  });
  await test('N21/output-producer-depth-and-input-accessor-rejected', () => {
    let schema = integer, output = 1; for (let i = 0; i < 6; i++) { schema = object({ next: schema }); output = { next: output }; }
    rejects(() => evaluate('probeGenerated()', {}, {}, schema, { limits: { depth: 4 }, producers: [{ name: 'probeGenerated', schema, run: () => output }] }), /LIMIT_EXCEEDED/);
    let getterCalls = 0; const input = Object.defineProperty({}, 'n', { enumerable: true, get() { getterCalls++; return 1; } });
    rejects(() => evaluate('o', { o: object({ n: integer }) }, { o: input }, object({ n: integer }))); same(getterCalls, 0);
  });
  await test('N22/patched-AST-budget-active-through-native-function-calls', () => {
    const schema = set(integer), run = adapter({ s: schema }, boolean, { cost: 10 }).compile('[1,2,3,4,5,6,7,8].all(x,probeSetHas(s,x))');
    rejects(() => run({ s: new Set([1, 2, 3, 4, 5, 6, 7, 8]) }), /cost|budget|limit/i);
    const fresh = adapter({ s: schema }, integer, { cost: 100 }).compile('probeSetSize(s)'); same(fresh({ s: new Set([1]) }), 1); same(fresh({ s: new Set([1]) }), 1);
  });
  await test('N23/expression-length-and-result-schema-validation', () => {
    rejects(() => adapter({}, integer, { limits: { expressionChars: 3 } }).compile('1+2+3'), /LIMIT_EXCEEDED/);
    rejects(() => adapter({}, { ...integer, maximum: 1 }).compile('2')({}));
    rejects(() => adapter({}, object({ n: integer })).compile('{"undeclared":1}')({}), /TYPE_MISMATCH/);
  });
  return results;
}
