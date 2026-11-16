import { createHttpExecutor } from '@viewstem/core/http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createServer } from 'node:http';
import { createRegistry, createStateStore } from '@viewstem/core';
import { createRuntime } from './fixtures/runtime-operations.mjs';
const p = path => ({ '@path': path });
const n = { type: 'number' }, b = { type: 'boolean' };
const value = (schema = true) => ({ kind: 'Value', schema, required: true });
const state = schema => ({ kind: 'State', schema, required: true });
const stateDef = (initial, schema = true) => ({ kind: 'State', schema, initial });
const flush = async () => { await setImmediate(); await setImmediate(); };
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const bounded = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('public Query acceptance watchdog')), 3000); })]); }
  finally { clearTimeout(timer); }
};
function registry(functions = []) {
  const r = createRegistry({ functions });
  r.registerComponentContract({ kind: 'Component', id: 'Display', spec: { ports: { value: value() } } });
  r.registerComponentContract({ kind: 'Component', id: 'Row', spec: { slots: { default: {} } } });
  return r;
}
const display = (id = 'display', payload = 'ready') => ({ id, componentRef: 'Display', inputs: { value: payload } });
const query = (id = 'q', ports = { term: value() }) => ({ kind: 'Query', id, spec: { ports, sources: { main: {
  datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/current' },
} }, transform: { input: p('/sources/main') } } });
function controlled(t, { functions = [], resources = [query()], runtimeOptions = {} } = {}) {
  const r = registry(functions); if (resources.length) r.registerResources(resources);
  const requests = [];
  const runtime = createRuntime({ registry: r, ...runtimeOptions, requestExecutor: (plan, { signal }) => {
    const completion = deferred(); const row = { plan, signal, ...completion }; requests.push(row); return completion.promise;
  } });
  t.after(() => { runtime.dispose(); for (const row of requests) row.resolve({ status: 200, headers: {}, body: null }); });
  return { r, runtime, requests, async reply(index, body, code) {
    const row = requests[index - 1]; assert.ok(row, `Missing request ${index}`);
    if (code) row.reject({ code, message: 'raw detail must be sanitized' }); else row.resolve({ status: 200, headers: {}, body }); await flush();
  } };
}
const spec = (settings = {}) => ({ states: { term: stateDef('A'), enabled: stateDef(true, b) }, queries: { list: {
  queryRef: 'q', inputs: { term: p('/states/term') }, ...settings,
} }, render: display() });

// A real Action output calls this registered pure-function test observer only
// after all stages succeed. The control Action proves it is connected.
function installActionPipeline(f) {
  let before = 0, after = 0, output = 0;
  f.r.registerAction({ kind: 'Action', id: 'before', spec: {} }, () => { before++; });
  f.r.registerAction({ kind: 'Action', id: 'after', spec: {} }, () => { after++; });
  const ports = { list: { kind: 'Query', required: true }, cell: state(n) };
  f.r.registerResources([{ kind: 'Action', id: 'pipeline', spec: { ports, steps: [
    { kind: 'SetState', target: p('/ports/cell'), value: 1 }, { kind: 'Action', actionRef: 'before' },
    { kind: 'RefreshQuery', target: p('/ports/list') }, { kind: 'Action', actionRef: 'after' },
    { kind: 'SetState', target: p('/ports/cell'), value: 2 },
  ], output: { schema: n, value: { '@call': 'countOutput', args: [] } } } },
  { kind: 'Action', id: 'output-control', spec: { steps: [], output: { schema: n, value: { '@call': 'countOutput', args: [] } } } }]);
  return { counts: () => ({ before, after, output }), setOutput: () => { output++; return 9; }, reset: () => { output = 0; } };
}
for (const [label, settings, errorCode] of [
  ['closed gate', { executeWhen: p('/states/enabled') }, 'EXECUTION_BLOCKED'],
  ['refresh disabled', { refresh: false }, 'QUERY_REFRESH_DISABLED'],
]) test(`Q09 Q13 K12 actual Action ${label} preserves earlier effects and skips later stages/output`, async t => {
  let effects;
  const f = controlled(t, { functions: [{ name: 'countOutput', inputs: [], output: n, run: () => effects.setOutput() }] }); effects = installActionPipeline(f);
  const viewSpec = spec(settings); viewSpec.states.cell = stateDef(0, n); if (label === 'closed gate') viewSpec.states.enabled.initial = false;
  const { view, initialComplete: initial } = await f.runtime.createView({ view: viewSpec }); await flush();
  if (label === 'refresh disabled') await f.reply(1, 'initial'); await bounded(initial);
  assert.equal(await f.runtime.invokeAction({ owner: view, actionRef: 'output-control' }), 9); assert.equal(effects.counts().output, 1); effects.reset();
  const beforeRequests = f.requests.length;
  await assert.rejects(f.runtime.invokeAction({ owner: view, actionRef: 'pipeline', inputs: { list: view.getQuery('list'), cell: view.getState('cell') } }), e => e.code === errorCode);
  assert.deepEqual(effects.counts(), { before: 1, after: 0, output: 0 }); assert.equal(view.getState('cell').read(), 1); assert.equal(f.requests.length, beforeRequests);
});

