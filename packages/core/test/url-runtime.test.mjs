import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, createStateStore } from '@viewstem/core';
import { createRuntime } from './fixtures/runtime-operations.mjs';
import { FakeClock } from './query-fixtures.mjs';
import { memoryUrl, link, tick } from './fixtures/state/url-adapter.mjs';
const integer = { type: 'integer' }, path = value => ({ '@path': value });
function fixture(endpoint = memoryUrl(), stateStore, options) {
  const registry = createRegistry(); registry.registerComponentContract({ kind: 'Component', id: 'Text', spec: { ports: { value: { kind: 'Value', schema: true } } } });
  const requests = [], runtime = createRuntime({ registry, ...(stateStore ? { stateStore } : {}), ...options, requestExecutor: async plan => { requests.push(plan); return { status: 200, headers: {}, body: requests.length }; } });
  const view = (initial = 1, extra = {}) => ({ states: { value: { kind: 'State', schema: integer, initial }, ...extra.states }, ...extra,
    render: { id: 'text', componentRef: 'Text', inputs: { value: path('/states/value') } } });
  const url = { adapter: endpoint.adapter, bindings: [{ state: 'value', key: 'owned' }] };
  return { ...endpoint, endpoint, registry, runtime, requests, spec: view, url };
}

test('L02/C11/K18 actual View restores URL before first Query and suppresses initial/restore reactions', async () => {
  const f = fixture(memoryUrl(link({ owned: 2, selected: 8 })));
  f.registry.registerResources([{ kind: 'Query', id: 'q', spec: { ports: { value: { kind: 'Value', schema: integer, required: true }, selected: { kind: 'Value', schema: integer, required: true } }, sources: { main: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: 'items', params: { value: path('/ports/value'), selected: path('/ports/selected') } } } }, transform: { input: path('/sources/main') } } }]);
  const spec = f.spec(1, { states: { value: { kind: 'State', schema: integer, initial: 1 }, selected: { kind: 'State', schema: integer, initial: 7 } }, reactions: [{ watch: [path('/states/value')], target: path('/states/selected'), value: 0 }], queries: { data: { queryRef: 'q', inputs: { value: path('/states/value'), selected: path('/states/selected') } } } });
  const { view, initialComplete: initial } = await f.runtime.createView({ view: spec, url: { adapter: f.adapter, bindings: [{ state: 'value', key: 'owned' }, { state: 'selected', key: 'selected' }] } }); await initial; await tick();
  assert.equal(view.getState('value').read(), 2); assert.equal(view.getState('selected').read(), 8); assert.equal(f.requests.length, 1); assert.deepEqual({ ...f.requests[0].inputs }, { value: 2, selected: 8 }); assert.equal(f.commits.length, 0);
  f.navigate(link({ owned: 4, selected: 9 })); await tick(); assert.equal(view.getState('selected').read(), 9); assert.deepEqual({ ...f.requests.at(-1).inputs }, { value: 4, selected: 9 }); assert.equal(f.commits.length, 0);
  view.getState('value').write(5); await tick(); assert.equal(view.getState('selected').read(), 0); assert.deepEqual({ ...f.requests.at(-1).inputs }, { value: 5, selected: 0 }); f.runtime.dispose();
});
test('L07/M05 actual View replacement removes old owned keys and uses new initial without reimporting old URL', async () => {
  const f = fixture(memoryUrl('https://example.test/path?owned=8&external=%2f#hash'));
  const { view, initialComplete: initial } = await f.runtime.createView({ view: f.spec(1), url: f.url }); await initial; const old = view.getState('value'); assert.equal(old.read(), 8);
  const result = await view.replace({ view: f.spec(3), url: f.url }); await result.initialComplete;
  assert.equal(view.getState('value').read(), 3); assert.throws(() => old.read(), { code: 'CANCELLED' });
  const url = new URL(f.read()); assert.equal(url.searchParams.has('owned'), false); assert.equal(url.searchParams.get('external'), '/'); assert.equal(url.pathname, '/path'); assert.equal(url.hash, '#hash'); assert.equal(f.commits.length, 1); assert.equal(f.commits[0].mode, 'replace');
  view.getState('value').write(4); await tick(); assert.equal(JSON.parse(new URL(f.read()).searchParams.get('owned')), 4); f.runtime.dispose();
});
test('L07 cleanup failure still completes new View, preserves new baseline and reports error', async () => {
  const f = fixture(memoryUrl('https://example.test/view?owned=8'));
  const { view, initialComplete: initial } = await f.runtime.createView({ view: f.spec(1), url: f.url }); await initial; f.failNext();
  const replacement = await view.replace({ view: f.spec(3), url: f.url }); await replacement.initialComplete;
  assert.equal(view.getState('value').read(), 3); assert.equal(new URL(f.read()).searchParams.get('owned'), '8');
  assert.ok(view.getSnapshot().errors.some(error => error.kind === 'replace-cleanup' && error.code === 'HTTP_ERROR'));
  view.getState('value').write(4); await tick(); assert.equal(new URL(f.read()).searchParams.get('owned'), '4'); f.runtime.dispose();
});
test('L07/M05 invalid replacement schema preserves existing tree/state/URL before cleanup', async () => {
  const f = fixture(memoryUrl('https://example.test/view?owned=8'));
  const { view, initialComplete: initial } = await f.runtime.createView({ view: f.spec(1), url: f.url }); await initial; const old = view.getState('value'), snapshot = view.getSnapshot(), href = f.read();
  await assert.rejects(view.replace({ view: f.spec('wrong'), url: f.url }), { code: 'INVALID_DEFINITION' });
  assert.equal(view.getState('value'), old); assert.equal(old.read(), 8); assert.equal(view.getSnapshot().generation, snapshot.generation); assert.equal(f.read(), href); assert.equal(f.attempts.length, 0); f.runtime.dispose();
});
const invalidUrlConfigurations = [
  ['adapter', f => ({ adapter: { read: f.adapter.read }, bindings: [{ state: 'value', key: 'owned' }] })],
  ['history', f => ({ ...f.url, bindings: [{ state: 'value', key: 'owned', history: 'invalid' }] })],
  ['duplicate-state', f => ({ ...f.url, bindings: [{ state: 'value', key: 'owned' }, { state: 'value', key: 'second' }] })],
  ['limits', f => ({ ...f.url, limits: { maxValueBytes: 0 } })],
  ['missing-state', f => ({ ...f.url, bindings: [{ state: 'absent', key: 'owned' }] })],
];
for (const [name, invalid] of invalidUrlConfigurations) test(`L07/M05 URL replacement preflight/${name}`, async () => {
  const f = fixture(memoryUrl('https://example.test/view?owned=8')), { view, initialComplete: initial } = await f.runtime.createView({ view: f.spec(1), url: f.url }); await initial;
  const old = view.getState('value'), href = f.read();
  await assert.rejects(view.replace({ view: f.spec(3), url: invalid(f) }));
  assert.equal(view.getState('value'), old); assert.equal(old.read(), 8); assert.equal(f.read(), href); assert.equal(f.attempts.length, 0); f.runtime.dispose();
});
test('L09/K20 superseded cleanup checks currentness immediately before actual commit', async () => {
  const f = fixture(memoryUrl('https://example.test/view?owned=8', { delayed: true }));
  const { view, initialComplete: initial } = await f.runtime.createView({ view: f.spec(1), url: f.url }); await initial;
  const first = await view.replace({ view: f.spec(2), url: f.url });
  const second = view.replace({ view: f.spec(3), url: f.url });
  await tick();
  assert.equal(f.pending.length, 1);
  assert.equal(view.getState('value').read(), 2);
  assert.equal(f.pending[0].options.isCurrent(), true);
  f.release(0);
  const latest = await second;
  await tick();
  assert.equal(f.pending.length, 1);
  assert.equal(f.pending[0].options.isCurrent(), true);
  f.release(0);
  await latest.initialComplete;
  await first.initialComplete.catch(() => {});
  assert.equal(view.getState('value').read(), 3);
  assert.equal(f.attempts.length, 2);
  assert.equal(f.commits.length, 1);
  f.runtime.dispose();
});

