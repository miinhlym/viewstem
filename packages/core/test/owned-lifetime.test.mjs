import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntime, createStateStore } from '@viewstem/core';
import { createRendererHost, prepareOwnedView } from '@viewstem/core/renderer';

const componentContracts = [{ kind: 'Component', id: 'Leaf', spec: {} }];
const render = { id: 'leaf', componentRef: 'Leaf' };
const states = { label: { kind: 'State', schema: { type: 'string' }, initial: 'committed' } };
const never = () => new Promise(() => {});
const path = name => ({ '@path': name });
const cancelled = { code: 'CANCELLED' };
const query = (...paths) => ({ query: {
  sources: Object.fromEntries(paths.map((path, index) => [`source${index}`, {
    datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path },
  }])),
  transform: { input: path('/sources/source0') },
} });
const source = { render, states, queries: { first: query('/first') } };
const createHost = (runtime, options) => createRendererHost(runtime, {
  ownsRuntime: false,
  validateTarget: () => true,
  connect: () => ({ whenRendered() {}, dispose() {} }),
  ...options,
});
const stateCount = store => {
  let count;
  store.subscribe(null, ({ states }) => { count = Object.keys(states).length; })();
  return count;
};

test('closing during Store publication preserves the Registry and skips the initial Query', { timeout: 2000 }, async t => {
  for (const mode of ['mount', 'source', 'public preparation']) await t.test(mode, async t => {
    const store = createStateStore();
    const control = new AbortController();
    let requests = 0;
    const runtime = createRuntime({
      stateStore: store, componentContracts,
      resourceResolver: (_kind, id) => ({ kind: 'View', id, spec: source }),
      requestExecutor() { requests++; return never(); },
    });
    const host = createHost(runtime);
    t.after(async () => { await host.dispose(); runtime.dispose(); store.dispose(); });
    let closing;
    const stop = store.subscribe(null, ({ changes }) => {
      if (!changes.some(change => change.kind === 'added')) return;
      if (mode === 'mount') closing = host.dispose();
      else control.abort();
    });
    t.after(stop);
    const reference = { ref: 'resolved' };
    const ready = mode === 'mount' ? host.mount({ target: {}, source: reference }).ready
      : mode === 'source' ? prepareOwnedView(runtime, reference)(control.signal)
        : runtime.createView(reference, { signal: control.signal });
    if (mode === 'public preparation') {
      const view = await ready;
      assert.equal(requests, 1);
      view.dispose();
    } else {
      await assert.rejects(ready, cancelled);
      await closing;
      assert.equal(requests, 0);
    }
    assert.equal(stateCount(store), 0);
    assert.equal(runtime.registry.get('View', 'resolved').id, 'resolved');
  });
});

test('closing from Query timer setup clears the returned timer and skips dispatch', async t => {
  const control = new AbortController();
  const events = [];
  const runtime = createRuntime({
    componentContracts,
    clock: {
      now: 0,
      setTimeout() { events.push('timer'); control.abort(); return 42; },
      clearTimeout(handle) { events.push(handle); },
    },
    requestExecutor() { events.push('request'); return never(); },
  });
  t.after(() => runtime.dispose());
  await assert.rejects(prepareOwnedView(runtime, source)(control.signal), cancelled);
  assert.deepEqual(events, ['timer', 42]);
});

test('closing from the first executor aborts it and skips siblings and the next Query', async t => {
  const events = [];
  let firstSignal;
  const runtime = createRuntime({ componentContracts, requestExecutor(plan, { signal }) {
    events.push(plan.request.path);
    firstSignal ??= signal;
    void host.dispose();
    return never();
  } });
  const host = createHost(runtime);
  t.after(async () => { await host.dispose(); runtime.dispose(); });
  const screen = host.mount({ target: {}, source: { render, queries: {
    first: query('/first', '/sibling'), next: query('/next'),
  } } });
  await assert.rejects(screen.ready, cancelled);
  assert.deepEqual(events, ['/first']);
  assert.equal(firstSignal.aborted, true);
});

test('closing from URL subscription or read stops the remaining setup', async t => {
  for (const step of ['subscribe', 'read']) await t.test(step, async t => {
    const events = [];
    const store = createStateStore();
    const runtime = createRuntime({ stateStore: store, componentContracts, requestExecutor() {
      events.push('request'); return never();
    } });
    const host = createHost(runtime);
    const stop = store.subscribe(null, ({ changes }) => {
      if (changes.some(change => change.kind === 'updated')) events.push('restore');
    });
    t.after(async () => { stop(); await host.dispose(); runtime.dispose(); store.dispose(); });
    const adapter = {
      subscribe() {
        events.push('subscribe');
        if (step === 'subscribe') void host.dispose();
        return () => events.push('unsubscribe');
      },
      read() {
        events.push('read');
        void host.dispose();
        return 'https://example.test/?label=%22restored%22';
      },
      writeOwned() { events.push('write'); },
    };
    const screen = host.mount({ target: {}, source, url: { adapter, bindings: [{ state: 'label', key: 'label' }] } });
    await assert.rejects(screen.ready, cancelled);
    assert.deepEqual(events, step === 'subscribe' ? ['subscribe', 'unsubscribe'] : ['subscribe', 'read', 'unsubscribe']);
    assert.equal(stateCount(store), 0);
  });
});