test('Q11 actual RefreshQuery Action waits beyond the old active response before executing its next stage/output', async t => {
  let effects;
  const f = controlled(t, { functions: [{ name: 'countOutput', inputs: [], output: n, run: () => effects.setOutput() }] }); effects = installActionPipeline(f);
  const viewSpec = spec(); viewSpec.states.cell = stateDef(0, n); const { view, initialComplete: initial } = await f.runtime.createView({ view: viewSpec }); await flush();
  let settled = false;
  const action = f.runtime.invokeAction({ owner: view, actionRef: 'pipeline', inputs: { list: view.getQuery('list'), cell: view.getState('cell') } }).then(value => { settled = true; return value; }); void action.catch(() => {}); await flush();
  assert.equal(f.requests.length, 1); assert.deepEqual(effects.counts(), { before: 1, after: 0, output: 0 });
  await f.reply(1, 'old-active'); assert.equal(settled, false); assert.equal(f.requests.length, 2); assert.equal(view.getState('cell').read(), 1);
  assert.deepEqual(effects.counts(), { before: 1, after: 0, output: 0 }); await f.reply(2, 'fresh'); assert.equal(await bounded(action), 9); await bounded(initial);
  assert.deepEqual(effects.counts(), { before: 1, after: 1, output: 1 }); assert.equal(view.getState('cell').read(), 2);
});

test('K28 real fresh RefreshQuery failure rejects the Action while retaining data and suppressing its remaining stages/output', async t => {
  let effects;
  const f = controlled(t, { functions: [{ name: 'countOutput', inputs: [], output: n, run: () => effects.setOutput() }] }); effects = installActionPipeline(f);
  const viewSpec = spec(); viewSpec.states.cell = stateDef(0, n); const { view, initialComplete: initial } = await f.runtime.createView({ view: viewSpec }); await f.reply(1, 'last-success'); await initial;
  const action = f.runtime.invokeAction({ owner: view, actionRef: 'pipeline', inputs: { list: view.getQuery('list'), cell: view.getState('cell') } });
  const rejected = assert.rejects(action, e => e.code === 'HTTP_ERROR'); await flush(); await f.reply(2, null, 'HTTP_ERROR'); await rejected;
  assert.deepEqual(effects.counts(), { before: 1, after: 0, output: 0 }); assert.equal(view.getState('cell').read(), 1);
  assert.equal(view.getQuery('list').getSnapshot().data, 'last-success'); assert.equal(view.getQuery('list').getSnapshot().status, 'error');
});

