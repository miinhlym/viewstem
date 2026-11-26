import { bindTestComponents } from './fixtures/components.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, createStateStore } from '@viewstem/core';
import { createRuntime } from './fixtures/runtime-operations.mjs';
import { memoryUrl, link, tick } from './fixtures/state/url-adapter.mjs';

const integer = { type: 'integer' }, value = { kind: 'Value', schema: integer, required: true }, state = { kind: 'State', schema: integer, required: true };
const path = value => ({ '@path': value });
const leaf = { id: 'leaf', componentRef: 'Leaf' };
function fixture(t, options = {}) {
  const calls = { input: 0, result: 0 };
  const registry = bindTestComponents(createRegistry({ functions: [
    { name: 'observeInput', inputs: [integer], output: integer, run: n => { calls.input++; return n; } },
    { name: 'observeResult', inputs: [integer], output: integer, run: n => { calls.result++; return n; } },
  ] }), [{ kind: 'Component', id: 'Leaf', spec: { ports: { value: { kind: 'Value', schema: integer } } } }]);
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
  bindTestComponents(f.registry, [{ kind: 'Component', id: 'Row', spec: { slots: { default: {} } } }]);
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
  const guardedConsumer = await f.runtime.createView({ view: spec, inputs: { source: guarded } });
  await guardedConsumer.initialComplete;
  const guardedOutput = guardedConsumer.view.getState('computed');
  assert.equal(guardedOutput.read(), 1);
  const output = view.getState('computed'); assert.equal(output.read(), 1);
  await author.view.dispose();
  assert.throws(() => guarded.getSnapshot(), { code: 'CANCELLED' });
  assert.throws(() => guardedOutput.read(), { code: 'CANCELLED' });
  await (await view.update(spec, { inputs: { source: guarded } })).initialComplete;
  assert.equal(output.getSnapshot().status, 'error'); assert.equal(output.getSnapshot().error.code, 'CANCELLED');
  await (await view.update(spec, { inputs: { source } })).initialComplete;
  assert.equal(output.read(), 1); source.write(2); assert.equal(output.read(), 2);
});

test('Derived refreshes a State path read through a dynamic formatString template', async t => {
  const f = fixture(t), string = { type: 'string' };
  const spec = {
    ports: { template: { kind: 'Value', schema: string, required: true } },
    states: {
      source: { kind: 'State', schema: integer, initial: 1 },
      computed: { kind: 'Derived', schema: string,
        variable: { ports: { text: { kind: 'Value', schema: string, required: true } }, expression: 'text' },
        inputs: { text: { '@call': 'formatString', args: { value: path('/ports/template') } } },
      },
    },
    render: leaf,
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec, inputs: { template: '${/states/source}' } });
  await initialComplete;
  const output = view.getState('computed'), source = view.getState('source');
  const observed = [];
  t.after(f.store.subscribe([source.address, output.address], () => observed.push([source.read(), output.read()])));
  source.write(2);
  assert.deepEqual(observed, [[1, '1'], [2, '2']]);
});

