import { createHttpExecutor } from '@viewstem/core/http';
import test from 'node:test';
import assert from 'node:assert/strict';
// Exercise the public entry points directly from source; the build owner updates dist.
import { createRuntime as publicRuntime, createRegistry } from '../src/index.mjs';
import { runtimeFixture as adaptRuntime } from './fixtures/runtime-operations.mjs';
const createRuntime = adaptRuntime(publicRuntime);
// Pending-initialization probes below target the internal Store; the View flows
// above them continue to exercise the public Runtime and its URL integration.
import { createStateStore } from '../src/state.mjs';
import { memoryUrl, link, tick } from './fixtures/state/url-adapter.mjs';

const integer = { type: 'integer' };
function runtimeFixture(t) {
  const endpoint = memoryUrl(link({ owned: 8 })), registry = createRegistry();
  registry.registerComponentContract({ kind: 'Component', id: 'Text', spec: { ports: { value: { kind: 'Value', schema: true } } } });
  const runtime = createRuntime({ registry }); t.after(() => runtime.dispose());
  const render = { id: 'text', componentRef: 'Text', inputs: { value: 'ready' } };
  const pending = { ports: { seed: { kind: 'Value', schema: integer } }, states: {
    value: { kind: 'State', schema: integer, initial: { '@path': '/ports/seed' } },
  }, render };
  return { ...endpoint, runtime, pending, render, url: { adapter: endpoint.adapter, bindings: [{ state: 'value', key: 'owned' }] } };
}

test('U33 pending replacement initial survives failed old URL cleanup', async t => {
  const f = runtimeFixture(t);
  const { view, initialComplete: initial } = await f.runtime.createView({ view: { states: {
    value: { kind: 'State', schema: integer, initial: 1 },
  }, render: f.render }, url: f.url }); await initial;
  f.failNext(); const replacement = await view.replace({ view: f.pending, url: f.url }); await replacement.initialComplete;
  assert.equal(view.getState('value').getSnapshot().status, 'pending');
  const update = await view.update(f.pending, { inputs: { seed: 3 } }); await update.initialComplete; await tick();
  assert.equal(view.getState('value').read(), 3);
  assert.equal(new URL(f.read()).searchParams.get('owned'), '8');
  assert.ok(view.getSnapshot().errors.some(error => error.kind === 'replace-cleanup' && error.code === 'HTTP_ERROR'));
  assert.equal(f.attempts.length, 1);
  f.navigate(link({ owned: 6 })); assert.equal(view.getState('value').read(), 6);
});

test('pending View initialization restores URL without writing it back', async t => {
  const f = runtimeFixture(t), { view, initialComplete: initial } = await f.runtime.createView({ view: f.pending, url: f.url }); await initial;
  const update = await view.update(f.pending, { inputs: { seed: 3 } }); await update.initialComplete; await tick();
  assert.equal(view.getState('value').read(), 8); assert.equal(f.attempts.length, 0);
});

test('pending View baseline preserves explicit State write and sends it to URL', async t => {
  const f = runtimeFixture(t), { view, initialComplete: initial } = await f.runtime.createView({ view: f.pending, url: f.url }); await initial;
  view.getState('value').write(9);
  assert.equal(f.attempts.length, 0);
  const update = await view.update(f.pending, { inputs: { seed: 3 } }); await update.initialComplete; await tick();
  assert.equal(view.getState('value').read(), 9);
  assert.equal(new URL(f.read()).searchParams.get('owned'), '9');
  assert.deepEqual(f.attempts.map(job => job.patch), [{ owned: '9' }]);
});

for (const pending of [false, true]) for (const trigger of ['restore', 'navigate']) {
  test(`restore:false suppresses initial restore only, pending=${pending}, trigger=${trigger}`, async t => {
    const f = memoryUrl(link({ owned: 8 })), store = createStateStore(), scope = store.createScope(); t.after(() => store.dispose());
    let settle;
    const target = scope.registerState('value', { schema: integer, ...(pending ? { pendingInitial: new Promise(resolve => { settle = resolve; }) } : { initial: 3 }) });
    const connection = store.connectUrl({ adapter: f.adapter, bindings: [{ target, key: 'owned' }], restore: false });
    assert.equal(connection.isReady(), !pending);
    if (pending) { settle(3); await tick(); }
    assert.equal(connection.isReady(), true); await connection.ready;
    assert.equal(target.read(), 3); assert.equal(f.attempts.length, 0);
    if (trigger === 'restore') connection.restore(); else f.navigate(link({ owned: 8 }));
    assert.equal(target.read(), 8); assert.equal(f.attempts.length, 0);
    f.navigate('https://example.test/view'); assert.equal(target.read(), 3);
  });
}