test('Q12 K28 actual explicit Action Queries stay independent, never subscribe/retry/share, and never substitute cached data after failure', async t => {
  let after = 0, output = 0;
  const f = controlled(t, { functions: [{ name: 'explicitOutput', inputs: [], output: n, run: () => { output++; return 1; } }] });
  f.r.registerAction({ kind: 'Action', id: 'after', spec: {} }, () => { after++; });
  f.r.registerResources([{ kind: 'Action', id: 'explicit', spec: { ports: { term: value() }, steps: [
    { kind: 'Query', id: 'result', queryRef: 'q', inputs: { term: p('/ports/term') } }, { kind: 'Action', actionRef: 'after' },
  ], output: { schema: n, value: { '@call': 'explicitOutput', args: [] } } } }]);
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec() }); await f.reply(1, 'automatic-cache'); await initial;
  const first = f.runtime.invokeAction({ owner: view, actionRef: 'explicit', inputs: { term: 'A' } }); void first.catch(() => {});
  const second = f.runtime.invokeAction({ owner: view, actionRef: 'explicit', inputs: { term: 'A' } });
  const failed = assert.rejects(second, e => e.code === 'HTTP_ERROR'); await flush(); assert.equal(f.requests.length, 3);
  await f.reply(2, 'independent-success'); await f.reply(3, null, 'HTTP_ERROR'); assert.equal(await first, 1); await failed;
  assert.equal(after, 1); assert.equal(output, 1); assert.equal(view.getQuery('list').getSnapshot().data, 'automatic-cache');
  const third = f.runtime.invokeAction({ owner: view, actionRef: 'explicit', inputs: { term: 'A' } }); await flush(); assert.equal(f.requests.length, 4);
  await f.reply(4, 'new-explicit'); await third; const count = f.requests.length; await flush(); assert.equal(f.requests.length, count);
  view.getState('term').write('B'); await flush(); assert.equal(f.requests.length, count + 1); await f.reply(5, 'automatic-B');
  assert.equal(after, 2); assert.equal(output, 2); assert.equal(view.getSnapshot().errors.length, 0);
});

test('Q01 valid unused Query and Component registrations make no requests before or after a separate static View mount', async t => {
  const f = controlled(t);
  f.r.registerResources([{ kind: 'Component', id: 'UnusedPanel', spec: { queries: { list: { queryRef: 'q', inputs: { term: 'unused' } } }, render: display() } }]);
  assert.equal(f.requests.length, 0); const { initialComplete: initial } = await f.runtime.createView({ view: { render: display() } }); await initial; await flush(); assert.equal(f.requests.length, 0);
});

test('Q15 actual native-collection State stays protected and native after recursive callback encoding and callback mutation', async t => {
  const f = controlled(t, { resources: [query('q', { payload: value() })] });
  const { view, initialComplete: initial } = await f.runtime.createView({ view: { states: { payload: { kind: 'State', schema: true } }, queries: { list: { queryRef: 'q', inputs: { payload: p('/states/payload') } } }, render: display() } }); await initial;
  const original = { nested: { set: new Set([1, 2]), map: new Map([['outer', new Map([[3, new Set(['x'])]])]]) } };
  const handle = view.getState('payload'); handle.write(original); const before = handle.read(); await flush(); assert.equal(f.requests.length, 1);
  assert.deepEqual(f.requests[0].plan.inputs.payload, { nested: { set: [1, 2], map: [['outer', [[3, ['x']]]]] } });
  f.requests[0].plan.inputs.payload.nested.set.push(99); f.requests[0].plan.inputs.payload.nested.map[0][1][0][1].push('bad');
  original.nested.set.add(77); assert.equal(handle.read(), before); assert.ok(before.nested.set instanceof Set); assert.ok(before.nested.map instanceof Map);
  assert.deepEqual([...before.nested.set], [1, 2]); assert.deepEqual([...before.nested.map.get('outer').get(3)], ['x']);
  assert.equal(Object.isFrozen(original), false); assert.throws(() => before.nested.set.add(9)); await f.reply(1, 'done'); assert.equal(handle.read(), before);
});