for (const target of ['computed', 'peer']) {
  test(`View rejects a dynamic formatString cycle through ${target} without publishing`, async t => {
    const f = fixture(t), string = { type: 'string' };
    const text = { kind: 'Value', schema: string, required: true };
    const spec = {
      ports: { template: text },
      states: {
        source: { kind: 'State', schema: string, initial: 'true' },
        computed: { kind: 'Derived', schema: string,
          variable: { ports: { text }, expression: "text == 'true' ? 'false' : 'true'" },
          inputs: { text: { '@call': 'formatString', args: { value: path('/ports/template') } } },
        },
        peer: { kind: 'Derived', schema: string,
          variable: { ports: { text }, expression: 'text' },
          inputs: { text: path('/states/computed') },
        },
      },
      render: leaf,
    };
    const { view, initialComplete } = await f.runtime.createView({ view: spec, inputs: { template: '${/states/source}' } });
    await initialComplete;
    const output = view.getState('computed'), peer = view.getState('peer');
    assert.equal(output.read(), 'false');
    let updates = 0;
    t.after(f.store.subscribe(output.address, ({ changes }) => {
      // Stop a regressed notification loop so the test can fail and report it.
      if (changes.length && ++updates === 8) void view.dispose();
    }));

    await assert.rejects(view.setInputs({ template: '${/states/' + target + '}' }), { code: 'INVALID_DEFINITION' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(output.read(), 'false');
    assert.equal(peer.read(), 'false');
    assert.equal(updates, 0);
    view.getState('source').write('false');
    assert.equal(output.read(), 'true');
    assert.equal(peer.read(), 'true');
    assert.equal(updates, 1);
  });
}

test('dynamic Derived writes settle the newly selected dependency before reactions publish', async t => {
  const f = fixture(t), string = { type: 'string' };
  const text = { kind: 'Value', schema: string, required: true };
  const state = initial => ({ kind: 'State', schema: string, initial });
  const derive = (input, expression = 'text') => ({
    kind: 'Derived', schema: string, variable: { ports: { text }, expression }, inputs: { text: input },
  });
  const { view, initialComplete } = await f.runtime.createView({ view: {
    states: {
      template: state('${/states/fallback}'),
      fallback: state('new'),
      computed: derive({ '@call': 'formatString', args: { value: path('/states/template') } }),
      peer: derive(path('/states/template'), "text.contains('peer') ? 'new' : 'before'"),
      reactionTarget: state('unfired'),
    },
    reactions: [{ watch: [path('/states/computed')], target: path('/states/reactionTarget'), value: 'fired' }],
    render: leaf,
  } });
  await initialComplete;
  const names = ['template', 'computed', 'peer', 'reactionTarget'];
  const handles = names.map(name => view.getState(name));
  const observed = [];
  t.after(f.store.subscribe(handles.map(handle => handle.address), ({ changes }) => {
    observed.push([handles.map(handle => handle.read()), changes.map(change => change.target.name)]);
  }));
  handles[0].write('${/states/peer}');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(observed, [
    [['${/states/fallback}', 'new', 'before', 'unfired'], []],
    [['${/states/peer}', 'new', 'new', 'unfired'], ['template', 'peer']],
  ]);
});

test('dynamic Deriveds recover from a cycle in the State write that breaks it', async t => {
  const f = fixture(t), string = { type: 'string' };
  const text = { kind: 'Value', schema: string, required: true };
  const fromTemplate = template => ({
    kind: 'Derived', schema: string, variable: { ports: { text }, expression: 'text' },
    inputs: { text: { '@call': 'formatString', args: { value: path(template) } } },
  });
  const { view, initialComplete } = await f.runtime.createView({
    view: {
      ports: { peerTemplate: text },
      states: {
        selector: { kind: 'State', schema: string, initial: '${/states/source}' },
        source: { kind: 'State', schema: string, initial: 'value' },
        computed: fromTemplate('/states/selector'),
        peer: fromTemplate('/ports/peerTemplate'),
      },
      render: leaf,
    },
    inputs: { peerTemplate: '${/states/computed}' },
  });
  await initialComplete;
  const selector = view.getState('selector'), computed = view.getState('computed'), peer = view.getState('peer');
  const observed = [];
  t.after(f.store.subscribe([selector.address, computed.address, peer.address], () => {
    observed.push([computed.getSnapshot(), peer.getSnapshot()].map(value => value.error?.code ?? value.value));
  }));
  selector.write('${/states/peer}');
  selector.write('${/states/source}');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(observed, [
    ['value', 'value'],
    ['INVALID_DEFINITION', 'INVALID_DEFINITION'],
    ['value', 'value'],
  ]);
});

test('a View application validates dynamic paths against its candidate reactions', async t => {
  const f = fixture(t), string = { type: 'string' };
  const text = { kind: 'Value', schema: string, required: true };
  const spec = {
    ports: { template: text },
    states: {
      source: { kind: 'State', schema: string, initial: 'old' },
      computed: { kind: 'Derived', schema: string,
        variable: { ports: { text }, expression: 'text' },
        inputs: { text: { '@call': 'formatString', args: { value: path('/ports/template') } } },
      },
      target: { kind: 'State', schema: string, initial: 'new' },
    },
    reactions: [{ watch: [path('/states/computed')], target: path('/states/target'), value: 'fired' }],
    render: leaf,
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec, inputs: { template: '${/states/source}' } });
  await initialComplete;
  const output = view.getState('computed'), target = view.getState('target');
  const observed = [];
  t.after(f.store.subscribe(output.address, () => observed.push(output.getSnapshot())));
  const inputs = { template: '${/states/target}' };
  await assert.rejects(view.setInputs(inputs), { code: 'INVALID_DEFINITION' });
  assert.equal(output.read(), 'old');
  assert.equal(target.read(), 'new');

  const next = { ...spec, reactions: [] };
  await view.whenSettled(await view.updateDefinition(next, { inputs }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(observed, [{ status: 'ready', value: 'old' }, { status: 'ready', value: 'new' }]);
  target.write('later');
  assert.equal(output.read(), 'later');
});

test('external reactions participate in candidate validation and unblock live reads when disconnected', async t => {
  const f = fixture(t), string = { type: 'string' };
  const text = { kind: 'Value', schema: string, required: true };
  const target = f.scope.registerState('serviceTarget', { schema: string, initial: 'target' });
  const spec = {
    ports: { target: { kind: 'State', schema: string, required: true } },
    states: {
      source: { kind: 'State', schema: string, initial: 'source' },
      selector: { kind: 'State', schema: string, initial: '${/states/source}' },
      computed: { kind: 'Derived', schema: string,
        variable: { ports: { text }, expression: 'text' },
        inputs: { text: { '@call': 'formatString', args: { value: path('/states/selector') } } },
      },
    },
    render: leaf,
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec, inputs: { target } });
  await initialComplete;
  const output = view.getState('computed'), selector = view.getState('selector');
  const stop = f.store.registerReaction(f.scope, { watch: [output], target, value: 'fired' });
  const observed = [];
  t.after(f.store.subscribe(output.address, () => {
    const snapshot = output.getSnapshot();
    observed.push(snapshot.error?.code ?? snapshot.value);
  }));
  const next = '${/ports/target}';
  await assert.rejects(view.updateDefinition(spec, { states: { selector: next } }), { code: 'INVALID_DEFINITION' });
  assert.equal(selector.read(), '${/states/source}');
  assert.deepEqual(observed, ['source']);
  selector.write(next);
  assert.throws(() => output.read(), { code: 'INVALID_DEFINITION' });
  stop();
  assert.equal(output.read(), 'target');
  assert.equal(target.read(), 'target');
  assert.deepEqual(observed, ['source', 'INVALID_DEFINITION', 'target']);
});

test('a View cannot introduce a cycle using only external reaction ports', async t => {
  const f = fixture(t), string = { type: 'string' };
  const port = { kind: 'State', schema: string, required: true };
  const text = { kind: 'Value', schema: string, required: true };
  const target = f.scope.registerState('target', { schema: string, initial: 'target' });
  const bridge = f.scope.registerState('bridge', { schema: string, initial: 'bridge' });
  const first = await f.runtime.createView({
    view: {
      ports: { target: port, template: text },
      states: { computed: {
        kind: 'Derived', schema: string, variable: { ports: { text }, expression: 'text' },
        inputs: { text: { '@call': 'formatString', args: { value: path('/ports/template') } } },
      } },
      render: leaf,
    },
    inputs: { target, template: '${/ports/target}' },
  });
  await first.initialComplete;
  const output = first.view.getState('computed');
  const before = output.getSnapshot();
  f.store.registerReaction(f.scope, { watch: [output], target: bridge, value: 'fired' });
  const observed = [];
  t.after(f.store.subscribe(output.address, () => observed.push(output.getSnapshot())));
  await assert.rejects(f.runtime.createView({
    view: {
      ports: { target: port, bridge: port },
      reactions: [{ watch: [path('/ports/bridge')], target: path('/ports/target'), value: 'cycle' }],
      render: leaf,
    },
    inputs: { target, bridge },
  }), { code: 'INVALID_DEFINITION' });
  assert.equal(output.getSnapshot(), before);
  assert.deepEqual(observed, [before]);
  target.write('healthy');
  assert.equal(output.read(), 'healthy');
  assert.equal(bridge.read(), 'fired');
});

test('View state settlement replays only surviving reactions before its first projection', async t => {
  const f = fixture(t), string = { type: 'string' }, boolean = { type: 'boolean' };
  const text = { kind: 'Value', schema: string, required: true };
  const stringState = { kind: 'State', schema: string, required: true };
  const state = (schema, initial) => ({ kind: 'State', schema, initial });
  const reaction = (watch, target, value) => ({ watch: [path(watch)], target: path(target), value });
  bindTestComponents(f.registry, [
    { kind: 'Component', id: 'Row', spec: { slots: { default: {} } } },
    { kind: 'Component', id: 'Label', spec: { ports: { value: text } } },
  ]);
  f.registry.registerResources([{ kind: 'Component', id: 'Child', spec: {
    ports: { bridge: stringState, target: stringState, extra: stringState, trigger: statePort(integer) },
    reactions: [
      reaction('/ports/bridge', '/ports/target', 'child'),
      reaction('/ports/trigger', '/ports/extra', 'leaked'),
    ],
    render: { ...leaf, id: 'child-leaf' },
  } }]);
  const spec = {
    states: {
      trigger: state(integer, 0),
      selector: state(string, '${/states/source}'),
      source: state(string, 'source'),
      target: state(string, 'target'),
      extra: state(string, 'safe'),
      bridge: state(string, 'unfired'),
      show: state(boolean, true),
      computed: { kind: 'Derived', schema: string,
        variable: { ports: { text }, expression: 'text' },
        inputs: { text: { '@call': 'formatString', args: { value: path('/states/selector') } } },
      },
    },
    reactions: [
      reaction('/states/trigger', '/states/selector', '${/states/target}'),
      reaction('/states/trigger', '/states/show', false),
      reaction('/states/computed', '/states/bridge', 'fired'),
    ],
    render: { id: 'row', componentRef: 'Row', slots: { default: [
      { id: 'child', componentRef: 'Child', when: path('/states/show'), inputs: {
        trigger: path('/states/trigger'), bridge: path('/states/bridge'),
        target: path('/states/target'), extra: path('/states/extra'),
      } },
      { id: 'label', componentRef: 'Label', inputs: { value: path('/states/computed') } },
    ] } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const originalGeneration = view.getSnapshot().generation;
  const names = ['trigger', 'computed', 'bridge', 'target', 'extra'];
  const handles = names.map(name => view.getState(name));
  const observed = [], projections = [];
  t.after(f.store.subscribe(handles.map(handle => handle.address), () => {
    observed.push(handles.map(handle => handle.getSnapshot().value));
  }));
  t.after(view.subscribe(snapshot => {
    if (snapshot.generation <= originalGeneration) return;
    const nodes = snapshot.roots[0].children;
    projections.push(nodes.map(node => [node.id, node.status, node.inputs.value]));
  }));
  const cyclic = { ...spec, reactions: spec.reactions.filter(rule => rule.target['@path'] !== '/states/show') };
  await assert.rejects(view.updateDefinition(cyclic, { states: { trigger: 1 } }), { code: 'INVALID_DEFINITION' });
  assert.equal(view.getSnapshot().generation, originalGeneration);
  assert.deepEqual(observed, [[0, 'source', 'unfired', 'target', 'safe']]);

  const next = { ...spec, states: { ...spec.states,
    loaded: { kind: 'State', schema: string, initial: path('/states/bridge') },
  } };
  await view.whenSettled(await view.updateDefinition(next, { states: { trigger: 1 } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(observed, [[0, 'source', 'unfired', 'target', 'safe'], [1, 'target', 'fired', 'target', 'safe']]);
  assert.deepEqual(projections[0], [['label', 'ready', 'target']]);
  assert.ok(projections.every(nodes => nodes.length === 1 && nodes[0][1] === 'ready'));
  const loaded = view.getState('loaded');
  assert.equal(loaded.read(), 'fired');
  loaded.write('different');
  loaded.reset();
  assert.equal(loaded.read(), 'fired');

  function statePort(schema) { return { kind: 'State', schema, required: true }; }
});

test('View rejects a reaction that repeatedly removes and restores its own owner', async t => {
  const f = fixture(t), boolean = { type: 'boolean' };
  f.registry.registerResources([{ kind: 'Component', id: 'Toggle', spec: {
    ports: { trigger: state, show: { kind: 'State', schema: boolean, required: true } },
    reactions: [{ watch: [path('/ports/trigger')], target: path('/ports/show'), value: false }],
    render: leaf,
  } }]);
  const spec = {
    states: {
      trigger: { kind: 'State', schema: integer, initial: 0 },
      show: { kind: 'State', schema: boolean, initial: true },
    },
    render: { id: 'toggle', componentRef: 'Toggle', when: path('/states/show'),
      inputs: { trigger: path('/states/trigger'), show: path('/states/show') },
    },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const original = view.getSnapshot(), trigger = view.getState('trigger'), show = view.getState('show');
  const observed = [];
  t.after(f.store.subscribe([trigger.address, show.address], () => observed.push([trigger.read(), show.read()])));
  await assert.rejects(view.updateDefinition(spec, { states: { trigger: 1 } }), { code: 'INVALID_DEFINITION' });
  assert.deepEqual(observed, [[0, true]]);
  assert.equal(view.getSnapshot().generation, original.generation);
  assert.equal(view.getSnapshot().roots[0].instanceId, original.roots[0].instanceId);
});

for (const [trigger, delta, previous] of [[0, 0], [1, 0], [0, 1], [0, 0, 9]]) test(`View replay separates initialization from writes ${trigger},${delta},${previous}`, async t => {
  const f = fixture(t);
  f.registry.registerResources([{ kind: 'Component', id: 'Initializing', spec: {
    ports: { input: { kind: 'Value', schema: integer }, delta: value, trigger: state, output: state },
    states: { loaded: { kind: 'State', schema: integer, initial: path('/ports/input') }, calculated: {
      kind: 'Derived', schema: integer, variable: { ports: { n: value, delta: value }, expression: 'n + delta' },
      inputs: { n: path('/states/loaded'), delta: path('/ports/delta') },
    } },
    reactions: [
      { watch: [path('/ports/trigger')], target: path('/states/loaded'), value: 9 },
      { watch: [path('/states/calculated')], target: path('/ports/output'), value: 1 },
    ],
    render: leaf,
  } }]);
  const spec = {
    states: {
      input: { kind: 'State', schema: integer },
      trigger: { kind: 'State', schema: integer, initial: 0 },
      delta: { kind: 'State', schema: integer, initial: 0 },
      output: { kind: 'State', schema: integer, initial: 0 },
    },
    render: { id: 'owner', componentRef: 'Initializing',
      inputs: { input: path('/states/input'), delta: path('/states/delta'), trigger: path('/states/trigger'), output: path('/states/output') },
    },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const owner = view.getSnapshot().roots[0].instanceId;
  const loaded = view.getState('loaded', owner);
  assert.equal(loaded.getSnapshot().status, 'pending');
  const output = view.getState('output');
  if (previous !== undefined) {
    loaded.write(previous);
    output.write(0);
  }
  const observed = [];
  t.after(f.store.subscribe(loaded.address, () => observed.push(loaded.getSnapshot())));
  await view.whenSettled(await view.updateDefinition(spec, { states: { input: 5, trigger, delta } }));
  assert.equal(view.getState('loaded', owner), loaded);
  assert.deepEqual(observed, previous === undefined
    ? [{ status: 'pending' }, { status: 'ready', value: trigger ? 9 : 5 }]
    : [{ status: 'ready', value: previous }]);
  assert.equal(output.read(), trigger || delta);
  loaded.reset();
  assert.equal(loaded.read(), 5);
});

for (const [throughRepeat, delta, blocked] of [
  [false, 0], [false, 1], [true, 0], [true, 1], [false, 0, 'pending'], [false, 1, 'pending'],
  [false, 0, 'error'], [false, 1, 'error'],
]) {
  test(`View replay isolates initialization through Value ports (repeat=${throughRepeat}, delta=${delta}, before=${blocked ?? 'ready'})`, async t => {
    const f = fixture(t);
    const waiting = blocked === 'pending', invalidGate = blocked === 'error';
    bindTestComponents(f.registry, [{ kind: 'Component', id: 'Row', spec: { slots: { default: {} } } }]);
    f.registry.registerResources([
      { kind: 'Component', id: 'Watcher', spec: {
        ports: { input: value, delta: value, output: state },
        states: { seen: {
          kind: 'Derived', schema: integer,
          variable: { ports: { input: value, delta: value }, expression: 'input + delta' },
          inputs: { input: path('/ports/input'), delta: path('/ports/delta') },
        } },
        reactions: [{ watch: [path('/states/seen')], target: path('/ports/output'), value: 1 }],
        render: leaf,
      } },
      { kind: 'Component', id: 'Relay', spec: {
        ports: { input: value, delta: value, output: state, gate: { kind: 'Value', schema: integer } },
        render: { id: 'watcher', componentRef: 'Watcher',
          inputs: { input: path('/ports/input'), delta: path('/ports/delta'), output: path('/ports/output') },
        },
      } },
    ]);
    const items = { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, n: integer }, required: ['id', 'n'] } };
    const relay = { id: 'relay', componentRef: 'Relay',
      ...(throughRepeat ? { repeat: { items: path('/states/input'), as: 'item', key: path('/repeat/item/id') } } : {}),
      inputs: { input: throughRepeat ? path('/repeat/item/n') : waiting ? 0 : path('/states/input'),
        delta: path('/states/delta'), output: path('/states/output') },
    };
    const row = node => ({ id: 'row', componentRef: 'Row', slots: { default: [node] } });
    const spec = {
      states: {
        input: { kind: 'State', schema: throughRepeat ? items : integer,
          ...(!waiting && { initial: throughRepeat ? [{ id: 'stable', n: 0 }] : 0 }) },
        ...(waiting && { loaded: { kind: 'State', schema: integer, initial: path('/states/input') } }),
        ...(invalidGate && {
          loaded: { kind: 'State', schema: integer, initial: 5 },
          gate: { kind: 'State', schema: true, initial: 'invalid' },
        }),
        delta: { kind: 'State', schema: integer, initial: 0 },
        output: { kind: 'State', schema: integer, initial: 0 },
      },
      render: row(relay),
    };
    const { view, initialComplete } = await f.runtime.createView({ view: spec });
    await initialComplete;
    const watcher = () => view.getSnapshot().roots[0].children[0].children[0].instanceId;
    const owner = watcher(), seen = view.getState('seen', owner), output = view.getState('output');
    if (waiting) assert.equal(view.getState('loaded').getSnapshot().status, 'pending');
    const observed = [];
    t.after(f.store.subscribe([seen.address, output.address], () => observed.push([seen.read(), output.read()])));
    const next = {
      ...spec,
      states: { ...spec.states, loaded: { kind: 'State', schema: spec.states.input.schema, initial: path('/states/input') } },
      render: row(throughRepeat
        ? { ...relay, repeat: { ...relay.repeat, items: path('/states/loaded') } }
        : { ...relay, inputs: { ...relay.inputs, input: path('/states/loaded'),
          ...(invalidGate && { gate: path('/states/gate') }) } }),
    };
    const input = throughRepeat ? [{ id: 'stable', n: 5 }] : 5;
    await view.whenSettled(await view.updateDefinition(next, { states: { input, delta, ...(invalidGate && { gate: 0 }) } }));
    assert.equal(watcher(), owner);
    const loaded = view.getState('loaded').read();
    assert.equal(throughRepeat ? loaded[0].n : loaded, 5);
    assert.equal(seen.read(), 5 + delta);
    assert.equal(output.read(), delta);
    assert.deepEqual(observed, [[0, 0], [5 + delta, delta]]);
  });
}

test('a Reaction cannot feed its own Derived through a Value port', async t => {
  const f = fixture(t);
  f.registry.registerResources([{ kind: 'Component', id: 'Reviewer', spec: {
    ports: { input: value, target: state },
    states: { seen: derived(path('/ports/input')) },
    reactions: [{ watch: [path('/states/seen')], target: path('/ports/target'), value: 9 }],
    render: leaf,
  } }]);
  const spec = {
    states: {
      input: { kind: 'State', schema: integer, initial: 0 },
      output: { kind: 'State', schema: integer, initial: 0 },
    },
    render: { id: 'reviewer', componentRef: 'Reviewer',
      inputs: { input: path('/states/input'), target: path('/states/output') } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const input = view.getState('input'), output = view.getState('output');
  const observed = [];
  t.after(f.store.subscribe([input.address, output.address], () => observed.push([input.read(), output.read()])));
  const cyclic = { ...spec, render: { ...spec.render, inputs: { ...spec.render.inputs, target: path('/states/input') } } };
  await assert.rejects(view.updateDefinition(cyclic, { states: { input: 1 } }), { code: 'INVALID_DEFINITION' });
  assert.deepEqual(observed, [[0, 0]]);
  await view.whenSettled(await view.updateDefinition(spec, { states: { input: 1 } }));
  assert.deepEqual(observed, [[0, 0], [1, 9]]);
});

test('whole ports compares omitted optional Values consistently and traces the remaining ports', async t => {
  const f = fixture(t);
  const all = { kind: 'Value', required: true, schema: {
    type: 'object', properties: { input: integer, delta: integer }, required: ['input', 'delta'],
  } };
  f.registry.registerResources([{ kind: 'Component', id: 'Aggregate', spec: {
    ports: { unused: { kind: 'Value', schema: integer }, input: value, delta: value },
    states: {
      seen: { kind: 'Derived', schema: integer,
        variable: { ports: { all }, expression: 'all.input' }, inputs: { all: path('/ports') } },
      output: { kind: 'State', schema: integer, initial: 0 },
    },
    reactions: [{ watch: [path('/states/seen')], target: path('/states/output'), value: 9 }],
    render: leaf,
  } }]);
  const spec = {
    states: {
      input: { kind: 'State', schema: integer, initial: 1 },
      delta: { kind: 'State', schema: integer, initial: 0 },
    },
    render: { id: 'aggregate', componentRef: 'Aggregate',
      inputs: { input: path('/states/input'), delta: path('/states/delta') } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const id = view.getSnapshot().roots[0].instanceId, seen = view.getState('seen', id);
  const output = view.getState('output', id);
  await view.whenSettled(await view.updateDefinition(spec, { states: { delta: 1 } }));
  assert.equal(seen.read(), 1);
  assert.equal(output.read(), 0);
  assert.throws(() => f.store.registerReaction(f.scope, { watch: [seen], target: view.getState('input'), value: 9 }),
    { code: 'INVALID_DEFINITION' });
});

test('a nested repeat traces the alias that the watched Value reads', async t => {
  const f = fixture(t);
  bindTestComponents(f.registry, [{ kind: 'Component', id: 'Row', spec: { slots: { default: {} } } }]);
  const items = { type: 'array', items: {
    type: 'object', properties: { id: { type: 'string' }, n: integer }, required: ['id', 'n'],
  } };
  f.registry.registerResources([{ kind: 'Component', id: 'NestedWatcher', spec: {
    ports: { input: value, target: { kind: 'State', schema: items, required: true } },
    states: { seen: derived(path('/ports/input')) },
    reactions: [{ watch: [path('/states/seen')], target: path('/ports/target'), value: [{ id: 'stable', n: 9 }] }],
    render: leaf,
  } }]);
  const makeSpec = input => ({
    states: {
      outer: { kind: 'State', schema: { type: 'array', items: integer }, initial: [1] },
      target: { kind: 'State', schema: items, initial: [{ id: 'stable', n: 0 }] },
    },
    render: { id: 'root', componentRef: 'Row', slots: { default: [{
      id: 'outer', componentRef: 'Row', repeat: { items: path('/states/outer'), as: 'outer', key: path('/repeat/outer') },
      slots: { default: [{
        id: 'inner', componentRef: 'NestedWatcher',
        repeat: { items: path('/states/target'), as: 'inner', key: path('/repeat/inner/id') },
        inputs: { input: path(input), target: path('/states/target') },
      }] },
    }] } },
  });
  const { view, initialComplete } = await f.runtime.createView({ view: makeSpec('/repeat/outer') });
  await initialComplete;
  const watcher = view.getSnapshot().roots[0].children[0].children[0];
  assert.equal(view.getState('seen', watcher.instanceId).read(), 1);
  await assert.rejects(view.updateDefinition(makeSpec('/repeat/inner/n')), { code: 'INVALID_DEFINITION' });
  assert.equal(view.getState('target').read()[0].n, 0);
  assert.equal(view.getState('seen', watcher.instanceId).read(), 1);
});

for (const cycle of [false, true]) test(`a suspended owner has no active Derived binding (cycle=${cycle})`, async t => {
  const f = fixture(t), string = { type: 'string' }, text = { kind: 'Value', schema: string, required: true };
  f.registry.registerResources([{ kind: 'Component', id: 'Suspendable', spec: {
    ports: { input: text, gate: text },
    states: { seen: { kind: 'Derived', schema: string,
      variable: { ports: { input: text }, expression: 'input' }, inputs: { input: path('/ports/input') } } },
    render: leaf,
  } }]);
  const spec = {
    states: {
      selector: { kind: 'State', schema: string, initial: '${/states/source}' },
      source: { kind: 'State', schema: string, initial: 'safe' },
      target: { kind: 'State', schema: string, initial: 'unfired' },
      missing: { kind: 'State', schema: string },
    },
    render: { id: 'watcher', componentRef: 'Suspendable', inputs: {
      input: cycle ? { '@call': 'formatString', args: { value: path('/states/selector') } } : path('/states/source'),
      gate: 'ready',
    } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const id = view.getSnapshot().roots[0].instanceId, seen = view.getState('seen', id), target = view.getState('target');
  t.after(f.store.registerReaction(f.scope, { watch: [seen], target, value: 'fired' }));
  const next = {
    states: { ...spec.states },
    render: { ...spec.render, inputs: { input: cycle ? path('/states/source') : 'safe', gate: path('/states/missing') } },
  };
  if (!cycle) delete next.states.source;
  await view.whenSettled(await view.updateDefinition(next, { states: { selector: '${/states/target}' } }));
  assert.equal(view.getSnapshot().roots[0].status, 'pending');
  assert.equal(view.getSnapshot().roots[0].instanceId, id);
  assert.equal(seen.read(), 'safe');
  assert.equal(target.read(), 'unfired');
  await view.whenSettled(await view.updateDefinition(next, { states: { missing: 'ready' } }));
  assert.equal(view.getSnapshot().roots[0].status, 'ready');
  assert.equal(view.getState('seen', id), seen);
  assert.equal(target.read(), 'unfired');
});

test('a late Derived initializes without a Reaction during its first View application', async t => {
  const f = fixture(t);
  f.registry.registerResources([{ kind: 'Component', id: 'LateWatcher', spec: {
    ports: { source: state, output: state },
    states: {
      loaded: { kind: 'State', schema: integer, initial: path('/ports/source') },
      seen: derived(path('/states/loaded')),
    },
    reactions: [{ watch: [path('/states/seen')], target: path('/ports/output'), value: 9 }],
    render: leaf,
  } }]);
  const spec = {
    states: {
      trigger: { kind: 'State', schema: integer, initial: 0 },
      output: { kind: 'State', schema: integer, initial: 0 },
      source: { kind: 'State', schema: integer },
      show: { kind: 'State', schema: { type: 'boolean' }, initial: false },
    },
    reactions: [{ watch: [path('/states/trigger')], target: path('/states/source'), value: 5 }],
    render: { id: 'late-watcher', componentRef: 'LateWatcher', when: path('/states/show'),
      inputs: { source: path('/states/source'), output: path('/states/output') } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  await view.whenSettled(await view.updateDefinition(spec, { states: { trigger: 1, show: true } }));
  const id = view.getSnapshot().roots[0].instanceId;
  assert.equal(view.getState('seen', id).read(), 5);
  assert.equal(view.getState('output').read(), 0);
});

test('discarded effects cannot seed the Reaction of a late Derived', async t => {
  const f = fixture(t);
  bindTestComponents(f.registry, [{ kind: 'Component', id: 'Row', spec: { slots: { default: {} } } }]);
  f.registry.registerResources([
    { kind: 'Component', id: 'Early', spec: {
      ports: { trigger: state, target: state },
      reactions: [{ watch: [path('/ports/trigger')], target: path('/ports/target'), value: 5 }],
      render: leaf,
    } },
    { kind: 'Component', id: 'Late', spec: {
      ports: { source: state, output: state },
      states: { seen: derived(path('/ports/source')) },
      reactions: [{ watch: [path('/states/seen')], target: path('/ports/output'), value: 9 }],
      render: leaf,
    } },
  ]);
  const integerState = { kind: 'State', schema: integer, initial: 0 };
  const boolean = { type: 'boolean' };
  const spec = {
    states: { trigger: integerState, input: integerState, output: integerState,
      early: { kind: 'State', schema: boolean, initial: true },
      late: { kind: 'State', schema: boolean, initial: false },
    },
    reactions: [
      { watch: [path('/states/trigger')], target: path('/states/early'), value: false },
      { watch: [path('/states/trigger')], target: path('/states/late'), value: true },
    ],
    render: { id: 'row', componentRef: 'Row', slots: { default: [
      { id: 'early', componentRef: 'Early', when: path('/states/early'),
        inputs: { trigger: path('/states/trigger'), target: path('/states/input') } },
      { id: 'late', componentRef: 'Late', when: path('/states/late'),
        inputs: { source: path('/states/input'), output: path('/states/output') } },
    ] } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  await view.whenSettled(await view.updateDefinition(spec, { states: { trigger: 1 } }));
  const [late] = view.getSnapshot().roots[0].children;
  assert.equal(late.id, 'late');
  assert.equal(view.getState('seen', late.instanceId).read(), 0);
  assert.equal(view.getState('output').read(), 0);
  view.getState('input').write(2);
  assert.equal(view.getState('output').read(), 9);
});

test('an independent Store write still runs a service Reaction watching a suspended owner', async t => {
  const f = fixture(t);
  const source = f.scope.registerState('source', { schema: integer, initial: 0 });
  const output = f.scope.registerState('output', { schema: integer, initial: 0 });
  f.registry.registerResources([{ kind: 'Component', id: 'SourceWatcher', spec: {
    ports: { source: state, gate: value },
    states: { seen: derived(path('/ports/source')) },
    render: leaf,
  } }]);
  const spec = {
    ports: { source: state, gate: { kind: 'Value', schema: integer } },
    render: { id: 'watcher', componentRef: 'SourceWatcher',
      inputs: { source: path('/ports/source'), gate: path('/ports/gate') } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec, inputs: { source, gate: 0 } });
  await initialComplete;
  const id = view.getSnapshot().roots[0].instanceId, seen = view.getState('seen', id);
  t.after(f.store.registerReaction(f.scope, { watch: [seen], target: output, value: 9 }));
  await view.whenSettled(await view.setInputs({ source }));
  assert.equal(view.getSnapshot().roots[0].status, 'pending');
  source.write(1);
  assert.equal(seen.read(), 1);
  assert.equal(output.read(), 9);
  await view.whenSettled(await view.setInputs({ source, gate: 0 }));
  assert.equal(view.getState('seen', id), seen);
});

test('suspension preserves the committed State binding through speculative retargeting', async t => {
  const f = fixture(t);
  const first = f.scope.registerState('first', { schema: integer, initial: 0 });
  const second = f.scope.registerState('second', { schema: integer, initial: 10 });
  const output = f.scope.registerState('output', { schema: integer, initial: 0 });
  f.registry.registerResources([{ kind: 'Component', id: 'SourceWatcher', spec: {
    ports: { source: state, gate: value },
    states: { seen: derived(path('/ports/source')) },
    render: leaf,
  } }]);
  const spec = {
    ports: { first: state, second: state },
    states: { gate: { kind: 'State', schema: true, initial: 0 } },
    render: { id: 'watcher', componentRef: 'SourceWatcher',
      inputs: { source: path('/ports/first'), gate: path('/states/gate') } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec, inputs: { first, second } });
  await initialComplete;
  const id = view.getSnapshot().roots[0].instanceId, seen = view.getState('seen', id);
  t.after(f.store.registerReaction(f.scope, { watch: [seen], target: output, value: 9 }));
  const next = { ...spec, render: { ...spec.render, inputs: { ...spec.render.inputs, source: path('/ports/second') } } };
  await view.whenSettled(await view.updateDefinition(next, { states: { gate: 'invalid' } }));
  assert.equal(view.getSnapshot().roots[0].status, 'error');
  assert.equal(view.getState('seen', id), seen);
  second.write(11);
  assert.deepEqual([seen.read(), output.read()], [0, 0]);
  first.write(1);
  assert.deepEqual([seen.read(), output.read()], [1, 9]);
  output.write(0);
  await view.whenSettled(await view.updateDefinition(next, { states: { gate: 0 } }));
  assert.equal(view.getState('seen', id), seen);
  assert.deepEqual([seen.read(), output.read()], [11, 0]);
});

test('a new owner suspended before commit does not publish provisional State', async t => {
  const f = fixture(t);
  f.registry.registerResources([{ kind: 'Component', id: 'NewWatcher', spec: {
    ports: { gate: value },
    states: { seen: derived(path('/ports/gate')) },
    render: leaf,
  } }]);
  const spec = { states: { gate: { kind: 'State', schema: true, initial: 1 } }, render: leaf };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const observed = [];
  t.after(f.store.subscribe(undefined, ({ changes }) => observed.push(...changes.map(change => change.target.name))));
  const next = { ...spec, render: { id: 'watcher', componentRef: 'NewWatcher', inputs: { gate: path('/states/gate') } } };
  await view.whenSettled(await view.updateDefinition(next, { states: { gate: 'invalid' } }));
  const node = view.getSnapshot().roots[0];
  assert.equal(node.status, 'error');
  assert.throws(() => view.getState('seen', node.instanceId), { code: 'REFERENCE_NOT_FOUND' });
  assert.deepEqual(observed, ['gate']);
  await view.whenSettled(await view.updateDefinition(next, { states: { gate: 2 } }));
  assert.equal(view.getState('seen', view.getSnapshot().roots[0].instanceId).read(), 2);
  assert.equal(observed.filter(name => name === 'seen').length, 1);
});

test('a suspended owner keeps its committed State declarations until resumption', async t => {
  const f = fixture(t);
  const spec = {
    states: { gate: { kind: 'State', schema: true, initial: 0 } },
    render: { id: 'watcher', component: {
      ports: { gate: value },
      states: { count: { kind: 'State', schema: integer, initial: 7 } },
      render: leaf,
    }, inputs: { gate: path('/states/gate') } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const id = view.getSnapshot().roots[0].instanceId, count = view.getState('count', id);
  const changes = [];
  t.after(f.store.subscribe(undefined, batch => {
    changes.push(...batch.changes.filter(change => ['count', 'different'].includes(change.target.name))
      .map(change => [change.kind, change.target.name]));
  }));
  const next = { ...spec, render: { ...spec.render, component: { ...spec.render.component,
    states: { different: { kind: 'State', schema: integer, initial: 9 } },
  } } };
  await view.whenSettled(await view.updateDefinition(next, { states: { gate: 'invalid' } }));
  assert.equal(view.getSnapshot().roots[0].status, 'error');
  assert.equal(view.getState('count', id), count);
  assert.equal(count.read(), 7);
  assert.throws(() => view.getState('different', id), { code: 'REFERENCE_NOT_FOUND' });
  assert.deepEqual(changes, []);

  await view.whenSettled(await view.updateDefinition(next, { states: { gate: 0 } }));
  assert.equal(view.getState('different', id).read(), 9);
  assert.throws(() => count.read(), { code: 'CANCELLED' });
  assert.deepEqual(changes.sort(), [['added', 'different'], ['removed', 'count']]);
});

test('a suspended owner detaches the Reaction installed in a preceding candidate', async t => {
  const f = fixture(t);
  f.registry.registerResources([{ kind: 'Component', id: 'Watcher', spec: {
    ports: { trigger: state, target: state, gate: value },
    reactions: [{ watch: [path('/ports/trigger')], target: path('/ports/target'), value: 9 }],
    render: leaf,
  } }]);
  const integerState = { kind: 'State', schema: integer, initial: 0 };
  const spec = {
    states: { trigger: integerState, first: integerState, second: integerState,
      gate: { kind: 'State', schema: true, initial: 0 } },
    reactions: [{ watch: [path('/states/trigger')], target: path('/states/gate'), value: 'invalid' }],
    render: { id: 'watcher', componentRef: 'Watcher', inputs: {
      trigger: path('/states/trigger'), target: path('/states/first'), gate: path('/states/gate'),
    } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const target = view.getState('second'), output = [];
  t.after(f.store.subscribe(target.address, () => output.push(target.read())));
  const next = { ...spec, render: { ...spec.render, inputs: { ...spec.render.inputs, target: path('/states/second') } } };
  await view.whenSettled(await view.updateDefinition(next, { states: { trigger: 1 } }));
  assert.equal(view.getSnapshot().roots[0].status, 'error');
  assert.equal(view.getState('first').read(), 0);
  view.getState('trigger').write(2);
  assert.deepEqual(output, [0]);
});

test('a removed root State cannot contribute a Reaction that invalidates projection', async t => {
  const f = fixture(t);
  bindTestComponents(f.registry, [{ kind: 'Component', id: 'Row', spec: { slots: { default: {} } } }]);
  const integerState = { kind: 'State', schema: integer, initial: 0 };
  const spec = {
    states: { trigger: integerState, removed: integerState,
      items: { kind: 'State', schema: { type: 'array', items: integer }, initial: [0] } },
    render: { id: 'row', componentRef: 'Row', slots: { default: [{
      ...leaf, repeat: { items: path('/states/items'), as: 'item', key: path('/repeat/item') },
    }] } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const trigger = view.getState('trigger'), removed = view.getState('removed'), items = view.getState('items');
  f.store.registerReaction(f.scope, { watch: [trigger], target: removed, value: 1 });
  f.store.registerReaction(f.scope, { watch: [removed], target: items, value: [0, 0] });
  const next = { ...spec, states: { trigger: spec.states.trigger, items: spec.states.items } };
  await view.whenSettled(await view.updateDefinition(next, { states: { trigger: 1 } }));
  assert.equal(trigger.read(), 1);
  assert.throws(() => removed.read(), { code: 'CANCELLED' });
  assert.deepEqual(items.read(), [0]);
});

test('an unrelated View can apply while a shared Store has a blocked Derived read', async t => {
  const f = fixture(t), string = { type: 'string' }, text = { kind: 'Value', schema: string, required: true };
  const { view: first, initialComplete: firstReady } = await f.runtime.createView({ view: {
    states: {
      source: { kind: 'State', schema: string, initial: 'value' },
      selector: { kind: 'State', schema: string, initial: '${/states/source}' },
      target: { kind: 'State', schema: string, initial: 'unfired' },
      seen: { kind: 'Derived', schema: string, variable: { ports: { input: text }, expression: 'input' },
        inputs: { input: { '@call': 'formatString', args: { value: path('/states/selector') } } } },
    },
    reactions: [{ watch: [path('/states/seen')], target: path('/states/target'), value: 'fired' }],
    render: leaf,
  } });
  await firstReady;
  first.getState('selector').write('${/states/target}');
  await new Promise(resolve => setImmediate(resolve));
  assert.throws(() => first.getState('seen').read(), { code: 'INVALID_DEFINITION' });

  const { view: second, initialComplete: secondReady } = await f.runtime.createView({ view: { render: leaf } });
  await secondReady;
  await second.whenSettled(await second.updateDefinition({ render: { ...leaf, id: 'changed' } }));
  assert.equal(second.getSnapshot().roots[0].id, 'changed');
  assert.equal(first.getState('target').read(), 'unfired');
});

for (const late of [false, true]) test(`new owners compare against the watch cell's own baseline (late=${late})`, async t => {
  const f = fixture(t);
  f.registry.registerResources([{ kind: 'Component', id: 'NewOwner', spec: {
    ports: { delta: late ? state : value, output: state },
    ...(!late && { states: { seen: derived(path('/ports/delta'), 'n + 5') } }),
    reactions: [{ watch: [path(late ? '/ports/delta' : '/states/seen')], target: path('/ports/output'), value: 9 }],
    render: leaf,
  } }]);
  const spec = {
    states: {
      delta: { kind: 'State', schema: integer, initial: 0 },
      output: { kind: 'State', schema: integer, initial: 0 },
      show: { kind: 'State', schema: { type: 'boolean' }, initial: false },
    },
    render: leaf,
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const next = { ...spec, render: {
    id: 'new-owner', componentRef: 'NewOwner', ...(late && { when: path('/states/show') }),
    inputs: { delta: path('/states/delta'), output: path('/states/output') },
  } };
  await view.whenSettled(await view.updateDefinition(next, { states: { delta: 1, show: true } }));
  assert.equal(view.getState('output').read(), 9);
});

for (const duplicate of [false, true]) test(`an independent reaction can remove a provisional ${duplicate ? 'duplicate target' : 'static cycle'}`, async t => {
  const f = fixture(t), boolean = { type: 'boolean' };
  f.registry.registerResources([{ kind: 'Component', id: 'Cyclic', spec: {
    ports: { source: state, target: state },
    states: { dependent: derived(path('/ports/source')) },
    reactions: [{ watch: [path('/states/dependent')], target: path('/ports/target'), value: 9 }],
    render: leaf,
  } }]);
  const spec = {
    states: {
      trigger: { kind: 'State', schema: integer, initial: 0 },
      show: { kind: 'State', schema: boolean, initial: true },
      target: { kind: 'State', schema: integer, initial: 4 },
    },
    reactions: [
      { watch: [path('/states/trigger')], target: path('/states/show'), value: false },
      ...(duplicate ? [{ watch: [path('/states/trigger')], target: path('/states/target'), value: 7 }] : []),
    ],
    render: leaf,
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const next = { ...spec, render: { id: 'child', componentRef: 'Cyclic', when: path('/states/show'),
    inputs: { source: path('/states/target'), target: path('/states/target') } } };
  await assert.rejects(view.updateDefinition(next), { code: 'INVALID_DEFINITION' });
  assert.equal(view.getState('show').read(), true);
  await view.whenSettled(await view.updateDefinition(next, { states: { trigger: 1 } }));
  assert.equal(view.getState('show').read(), false);
  assert.equal(view.getState('target').read(), duplicate ? 7 : 4);
  assert.deepEqual(view.getSnapshot().roots, []);
});

for (const direct of [false, true]) test(`retired State ports invalidate first projection (direct=${direct})`, async t => {
  const f = fixture(t), boolean = { type: 'boolean' };
  bindTestComponents(f.registry, [{ kind: 'Component', id: 'Row', spec: { slots: { default: {} } } }]);
  f.registry.registerResources([{ kind: 'Component', id: 'Producer', spec: {
    states: { value: { kind: 'State', schema: integer, initial: 4 } },
    render: leaf,
  } }]);
  const spec = {
    ports: { fromChild: { kind: 'State', schema: integer } },
    states: {
      trigger: { kind: 'State', schema: integer, initial: 0 },
      show: { kind: 'State', schema: boolean, initial: true },
      unrelated: { kind: 'State', schema: integer, initial: 2 },
      output: { kind: 'State', schema: integer, initial: 0 },
      ...(direct ? {} : { dependent: derived(path('/ports/fromChild')) }),
    },
    reactions: [{ watch: [path('/states/trigger')], target: path('/states/show'), value: false }],
    render: { id: 'row', componentRef: 'Row', slots: { default: [
      { id: 'producer', componentRef: 'Producer', when: path('/states/show') },
      { id: 'consumer', componentRef: 'Leaf', inputs: { value: path(direct ? '/ports/fromChild' : '/states/dependent') } },
      { id: 'other', componentRef: 'Leaf', inputs: { value: path('/states/unrelated') } },
    ] } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const producer = view.getSnapshot().roots[0].children.find(child => child.id === 'producer');
  await view.whenSettled(await view.setInputs({ fromChild: view.getState('value', producer.instanceId) }));
  const ready = view.getSnapshot();
  assert.equal(ready.roots[0].children.find(child => child.id === 'consumer').inputs.value, 4);
  const updates = [];
  t.after(view.subscribe(snapshot => {
    if (snapshot.generation > ready.generation) updates.push(snapshot.roots[0].children.find(child => child.id === 'consumer'));
  }));
  const next = direct ? spec : { ...spec, reactions: [...spec.reactions,
    { watch: [path('/states/trigger')], target: path('/ports/fromChild'), value: 7 },
    { watch: [path('/ports/fromChild')], target: path('/states/output'), value: 8 },
  ] };
  await view.whenSettled(await view.updateDefinition(next, { states: { trigger: 1 } }));
  assert.equal(updates[0].status, 'error');
  assert.equal(updates[0].error.code, 'CANCELLED');
  assert.equal(view.getState('output').read(), 0);
  await assert.rejects(view.updateDefinition({ ...spec, ports: { fromChild: { kind: 'State', schema: { type: 'string' } } } }),
    { code: 'TYPE_CONTRACT_MISMATCH' });
  view.getState('unrelated').write(3);
  const nodes = view.getSnapshot().roots[0].children;
  assert.equal(nodes.find(child => child.id === 'consumer').error.code, 'CANCELLED');
  assert.equal(nodes.find(child => child.id === 'other').inputs.value, 3);
});

for (const duplicate of [false, true]) test(`a settled watch can resolve a provisional ${duplicate ? 'duplicate' : 'cycle'}`, async t => {
  const f = fixture(t), boolean = { type: 'boolean' }, toggle = { kind: 'State', schema: boolean, required: true };
  f.registry.registerResources([{ kind: 'Component', id: 'Conditional', spec: {
    ports: { show: toggle, target: state },
    ...(duplicate ? {} : { states: { dependent: {
      kind: 'Derived', schema: boolean,
      variable: { ports: { checked: { kind: 'Value', schema: boolean, required: true } }, expression: 'checked' },
      inputs: { checked: path('/ports/show') },
    } } }),
    reactions: [duplicate
      ? { watch: [path('/ports/target')], target: path('/ports/show'), value: true }
      : { watch: [path('/states/dependent')], target: path('/ports/target'), value: 9 }],
    render: leaf,
  } }]);
  const spec = {
    states: {
      trigger: { kind: 'State', schema: integer, initial: 0 },
      show: { kind: 'State', schema: boolean, initial: true },
      target: { kind: 'State', schema: integer, initial: 4 },
    },
    reactions: [{ watch: [path('/states/trigger'), ...(!duplicate ? [path('/states/target')] : [])],
      target: path('/states/show'), value: false }],
    render: leaf,
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const next = { ...spec, render: { id: 'child', componentRef: 'Conditional', when: path('/states/show'),
    inputs: { show: path('/states/show'), target: path('/states/target') } } };
  await view.whenSettled(await view.updateDefinition(next, { states: { trigger: 1 } }));
  assert.deepEqual(view.getSnapshot().roots, []);
  assert.equal(view.getState('target').read(), 4);
});

test('Action aliases are validated on the final projection after explicit writes', async t => {
  const f = fixture(t), boolean = { type: 'boolean' };
  bindTestComponents(f.registry, [
    { kind: 'Component', id: 'Row', spec: { slots: { default: {} } } },
    { kind: 'Component', id: 'Button', spec: { events: { click: { schema: true } } } },
  ]);
  f.registry.registerAction({ kind: 'Action', id: 'noop', spec: {} }, () => {});
  const button = { id: 'first', componentRef: 'Button', on: { click: { id: 'shared', actionRef: 'noop' } } };
  const spec = { states: { show: { kind: 'State', schema: boolean, initial: true } }, render: button };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const next = { ...spec, render: { id: 'row', componentRef: 'Row', slots: { default: [
    button, { ...button, id: 'second', when: path('/states/show') },
  ] } } };
  await assert.rejects(view.updateDefinition(next), { code: 'INVALID_DEFINITION' });
  assert.equal(view.getState('show').read(), true);
  await view.whenSettled(await view.updateDefinition(next, { states: { show: false } }));
  assert.deepEqual(view.getSnapshot().roots[0].children.map(child => child.id), ['first']);
});

test('a discarded reaction never replaces the URL value of an initialized State', async t => {
  const f = fixture(t), endpoint = memoryUrl(link({ owned: 8 })), boolean = { type: 'boolean' };
  f.registry.registerResources([{ kind: 'Component', id: 'Temporary', spec: {
    ports: { trigger: state, loaded: state },
    reactions: [{ watch: [path('/ports/trigger')], target: path('/ports/loaded'), value: 9 }],
    render: leaf,
  } }]);
  const spec = {
    states: {
      trigger: { kind: 'State', schema: integer, initial: 0 },
      show: { kind: 'State', schema: boolean, initial: true },
      input: { kind: 'State', schema: integer },
      loaded: { kind: 'State', schema: integer, initial: path('/states/input') },
    },
    reactions: [{ watch: [path('/states/trigger')], target: path('/states/show'), value: false }],
    render: { id: 'temporary', componentRef: 'Temporary', when: path('/states/show'),
      inputs: { trigger: path('/states/trigger'), loaded: path('/states/loaded') } },
  };
  const { view, initialComplete } = await f.runtime.createView({
    view: spec, url: { adapter: endpoint.adapter, bindings: [{ state: 'loaded', key: 'owned' }] },
  });
  await initialComplete;
  assert.equal(view.getState('loaded').getSnapshot().status, 'pending');
  await view.whenSettled(await view.updateDefinition(spec, { states: { trigger: 1, input: 5 } }));
  await tick();
  assert.equal(view.getState('loaded').read(), 8);
  assert.equal(new URL(endpoint.read()).searchParams.get('owned'), '8');
  assert.deepEqual(endpoint.attempts, []);
});

for (const constrained of [false, true]) test(`a discarded reaction cannot freeze or reject a provisional initializer (${constrained})`, async t => {
  const f = fixture(t), boolean = { type: 'boolean' }, items = { type: 'array', items: integer };
  bindTestComponents(f.registry, [{ kind: 'Component', id: 'Row', spec: { slots: { default: {} } } }]);
  f.registry.registerResources([
    { kind: 'Component', id: 'Removed', spec: {
      ports: { trigger: state, input: state, items: { kind: 'State', schema: items, required: true } },
      reactions: [
        { watch: [path('/ports/trigger')], target: path('/ports/input'), value: 9 },
        { watch: [path('/ports/trigger')], target: path('/ports/items'), value: [1, 1] },
      ],
      render: leaf,
    } },
    { kind: 'Component', id: 'Initializing', spec: {
      ports: { input: { kind: 'Value', schema: integer } },
      states: { loaded: { kind: 'State', schema: constrained ? { ...integer, maximum: 5 } : integer, initial: path('/ports/input') } },
      render: leaf,
    } },
  ]);
  const spec = {
    states: {
      trigger: { kind: 'State', schema: integer, initial: 0 },
      show: { kind: 'State', schema: boolean, initial: true },
      input: { kind: 'State', schema: integer },
      items: { kind: 'State', schema: items, initial: [1] },
    },
    reactions: [{ watch: [path('/states/trigger')], target: path('/states/show'), value: false }],
    render: { id: 'row', componentRef: 'Row', slots: { default: [
      { id: 'removed', componentRef: 'Removed', when: path('/states/show'),
        inputs: { trigger: path('/states/trigger'), input: path('/states/input'), items: path('/states/items') } },
      { id: 'owner', componentRef: 'Initializing', inputs: { input: path('/states/input') } },
      { id: 'repeat', componentRef: 'Leaf',
        repeat: { items: path('/states/items'), as: 'item', key: path('/repeat/item') },
        inputs: { value: path('/repeat/item') } },
    ] } },
  };
  const { view, initialComplete } = await f.runtime.createView({ view: spec });
  await initialComplete;
  const owner = view.getSnapshot().roots[0].children.find(node => node.id === 'owner').instanceId;
  const loaded = view.getState('loaded', owner), input = view.getState('input');
  const observed = [];
  t.after(f.store.subscribe(loaded.address, () => observed.push(loaded.getSnapshot())));
  await view.whenSettled(await view.updateDefinition(spec, { states: { trigger: 1 } }));
  const nodes = view.getSnapshot().roots[0].children;
  assert.deepEqual(nodes.map(node => node.id), ['owner', 'repeat']);
  assert.equal(nodes[0].instanceId, owner);
  assert.equal(nodes[1].inputs.value, 1);
  assert.equal(input.getSnapshot().status, 'missing');
  assert.deepEqual(observed, [{ status: 'pending' }]);
  input.write(5);
  assert.equal(loaded.read(), 5);
  assert.deepEqual(observed, [{ status: 'pending' }, { status: 'ready', value: 5 }]);
});

test('Derived can reverse dynamic connections in one input update without publishing a cycle', async t => {
  const f = fixture(t), string = { type: 'string' };
  const text = { kind: 'Value', schema: string, required: true };
  const fromTemplate = name => ({
    kind: 'Derived', schema: string,
    variable: { ports: { text }, expression: 'text' },
    inputs: { text: { '@call': 'formatString', args: { value: path('/ports/' + name) } } },
  });
  const spec = {
    ports: { first: text, second: text },
    states: {
      source: { kind: 'State', schema: string, initial: 'same' },
      first: fromTemplate('first'),
      second: fromTemplate('second'),
    },
    render: leaf,
  };
  const { view, initialComplete } = await f.runtime.createView({
    view: spec, inputs: { first: '${/states/source}', second: '${/states/first}' },
  });
  await initialComplete;
  const first = view.getState('first'), second = view.getState('second');
  const observed = [];
  t.after(f.store.subscribe([first.address, second.address], () => {
    observed.push([first.getSnapshot().status, second.getSnapshot().status]);
  }));
  await view.whenSettled(await view.setInputs({ first: '${/states/second}', second: '${/states/source}' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(observed, [['ready', 'ready']]);
  view.getState('source').write('new');
  assert.equal(first.read(), 'new');
  assert.equal(second.read(), 'new');
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
  const before = { ...f.calls }, stable = output.getSnapshot();
  const unrelated = f.store.createScope();
  unrelated.registerState('unrelated', { schema: integer, initial: 0 });
  unrelated.dispose();
  assert.deepEqual(f.calls, before);
  assert.equal(output.getSnapshot(), stable);
  result = 2; await view.getQuery('number').refresh();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  assert.equal(view.getState('computed', oldNode.instanceId), output); assert.equal(output.read(), 2);
  view.getState('show').write(false); assert.deepEqual(view.getSnapshot().roots, []); assert.throws(() => output.read(), { code: 'CANCELLED' });
  view.getState('show').write(true); const next = view.getSnapshot().roots[0];
  assert.notEqual(next.instanceId, oldNode.instanceId); assert.equal(view.getState('computed', next.instanceId).read(), 2);
});
