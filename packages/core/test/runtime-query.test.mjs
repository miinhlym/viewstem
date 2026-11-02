import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createServer } from 'node:http';
import { createRegistry, createRuntime } from '@viewstem/core';
const p = path => ({ '@path': path });
const number = { type: 'number' }, boolean = { type: 'boolean' };
const port = (schema = true) => ({ kind: 'Value', schema, required: true });
const valueState = value => ({ kind: 'State', schema: typeof value === 'boolean' ? boolean : number, initial: value });
const flush = async () => { await setImmediate(); await setImmediate(); };
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const bounded = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('runtime Query fixture watchdog')), 2000); })]); }
  finally { clearTimeout(timer); }
};
function registry() {
  const registry = createRegistry();
  registry.registerComponentContract({ kind: 'Component', id: 'Display', spec: { ports: { value: port() } } });
  registry.registerComponentContract({ kind: 'Component', id: 'Row', spec: { slots: { default: {} } } });
  registry.registerComponentContract({ kind: 'Component', id: 'Button', spec: { events: { click: { schema: { type: 'object' } } } } });
  return registry;
}
const display = (id = 'display', value = 'static') => ({ id, componentRef: 'Display', inputs: { value } });
function queryResource(id = 'q', baseUrl = 'https://example.test') {
  return { kind: 'Query', id, spec: { ports: { a: port(), b: port() }, sources: { main: {
    datasource: { kind: 'Http', baseUrl }, request: { method: 'GET', path: `/${id}` },
  } }, transform: { input: p('/sources/main') } } };
}
function controlled(t, resources = [queryResource()]) {
  const r = registry(); if (resources.length) r.registerResources(resources);
  const requests = [];
  const runtime = createRuntime({ registry: r, requestExecutor: (plan, { signal }) => {
    const completion = deferred(); const row = { plan, signal, ...completion, done: false }; requests.push(row); return completion.promise;
  } });
  t.after(() => { runtime.dispose(); for (const row of requests) if (!row.done) row.resolve({ status: 200, headers: {}, body: null }); });
  return { registry: r, runtime, requests, async reply(index, value, code) {
    const row = requests[index - 1]; assert.ok(row, `Missing request ${index}`); row.done = true;
    if (code) row.reject({ code, message: 'private executor message' }); else row.resolve({ status: 200, headers: {}, body: value });
    await flush();
  } };
}
const use = (queryRef = 'q', a = p('/states/a'), b = p('/states/b'), extra = {}) => ({ queryRef, inputs: { a, b }, ...extra });
const baseView = (extra = {}) => ({ states: { a: valueState(1), b: valueState(1) }, queries: { list: use() }, render: display('display', p('/queries/list/data')), ...extra });

test('N03 initial waits for every executable first Query while ready UI appears independently', async t => {
  const f = controlled(t, [queryResource('first'), queryResource('second')]);
  const spec = baseView({ queries: { first: use('first'), second: use('second') }, render: {
    id: 'row', componentRef: 'Row', slots: { default: [display('first', p('/queries/first/data')), display('second', p('/queries/second/data'))] },
  } });
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec });
  let settled = false; initial.then(() => { settled = true; }); await flush(); assert.equal(f.requests.length, 2);
  await f.reply(1, 'first-ready');
  const [first, second] = view.getSnapshot().roots[0].children;
  assert.equal(first.status, 'ready'); assert.equal(first.inputs.value, 'first-ready'); assert.equal(second.status, 'pending');
  assert.equal(settled, false); await f.reply(2, 'second-ready');
  assert.deepEqual(await bounded(initial), { generation: 1, queryErrors: [] }); assert.equal(view.getSnapshot().roots[0].children[1].inputs.value, 'second-ready');
});