test('Q21 explicit multiple Queries accept array Values and do not become list-driven fanout', async t => {
  const array = { type: 'array', items: n }, f = controlled(t, { resources: [query('q', { items: value(array) })] });
  const viewSpec = { states: { items: stateDef([1, 2], array) }, queries: {
    first: { queryRef: 'q', inputs: { items: p('/states/items') } }, second: { queryRef: 'q', inputs: { items: p('/states/items') } },
  }, render: display() };
  const { view, initialComplete: initial } = await f.runtime.createView({ view: viewSpec }); await flush(); assert.equal(f.requests.length, 2);
  assert.deepEqual(f.requests.map(row => row.plan.inputs.items), [[1, 2], [1, 2]]); await f.reply(1, []); await f.reply(2, []); await initial;
  view.getState('items').write([3, 4, 5]); await flush(); assert.equal(f.requests.length, 4); assert.deepEqual(f.requests[2].plan.inputs.items, [3, 4, 5]);
  await f.reply(3, []); await f.reply(4, []);
  const unsupported = structuredClone(viewSpec); unsupported.queries.first.repeat = { items: p('/states/items'), as: 'item' };
  await assert.rejects(view.update(unsupported), e => e.code === 'INVALID_DEFINITION'); assert.equal(f.requests.length, 4);
});

test('H02 mounted current definition ignores later backing-store changes and does not re-read the resolver on refresh', async t => {
  const backing = query('saved'), reads = [], f = controlled(t, { resources: [], runtimeOptions: { resourceResolver: async (kind, id) => { reads.push([kind, id]); return backing; } } });
  const { view, initialComplete: initial } = await f.runtime.createView({ view: { queries: { list: { queryRef: 'saved', inputs: { term: 'A' } } }, render: display() } });
  await f.reply(1, 'current'); await initial; backing.spec.sources.main.request.path = '/backing-store-new'; backing.spec.transform.input = 'wrong';
  const fresh = view.getQuery('list').refresh(); await flush(); assert.equal(f.requests[1].plan.request.path, '/current'); assert.deepEqual(reads, [['Query', 'saved']]);
  await f.reply(2, 'still-current'); await fresh; assert.equal(view.getQuery('list').getSnapshot().data, 'still-current');
});

