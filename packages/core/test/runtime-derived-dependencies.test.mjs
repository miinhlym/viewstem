import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, createRuntime, createStateStore } from '@viewstem/core';

const integer = { type: 'integer' }, value = { kind: 'Value', schema: integer, required: true }, state = { kind: 'State', schema: integer, required: true };
const path = value => ({ '@path': value });
const leaf = { id: 'leaf', componentRef: 'Leaf' };
function fixture(t, options = {}) {
  const calls = { input: 0, result: 0 };
  const registry = createRegistry({ functions: [
    { name: 'observeInput', inputs: [integer], output: integer, run: n => { calls.input++; return n; } },
    { name: 'observeResult', inputs: [integer], output: integer, run: n => { calls.result++; return n; } },
  ] }).registerComponentContract({ kind: 'Component', id: 'Leaf', spec: { ports: { value: { kind: 'Value', schema: integer } } } });
  const store = createStateStore(), scope = store.createScope(), runtime = createRuntime({ registry, stateStore: store, ...options });
  t.after(() => { runtime.dispose(); store.dispose(); });
  return { calls, registry, store, scope, runtime };
}
const derived = (input, expression = 'observeResult(n)') => ({ kind: 'Derived', schema: integer,
  variable: { ports: { n: value }, expression }, inputs: { n: { '@call': 'observeInput', args: [input] } },
});

test('Derived rebinds current owner ports and definitions without evaluating unchanged inputs', async t => {
  const f = fixture(t), first = f.scope.registerState('first', { schema: integer, initial: 1 }), second = f.scope.registerState('second', { schema: integer, initial: 10 });
  const unrelated = f.scope.registerState('unrelated', { schema: integer, initial: 0 });
  const spec = { ports: { source: state, offset: value, unused: value }, states: { computed: {
    ...derived(path('/ports/source')),
    variable: { ports: { n: value, offset: value }, expression: 'observeResult(n + offset)' },
    inputs: { n: { '@call': 'observeInput', args: [path('/ports/source')] }, offset: path('/ports/offset') },
  } }, render: leaf };
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec, inputs: { source: first, offset: 2, unused: 0 } }); await initial;
  const output = view.getState('computed'), baseline = { ...f.calls };
  assert.equal(output.read(), 3);
  unrelated.write(1); assert.deepEqual(f.calls, baseline);
  await (await view.update(spec, { inputs: { source: first, offset: 2, unused: 1 } })).initialComplete;
  assert.deepEqual(f.calls, baseline);
  await (await view.update(spec, { inputs: { source: first, offset: 4, unused: 1 } })).initialComplete;
  assert.equal(view.getState('computed'), output); assert.equal(output.read(), 5);
  first.write(2); assert.equal(output.read(), 6);
  await (await view.update(spec, { inputs: { source: second, offset: 4, unused: 1 } })).initialComplete;
  assert.equal(output.read(), 14);
  const rebound = { ...f.calls }; first.write(3); assert.deepEqual(f.calls, rebound);
  second.write(11); assert.equal(output.read(), 15);
  const changed = structuredClone(spec); changed.states.computed.variable.expression = 'observeResult(n * 2 + offset)';
  await (await view.update(changed)).initialComplete; assert.equal(output.read(), 26);
  second.write(12); assert.equal(output.read(), 28);
  const final = { ...f.calls }; unrelated.write(2); assert.deepEqual(f.calls, final);
});

test('failed Derived input and definition updates restore the old callback and dependency graph', async t => {
  const f = fixture(t), first = f.scope.registerState('first', { schema: integer, initial: 1 }), second = f.scope.registerState('second', { schema: integer, initial: 10 });
  f.registry.registerComponentContract({ kind: 'Component', id: 'Row', spec: { slots: { default: {} } } });
  const spec = { ports: { source: state }, states: { computed: derived(path('/ports/source')) }, render: { id: 'row', componentRef: 'Row', slots: { default: [leaf] } } };
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec, inputs: { source: first } }); await initial;
  const output = view.getState('computed'), generation = view.getSnapshot().generation;
  const invalid = structuredClone(spec); invalid.states.computed.variable.expression = 'observeResult(n * 100)';
  invalid.render.slots.default.push({ id: 'duplicate', componentRef: 'Leaf', repeat: { items: [1, 1], as: 'item', key: path('/repeat/item') } });
  await assert.rejects(view.update(invalid, { inputs: { source: second } }), { code: 'INVALID_DEFINITION' });
  assert.equal(output.read(), 1); assert.equal(view.getSnapshot().generation, generation); assert.deepEqual(view.exportDefinition(), spec);
  const afterFailure = { ...f.calls }; second.write(11); assert.deepEqual(f.calls, afterFailure);
  first.write(2); assert.equal(output.read(), 2);
  await (await view.update(spec, { inputs: { source: second } })).initialComplete; assert.equal(output.read(), 11);
  first.write(3); assert.equal(output.read(), 11); second.write(12); assert.equal(output.read(), 12);
});

