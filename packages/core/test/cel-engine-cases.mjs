import { runExtensionCases } from './cel-engine-extensions.mjs';
import { createGuarded } from './cel-engine-guarded.mjs';
function check(condition, message = 'ASSERTION') { if (!condition) throw Error(message); }
function decode(value) {
  if (value.type === 'int') return BigInt(value.value);
  if (value.type === 'list') return value.value.map(decode);
  if (value.type === 'map') return new Map(value.value.map(([k, v]) => [decode(k), decode(v)]));
  if (value.type === 'object') return Object.fromEntries(Object.entries(value.value).map(([k, v]) => [k, decode(v)]));
  return value.value;
}
function encode(value) {
  if (value === null) return { type: 'null' };
  if (typeof value === 'bigint') return { type: 'int', value: String(value) };
  if (typeof value === 'boolean') return { type: 'bool', value };
  if (typeof value === 'number') return { type: 'double', value: Number.isFinite(value) ? value : String(value) };
  if (typeof value === 'string') return { type: 'string', value };
  if (Array.isArray(value)) return { type: 'list', value: value.map(encode) };
  if (value instanceof Map) return { type: 'map', value: [...value].map(([k, v]) => [encode(k), encode(v)]) };
  if (value?.constructor?.name === 'UnsignedInt') return { type: 'uint', value: String(value.value) };
  return { type: 'unsupported' };
}