async function serverFixture(t) {
  const seen = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const url = new URL(req.url, 'http://localhost'); seen.push({ path: url.pathname, params: [...url.searchParams], headers: req.headers, body });
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(url.pathname.endsWith('/login') ? { token: 'login-token', private: 'login-private' } : { ok: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const executor = createHttpExecutor({ caller: 'trusted', authorize: ({ caller, destination }) => caller === 'trusted' && new URL(destination).origin === new URL(baseUrl).origin,
    resolveSecret: async (reference, context) => { assert.equal(context.caller, 'trusted'); assert.ok(context.destination.startsWith(baseUrl)); return { key: 'api-key', token: 'existing-token', password: 'password-secret' }[reference]; },
  });
  return { seen, baseUrl, executor };
}
test('H04 H09 all seven named authentication layouts use the actual public executor and isolate Login/secret results', async t => {
  const f = await serverFixture(t), secret = name => p('/secrets/'+name), bearer = source => ({ '@call': 'concat', args: ['Bearer ', source] });
  const layouts = [
    ['public', {}, undefined],
    ['api-key-header', { secrets: { key: 'key' }, headers: { 'X-API-Key': secret('key') } }, ['header', 'x-api-key', 'api-key']],
    ['api-key-params', { secrets: { key: 'key' }, params: { api_key: secret('key') } }, ['param', 'api_key', 'api-key']],
    ['existing-bearer', { secrets: { token: 'token' }, headers: { Authorization: bearer(secret('token')) } }, ['header', 'authorization', 'Bearer existing-token']],
    ['login-bearer', { headers: { Authorization: bearer(p('/auth/token')) } }, ['header', 'authorization', 'Bearer login-token']],
    ['login-custom-header', { headers: { 'X-Session': p('/auth/token') } }, ['header', 'x-session', 'login-token']],
    ['login-params', { params: { access_token: p('/auth/token') } }, ['param', 'access_token', 'login-token']],
  ];
  for (const [name, config, expected] of layouts) {
    const start = f.seen.length;
    const datasource = { kind: 'Http', baseUrl: f.baseUrl, ...config };
    if (name.startsWith('login-')) {
      datasource.secrets = { password: 'password' }; datasource.auth = { kind: 'Login', request: { method: 'POST', path: '/login', body: { password: secret('password') } }, token: p('/response/body/token') };
    }
    const plan = { version: 1, requestId: name, datasource, request: { method: 'GET', path: '/data' }, inputs: {} };
    const result = await f.executor(plan); const sent = f.seen.slice(start), api = sent.at(-1);
    assert.equal(sent.length, name.startsWith('login-') ? 2 : 1); assert.equal(api.path, '/v1/data');
    if (expected) assert.equal(expected[0] === 'header' ? api.headers[expected[1]] : new URLSearchParams(api.params).get(expected[1]), expected[2]);
    if (name.startsWith('login-')) { assert.equal(sent[0].headers.authorization, undefined); assert.deepEqual(sent[0].params, []); assert.equal(JSON.parse(sent[0].body).password, 'password-secret'); }
    assert.deepEqual(result.body, { ok: true }); for (const marker of ['api-key','existing-token','login-token','password-secret','login-private']) assert.equal(JSON.stringify(result).includes(marker), false);
    assert.deepEqual(plan.inputs, {}); assert.equal(plan.datasource.auth?.token?.['@path'], name.startsWith('login-') ? '/response/body/token' : undefined);
  }
});

test('K09 params nested object values are rejected before transport in common and request declarations', async t => {
  const f = await serverFixture(t);
  for (const where of ['datasource','request']) {
    const plan = { version: 1, requestId: where, datasource: { kind: 'Http', baseUrl: f.baseUrl }, request: { method: 'GET', path: '/data' }, inputs: {} };
    plan[where].params = { nested: { unsupported: 'object' } };
    await assert.rejects(f.executor(plan), e => e.code === 'INVALID_DEFINITION');
  }
  assert.equal(f.seen.length, 0);
});

test('K27 a retry that fails again preserves the last successful pair with the new error and stale flag', async t => {
  const f = controlled(t); const { view, initialComplete: initial } = await f.runtime.createView({ view: spec() }); await f.reply(1, 'last-success'); await initial;
  view.getState('term').write('B'); await flush(); await f.reply(2, null, 'HTTP_ERROR'); const before = view.getQuery('list').getSnapshot();
  const retry = view.getQuery('list').retry(); const rejected = assert.rejects(retry, e => e.code === 'TIMEOUT'); await flush();
  assert.equal(view.getQuery('list').getSnapshot().error, null); assert.equal(view.getQuery('list').getSnapshot().stale, true);
  await f.reply(3, null, 'TIMEOUT'); await rejected; const after = view.getQuery('list').getSnapshot();
  assert.equal(after.status, 'error'); assert.equal(after.error.code, 'TIMEOUT'); assert.equal(after.data, before.data); assert.equal(after.dataInputs, before.dataInputs); assert.equal(after.stale, true);
});

test('K14 retry never bypasses a closed gate or trusted server authorization even with refresh disabled', async t => {
  const f = await serverFixture(t), r = registry(), definition = query(); definition.spec.sources.main.datasource.baseUrl = f.baseUrl;
  let allowed = true, sends = 0;
  const executor = createHttpExecutor({ authorize: () => allowed, transport: async () => { sends++; return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } }); } });
  r.registerResources([definition]); const runtime = createRuntime({ registry: r, requestExecutor: executor }); t.after(() => runtime.dispose());
  const { view, initialComplete: initial } = await runtime.createView({ view: spec({ refresh: false, executeWhen: p('/states/enabled') }) }); await bounded(initial); assert.equal(sends, 1);
  view.getState('enabled').write(false); await flush(); await assert.rejects(view.getQuery('list').retry(), e => e.code === 'EXECUTION_BLOCKED'); assert.equal(sends, 1);
  allowed = false; view.getState('enabled').write(true); await flush(); assert.equal(view.getQuery('list').getSnapshot().status, 'error');
  await assert.rejects(view.getQuery('list').retry(), e => e.code === 'EXECUTION_BLOCKED'); assert.equal(sends, 1);
});

