import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRegistry, createRuntime } from '@viewstem/core';

const textState = initial => ({ kind: 'State', schema: { type: 'string' }, initial });
const path = value => ({ '@path': value });
const label = { id: 'label', componentRef: 'Label', inputs: { text: path('/states/text') } };
const settle = () => new Promise(resolve => setImmediate(resolve));

function runtime(options = {}) {
  const registry = createRegistry();
  registry.registerComponentContract({
    kind: 'Component', id: 'Label',
    spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } },
  });
  return createRuntime({ registry, ...options });
}

test('View subscriber State writes publish Query results before initial completion', async t => {
  let resolveLoad;
  const host = runtime({ requestExecutor: () => new Promise(resolve => { resolveLoad = resolve; }) });
  t.after(() => host.dispose());
  const { view, initialComplete } = await host.createView({ view: {
    states: { text: textState('') },
    queries: { loaded: { query: {
      sources: { value: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/' } } },
      transform: { input: path('/sources/value') },
    } } },
    render: label,
  } });
  const state = view.getState('text'), query = view.getQuery('loaded'), observed = [];
  view.subscribe(() => {
    const data = query.getSnapshot().data;
    if (typeof data === 'string' && state.read() !== `Loaded: ${data}`) state.write(`Loaded: ${data}`);
  });
  view.subscribe(snapshot => observed.push(snapshot));
  resolveLoad({ status: 200, headers: {}, body: 'Initial' });
  assert.deepEqual(await initialComplete, { generation: 1, queryErrors: [] });
  assert.equal(query.getSnapshot().data, 'Initial');
  assert.equal(state.read(), 'Loaded: Initial');
  assert.equal(view.getSnapshot().roots[0].inputs.text, 'Loaded: Initial');
  assert.equal(observed.at(-1).roots[0].inputs.text, 'Loaded: Initial');
  assert.ok(observed.every(snapshot => snapshot.roots[0].inputs.text === snapshot.states.text.value));
});

test('View subscriber writes coalesce without recursive delivery or endless equal-value notifications', async t => {
  const host = runtime();
  t.after(() => host.dispose());
  const { view, initialComplete } = await host.createView({ view: { states: { text: textState('idle') }, render: label } });
  await initialComplete;
  const state = view.getState('text'), observed = [];
  let depth = 0, maxDepth = 0, calls = 0;
  view.subscribe(snapshot => {
    depth++; maxDepth = Math.max(maxDepth, depth); calls++;
    // Bound a broken scheduler so this regression cannot starve the test runner.
    if (calls < 12) {
      if (snapshot.roots[0].inputs.text === 'start') {
        state.write('intermediate');
        state.write('final');
      } else if (snapshot.roots[0].inputs.text === 'final') state.write('final');
    }
    depth--;
  });
  view.subscribe(snapshot => observed.push(snapshot));
  state.write('start');
  await settle();
  assert.equal(maxDepth, 1);
  assert.equal(state.read(), 'final');
  assert.deepEqual(observed.map(snapshot => snapshot.roots[0].inputs.text), ['idle', 'start', 'final']);
  assert.deepEqual(observed.map(snapshot => snapshot.states.text.value), ['idle', 'start', 'final']);
  assert.equal(calls, 3);
  await settle();
  assert.equal(calls, 3);
});

test('Disposal inside a View subscriber cancels queued projection work', async t => {
  const host = runtime();
  t.after(() => host.dispose());
  const { view, initialComplete } = await host.createView({ view: { states: { text: textState('idle') }, render: label } });
  await initialComplete;
  const state = view.getState('text'), observed = [];
  view.subscribe(snapshot => {
    if (snapshot.roots[0].inputs.text === 'start') {
      state.write('pending');
      view.dispose();
    }
  });
  view.subscribe(snapshot => observed.push(snapshot.roots[0].inputs.text));
  state.write('start');
  await settle();
  assert.deepEqual(observed, ['idle']);
  assert.throws(() => state.read(), { code: 'CANCELLED' });
});

test('Queued subscriber writes cannot restore an old projection after View replacement', async t => {
  const host = runtime();
  t.after(() => host.dispose());
  const { view, initialComplete } = await host.createView({ view: { states: { text: textState('idle') }, render: label } });
  await initialComplete;
  const state = view.getState('text');
  let replacement;
  view.subscribe(snapshot => {
    if (snapshot.roots[0].inputs.text === 'start') {
      state.write('old pending');
      replacement = view.replace({ view: { states: { text: textState('new') }, render: label } });
    }
  });
  state.write('start');
  const applied = await replacement;
  await applied.initialComplete;
  await settle();
  assert.equal(view.getState('text').read(), 'new');
  assert.equal(view.getSnapshot().roots[0].inputs.text, 'new');
  assert.equal(view.getSnapshot().generation, 2);
  assert.throws(() => state.read(), { code: 'CANCELLED' });
});
