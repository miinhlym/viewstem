import assert from 'node:assert/strict';
import { CompositeEngine, leaf, ref } from '../t2-composite-query/harness.mjs';
import { StateProbe } from '../t3-state/state-probe.mjs';
import { compileVariable } from '../t3-state/clock-variable.mjs';
import { createValueEvaluator } from '../t2-http-boundary/value-expressions.mjs';
import { preparePatch } from '../t1-cel-patch/prepare.mjs';
import { harness, report } from './report.mjs';

const { test, results } = harness();
const definition = (input, extra) => ({ sources: {}, transform: { input, steps: [{ kind: 'Concat', with: extra }] } });
await test('Q14/concat-rejects-nonarray-input-without-coercion', async () => {
  for (const input of [null, false, 1, 'text', { x: 1 }]) {
    const engine = new CompositeEngine({ queries: { q: definition(ref('/ports/value'), [[]]) } });
    await assert.rejects(engine.execute('q', { value: input }), error => error.code === 'TYPE_MISMATCH' && error.location === '/spec/transform/steps/0');
  }
});
await test('Q14/concat-rejects-nonarray-with-definition-and-elements', async () => {
  for (const extra of [null, false, 1, 'text', {}, ref('/ports/lists')]) {
    assert.throws(() => new CompositeEngine({ queries: { q: definition([], extra) } }), error => error.code === 'INVALID_DEFINITION');
  }
  for (const extra of [null, false, 1, 'text', { x: 1 }]) {
    const engine = new CompositeEngine({ queries: { q: definition([0], [ref('/ports/value')]) } });
    await assert.rejects(engine.execute('q', { value: extra }), error => error.code === 'TYPE_MISMATCH');
  }
});
await test('Q21/explicit-queries-accept-array-inputs-without-list-fanout', async () => {
  const requests = [], evaluate = createValueEvaluator(() => {});
  const engine = new CompositeEngine({ queries: {
    left: leaf('/left'), right: leaf('/right'), root: {
      sources: { a: { queryRef: 'left', inputs: { value: ref('/ports/selected') } }, b: { queryRef: 'right', inputs: { value: ref('/ports/selected') } } },
      transform: { input: { a: ref('/sources/a'), b: ref('/sources/b') } },
    },
  }, executeHttp: async plan => {
    const request = await evaluate(plan.request, { values: { ports: plan.inputs } }); requests.push(request);
    return { body: { selected: request.params.value, path: request.path } };
  } });
  assert.equal(requests.length, 0);
  for (const selected of [[], [1], [1, 2, 2, 4, 5]]) {
    const start = requests.length, result = await engine.execute('root', { selected });
    assert.equal(requests.length - start, 2);
    assert.deepEqual(result.a, { selected, path: '/left' }); assert.deepEqual(result.b, { selected, path: '/right' });
    for (const request of requests.slice(start)) assert.deepEqual(request.params.value, selected);
  }
  assert.equal(engine.caches.size, 0);
});
await test('V18/host-keeps-column-keys-before-object-normalization', () => {
  const store = new StateProbe(), scope = store.scope(), source = { name: undefined, age: 20 }, columns = Object.keys(source);
  const schema = { type: 'object', properties: { name: { type: 'string' }, age: { type: 'integer' } }, additionalProperties: false };
  const cell = scope.register('record', { schema, initial: source }), snapshot = cell.snapshot();
  assert.deepEqual(columns, ['name', 'age']); assert.deepEqual(Object.keys(cell.read()), ['age']); assert.equal(Object.hasOwn(source, 'name'), true);
  cell.write({ age: 20 }); assert.equal(cell.snapshot(), snapshot); assert.deepEqual(columns, ['name', 'age']);
  source.name = 'changed'; assert.deepEqual(Object.entries(cell.read()), [['age', 20]]); scope.dispose();
});

