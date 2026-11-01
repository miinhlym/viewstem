import { compileCel, createStateStore } from '@viewstem/core';
const protect=value=>{const store=createStateStore(),scope=store.createScope();const result=scope.registerState('value',{schema:true,initial:value}).read();store.dispose();return result;};
const integer = { type: 'integer' }, number = { type: 'number' }, string = { type: 'string' };
const run = (source, inputs = {}, bindings = {}, output, extra = {}) => compileCel(source, { inputs, output, ...extra })(bindings);
export function runBrowserCases() {
  const results = [];
  const test = (id, execute) => {
    try { if (execute() !== true) throw Error('ASSERTION'); results.push({ id, passed: true }); }
    catch (error) { results.push({ id, passed: false, error: { code: error.code, message: error.message } }); }
  };
  const rejects = (execute, code) => { try { execute(); } catch (error) { return !code || code === error.code; } return false; };
  test('integer', () => run('x + 1', { x: integer }, { x: 2 }, integer) === 3);
  test('double', () => run('x + 1.0', { x: number }, { x: 2 }, number) === 3);
  test('numeric-output-strict', () => rejects(() => run('1.0', {}, {}, integer), 'TYPE_MISMATCH'));
  test('safe-integer-result', () => rejects(() => run('9007199254740992', {}, {}, integer)));
  test('unknown-function-registration', () => rejects(() => compileCel('unknown()')));
  test('full-schema-ref', () => run('x + 1', { x: { $defs: { n: integer }, $ref: '#/$defs/n' } }, { x: 2 }, integer) === 3);
  test('full-schema-tuple', () => run('xs[0] + 1', { xs: { type: 'array', prefixItems: [integer, string], items: false } }, { xs: [2, 'a'] }, integer) === 3);
  test('object-field', () => run('x.n + 1', { x: { type: 'object', properties: { n: integer } } }, { x: { n: 2 } }, integer) === 3);
  test('set-stored-identity', () => {
    const schema = { 'x-viewstem-type': 'set', items: { type: 'array', items: integer } }, value = protect(new Set([[1, 2]]));
    return run('setHas(s, item)', { s: schema, item: schema.items }, { s: value, item: [...value][0] }) === true
      && run('setHas(s, [1, 2])', { s: schema }, { s: value }) === false;
  });
  test('native-map-integer-fractional-string-overloads', () => {
    const schema = { 'x-viewstem-type': 'map', keys: { type: ['string', 'number'] }, values: integer }, bindings = { m: new Map([[1, 10], [1.5, 15], ['1', 20]]) };
    return run('mapGet(m, 1)', { m: schema }, bindings, integer) === 10
      && run('mapHas(m, 1)', { m: schema }, bindings) === true
      && run('mapGet(m, 1.5)', { m: schema }, bindings, integer) === 15
      && run('mapHas(m, 1.5)', { m: schema }, bindings) === true
      && run('mapGet(m, "1")', { m: schema }, bindings, integer) === 20;
  });
  test('native-equality', () => run('a == b', { a: { 'x-viewstem-type': 'set', items: integer }, b: { 'x-viewstem-type': 'set', items: integer } }, { a: new Set([1, 2]), b: new Set([2, 1]) }) === true);
  test('date-normalization', () => run('dateText(d)', { d: { 'x-viewstem-type': 'datetime' } }, { d: '2026-10-29T09:30:00+09:00' }) === '2026-10-29T00:30:00.000Z');
  test('date-no-implicit-parse', () => rejects(() => run('dateText(s)', { s: string }, { s: '2026-10-29' })));
  test('calendar-explicit-zone', () => run('atLocal("2026-10-29", "09:30", "Asia/Seoul")') === '2026-10-29T00:30:00.000Z');
  test('calendar-ambiguous-DST', () => rejects(() => run('atLocal("2026-11-01", "01:30", "America/New_York")')));
  test('calendar-integer-only', () => rejects(() => compileCel('addDate("2026-10-29", 1.5)')));
  test('regex-global-and-receiver-cached', () => run('matches("abc", "b")') === true && run('"abc".matches("b")') === true && run('matches("abc", "b")') === true);
  test('regex-RE2-backreference-rejected', () => rejects(() => run('"aa".matches("(a)\\\\1")')));
  test('regex-RE2-nested-quantifier', () => run('s.matches("(a+)+$")', { s: string }, { s: `${'a'.repeat(10000)}!` }) === false);
  test('string-Unicode-search', () => run('"😀x😀x".lastIndexOf("x")') === 3);
  test('cost-fatal', () => rejects(() => run('xs.all(x, x > 0) || true', { xs: { type: 'array', items: integer } }, { xs: Array(100).fill(1) }, undefined, { cost: 30 }), 'LIMIT_EXCEEDED'));
  test('input-byte-limit', () => rejects(() => run('s', { s: string }, { s: '😀😀' }, undefined, { limits: { valueBytes: 7 } }), 'LIMIT_EXCEEDED'));
  test('output-node-limit', () => rejects(() => run('[1,2,3]', {}, {}, undefined, { limits: { outputNodes: 3 } }), 'LIMIT_EXCEEDED'));
  test('async-host-rejected', () => rejects(() => run('later() || true', {}, {}, undefined, { functions: [{ name: 'later', inputs: [], output: { type: 'boolean' }, run: async () => true }] }), 'ASYNC_CEL_FUNCTION'));
  test('bytes-optional-disabled', () => rejects(() => compileCel('bytes("x")')) && rejects(() => compileCel('optional.of(1)')) && rejects(() => compileCel('int == int')));
  return results;
}
