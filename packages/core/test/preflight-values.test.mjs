import { evaluate } from '../src/expressions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRegistry, createStateStore, computeGridLayout } from '@viewstem/core';
import { createRuntime } from './fixtures/runtime-operations.mjs';

const max = Number.MAX_SAFE_INTEGER;
const nodes = (...ids) => ids.map(id => ({ id }));
const items = (...ids) => ids.map(id => ({ id, address: id }));

test('preflight Grid validates last occupied row and preserves maximum safe one-cell coordinates', () => {
  for (const rowSpan of [2, 3]) assert.throws(() => computeGridLayout(nodes('a'), items('a'), { a: { row: max, column: 1, rowSpan, columnSpan: 1 } }), { code: 'INVALID_DEFINITION' });
  const result = computeGridLayout(nodes('a'), items('a'), { a: { row: max, column: 1, rowSpan: 1, columnSpan: 1 } });
  assert.deepEqual(result.get('a'), { row: max, column: 1, rowSpan: 1, columnSpan: 1 });
  assert.throws(() => computeGridLayout(nodes('hidden'), [], { hidden: { row: max, column: 1, rowSpan: 3 } }), { code: 'INVALID_DEFINITION' });
});

test('preflight Grid handles large valid spans and checks automatic row plus span without cell enumeration', () => {
  const large = computeGridLayout(nodes('tall', 'next'), items('tall', 'next'), { tall: { rowSpan: max - 1 } });
  assert.equal(large.get('tall').row, 1);
  assert.equal(large.get('next').row, max);
  assert.throws(() => computeGridLayout(nodes('tall', 'next'), items('tall', 'next'), { tall: { rowSpan: max } }), { code: 'INVALID_DEFINITION' });
  assert.throws(() => computeGridLayout(nodes('fixed', 'auto'), items('fixed', 'auto'), { fixed: { row: 1, column: 1 }, auto: { rowSpan: max } }), { code: 'INVALID_DEFINITION' });
  const beside = computeGridLayout(nodes('tall', 'next'), items('tall', 'next'), { tall: { rowSpan: max, columnSpan: 1 }, next: { columnSpan: 1 } });
  assert.equal(beside.get('next').row, 1);
  assert.equal(beside.get('next').column, 2);
});

test('preflight Grid omitted layout treats prototype-named declaration IDs as ordinary IDs', () => {
  const ids = ['toString', 'constructor', '__proto__'];
  const result = computeGridLayout(nodes(...ids), items(...ids));
  ids.forEach((id, index) => assert.deepEqual(result.get(id), { rowSpan: 1, columnSpan: 12, row: index + 1, column: 1 }));
  assert.equal(computeGridLayout(nodes('constructor'), items('constructor'), { constructor: { columnSpan: 2 } }).get('constructor').columnSpan, 2);
});

async function stateFixture(t, sourceSchema, portSchema, initial) {
  const registry = createRegistry(), store = createStateStore(), scope = store.createScope();
  const cell = scope.registerState('source', { schema: sourceSchema, initial });
  registry.registerComponentContract({ kind: 'Component', id: 'Empty', spec: {} });
  registry.registerAction({ kind: 'Action', id: 'write', spec: { ports: { cell: { kind: 'State', schema: portSchema, required: true }, next: { kind: 'Value', schema: true, required: true } } } }, ({ inputs }) => { inputs.cell.write(inputs.next); });
  const runtime = createRuntime({ registry, stateStore: store });
  t.after(() => { runtime.dispose(); scope.dispose(); });
  const { view, initialComplete: ready } = await runtime.createView({ view: { render: { id: 'root', componentRef: 'Empty' } } });
  await ready;
  return { cell, write: next => runtime.invokeAction({ owner: view, actionRef: 'write', inputs: { cell, next } }) };
}

test('preflight public State ports ignore enum ordering while preserving distinct Unicode values and ASCII', async t => {
  const values = ['é', 'e\u0301', 'b', 'a'];
  const f = await stateFixture(t, { type: 'string', enum: values }, { enum: [...values].reverse(), type: 'string' }, values[0]);
  for (const value of values) { await f.write(value); assert.equal(f.cell.read(), value); }
  await assert.rejects(f.write('unlisted'), { code: 'TYPE_MISMATCH' });
  assert.equal(f.cell.read(), 'a');
  const distinct = await stateFixture(t, { type: 'string', enum: ['é'] }, { type: 'string', enum: ['e\u0301'] }, 'é');
  await assert.rejects(distinct.write('e\u0301'), { code: 'TYPE_CONTRACT_MISMATCH' });
});

test('preflight public State ports ignore required ordering without normalizing Unicode property names', async t => {
  const names = ['é', 'e\u0301', 'b', 'a'];
  const properties = Object.fromEntries(names.map(name => [name, { type: 'string' }]));
  const schema = { type: 'object', properties, required: names, additionalProperties: false };
  const initial = Object.fromEntries(names.map(name => [name, name]));
  const f = await stateFixture(t, schema, { ...schema, required: [...names].reverse() }, initial);
  const next = Object.fromEntries([...names].reverse().map(name => [name, `${name}!`]));
  await f.write(next);
  for (const name of names) assert.equal(f.cell.read()[name], `${name}!`);
  const missing = { ...next }; delete missing['e\u0301'];
  await assert.rejects(f.write(missing), { code: 'TYPE_MISMATCH' });
  assert.equal(f.cell.read()['e\u0301'], 'e\u0301!');
});

test('preflight registered @call remains synchronous and validates ordinary results', () => {
  const call = { '@call': 'read', args: [] };
  assert.equal(evaluate(call, { functions: [{ name: 'read', inputs: [], output: { type: 'integer' }, run: () => 7 }] }), 7);
  assert.throws(() => evaluate(call, { functions: [{ name: 'read', inputs: [], output: { type: 'integer' }, run: () => 'wrong' }] }), { code: 'TYPE_MISMATCH' });
});

test('preflight rejecting async @call and arbitrary thenables report synchronous TYPE_MISMATCH without unhandled rejection', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { evaluate } from './src/expressions.mjs';
    let unhandled = 0;
    process.on('unhandledRejection', () => { unhandled++; });
    const callbacks = [
      async () => { throw Error('rejected callback'); },
      () => Promise.resolve(1),
      () => ({ then(resolve, reject) { reject(Error('rejected thenable')); } }),
      () => ({ then() { throw Error('throwing thenable'); } }),
      () => ({ then(resolve) { resolve(1); } }),
      () => Object.assign(() => {}, { then(resolve, reject) { reject(Error('callable thenable')); } }),
      () => Object.defineProperty({}, 'then', { get() { throw Error('throwing getter'); } }),
    ];
    for (const run of callbacks) assert.throws(() => evaluate({ '@call': 'later', args: [] }, {
      functions: [{ name: 'later', inputs: [], output: true, run }],
    }), { code: 'TYPE_MISMATCH' });
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(unhandled, 0);
    console.log('no-unhandled-rejection');
  `;
  const result = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', script], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no-unhandled-rejection/);
});