const prepared = await preparePatch(), { Environment } = await import(prepared.entry.href);
// Private bounded Derived connector: no public registry, SDK, or implicit scope capture.
// The definition selection uses the documented variableRef/variable XOR; actual
// input checking, CEL execution and dependency scheduling use the existing probes.
function connectDerived(scope, name, declaration, variables) {
  const hasRef = Object.hasOwn(declaration, 'variableRef'), hasInline = Object.hasOwn(declaration, 'variable');
  if (hasRef === hasInline) throw Object.assign(new Error('INVALID_DEFINITION'), { code: 'INVALID_DEFINITION' });
  const spec = hasInline ? declaration.variable : variables[declaration.variableRef];
  if (!spec) throw Object.assign(new Error('REFERENCE_NOT_FOUND'), { code: 'REFERENCE_NOT_FOUND' });
  const compiled = compileVariable(Environment, { ...structuredClone(spec), output: declaration.schema });
  const entries = Object.entries(declaration.inputs ?? {});
  return scope.register(name, { schema: declaration.schema, dependencies: entries.map(([, handle]) => handle),
    derived: (...values) => compiled.evaluate(Object.fromEntries(entries.map(([key], index) => [key, values[index]]))).value });
}
await test('K01/derived-reference-inline-equivalence-and-explicit-inputs', () => {
  const store = new StateProbe(), scope = store.scope(), integer = { type: 'integer' };
  const source = scope.register('x', { schema: integer, initial: 3 }), ambient = scope.register('ambient', { schema: integer, initial: 100 });
  const spec = { ports: { x: { kind: 'Value', schema: integer, required: true } }, expression: 'x * 2' }, variables = { double: spec };
  const a = connectDerived(scope, 'a', { variableRef: 'double', inputs: { x: source }, schema: integer }, variables);
  const b = connectDerived(scope, 'b', { variable: spec, inputs: { x: source }, schema: integer }, variables);
  assert.equal(a.read(), 6); assert.equal(b.read(), 6); const snapshots = [a.snapshot(), b.snapshot()];
  ambient.write(200); assert.equal(a.snapshot(), snapshots[0]); assert.equal(b.snapshot(), snapshots[1]);
  source.write(7); assert.equal(a.read(), 14); assert.equal(b.read(), 14);
  for (const cell of [a, b]) assert.throws(() => cell.write(0), error => error.code === 'READ_ONLY');
  for (const use of [{ variableRef: 'double' }, { variable: spec }]) {
    const bad = connectDerived(scope, `bad-${Object.keys(use)[0]}`, { ...use, inputs: { x: ambient }, schema: { type: 'integer', maximum: 10 } }, variables);
    assert.equal(bad.snapshot().status, 'error'); assert.equal(bad.snapshot().error.code, 'TYPE_MISMATCH');
  }
  assert.equal(ambient.read(), 200); scope.dispose();
});
await test('K01/derived-xor-and-no-ambient-capture', () => {
  const store = new StateProbe(), scope = store.scope(), integer = { type: 'integer' };
  scope.register('ambient', { schema: integer, initial: 100 });
  const spec = { ports: {}, expression: '1' };
  for (const use of [{}, { variableRef: 'v', variable: spec }]) assert.throws(() => connectDerived(scope, 'bad', { ...use, schema: integer }, { v: spec }), error => error.code === 'INVALID_DEFINITION');
  assert.throws(() => connectDerived(scope, 'bad', { variableRef: 'missing', schema: integer }, {}), error => error.code === 'REFERENCE_NOT_FOUND');
  for (const use of [{ variable: { ports: {}, expression: 'ambient' } }, { variableRef: 'v' }]) {
    assert.throws(() => connectDerived(scope, 'bad', { ...use, schema: integer }, { v: { ports: {}, expression: 'ambient' } }), error => error.code === 'INVALID_DEFINITION');
  }
  scope.dispose();
});
await report({ base: import.meta.url, name: process.argv[2] ?? 'cross-boundaries-node24.json', scope: 'Remaining Concat/array-input/host-key/Derived reference boundaries in independent probes; no production registry or full Variable schema adapter', results,
  sources: ['cross-boundaries.mjs', 'report.mjs', 'errors.mjs', '../t2-composite-query/composite-probe.mjs', '../t2-composite-query/harness.mjs', '../t2-query-races/query-probe.mjs', '../t2-query-races/harness.mjs', '../t2-http-boundary/value-expressions.mjs', '../t3-state/state-probe.mjs', '../t3-state/immutable.mjs', '../t3-state/ports-probe.mjs', '../t3-state/clock-variable.mjs', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package-lock.json', '../t1-cel-patch/calendar.mjs', '../t1-cel-patch/guarded.mjs', '../t1-cel-patch/prepare.mjs', '../t1-cel-patch/cel-js-8.0.0.patch', '../t1-cel-patch/patched-sha256.json', '../t1-cel-patch/upstream-sha256.json', '../t1-cel-patch/package-lock.json'], extra: { patchSha256: prepared.patchSha256 } });