test('closing inside a rolled back transaction removes the owned scope before target reuse', async t => {
  const store = createStateStore();
  const external = store.createScope().registerState('external', { schema: { type: 'number' }, initial: 1 });
  const runtime = createRuntime({ stateStore: store, componentContracts });
  const host = createHost(runtime);
  t.after(async () => { await host.dispose(); runtime.dispose(); store.dispose(); });
  const target = {};
  const screen = host.mount({ target, source: { render, states } });
  const view = await screen.ready;
  let close;
  assert.throws(() => store.transaction(() => {
    external.write(2);
    close = screen.unmount();
    throw Error('rollback');
  }), /rollback/);
  await close;
  assert.equal(stateCount(store), 1);
  assert.equal(external.read(), 1);
  await assert.rejects(view.setInputs({}), cancelled);
  await host.mount({ target, source: { render } }).ready;
});

test('bulk close blocks requests in every owned View before running abort callbacks', async t => {
  const store = createStateStore();
  const shared = store.createScope().registerState('shared', { schema: { type: 'string' } });
  const requests = [];
  const runtime = createRuntime({ stateStore: store, componentContracts, requestExecutor(plan, { signal }) {
    requests.push(plan.request.path);
    if (plan.request.path === '/first') signal.addEventListener('abort', () => shared.write('ready'), { once: true });
    return never();
  } });
  const host = createHost(runtime);
  t.after(async () => { await host.dispose(); runtime.dispose(); store.dispose(); });
  const waiting = query('/waiting');
  waiting.query.ports = { value: { kind: 'Value', required: true, schema: { type: 'string' } } };
  waiting.inputs = { value: path('/ports/shared') };
  const first = host.mount({ target: {}, source });
  const second = host.mount({ target: {}, source: {
    render, ports: { shared: { kind: 'State', required: true, schema: { type: 'string' } } },
    queries: { waiting },
  }, inputs: { shared } });
  await Promise.all([first.ready, second.ready]);
  await host.dispose();
  assert.equal(shared.read(), 'ready');
  assert.deepEqual(requests, ['/first']);
});

test('reentrant cancellation settles the superseding job and preserves a newer job', { timeout: 2000 }, async t => {
  for (const mode of ['close', 'newest']) await t.test(mode, async t => {
    let view, newest, entered;
    const started = new Promise(resolve => { entered = resolve; });
    const runtime = createRuntime({ componentContracts, resourceResolver(_kind, _id, { signal }) {
      signal.addEventListener('abort', () => {
        if (mode === 'close') view.dispose();
        else newest = view.updateDefinition({ render: { ...render, id: 'newest' } });
      }, { once: true });
      entered();
      return never();
    } });
    t.after(() => runtime.dispose());
    view = await runtime.createView({ render });
    const previous = assert.rejects(view.replace({ ref: 'slow' }), cancelled);
    await started;
    await assert.rejects(view.updateDefinition({ render: { ...render, id: 'middle' } }), cancelled);
    await previous;
    if (mode === 'newest') {
      await newest;
      assert.equal(view.getSnapshot().roots[0].id, 'newest');
    }
  });
});

test('render waits capture their application at call time and cancel during adapter work', { timeout: 2000 }, async t => {
  let enter;
  const entered = new Promise(resolve => { enter = resolve; });
  let hold = false;
  const runtime = createRuntime({ componentContracts });
  const host = createHost(runtime, { connect: () => ({
    dispose() {},
    whenRendered() { if (hold) { enter(); return never(); } },
  }) });
  t.after(async () => { await host.dispose(); runtime.dispose(); });
  const screen = host.mount({ target: {}, source: { render } });
  const view = await screen.ready;
  const attachment = host.attach(view, {});
  const update = view.updateDefinition({ render });
  const comparisons = Promise.all([
    assert.rejects(screen.whenRendered(), cancelled), assert.rejects(attachment.whenRendered(), cancelled),
  ]);
  await update;
  await comparisons;
  hold = true;
  const previous = assert.rejects(attachment.whenRendered(), cancelled);
  await entered;
  await view.replace({ render });
  await previous;
});

test('target validation cannot reserve a mount after closing its renderer', async t => {
  const runtime = createRuntime({ componentContracts });
  let close;
  const host = createHost(runtime, { validateTarget() { close = host.dispose(); return true; } });
  t.after(() => runtime.dispose());
  assert.throws(() => host.mount({ target: {}, source }), cancelled);
  await close;
});