for (const history of ['replace', 'push']) test(`pending explicit writes accumulate once with ${history} history and restore without reactions`, async t => {
  const f = memoryUrl(link({ owned: 8, other: 5 })), store = createStateStore(), scope = store.createScope(); t.after(() => store.dispose());
  let settle;
  const target = scope.registerState('value', { schema: integer, pendingInitial: new Promise(resolve => { settle = resolve; }) });
  const other = scope.registerState('other', { schema: integer, initial: 1 });
  const reaction = scope.registerState('reaction', { schema: integer, initial: 7 });
  store.registerReaction(scope, { watch: [target], target: reaction, value: 0 });
  const connection = store.connectUrl({ adapter: f.adapter, bindings: [{ target, key: 'owned' }, { target: other, key: 'other', history }] });
  target.write(9); other.write(4); target.write(10); assert.equal(f.attempts.length, 0);
  reaction.write(7); settle(3); await tick(); await connection.ready;
  assert.equal(connection.isReady(), true); assert.equal(target.read(), 10); assert.equal(other.read(), 4); assert.equal(reaction.read(), 7);
  assert.deepEqual(f.attempts.map(job => ({ patch: job.patch, mode: job.options.mode })), [{ patch: { owned: '10', other: '4' }, mode: history }]);
  f.navigate(link({ owned: 2, other: 6 })); await tick();
  assert.equal(target.read(), 2); assert.equal(other.read(), 6); assert.equal(reaction.read(), 7); assert.equal(f.attempts.length, 1);
});

test('pending pure initialization and URL restore never write URL or run reactions', async t => {
  const f = memoryUrl(link({ owned: 8 })), store = createStateStore(), scope = store.createScope(); t.after(() => store.dispose());
  let settle;
  const target = scope.registerState('value', { schema: integer, pendingInitial: new Promise(resolve => { settle = resolve; }) });
  const reaction = scope.registerState('reaction', { schema: integer, initial: 7 });
  store.registerReaction(scope, { watch: [target], target: reaction, value: 0 });
  const connection = store.connectUrl({ adapter: f.adapter, bindings: [{ target, key: 'owned' }] });
  settle(3); await tick(); await connection.ready;
  assert.equal(target.read(), 8); assert.equal(reaction.read(), 7); assert.equal(f.attempts.length, 0);
});

for (const observed of [3, 8]) test(`reentrant write from initial/URL notification ${observed} is retained and synchronized`, async t => {
  const f = memoryUrl(link({ owned: 8 })), store = createStateStore(), scope = store.createScope(); t.after(() => store.dispose());
  let settle;
  const target = scope.registerState('value', { schema: integer, pendingInitial: new Promise(resolve => { settle = resolve; }) });
  store.subscribe(target.address, payload => {
    const snapshot = payload.states[JSON.stringify([target.address.scopeId, target.address.name])];
    if (snapshot.status === 'ready' && snapshot.value === observed) target.write(9);
  });
  const connection = store.connectUrl({ adapter: f.adapter, bindings: [{ target, key: 'owned' }] });
  settle(3); await tick(); await connection.ready;
  assert.equal(target.read(), 9); assert.equal(new URL(f.read()).searchParams.get('owned'), '9');
  assert.deepEqual(f.attempts.map(job => job.patch), [{ owned: '9' }]);
});

for (const suffix of ['?', '#']) for (const addressOwner of ['datasource', 'request', 'login']) {
  test(`HTTP rejects empty ${suffix} baseUrl delimiter in ${addressOwner} before transport`, async () => {
    const calls = [];
    const execute = createHttpExecutor({ authorize: () => true, transport: async (...args) => { calls.push(args); return new Response('{}', { headers: { 'content-type': 'application/json' } }); } });
    const invalid = `https://api.example.test/v1${suffix}`;
    const datasource = { kind: 'Http', baseUrl: addressOwner === 'datasource' ? invalid : 'https://api.example.test/v1' };
    if (addressOwner === 'login') datasource.auth = { kind: 'Login', request: { baseUrl: invalid, method: 'POST', path: '/login' }, token: { '@path': '/response/body/token' } };
    await assert.rejects(execute({ version: 1, requestId: 'preflight', datasource,
      request: { method: 'POST', path: '/delete', ...(addressOwner === 'request' ? { baseUrl: invalid } : {}) }, inputs: {},
    }), { code: 'INVALID_DEFINITION' });
    assert.equal(calls.length, 0);
  });
}

test('HTTP keeps encoded query/fragment delimiters in base and request paths', async () => {
  const calls = [];
  const execute = createHttpExecutor({ transport: async (url, options) => { calls.push({ url: String(url), method: options.method }); return new Response('{}', { headers: { 'content-type': 'application/json' } }); } });
  await execute({ version: 1, requestId: 'encoded', datasource: { kind: 'Http', baseUrl: 'https://api.example.test/v1%3F%23' }, request: { method: 'POST', path: '/delete%3F%23' }, inputs: {} });
  assert.deepEqual(calls, [{ url: 'https://api.example.test/v1%3F%23/delete%3F%23', method: 'POST' }]);
});
