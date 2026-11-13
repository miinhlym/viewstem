import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntime } from '@viewstem/core';
import { createRendererHost } from '@viewstem/core/renderer';

const component = { kind: 'Component', id: 'Leaf', spec: {
  ports: { text: { kind: 'Value', required: true, schema: { type: 'string' } } },
} };
const render = { id: 'leaf', componentRef: 'Leaf', inputs: { text: 'ok' } };
const querySource = { render, queries: { q: { query: {
  sources: { data: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/data' } } },
  transform: { input: { '@path': '/sources/data' } },
} } } };
const turn = () => new Promise(resolve => setImmediate(resolve));

function host(runtime, options) {
  return createRendererHost(runtime, {
    ownsRuntime: false, validateTarget: target => target !== null,
    connect: () => ({ dispose() {}, whenRendered() {} }), ...options,
  });
}

test('live and replayed Query diagnostics share one occurrence across hosts and callbacks', async t => {
  const requests = [];
  const runtime = createRuntime({ componentContracts: [component], requestExecutor() {
    return new Promise((resolve, reject) => requests.push({ resolve, reject }));
  } });
  const global = [], left = [], right = [], late = [];
  const log = diagnostic => global.push(diagnostic);
  const first = host(runtime, { onError: log });
  const second = host(runtime, { onError: log });
  t.after(async () => { await Promise.all([first.dispose(), second.dispose()]); runtime.dispose(); });
  const view = await runtime.createView(querySource);
  first.attach(view, {}, { onError: log });
  first.attach(view, {}, { onError: diagnostic => left.push(diagnostic) });
  second.attach(view, {}, { onError: diagnostic => right.push(diagnostic) });
  requests[0].reject(new Error('private'));
  await view.whenSettled(view.initial);
  await turn();
  second.attach(view, {}, { onError: diagnostic => late.push(diagnostic) });
  assert.equal(global.length, 1);
  assert.deepEqual([left, right, late], [[global[0]], [global[0]], [global[0]]]);
  assert.equal(left[0], global[0]);
  assert.equal(late[0], global[0]);
  assert.equal(global[0].error.location, '/query/sources/data');
  assert.equal(global[0].error.cause.code, 'HTTP_ERROR');
  assert.equal(global[0].application, view.initial);
  assert.equal(Object.isFrozen(global[0]), true);
  assert.equal(JSON.stringify(global).includes('private'), false);

  const retried = assert.rejects(view.getQuery('q').retry(), { code: 'HTTP_ERROR' });
  requests[1].reject(new Error('private again'));
  await retried;
  await turn();
  assert.equal(global.length, 2);
  assert.notEqual(global[1], global[0]);
  assert.equal(late[1], global[1]);
});

test('a failed Query is reported when the next queued execution immediately replaces its snapshot', async t => {
  const requests = [];
  const runtime = createRuntime({ componentContracts: [component], requestExecutor() {
    return new Promise((resolve, reject) => requests.push({ resolve, reject }));
  } });
  const live = [], replay = [];
  const renderer = host(runtime, { onError: diagnostic => live.push(diagnostic) });
  t.after(async () => { await renderer.dispose(); runtime.dispose(); });
  const view = await runtime.createView(querySource);
  renderer.attach(view, {});
  const queued = view.getQuery('q').refresh();
  requests[0].reject(new Error('first failed'));
  await turn();
  assert.equal(requests.length, 2);
  assert.equal(view.getQuery('q').getSnapshot().status, 'running');
  renderer.attach(view, {}, { onError: diagnostic => replay.push(diagnostic) });
  assert.deepEqual(live.map(diagnostic => diagnostic.phase), ['query']);
  assert.deepEqual(replay, []);
  requests[1].resolve({ status: 200, headers: {}, body: 'ok' });
  await queued;
});

test('node replay sees the recovered projection and a connection added from a callback sees the current occurrence', async t => {
  const runtime = createRuntime({ componentContracts: [component] });
  const live = [], replay = [], afterRecovery = [];
  const renderer = host(runtime, { onError(diagnostic) {
    live.push(diagnostic);
    renderer.attach(view, {}, { onError: entry => replay.push(entry) });
  } });
  t.after(async () => { await renderer.dispose(); runtime.dispose(); });
  const view = await runtime.createView({ render, states: { value: { kind: 'State', schema: true, initial: 'ok' } } });
  const application = await view.updateDefinition({
    ...view.exportDefinition(), render: { ...render, inputs: { text: { '@path': '/states/value' } } },
  });
  await view.whenSettled(application);
  renderer.attach(view, {});
  const cell = view.getState('value');
  cell.write(5);
  assert.equal(live.length, 1);
  assert.equal(replay.length, 1);
  assert.equal(replay[0], live[0]);
  const off = view.subscribe(snapshot => {
    if (!snapshot.roots[0].error) renderer.attach(view, {}, { onError: entry => afterRecovery.push(entry) });
  });
  cell.write('ok');
  off();
  assert.deepEqual(afterRecovery, []);
});

test('prepare diagnostics isolate observers and preserve the error after automatic cleanup', async t => {
  const runtime = createRuntime({ componentContracts: [component] });
  const diagnostics = [];
  const renderer = host(runtime, { onError(diagnostic) {
    assert.equal(Reflect.set(diagnostic, 'phase', 'render'), false);
    assert.equal(Reflect.set(diagnostic.error.resource, 'id', 'changed'), false);
    return Promise.reject(new Error('observer failed'));
  } });
  t.after(async () => { await renderer.dispose(); runtime.dispose(); });
  const screen = renderer.mount({ target: {}, source: { render: { ...render, inputs: { text: 5 } } },
    onError: diagnostic => diagnostics.push(diagnostic),
  });
  await assert.rejects(screen.ready, error => {
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].phase, 'prepare');
    assert.equal(diagnostics[0].error, error);
    assert.equal(error.resource.id, 'Leaf');
    return true;
  });
});