test('closing during initial attach diagnostics releases the subscription without closing the View', async t => {
  let succeed = false, closing;
  const runtime = createRuntime({ componentContracts, requestExecutor() {
    if (!succeed) throw { code: 'HTTP_ERROR' };
    return { status: 200, headers: {}, body: 'ok' };
  } });
  const diagnostics = [];
  const host = createHost(runtime, { onError(diagnostic) {
    diagnostics.push(diagnostic.error.code);
    closing ??= host.dispose();
  } });
  t.after(() => runtime.dispose());
  const view = await runtime.createView(source);
  await view.whenSettled(view.initial);
  assert.throws(() => host.attach(view, {}), cancelled);
  await closing;
  succeed = true;
  await view.getQuery('first').retry();
  succeed = false;
  await assert.rejects(view.getQuery('first').refresh(), { code: 'HTTP_ERROR' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(diagnostics, ['HTTP_ERROR']);
});

test('a refresh from a commit observer uses the retained Query with its new inputs', async t => {
  const store = createStateStore();
  const inputs = [];
  const runtime = createRuntime({ stateStore: store, componentContracts, requestExecutor(plan) {
    inputs.push(plan.inputs.value);
    return { status: 200, headers: {}, body: plan.inputs.value };
  } });
  t.after(() => { runtime.dispose(); store.dispose(); });
  const definition = value => {
    const first = query('/first');
    first.query.ports = { value: { kind: 'Value', required: true, schema: { type: 'number' } } };
    first.inputs = { value: path('/states/count') };
    return { render, states: { count: { kind: 'State', schema: { type: 'number' }, initial: value } }, queries: { first } };
  };
  const view = await runtime.createView(definition(1));
  await view.whenSettled(view.initial);
  const handle = view.getQuery('first');
  let refresh;
  const unsubscribe = store.subscribe(null, ({ changes }) => {
    if (changes.some(change => change.kind === 'updated')) refresh = handle.refresh();
  });
  t.after(unsubscribe);
  await view.updateDefinition(definition(1), { states: { count: 2 } });
  assert.ok(refresh);
  await refresh;
  assert.equal(view.getQuery('first'), handle);
  assert.equal(inputs[0], 1);
  assert.ok(inputs.length > 1);
  assert.ok(inputs.slice(1).every(value => value === 2));
});

test('a public preparation signal cancelled inside initial State evaluation prevents commit', async t => {
  const store = createStateStore();
  const control = new AbortController();
  let evaluations = 0, requests = 0;
  const runtime = createRuntime({
    stateStore: store, componentContracts,
    functions: [{
      name: 'cancelPreparation', inputs: [], output: { type: 'string' },
      run() { evaluations++; control.abort(); return 'staged'; },
    }],
    resourceResolver: (_kind, id) => ({ kind: 'View', id, spec: {
      ...source, states: { label: { ...states.label, initial: { '@call': 'cancelPreparation', args: [] } } },
    } }),
    requestExecutor() { requests++; return never(); },
  });
  t.after(() => { runtime.dispose(); store.dispose(); });
  await assert.rejects(runtime.createView({ ref: 'staged' }, { signal: control.signal }), cancelled);
  assert.equal(evaluations, 1);
  assert.equal(requests, 0);
  assert.deepEqual(runtime.registry.list('View'), []);
  assert.equal(stateCount(store), 0);
});

test('closing in Action authorization cannot start its Query during deferred scope cleanup', async t => {
  const store = createStateStore();
  const trigger = store.createScope().registerState('trigger', { schema: { type: 'boolean' }, initial: false });
  let view, action, requests = 0;
  const runtime = createRuntime({
    stateStore: store, componentContracts,
    authorize({ operation }) {
      if (operation === 'invoke') view.dispose();
      return true;
    },
    requestExecutor() { requests++; return never(); },
  });
  t.after(() => { runtime.dispose(); store.dispose(); });
  view = await runtime.createView({ render, states });
  const stop = store.subscribe(trigger.address, ({ changes }) => {
    if (changes.some(change => change.kind === 'updated')) action = view.invokeAction({
      action: { steps: [{ kind: 'Query', spec: query('/action').query }] },
    });
  });
  t.after(stop);
  trigger.write(true);
  await assert.rejects(action, cancelled);
  assert.equal(requests, 0);
  assert.equal(stateCount(store), 1);
});

test('a timer cleanup failure still releases every owned scope and target', async t => {
  const store = createStateStore();
  const active = new Map();
  const runtime = createRuntime({
    stateStore: store, componentContracts,
    clock: {
      now: 0,
      setTimeout(callback, delay) {
        const handle = {};
        active.set(handle, delay);
        return handle;
      },
      clearTimeout(handle) {
        const delay = active.get(handle);
        active.delete(handle);
        if (delay === 10) throw Error('poll cleanup failed');
      },
    },
    requestExecutor: () => ({ status: 200, headers: {}, body: 'ok' }),
  });
  const host = createHost(runtime);
  t.after(async () => { await host.dispose(); runtime.dispose(); store.dispose(); });
  const target = {};
  const screen = host.mount({ target, source: {
    ...source, queries: { first: { ...source.queries.first, intervalMs: 10 }, second: { ...query('/other'), intervalMs: 20 } },
  } });
  const view = await screen.ready;
  await screen.whenSettled(view.initial);
  assert.deepEqual([...active.values()], [10, 20]);
  await assert.rejects(screen.unmount(), { code: 'INTERNAL_ERROR' });
  assert.equal(active.size, 0);
  assert.equal(stateCount(store), 0);
  await host.mount({ target, source: { render } }).ready;
});