test('N04/K23 first Query errors report through initial; blocked and missing-input Queries do not prevent completion', async t => {
  const f = controlled(t);
  const spec = baseView({ states: { a: valueState(1), b: valueState(1), missing: { kind: 'State', schema: number } },
    queries: { failing: use(), blocked: use('q', 1, 1, { executeWhen: false }), waiting: use('q', p('/states/missing'), 1) }, render: display(),
  });
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec }); await flush(); assert.equal(f.requests.length, 1);
  await f.reply(1, null, 'HTTP_ERROR'); const done = await bounded(initial);
  assert.equal(done.queryErrors.length, 1); assert.equal(done.queryErrors[0].query, 'failing'); assert.equal(done.queryErrors[0].error.code, 'HTTP_ERROR');
  assert.equal(view.getQuery('blocked').getSnapshot().waitingReason, 'EXECUTION_BLOCKED');
  assert.equal(view.getQuery('waiting').getSnapshot().waitingReason, 'INPUT_NOT_READY');
  assert.equal(view.getSnapshot().roots[0].status, 'ready'); assert.equal(JSON.stringify(done).includes('private'), false);
});

test('N05/K23 failed update preserves existing State, screen, in-flight Query and initial completion', async t => {
  const f = controlled(t); const spec = baseView(); const { view, initialComplete: initial } = await f.runtime.createView({ view: spec }); await flush();
  const previous = view.getSnapshot(), handle = view.getState('a');
  const invalid = { ...spec, render: { id: 'invalid', componentRef: 'Missing' } };
  await assert.rejects(view.update(invalid, { states: { a: 9 } }), e => e.code === 'REFERENCE_NOT_FOUND');
  assert.equal(view.getState('a'), handle); assert.equal(handle.read(), 1); assert.equal(view.getSnapshot().generation, previous.generation);
  assert.equal(view.getSnapshot().lifetime, previous.lifetime); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].signal.aborted, false);
  await f.reply(1, 'preserved'); await bounded(initial); assert.equal(view.getSnapshot().roots[0].inputs.value, 'preserved');
});

test('K23/Q07 replace cancels prior initial and old owner, discarding late Query results', async t => {
  const f = controlled(t); const spec = baseView(); const { view, initialComplete: initial } = await f.runtime.createView({ view: spec }); await flush();
  const oldLifetime = view.getSnapshot().lifetime; const cancelled = assert.rejects(initial, e => e.code === 'CANCELLED');
  const next = await view.replace({ view: spec }); await cancelled; await flush();
  assert.notEqual(view.getSnapshot().lifetime, oldLifetime); assert.equal(f.requests.length, 2); assert.equal(f.requests[0].signal.aborted, true);
  await f.reply(1, 'old-owner'); assert.equal(view.getQuery('list').getSnapshot().data, undefined);
  await f.reply(2, 'current-owner'); await bounded(next.initialComplete); assert.equal(view.getSnapshot().roots[0].inputs.value, 'current-owner');
});

test('Q18 atomic State batch opens gate and starts exactly one execution with the complete new input snapshot', async t => {
  const f = controlled(t); const { view, initialComplete: initial } = await f.runtime.createView({ view: baseView({
    states: { a: valueState(1), b: valueState(1), enabled: valueState(false) }, queries: { list: use('q', p('/states/a'), p('/states/b'), { executeWhen: p('/states/enabled') }) },
  }) });
  await bounded(initial); assert.equal(f.requests.length, 0);
  f.runtime.stateStore.writeBatch([[view.getState('a'), 2], [view.getState('enabled'), true], [view.getState('b'), 3]]); await flush();
  assert.equal(f.requests.length, 1); assert.deepEqual(plain(f.requests[0].plan.inputs), { a: 2, b: 3 });
  await f.reply(1, 'writeBatch'); assert.equal(view.getQuery('list').getSnapshot().status, 'success'); assert.equal(view.getSnapshot().errors.length, 0);
});

test('K25/K27 current Query status keeps prior data/dataInputs stale on failure and replaces the pair after retry', async t => {
  const f = controlled(t); const { view, initialComplete: initial } = await f.runtime.createView({ view: baseView() }); await f.reply(1, false); await bounded(initial);
  const old = view.getQuery('list').getSnapshot(); view.getState('a').write(2); await flush();
  assert.equal(view.getQuery('list').getSnapshot().stale, true); await f.reply(2, null, 'HTTP_ERROR');
  const failed = view.getQuery('list').getSnapshot(); assert.equal(failed.status, 'error'); assert.equal(failed.data, false); assert.equal(failed.dataInputs.a, 1); assert.equal(failed.stale, true);
  assert.equal(view.getSnapshot().roots[0].inputs.value, false); const retry = view.getQuery('list').retry(); await flush();
  const running = view.getQuery('list').getSnapshot(); assert.equal(running.error, null); assert.equal(running.data, false); assert.equal(running.stale, true);
  await f.reply(3, 0); await retry; const success = view.getQuery('list').getSnapshot(); assert.equal(success.data, 0); assert.equal(success.dataInputs.a, 2); assert.equal(success.stale, false); assert.equal(old.data, false);
});