test('L09/K20 disposing View invalidates in-flight cleanup and preserves old URL', async () => {
  const f = fixture(memoryUrl('https://example.test/view?owned=8', { delayed: true }));
  const { view, initialComplete: initial } = await f.runtime.createView({ view: f.spec(1), url: f.url }); await initial;
  const replacement = await view.replace({ view: f.spec(2), url: f.url });
  const rejected = assert.rejects(replacement.initialComplete, { code: 'CANCELLED' });
  await tick(); assert.equal(f.pending.length, 1); view.dispose(); assert.equal(f.pending[0].options.isCurrent(), false);
  f.release(); await rejected; assert.equal(f.commits.length, 0); assert.equal(new URL(f.read()).searchParams.get('owned'), '8'); f.runtime.dispose();
});
test('L10/M05 service Store connection rejects View convenience URL before old screen changes', async () => {
  const stateStore = createStateStore(), service = stateStore.createScope(), selected = service.registerState('selected', { schema: integer, initial: 1 }), endpoint = memoryUrl(), shared = stateStore.connectUrl({ adapter: endpoint.adapter, bindings: [{ target: selected }] });
  const f = fixture(endpoint, stateStore), { view, initialComplete: initial } = await f.runtime.createView({ view: f.spec(7) }); await initial; const old = view.getState('value');
  await assert.rejects(view.replace({ view: f.spec(3), url: f.url }), { code: 'INVALID_DEFINITION' });
  assert.equal(view.getState('value'), old); assert.equal(old.read(), 7); assert.equal(selected.read(), 1); assert.equal(f.attempts.length, 0);
  view.dispose(); selected.write(2); await tick(); assert.equal(new URL(f.read()).searchParams.get('p.selected'), '2'); shared.dispose(); service.dispose(); f.runtime.dispose();
});

test('timed-out URL cleanup invalidates late writes and releases the queued update', async t => {
  const clock = new FakeClock();
  const f = fixture(memoryUrl('https://example.test/view?owned=8&keep=%2f', { delayed: true }), undefined,
    { clock, urlCleanupTimeoutMs: 10 });
  t.after(() => f.runtime.dispose());
  const { view, initialComplete } = await f.runtime.createView({ view: f.spec(1), url: f.url });
  await initialComplete;
  const replacement = await view.replace({ view: f.spec(2), url: f.url });
  const update = view.update(f.spec(3), { states: { value: 5 } });
  await tick();
  assert.equal(f.pending[0].options.isCurrent(), true);
  await clock.advance(10);
  assert.equal(f.pending[0].options.isCurrent(), false);
  f.release();
  const applied = await update;
  await applied.initialComplete;
  await replacement.initialComplete.catch(() => {});
  assert.equal(view.getState('value').read(), 5);
  assert.ok(view.getSnapshot().errors.some(error => error.kind === 'replace-cleanup' && error.code === 'TIMEOUT'));
  assert.equal(new URL(f.read()).searchParams.get('owned'), '8');
  assert.equal(new URL(f.read()).searchParams.get('keep'), '/');
});