test('a renderer disposed by its first prepare observer skips the screen observer', async t => {
  const runtime = createRuntime({ componentContracts: [component] });
  const events = [];
  const renderer = host(runtime, { onError() { events.push('renderer'); void renderer.dispose(); } });
  t.after(() => runtime.dispose());
  const screen = renderer.mount({ target: {}, source: { render: { id: 'bad', componentRef: 'Absent' } },
    onError() { events.push('screen'); },
  });
  await assert.rejects(screen.ready, { code: 'REFERENCE_NOT_FOUND' });
  await renderer.dispose();
  assert.deepEqual(events, ['renderer']);
});

test('the first render only suppresses an already reported failure with the same identity', async t => {
  const runtime = createRuntime({ componentContracts: [component] });
  t.after(() => runtime.dispose());
  for (const same of [true, false]) {
    const events = [];
    const reported = { code: 'INTERNAL_ERROR' };
    const thrown = same ? reported : { code: 'INTERNAL_ERROR' };
    const renderer = host(runtime, { onError: diagnostic => events.push(diagnostic), connect(_view, _target, _options, report) {
      report(reported);
      return { dispose() {}, whenRendered() { throw thrown; } };
    } });
    await assert.rejects(renderer.mount({ target: {}, source: { render } }).ready, { code: 'INTERNAL_ERROR' });
    assert.equal(events.length, same ? 1 : 2);
    assert.ok(events.every(diagnostic => diagnostic.phase === 'render'));
    await renderer.dispose();
  }
});

test('initial URL diagnostics keep their metadata and replay only for the current application', async t => {
  const runtime = createRuntime({ componentContracts: [component] });
  const live = [], replay = [], afterReplacement = [];
  const renderer = host(runtime, { onError: diagnostic => live.push(diagnostic) });
  t.after(async () => { await renderer.dispose(); runtime.dispose(); });
  const screen = renderer.mount({
    target: {},
    source: { render, states: { label: { kind: 'State', schema: { type: 'string' }, initial: 'initial' } } },
    url: {
      adapter: { read: () => 'https://example.test/?label=wrong', subscribe: () => () => {}, writeOwned() {} },
      bindings: [{ state: 'label', key: 'label' }],
    },
  });
  const view = await screen.ready;
  renderer.attach(view, {}, { onError: diagnostic => replay.push(diagnostic) });
  assert.equal(live.length, 1);
  assert.equal(replay[0], live[0]);
  assert.equal(live[0].phase, 'url');
  assert.equal(live[0].error.kind, 'restore');
  assert.equal(live[0].error.key, 'label');
  assert.equal(live[0].application, view.initial);
  await view.replace({ render });
  renderer.attach(view, {}, { onError: diagnostic => afterReplacement.push(diagnostic) });
  assert.deepEqual(afterReplacement, []);
});
