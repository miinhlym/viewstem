import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Environment } from '@marcbachmann/cel-js';
import { fromCelInteger } from './values.mjs';

// The real pinned CEL engine and existing result adapter; no core/renderer model.
const env = new Environment().registerVariable('items', 'list');
const cases = [];
for (const [name, items, expected] of [
  ['empty', [], 0],
  ['strings', ['a', 'b'], 2],
  ['null-is-an-element', [null], 1],
  ['duplicates-count', ['a', 'a'], 2],
  ['nested-counts-outer-elements', [[1, 2], []], 2],
  ['objects-count-as-elements', [{ selected: true }, { selected: false }], 2],
  ['large-list', Array.from({ length: 10000 }, (_, i) => i), 10000],
]) for (const expression of ['size(items)', 'items.size()']) {
  cases.push({ id: `${name}/${expression}`, items, expression, expected });
}
cases.push(
  { id: 'empty-condition', items: [], expression: 'size(items) == 0', expected: true },
  { id: 'selection-limit', items: ['a', 'b', 'c'], expression: 'items.size() <= 2', expected: false },
  { id: 'filtered-count', items: [{ selected: true }, { selected: false }, { selected: true }], expression: 'size(items.filter(x, x.selected))', expected: 2 },
  { id: 'nested-count', items: [['a', 'b', 'c']], expression: 'size(items[0])', expected: 3 },
);
const results = [];
let stoppedAt = null;
for (const item of cases) {
  let observed, rawType, failure;
  const before = structuredClone(item.items);
  try {
    assert.equal(env.check(item.expression).valid, true);
    const raw = env.evaluate(item.expression, { items: item.items });
    rawType = typeof raw;
    observed = rawType === 'bigint' ? fromCelInteger(raw) : raw;
    if (typeof item.expected === 'number') {
      assert.equal(rawType, 'bigint');
      assert.ok(Number.isSafeInteger(observed));
    }
    assert.equal(observed, item.expected);
    assert.deepEqual(item.items, before);
  } catch (error) { failure = { name: error.name, message: error.message }; }
  results.push({ id: item.id, expression: item.expression, expected: item.expected, observed, rawType, passed: !failure, ...(failure ? { failure } : {}) });
  if (failure) { stoppedAt = item.id; break; }
}
const sourceSha256 = {};
for (const path of ['package.json', 'package-lock.json', 'values.mjs', 'array-size-tests.mjs']) {
  sourceSha256[path] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
}
const library = JSON.parse(await readFile(new URL('./node_modules/@marcbachmann/cel-js/package.json', import.meta.url)));
const report = {
  generatedAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch,
  engine: `${library.name}@${library.version}`, scope: 'CEL array size, checking and safe integer result adapter; no core/renderer or Dart integration',
  stopOnFirstProblem: true, stoppedAt, sourceSha256, results,
  summary: { executed: results.length, passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length },
};
await writeFile(new URL(`results/${process.argv[2] ?? 'array-size-node24.json'}`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, stoppedAt, engine: report.engine }));
if (stoppedAt) process.exitCode = 1;