test('N05 incompatible State-type update rejects before new Query execution and preserves the active prior screen', async t => {
  const f = controlled(t), original = spec(); original.states.count = stateDef(1,n); const { view, initialComplete: initial } = await f.runtime.createView({ view: original }); await flush();
  const old = view.getSnapshot(), handle = view.getState('count'), changed = structuredClone(original); changed.states.count.schema = { type: 'string' }; changed.states.count.initial = 'new';
  await assert.rejects(view.update(changed), e => e.code === 'TYPE_CONTRACT_MISMATCH');
  assert.equal(view.getState('count'), handle); assert.equal(handle.read(), 1); assert.equal(view.getSnapshot().generation, old.generation); assert.equal(view.getSnapshot().roots[0].generation, old.roots[0].generation);
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].signal.aborted, false); await f.reply(1, 'preserved'); await bounded(initial);
});

test('N05 competing Component reaction owners reject an update atomically without disturbing the old owner or its Query', async t => {
  const store = createStateStore(), external = store.createScope(), shared = external.registerState('shared', { schema: n, initial: 5 });
  t.after(() => { external.dispose(); store.dispose(); });
  const f = controlled(t, { runtimeOptions: { stateStore: store } });
  f.r.registerResources([{ kind: 'Component', id: 'Reactor', spec: { ports: { target: state(n) }, states: { watched: stateDef(1,n) },
    reactions: [{ watch: [p('/states/watched')], target: p('/ports/target'), value: 0 }], render: display(),
  } }]);
  const reactor = id => ({ id, componentRef: 'Reactor', inputs: { target: p('/ports/target') } });
  const original = { ...spec(), ports: { target: state(n) }, render: { id: 'row', componentRef: 'Row', slots: { default: [reactor('first')] } } };
  const { view, initialComplete: initial } = await f.runtime.createView({ view: original, inputs: { target: shared } }); await flush(); const old = view.getSnapshot(), ownerId = old.roots[0].children[0].instanceId;
  const oldWatched = view.getState('watched', ownerId), changed = structuredClone(original); changed.render.slots.default.push(reactor('second'));
  await assert.rejects(view.update(changed)); assert.equal(view.getSnapshot().generation, old.generation); assert.equal(view.getSnapshot().roots[0].children.length, 1);
  assert.equal(view.getState('watched', ownerId), oldWatched); assert.equal(shared.read(), 5); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].signal.aborted, false);
  oldWatched.write(2); assert.equal(shared.read(), 0); await f.reply(1, 'preserved'); await bounded(initial);
});

test('Query custom registered @call works in nested inputs and transforms without receiving HTTP secret capabilities', async t => {
  const calls = []; const functions = [{ name: 'twiceValue', inputs: [n], output: n, run: value => { calls.push(value); return value * 2; } }];
  const child = query('child', { term: value(n) }); child.spec.transform.input = { '@call': 'twiceValue', args: [p('/ports/term')] };
  const parent = { kind: 'Query', id: 'parent', spec: { ports: { term: value(n) }, sources: { child: { queryRef: 'child', inputs: { term: { '@call': 'twiceValue', args: [p('/ports/term')] } } } }, transform: { input: p('/sources/child') } } };
  const f = controlled(t, { functions, resources: [child,parent] });
  const { view, initialComplete: initial } = await f.runtime.createView({ view: { queries: { list: { queryRef: 'parent', inputs: { term: 3 } } }, render: display() } }); await flush();
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].plan.inputs.term, 6); assert.equal('secrets' in f.requests[0].plan.inputs, false); await f.reply(1, []); await bounded(initial);
  assert.equal(view.getQuery('list').getSnapshot().data, 12); assert.deepEqual(calls, [3, 6]);
  assert.throws(() => f.r.registerResources([{ kind: 'Query', id: 'secret-attempt', spec: { sources: {}, transform: { input: { '@call': 'twiceValue', args: [p('/secrets/key')] } } } }]), e => e.code === 'REFERENCE_NOT_FOUND');
  assert.deepEqual(calls, [3, 6]);
});