test('whole ports data retains every connected State and Value dependency', async t => {
  const f = fixture(t), source = f.scope.registerState('source', { schema: integer, initial: 1 });
  const unrelated = f.scope.registerState('unrelated', { schema: integer, initial: 0 });
  const spec = { ports: { source: state, offset: value }, states: { computed: {
    kind: 'Derived', schema: integer,
    variable: { ports: { all: { kind: 'Value', schema: { type: 'object', properties: { source: integer, offset: integer }, required: ['source', 'offset'] }, required: true } }, expression: 'observeResult(all.source + all.offset)' },
    inputs: { all: path('/ports') },
  } }, render: leaf };
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec, inputs: { source, offset: 2 } }); await initial;
  const output = view.getState('computed'), baseline = { ...f.calls };
  unrelated.write(1); assert.deepEqual(f.calls, baseline);
  source.write(2); assert.equal(output.read(), 4);
  await (await view.update(spec, { inputs: { source, offset: 3 } })).initialComplete; assert.equal(output.read(), 5);
  source.write(3); assert.equal(output.read(), 6);
});

test('reconnecting the same State through an expired capability cannot reuse a ready Derived value', async t => {
  const f = fixture(t), source = f.scope.registerState('source', { schema: integer, initial: 1 }); let guarded;
  f.registry.registerAction({ kind: 'Action', id: 'capture', spec: { ports: { target: state } } }, ({ inputs }) => { guarded = inputs.target; });
  const author = await f.runtime.createView({ view: { render: leaf } }); await author.initialComplete;
  await f.runtime.invokeAction({ owner: author.view, actionRef: 'capture', inputs: { target: source } });
  const spec = { ports: { source: state }, states: { computed: derived(path('/ports/source')) }, render: leaf };
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec, inputs: { source } }); await initial;
  const output = view.getState('computed'); assert.equal(output.read(), 1);
  author.view.dispose(); assert.throws(() => guarded.getSnapshot(), { code: 'CANCELLED' });
  await (await view.update(spec, { inputs: { source: guarded } })).initialComplete;
  assert.equal(output.getSnapshot().status, 'error'); assert.equal(output.getSnapshot().error.code, 'CANCELLED');
  await (await view.update(spec, { inputs: { source } })).initialComplete;
  assert.equal(output.read(), 1); source.write(2); assert.equal(output.read(), 2);
});

test('Derived Query-port values refresh through a retained owner and conditional removal cancels old cells', async t => {
  let result = 1;
  const f = fixture(t, { requestExecutor: async () => ({ status: 200, headers: {}, body: result }) });
  f.registry.registerResources([{ kind: 'Query', id: 'number', spec: { sources: { http: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/number' } } }, transform: { input: path('/sources/http') } } }]);
  f.registry.registerResources([{ kind: 'Component', id: 'Panel', spec: { ports: { query: { kind: 'Query', required: true } }, states: { computed: derived(path('/ports/query/data')) }, render: { ...leaf, inputs: { value: path('/states/computed') } } } }]);
  const spec = { states: { show: { kind: 'State', schema: { type: 'boolean' }, initial: true } }, queries: { number: { queryRef: 'number' } }, render: { id: 'panel', componentRef: 'Panel', when: path('/states/show'), inputs: { query: path('/queries/number') } } };
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec }); await initial;
  const oldNode = view.getSnapshot().roots[0], output = view.getState('computed', oldNode.instanceId);
  assert.equal(output.read(), 1);
  result = 2; await view.getQuery('number').refresh();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  assert.equal(view.getState('computed', oldNode.instanceId), output); assert.equal(output.read(), 2);
  view.getState('show').write(false); assert.deepEqual(view.getSnapshot().roots, []); assert.throws(() => output.read(), { code: 'CANCELLED' });
  view.getState('show').write(true); const next = view.getSnapshot().roots[0];
  assert.notEqual(next.instanceId, oldNode.instanceId); assert.equal(view.getState('computed', next.instanceId).read(), 2);
});