function compositeResources() {
  const left = queryResource('left'), right = queryResource('right');
  for (const definition of [left, right]) definition.spec.ports = { value: port() };
  return [left, right, { kind: 'Query', id: 'composite', spec: { ports: { a: port(), b: port() }, sources: {
    left: { queryRef: 'left', inputs: { value: p('/ports/a') } }, right: { queryRef: 'right', inputs: { value: p('/ports/b') } },
  }, transform: { input: { left: p('/sources/left'), right: p('/sources/right') } } } }];
}

test('Q22 unchanged child inputs reuse across State changes and View removal creates a fresh cache lifetime', async t => {
  const f = controlled(t, compositeResources()); const spec = baseView({ queries: { list: use('composite') } });
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec }); await flush(); assert.equal(f.requests.length, 2);
  await f.reply(1, ['left']); await f.reply(2, ['right']); await initial;
  view.getState('a').write(2); await flush(); assert.equal(f.requests.length, 3); assert.equal(f.requests[2].plan.request.path, '/left');
  await f.reply(3, ['next-left']); assert.deepEqual(plain(view.getQuery('list').getSnapshot().data), { left: ['next-left'], right: ['right'] });
  const previous = view.getQuery('list'); await view.update({ ...spec, queries: {}, render: display() }); await flush();
  await assert.rejects(previous.refresh(), e => e.code === 'CANCELLED'); const reapplied = await view.update(spec); await flush();
  assert.equal(f.requests.length, 5); assert.notEqual(view.getQuery('list'), previous);
  await f.reply(4, ['new-left']); await f.reply(5, ['new-right']); await bounded(reapplied.initialComplete);
});

test('Q22 separate usages of the same Query keep independent data, executions and child caches', async t => {
  const f = controlled(t, compositeResources()); const { view, initialComplete: initial } = await f.runtime.createView({ view: baseView({
    queries: { first: use('composite'), second: use('composite', 1, 1) }, render: display(),
  }) }); await flush(); assert.equal(f.requests.length, 4);
  await f.reply(1, ['a-left']); await f.reply(2, ['a-right']); await f.reply(3, ['b-left']); await f.reply(4, ['b-right']); await initial;
  const first = view.getQuery('first'), second = view.getQuery('second'); assert.notEqual(first, second);
  view.getState('a').write(9); await flush(); assert.equal(f.requests.length, 5); await f.reply(5, ['changed-left']);
  assert.deepEqual(plain(second.getSnapshot().data), { left: ['b-left'], right: ['b-right'] });
  assert.deepEqual(plain(first.getSnapshot().data), { left: ['changed-left'], right: ['a-right'] });
});

test('Q11/K16 cancelled parent Action propagates to its child refresh waiter while the shared Query keeps running', async t => {
  const f = controlled(t); let childPromise, held;
  f.registry.registerResources([{ kind: 'Action', id: 'child-refresh', spec: { ports: { list: { kind: 'Query', required: true } }, steps: [{ kind: 'RefreshQuery', target: p('/ports/list') }] } }]);
  f.registry.registerAction({ kind: 'Action', id: 'parent-refresh', spec: { ports: { list: { kind: 'Query', required: true } } } }, async context => {
    held = context.inputs.list; childPromise = context.invokeAction({ actionRef: 'child-refresh', inputs: { list: held } }); await childPromise;
  });
  const spec = baseView({ states: { a: valueState(1), b: valueState(1), show: valueState(true) }, render: {
    id: 'row', componentRef: 'Row', slots: { default: [{ id: 'button', componentRef: 'Button', when: p('/states/show'), on: {
      click: { actionRef: 'parent-refresh', inputs: { list: p('/queries/list') } },
    } }] },
  } });
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec }); await f.reply(1, 'initial'); await initial;
  const pending = view.emit(view.getSnapshot().roots[0].children[0], 'click', {}); const rejected = assert.rejects(pending, e => e.code === 'CANCELLED');
  await flush(); assert.equal(f.requests.length, 2); assert.equal(view.getQuery('list').getSnapshot().status, 'running');
  view.getState('show').write(false); await rejected; await assert.rejects(childPromise, e => e.code === 'CANCELLED');
  await assert.rejects(async () => held.refresh(), e => e.code === 'CANCELLED'); assert.equal(f.requests[1].signal.aborted, false);
  await f.reply(2, 'query-owned'); assert.equal(view.getQuery('list').getSnapshot().data, 'query-owned');
});

