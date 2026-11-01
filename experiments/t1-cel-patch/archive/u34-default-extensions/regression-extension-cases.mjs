// Focused default-extension regressions; these are not a full CEL profile approval.
export async function runExtensionCases({ Environment, evaluate }) {
  const results = [];
  const check = (condition, message = 'ASSERTION') => { if (!condition) throw Error(message); };
  const test = async (id, run) => {
    try { await run(); results.push({ id: `extension/${id}`, passed: true }); }
    catch (error) { results.push({ id: `extension/${id}`, passed: false, error: { name: error.name, code: error.code, message: error.message } }); }
  };
  const rejects = async (run, code) => {
    let caught; try { await run(); } catch (error) { caught = error; }
    check(caught, `Expected ${code}`);
    if (code) check(caught.code === code, `Expected ${code}, got ${caught.code ?? caught.message}`);
  };
  for (const [expression, expected] of [
    ['s.lowerAscii()', 'abcÆİΣß😀z'], ['s.upperAscii()', 'ABCÆİΣß😀Z'],
  ]) await test(`ascii/${expression}`, () => check(evaluate(expression, { s: 'AbCÆİΣß😀z' }) === expected));
  for (const method of ['indexOf', 'lastIndexOf']) {
    for (const [name, s, p, offset, expected] of [
      ['astral-index', '😀x😀x', 'x', null, method === 'indexOf' ? 1n : 3n],
      ['astral-match', 'a😀b😀', '😀', null, method === 'indexOf' ? 1n : 3n],
      ['astral-offset', '😀x😀x', 'x', 2n, method === 'indexOf' ? 3n : 1n],
      ['multi-point-pattern', '😀x😀x', '😀x', 2n, 2n],
      ['combining-offset', 'e\u0301😀x', 'x', null, 3n],
      ['empty-default', '😀x', '', null, method === 'indexOf' ? 0n : 2n],
      ['empty-start', '😀x', '', 0n, 0n], ['empty-middle', '😀x', '', 1n, 1n],
      ['empty-end', '😀x', '', 2n, 2n], ['empty-over', '😀x', '', 3n, 2n],
      ['empty-max-int', '😀x', '', 9223372036854775807n, 2n],
      ['start', '😀x', '😀', 0n, 0n], ['end', '😀x', 'x', 2n, -1n],
      ['over', '😀x', 'x', 3n, -1n], ['max-int', '😀x', 'x', 9223372036854775807n, -1n],
      ['not-found', '😀x', 'y', null, -1n], ['pattern-longer', '😀x', '😀xy', null, -1n],
      ['empty-target', '', 'x', null, -1n], ['both-empty', '', '', null, 0n],
      ['empty-target-offset', '', '', 1n, 0n],
    ]) await test(`search/${method}/${name}`, () => {
      const expression = offset === null ? `s.${method}(p)` : `s.${method}(p, offset)`;
      const actual = evaluate(expression, { s, p, offset: offset ?? 0n });
      check(actual === expected, `Expected ${expected}, got ${actual}`);
    });
    for (const p of ['', 'x']) await test(`search/${method}/negative-${p || 'empty'}`, () => rejects(() => evaluate(`s.${method}(p, -1)`, { s: '😀x', p }), 'index_out_of_range'));
  }
  for (const [name, expression, s, expected] of [
    ['astral', 's.substring(0,1)', '😀x', '😀'], ['after-astral', 's.substring(1,2)', '😀x', 'x'],
    ['tail', 's.substring(1)', '😀x', 'x'], ['end', 's.substring(2)', '😀x', ''],
    ['empty-range', 's.substring(1,1)', '😀x', ''], ['end-range', 's.substring(2,2)', '😀x', ''],
    ['empty-target', 's.substring(0)', '', ''], ['combining-codepoints', 's.substring(1,2)', 'e\u0301😀', '\u0301'],
  ]) await test(`substring/${name}`, () => check(evaluate(expression, { s }) === expected));
  for (const expression of ['s.substring(-1)', 's.substring(3)', 's.substring(0,3)', 's.substring(2,1)', 's.substring(0,-1)', 's.substring(-1,1)', 's.substring(9223372036854775807)', 's.substring(0,9223372036854775807)']) {
    await test(`substring/reject-${expression}`, () => rejects(() => evaluate(expression, { s: '😀x' }), 'index_out_of_range'));
  }
  for (const [expression, expected] of [
    ["s.split('')", ['😀', 'x']], ["s.split('', 1)", ['😀x']], ["s.split('', 2)", ['😀', 'x']],
    ["s.split('', -1)", ['😀', 'x']], ["s.split('', 0)", []],
  ]) await test(`split/${expression}`, () => check(JSON.stringify(evaluate(expression, { s: '😀x' })) === JSON.stringify(expected)));
  await test('split/empty-target-empty-separator', () => check(evaluate("''.split('')").length === 0));
  await test('trim/unicode-whitespace', () => check(evaluate('s.trim()', { s: '\u0085\u2000😀\u3000\u0085' }) === '😀'));
  await test('trim/keep-non-whitespace', () => check(evaluate('s.trim()', { s: '\ufeff\u200b😀\u200b\ufeff' }) === '\ufeff\u200b😀\u200b\ufeff'));
  await test('bytes-json/object-unicode', () => {
    const result = evaluate('bytes(s).json()', { s: '{"word":"한글😀","ok":true}' });
    check(result.word === '한글😀' && result.ok === true);
  });
  await test('bytes-json/nested-empty-object', () => {
    const result = evaluate('bytes(s).json()', { s: '{"nested":{"empty":{}},"list":[true,null,"😀"]}' });
    check(Object.keys(result.nested.empty).length === 0 && result.list[2] === '😀' && result.list[1] === null);
  });
  await test('bytes-json/invalid-json', () => rejects(() => evaluate('bytes(s).json()', { s: '{"broken":' })));
  for (const expression of ['s.lowerAscii()', 's.upperAscii()', 's.indexOf("x")', 's.lastIndexOf("x")', 's.substring(0,1)', 's.split("")', 's.trim()', 'bytes(s).json()']) {
    await test(`cost/large-input/${expression}`, () => rejects(() => new Environment({ unlistedVariablesAreDyn: true, limits: { maxEvaluationCost: 30 } }).evaluate(expression, { s: 'x'.repeat(1000) }), 'LIMIT_EXCEEDED'));
  }
  for (const method of ['indexOf', 'lastIndexOf']) await test(`cost/search-comparisons/${method}`, () => rejects(() => new Environment({ unlistedVariablesAreDyn: true, limits: { maxEvaluationCost: 1000 } }).evaluate(`s.${method}(p)`, { s: 'a'.repeat(200), p: 'a'.repeat(99) + 'b' }), 'LIMIT_EXCEEDED'));
  return results;
}