export async function runCases({ Environment, evaluate }, fixtures) {
  const results = [];
  const test = async (id, run) => {
    try { await run(); results.push({ id, passed: true }); }
    catch (error) { results.push({ id, passed: false, error: { name: error.name, code: error.code, message: error.message } }); }
  };
  const rejects = async (run, code) => {
    let caught; try { await run(); } catch (error) { caught = error; }
    check(caught, `Expected ${code}`); check(caught.code === code, `Expected ${code}, got ${caught.code ?? caught.message}`);
  };
  for (const fixture of fixtures) await test(`golden/${fixture.id}`, async () => {
    let actual;
    try { actual = encode(await evaluate(fixture.expression, Object.fromEntries(Object.entries(fixture.bindings).map(([k, v]) => [k, decode(v)])))); }
    catch { actual = { type: 'error' }; }
    check(JSON.stringify(actual) === JSON.stringify(fixture.expected), JSON.stringify({ actual, expected: fixture.expected }));
  });
  const env = limit => new Environment({ unlistedVariablesAreDyn: true, limits: { maxEvaluationCost: limit } });
  for (const [name, expression, bindings] of [
    ['all', 'xs.all(x, x > 0)', { xs: Array(100).fill(1n) }],
    ['exists', 'xs.exists(x, x < 0)', { xs: Array(100).fill(1n) }],
    ['exists-one', 'xs.exists_one(x, x > 0)', { xs: Array(100).fill(1n) }],
    ['map', 'xs.map(x, x + 1)', { xs: Array(100).fill(1n) }],
    ['filter', 'xs.filter(x, x > 0)', { xs: Array(100).fill(1n) }],
    ['nested', 'xs.all(x, xs.all(y, x == y))', { xs: Array(100).fill(1n) }],
    ['or-cannot-mask', 'xs.all(x, x > 0) || true', { xs: Array(100).fill(1n) }],
    ['and-cannot-mask', 'xs.exists(x, x < 0) && false', { xs: Array(100).fill(1n) }],
    ['quantifier-cannot-mask', '[true, false].all(flag, flag ? xs.all(x, x > 0) : false)', { xs: Array(100).fill(1n) }],
    ['function-string', 'size(text)', { text: 'x'.repeat(1000) }],
    ['list-equality', 'a == b', { a: Array(100).fill(1n), b: Array(100).fill(1n) }],
    ['membership', '1000 in xs', { xs: Array(100).fill(1n) }],
  ]) await test(`cost/${name}`, () => rejects(() => env(30).evaluate(expression, bindings), 'LIMIT_EXCEEDED'));
  await test('cost/exact-boundary', async () => {
    check(env(5).evaluate('1 + 2') === 3n); await rejects(() => env(4).evaluate('1 + 2'), 'LIMIT_EXCEEDED');
  });
  await test('cost/skipped-branch', () => check(env(3).evaluate('true || xs.all(x, x > 0)', { xs: Array(100).fill(1n) }) === true));
  await test('cost/evaluate-resets', () => { const runtime = env(5); for (let i = 0; i < 20; i++) check(runtime.evaluate('1+2') === 3n); });
  await test('cost/parsed-resets', () => { const run = env(5).parse('1+2'); for (let i = 0; i < 20; i++) check(run() === 3n); });
  await test('cost/failed-invocation-isolated', async () => {
    const runtime = env(5); await rejects(() => runtime.evaluate('1+2+3'), 'LIMIT_EXCEEDED'); check(runtime.evaluate('1+2') === 3n);
  });
  await test('cost/async-fatal', async () => {
    const runtime = env(30).registerFunction('positive(int): bool', async value => { await Promise.resolve(); return value > 0n; });
    await rejects(() => runtime.evaluate('xs.all(x, positive(x)) || true', { xs: Array(100).fill(1n) }), 'LIMIT_EXCEEDED');
  });
  await test('cost/concurrent-parsed-isolation', async () => {
    const runtime = env(40).registerFunction('positive(int): bool', async value => { await Promise.resolve(); return value > 0n; });
    const run = runtime.parse('xs.all(x, positive(x))');
    const output = await Promise.all(Array.from({ length: 20 }, () => run({ xs: [1n, 2n, 3n] })));
    check(output.every(value => value === true));
  });
  await test('cost/charge-before-host-function', async () => {
    let calls = 0; const runtime = env(10).registerFunction('observe(string): bool', () => { calls++; return true; });
    await rejects(() => runtime.evaluate('observe(s)', { s: 'x'.repeat(100) }), 'LIMIT_EXCEEDED'); check(calls === 0);
  });
  for (const [label, value] of [['zero', 0], ['negative', -1], ['fraction', 1.5], ['infinity', Infinity], ['nan', NaN], ['string', '10'], ['null', null]]) {
    await test(`cost/invalid-limit-${label}`, () => { let caught; try { env(value); } catch (error) { caught = error; } check(caught instanceof TypeError); });
  }
  for (const [value, expected] of [
    ['2000-02-29T23:59:59.123Z', '2000-02-29T23:59:59.123Z'],
    ['2026-10-30T09:30:00+09:00', '2026-10-30T00:30:00.000Z'],
    ['0001-01-01T00:00:00Z', '0001-01-01T00:00:00.000Z'],
    ['9999-12-31T23:59:59.999Z', '9999-12-31T23:59:59.999Z'],
    ['0099-01-01T00:00:00Z', '0099-01-01T00:00:00.000Z'],
    ['2026-10-30T00:00:00.1-09:30', '2026-10-30T09:30:00.100Z'],
  ]) await test(`timestamp/valid-${value}`, () => check(evaluate('timestamp(value)', { value }).toISOString() === expected));
  for (const value of ['1900-02-29T00:00:00Z', '2026-02-30T00:00:00Z', '2026-04-31T00:00:00Z', '2026-13-01T00:00:00Z',
    '2026-01-00T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T00:60:00Z', '2026-01-01T00:00:60Z',
    '2026-01-01T00:00:00-00:00', '2026-01-01T00:00:00+24:00', '2026-01-01T00:00:00+01:60',
    '0000-01-01T00:00:00Z', '0001-01-01T00:00:00+14:00', '9999-12-31T23:59:59-12:00',
    '2026-01-01T00:00:00.1234Z', '2026-01-01T00:00:00', '2026-01-01 00:00:00Z']) {
    await test(`timestamp/invalid-${value}`, () => rejects(() => evaluate('timestamp(value)', { value }), 'invalid_timestamp'));
  }
  await test('errors/ordinary-CEL-error-can-still-short-circuit', () => check(evaluate('1 / 0 == 0 || true') === true));
  await test('integer/division-min-overflow', () => rejects(() => evaluate('(-9223372036854775807 - 1) / -1'), 'numeric_overflow'));
  await test('integer/unary-min-overflow', () => rejects(() => evaluate('-(-9223372036854775807 - 1)'), 'numeric_overflow'));
  await test('timestamp/arithmetic-overflow', () => rejects(() => evaluate('timestamp("9999-12-31T23:59:59Z") + duration("1s")'), 'invalid_timestamp'));
  await test('timestamp/arithmetic-millisecond-loss', () => rejects(() => evaluate('timestamp("2026-10-30T00:00:00Z") + duration("1ns")'), 'invalid_timestamp'));
  await test('timestamp/year-0099-calendar-getter', () => check(evaluate('timestamp("0099-01-01T00:00:00Z").getFullYear("UTC")') === 99n));
  for (const [name, input, pattern, expected] of [
    ['substring', 'xxfooyy', 'foo', true], ['anchored', 'xxfooyy', '^foo$', false],
    ['unicode-codepoint', '😀', '^.$', true], ['unicode-group', '한글', '^\\p{Hangul}+$', true],
    ['case-flag', 'ABC', '(?i)abc', true], ['multiline', 'a\nb', '(?m)^b$', true],
    ['nested-repetition', 'a'.repeat(35) + '!', '^(a+)+$', false],
    ['alternation', 'a'.repeat(35) + '!', '^(a|aa)+$', false],
    ['empty', '', '', true], ['counted-repeat', 'aaaa', '^a{4}$', true],
  ]) for (const call of ['s.matches(p)', 'matches(s,p)']) await test(`regex/${name}/${call}`, () => check(evaluate(call, { s: input, p: pattern }) === expected));
  for (const [name, pattern] of [['backref', '(a)\\1'], ['lookahead', 'a(?=b)'], ['lookbehind', '(?<=a)b'], ['bad', '['], ['repeat-limit', 'a{1001}']]) {
    await test(`regex/reject-${name}`, () => rejects(() => evaluate('s.matches(p)', { s: 'ab', p: pattern }), 'invalid_regular_expression'));
  }
  await test('regex/cost-cannot-be-masked', () => rejects(() => env(100).evaluate('s.matches(p) || true', { s: 'x'.repeat(20), p: '(a|b|c|d|e){10}' }), 'LIMIT_EXCEEDED'));
  await test('regex/expanded-program-cost', () => rejects(() => env(1000).evaluate('s.matches(p)', { s: 'a'.repeat(20), p: 'a{100}' }), 'LIMIT_EXCEEDED'));
  await test('integer/double-conversion-overflow', () => rejects(() => evaluate('int(1e100)'), 'numeric_overflow'));
  await test('integer/empty-string', () => rejects(() => evaluate('int("")'), 'int_conversion_error'));
  for (const [expression, expected] of [
    ['duration("1.234s").getMilliseconds()', 234n],
    ['duration("-1.234s").getMilliseconds()', -234n],
    ['(duration("-0.5s") + duration("0s")) == duration("-0.5s")', true],
    ['(duration("0s") - duration("0.5s")) == duration("-0.5s")', true],
    ['duration("0").getSeconds()', 0n],
    ['(timestamp("9999-12-31T23:59:59.999Z") - timestamp("0001-01-01T00:00:00Z")).getMilliseconds()', 999n],
  ]) await test(`duration/${expression}`, () => check(evaluate(expression) === expected));
  await test('admission/expression-before-host-call', async () => {
    let calls = 0;
    const runtime = createGuarded(Environment, { limits: { expressionChars: 10 }, functions: [['mark(): bool', () => { calls++; return true; }]] });
    await rejects(() => runtime.compile('mark() || true'), 'LIMIT_EXCEEDED'); check(calls === 0);
  });
  for (const [name, value, limits, code] of [
    ['input-count', Array(10).fill(1n), { inputNodes: 5 }, 'LIMIT_EXCEEDED'],
    ['input-depth', [[[[[1n]]]]], { depth: 4 }, 'LIMIT_EXCEEDED'],
    ['input-bytes', '한글🙂', { valueBytes: 8 }, 'LIMIT_EXCEEDED'],
    ['nonfinite', Infinity, {}, 'UNSUPPORTED_VALUE'], ['undefined', undefined, {}, 'UNSUPPORTED_VALUE'],
    ['sparse', new Array(1), {}, 'UNSUPPORTED_VALUE'], ['function', () => true, {}, 'UNSUPPORTED_VALUE'],
    ['bigint-range', 9223372036854775808n, {}, 'UNSUPPORTED_VALUE'],
  ]) await test(`admission/${name}`, () => rejects(() => createGuarded(Environment, { variables: { x: 'dyn' }, limits }).compile('x')({ x: value }), code));
  await test('admission/cycle', async () => {
    const x = {}; x.self = x;
    await rejects(() => createGuarded(Environment, { variables: { x: 'dyn' } }).compile('x')({ x }), 'CYCLIC_VALUE');
  });
  await test('admission/accessor-not-executed', async () => {
    let calls = 0; const x = Object.defineProperty({}, 'secret', { enumerable: true, get() { calls++; return true; } });
    await rejects(() => createGuarded(Environment, { variables: { x: 'dyn' } }).compile('x')({ x }), 'UNSUPPORTED_VALUE'); check(calls === 0);
  });
  await test('admission/output-count', () => rejects(() => createGuarded(Environment, { variables: { xs: 'list<int>' }, limits: { outputNodes: 4 } })
    .compile('xs.map(x, [x,x])')({ xs: [1n, 2n, 3n] }), 'LIMIT_EXCEEDED'));
  await test('admission/output-bytes', () => rejects(() => createGuarded(Environment, { variables: { s: 'string' }, limits: { valueBytes: 10 } })
    .compile('s+s+s')({ s: 'abcd' }), 'LIMIT_EXCEEDED'));
  await test('admission/output-nonfinite', () => rejects(() => createGuarded(Environment).compile('1.0 / 0.0')(), 'UNSUPPORTED_VALUE'));
  await test('admission/unknown-function-registration', () => {
    let error; try { createGuarded(Environment).compile('hiddenClock()'); } catch (caught) { error = caught; } check(error && error.code);
  });
  await test('admission/unknown-variable-registration', () => {
    let error; try { createGuarded(Environment).compile('false && absent > 0'); } catch (caught) { error = caught; } check(error && error.code);
  });
  await test('admission/declared-unused-missing', () => check(createGuarded(Environment, { variables: { absent: 'int' } }).compile('false && absent > 0')({}) === false));
  await test('admission/shared-noncyclic', () => {
    const item = { x: 1n }; const out = createGuarded(Environment, { variables: { xs: 'list<map<string,int>>' } }).compile('size(xs)')({ xs: [item, item] }); check(out === 2n);
  });
  await test('admission/async-output-check', () => rejects(() => createGuarded(Environment, { functions: [['getValue(): string', async () => 'x'.repeat(20)]], limits: { valueBytes: 10 } })
    .compile('getValue()')(), 'LIMIT_EXCEEDED'));
  await test('admission/limits-validated', async () => { for (const limits of [{ depth: 0 }, { valueBytes: Infinity }, { typo: 10 }]) await rejects(() => createGuarded(Environment, { limits }), 'INVALID_LIMIT'); });
  return [...results, ...await runExtensionCases({ Environment, evaluate })];
}