test('N02 unknown reference without resolver fails clearly; default public native HTTP works without a supplied executor', async t => {
  const r = registry(), runtime = createRuntime({ registry: r }); t.after(() => runtime.dispose());
  await assert.rejects(runtime.createView({ viewRef: 'absent' }), e => e.code === 'REFERENCE_NOT_FOUND');
  const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('false'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  r.registerResources([queryResource('q', `http://127.0.0.1:${server.address().port}`)]);
  const { view, initialComplete: initial } = await runtime.createView({ view: baseView() }); await bounded(initial);
  assert.equal(view.getQuery('list').getSnapshot().data, false); assert.equal(view.getSnapshot().roots[0].inputs.value, false);
});

test('N02 server-only secret plan without resolver is a Query error reported by initial without a data request', async t => {
  const r = registry(), resource = queryResource(); resource.spec.sources.main.datasource.secrets = { key: 'server-reference' };
  resource.spec.sources.main.datasource.headers = { 'X-Key': p('/secrets/key') }; r.registerResources([resource]);
  const runtime = createRuntime({ registry: r }); t.after(() => runtime.dispose()); const { view, initialComplete: initial } = await runtime.createView({ view: baseView() });
  const done = await bounded(initial); assert.equal(done.queryErrors.length, 1); assert.equal(done.queryErrors[0].error.code, 'EXECUTION_BLOCKED');
  assert.equal(view.getQuery('list').getSnapshot().status, 'error'); assert.equal(view.getQuery('list').getSnapshot().data, undefined);
});

test('N05/K23 dynamic duplicate-key update rolls back staged State writes before retaining the old screen and pending initial', async t => {
  const f = controlled(t);
  const spec = baseView({ states: { a: valueState(1), b: valueState(1), items: { kind: 'State', schema: { type: 'array' }, initial: [{ id: 1 }] } },
    render: { id: 'row', componentRef: 'Row', slots: { default: [{ id: 'item', componentRef: 'Display', repeat: { items: p('/states/items'), as: 'item', key: p('/repeat/item/id') }, inputs: { value: p('/repeat/item/id') } }] } },
  });
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec }); await flush(); const original = view.getSnapshot(), items = view.getState('items');
  await assert.rejects(view.update(spec, { states: { a: 9, items: [{ id: 1 }, { id: 1 }] } }), e => e.code === 'INVALID_DEFINITION');
  assert.equal(view.getState('a').read(), 1); assert.deepEqual(plain(items.read()), [{ id: 1 }]);
  assert.equal(view.getSnapshot().generation, original.generation); assert.equal(view.getSnapshot().roots[0].generation, original.roots[0].generation);
  assert.equal(view.getSnapshot().roots.length, 1); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].signal.aborted, false);
  await f.reply(1, 'old-valid'); await bounded(initial); assert.equal(view.getQuery('list').getSnapshot().data, 'old-valid');
});

test('K23 update before initial completion cancels the old completion while preserving the active valid usage', async t => {
  const f = controlled(t); const spec = baseView(); const { view, initialComplete: initial } = await f.runtime.createView({ view: spec }); await flush();
  const rejected = assert.rejects(initial, e => e.code === 'CANCELLED'); const query = view.getQuery('list');
  const next = await view.update({ ...spec, render: display('changed', p('/queries/list/data')) }); await rejected; await flush();
  assert.equal(f.requests.length, 1); assert.equal(view.getQuery('list'), query); assert.equal(f.requests[0].signal.aborted, false);
  await f.reply(1, 'same-valid-usage'); assert.deepEqual(await bounded(next.initialComplete), { generation: 2, queryErrors: [] });
  assert.equal(view.getSnapshot().roots[0].id, 'changed'); assert.equal(view.getSnapshot().roots[0].inputs.value, 'same-valid-usage');
});

test('K25 dependency type errors affect the current Query while unrelated Query and UI stay ready', async t => {
  const typed = queryResource(); typed.spec.ports.a = port(number); const f = controlled(t, [typed]);
  const spec = baseView({ states: { a: { kind: 'State', schema: true, initial: 1 }, b: valueState(1) },
    queries: { list: use(), unrelated: use('q', 1, 1) }, render: display(),
  });
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec }); await flush(); await f.reply(1, 'old'); await f.reply(2, 'unrelated'); await initial;
  view.getState('a').write('wrong-type'); await flush(); const state = view.getQuery('list').getSnapshot();
  assert.equal(f.requests.length, 2); assert.equal(state.status, 'error'); assert.equal(state.error.code, 'TYPE_MISMATCH');
  assert.equal(state.data, 'old'); assert.equal(state.stale, true); assert.equal(state.dataInputs.a, 1);
  assert.equal(view.getQuery('unrelated').getSnapshot().status, 'success'); assert.equal(view.getSnapshot().roots[0].status, 'ready');
  view.getState('a').write(2); await flush(); assert.equal(f.requests.length, 3); await f.reply(3, 'corrected');
  assert.equal(view.getQuery('list').getSnapshot().data, 'corrected'); assert.equal(view.getQuery('list').getSnapshot().error, null);
});

test('Q22/K23 replacing a fully successful View resets owner caches even with identical query inputs', async t => {
  const f = controlled(t, compositeResources()), spec = baseView({ queries: { list: use('composite') } });
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec }); await flush();
  await f.reply(1, ['old-left']); await f.reply(2, ['old-right']); await initial; const previous = view.getQuery('list');
  const replaced = await view.replace({ view: spec }); await flush(); assert.equal(f.requests.length, 4);
  assert.equal(view.getQuery('list').getSnapshot().data, undefined); await assert.rejects(previous.refresh(), e => e.code === 'CANCELLED');
  await f.reply(3, ['new-left']); await f.reply(4, ['new-right']); await bounded(replaced.initialComplete);
  assert.deepEqual(plain(view.getQuery('list').getSnapshot().data), { left: ['new-left'], right: ['new-right'] });
});

test('Q22/K16 conditional Component removal disposes its Query cache and recreated owner fetches both children', async t => {
  const f = controlled(t, compositeResources());
  f.registry.registerResources([{ kind: 'Component', id: 'Panel', spec: { ports: { a: port(), b: port() },
    queries: { list: use('composite', p('/ports/a'), p('/ports/b')) }, render: display('inside', p('/queries/list/data')),
  } }]);
  const spec = { states: { show: valueState(true) }, render: { id: 'row', componentRef: 'Row', slots: { default: [{
    id: 'panel', componentRef: 'Panel', inputs: { a: 1, b: 1 }, when: p('/states/show'),
  }] } } };
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec }); await flush();
  await f.reply(1, ['old-left']); await f.reply(2, ['old-right']); await initial;
  const oldId = view.getSnapshot().roots[0].children[0].instanceId, old = view.getQuery('list', oldId);
  view.getState('show').write(false); await flush(); assert.equal(view.getSnapshot().roots[0].children.length, 0);
  await assert.rejects(old.refresh(), e => e.code === 'CANCELLED');
  view.getState('show').write(true); await flush(); assert.equal(f.requests.length, 4);
  const nextId = view.getSnapshot().roots[0].children[0].instanceId; assert.notEqual(nextId, oldId);
  await f.reply(3, ['new-left']); await f.reply(4, ['new-right']);
  assert.deepEqual(plain(view.getQuery('list', nextId).getSnapshot().data), { left: ['new-left'], right: ['new-right'] });
});
