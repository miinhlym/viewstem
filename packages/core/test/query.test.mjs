import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createQueryEngine, joinRows } from '../src/query/index.mjs';
import { expression } from '../src/ports.mjs';

const flush = () => setImmediate();
const ref = path => ({ '@path': path });
const port = (schema = true, extra = {}) => ({ kind: 'Value', schema, required: true, ...extra });
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
class Clock {
  now = 0; next = 0; tasks = new Map();
  setTimeout = (fn, ms) => { const id = ++this.next; this.tasks.set(id, { at: this.now + ms, fn }); return id; };
  clearTimeout = id => this.tasks.delete(id);
  async advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.now = next[1].at; this.tasks.delete(next[0]); next[1].fn(); await flush();
    }
    this.now = end; await flush();
  }
}
function definitions() {
  const leaf = path => ({ kind: 'Query', id: path.slice(1), spec: { ports: { value: port() }, sources: { main: {
    datasource: { kind: 'Http', baseUrl: 'https://example.com' }, request: { method: 'GET', path, params: { value: ref('/ports/value') } },
  } }, transform: { input: ref('/sources/main') } } });
  return { left: leaf('/left'), right: leaf('/right'), root: { kind: 'Query', id: 'root', spec: {
    ports: { a: port(), b: port() }, sources: {
      left: { queryRef: 'left', inputs: { value: ref('/ports/a') } }, right: { queryRef: 'right', inputs: { value: ref('/ports/b') } },
    }, transform: { input: { left: ref('/sources/left'), right: ref('/sources/right') } },
  } } };
}
function setup(t, settings = {}, edit = () => {}) {
  const queries = definitions(); edit(queries);
  const requests = [], clock = new Clock();
  const engine = createQueryEngine({ registry: { get: (kind, id) => kind === 'Query' ? queries[id] : undefined, types: () => ({}) },
    requestExecutor: (plan, { signal }) => { const completion = deferred(); requests.push({ plan, signal, ...completion }); return completion.promise; },
  });
  const query = engine.createUsage('root', { inputs: { a: 1, b: 1 }, clock, ...settings });
  t.after(() => { query.dispose(); for (const row of requests) row.resolve({ body: null }); assert.equal(clock.tasks.size, 0); });
  return { engine, query, requests, clock, queries, async reply(index, body, code) {
    const row = requests[index - 1]; assert.ok(row, `missing request ${index}`);
    if (code) row.reject({ code, message: 'private transport detail' }); else row.resolve({ status: 200, headers: {}, body });
    await flush();
  }, async initial() { await flush(); await this.reply(1, ['left']); await this.reply(2, ['right']); } };
}

// These are the observable production equivalents of the T2 C01–C09 fixtures.
test('C01 independent sources publish only a complete success', async t => {
  const f = setup(t); await flush(); assert.equal(f.requests.length, 2);
  await f.reply(2, ['right']); assert.equal(f.query.snapshot().data, undefined);
  await f.reply(1, ['left']); const state = f.query.snapshot();
  assert.deepEqual(plain(state.data), { left: ['left'], right: ['right'] }); assert.equal(state.status, 'success');
  assert.deepEqual(plain(state.dataInputs), { a: 1, b: 1 }); assert.equal(await f.query.initialSettled, state);
});
test('C02 only unchanged child inputs reuse; previous data stays stale until all complete', async t => {
  const f = setup(t); await f.initial(); const previous = f.query.snapshot();
  f.query.update({ inputs: { a: 2, b: 1 } }); await flush();
  assert.equal(f.requests.length, 3); assert.equal(f.requests[2].plan.request.path, '/left');
  assert.equal(f.query.snapshot().stale, true); assert.equal(f.query.snapshot().data, previous.data);
  await f.reply(3, ['new']); assert.deepEqual(plain(f.query.snapshot().data), { left: ['new'], right: ['right'] });
  assert.deepEqual(plain(previous.data), { left: ['left'], right: ['right'] });
});
test('C04 nested errors preserve actual declaration locations and last complete pair', async t => {
  const f = setup(t); await f.initial(); f.query.update({ inputs: { a: 2, b: 2 } }); await flush();
  await f.reply(3, ['partial']); await f.reply(4, null, 'HTTP_ERROR');
  const state = f.query.snapshot(); assert.equal(state.status, 'error'); assert.equal(state.error.location, '/spec/sources/right');
  assert.equal(state.error.cause.location, '/spec/sources/main'); assert.equal(state.error.cause.resource.id, 'right');
  assert.deepEqual(plain(state.data), { left: ['left'], right: ['right'] }); assert.equal(state.stale, true);
  assert.equal(JSON.stringify(state.error).includes('private'), false);
});
test('C05 refresh waves await their own next fresh execution', async t => {
  const f = setup(t); await flush(); let a = false, b = false;
  const first = f.query.refresh().then(() => { a = true; });
  await f.reply(1, ['left']); await f.reply(2, ['right']); assert.equal(a, false); assert.equal(f.requests.length, 4);
  const second = f.query.refresh().then(() => { b = true; });
  await f.reply(3, ['fresh-left']); await f.reply(4, ['fresh-right']); await first; assert.equal(b, false);
  assert.equal(f.requests.length, 6); await f.reply(5, []); await f.reply(6, []); await second;
});
test('C06 obsolete completion cannot publish or seed a child cache', async t => {
  const f = setup(t); await f.initial(); f.query.update({ inputs: { a: 2, b: 1 } }); await flush();
  f.query.update({ inputs: { a: 3, b: 1 } }); await f.reply(3, ['obsolete']);
  assert.equal(f.requests.length, 4); assert.equal(f.requests[3].plan.inputs.value, 3);
  await f.reply(4, ['current']); assert.deepEqual(plain(f.query.snapshot().data), { left: ['current'], right: ['right'] });
});
test('C07 partial failures do not commit cache entries', async t => {
  const f = setup(t); await f.initial(); f.query.update({ inputs: { a: 2, b: 2 } }); await flush();
  await f.reply(3, ['partial']); await f.reply(4, null, 'HTTP_ERROR');
  f.query.update({ inputs: { a: 2, b: 3 } }); await flush(); assert.equal(f.requests.length, 6);
  await f.reply(5, []); await f.reply(6, []);
});
test('C09 first failure is error with missing data and aborts siblings', async t => {
  const f = setup(t); await flush(); await f.reply(1, null, 'HTTP_ERROR');
  const state = f.query.snapshot(); assert.equal(state.status, 'error'); assert.equal(state.data, undefined); assert.equal(state.stale, false);
  assert.equal(f.requests[1].signal.aborted, true); await f.reply(2, ['late']); assert.equal(f.query.snapshot(), state);
});
test('fresh waiter follows latest input after its fresh execution started', async t => {
  const f = setup(t); await f.initial(); let settled = false;
  const waiter = f.query.refresh().then(() => { settled = true; }); await flush();
  f.query.update({ inputs: { a: 9, b: 1 } }); await f.reply(3, []); await f.reply(4, []);
  assert.equal(settled, false); assert.equal(f.requests.length, 6);
  await f.reply(5, ['new']); await f.reply(6, ['right-fresh']); await waiter;
  assert.equal(f.query.snapshot().dataInputs.a, 9);
});
test('waiter-specific cancellation preserves remaining callers and shared execution', async t => {
  const f = setup(t); await flush(); const controller = new AbortController();
  const cancelled = assert.rejects(f.query.refresh(controller.signal), e => e.code === 'CANCELLED');
  const remaining = f.query.refresh(); controller.abort(); await cancelled;
  assert.equal(f.requests[0].signal.aborted, false); await f.reply(1, []); await f.reply(2, []);
  await f.reply(3, []); await f.reply(4, []); await remaining;
});
test('gate closure rejects waiters; disposal blocks late publication and cleans polling', async t => {
  const f = setup(t, { intervalMs: 10 }); await flush();
  const pending = assert.rejects(f.query.refresh(), e => e.code === 'EXECUTION_BLOCKED');
  f.query.update({ executeWhen: false }); await pending;
  await f.reply(1, []); await f.reply(2, []); assert.equal(f.query.snapshot().status, 'waiting');
  f.query.update({ executeWhen: true }); await flush(); const state = f.query.snapshot(); f.query.dispose();
  await f.reply(3, []); await f.reply(4, []); assert.equal(f.query.snapshot(), state); assert.equal(f.clock.tasks.size, 0);
});
for (const value of [null, false, 0, '', []]) test(`last successful ${JSON.stringify(value)} survives failure; retry bypasses refresh false`, async t => {
  const f = setup(t, { refresh: false }, q => { q.root.spec.transform.input = ref('/sources/left'); }); await flush();
  await f.reply(1, value); await f.reply(2, []);
  await assert.rejects(f.query.refresh(), e => e.code === 'QUERY_REFRESH_DISABLED');
  f.query.update({ inputs: { a: 2, b: 1 } }); await flush(); await f.reply(3, null, 'HTTP_ERROR');
  assert.deepEqual(plain(f.query.snapshot().data), value); assert.equal(f.query.snapshot().stale, true);
  const retry = f.query.retry(); await flush(); assert.equal(f.requests.length, 5);
  await f.reply(4, value); await f.reply(5, []); await retry; assert.equal(f.query.snapshot().stale, false);
});
test('polling anchors at whole completion and resumes with one immediate fresh request', async t => {
  const f = setup(t, { intervalMs: 100, autoRefreshWhen: false }); await f.initial(); await f.clock.advance(1000);
  assert.equal(f.requests.length, 2); f.query.update({ autoRefreshWhen: true }); await flush(); assert.equal(f.requests.length, 4);
  await f.reply(3, []); await f.clock.advance(1000); assert.equal(f.requests.length, 4);
  await f.reply(4, []); await f.clock.advance(99); assert.equal(f.requests.length, 4);
  await f.clock.advance(1); assert.equal(f.requests.length, 6);
});
test('pause removes only periodic pending intent while preserving input/manual work', async t => {
  const f = setup(t, { intervalMs: 100, autoRefreshWhen: false }); await f.initial();
  f.query.update({ inputs: { a: 2, b: 1 } }); await flush(); const waiter = f.query.refresh();
  f.query.update({ inputs: { a: 3, b: 1 }, autoRefreshWhen: true }); f.query.update({ autoRefreshWhen: false });
  await f.reply(3, []); assert.equal(f.requests.length, 5); await f.reply(4, []); await f.reply(5, []); await waiter;
  await f.clock.advance(1000); assert.equal(f.requests.length, 5);
});
test('prepared default values and recursively encoded native collections reach actual executor', async t => {
  const f = setup(t, { inputs: {} }, q => {
    q.root.spec.ports = { a: { kind: 'Value', schema: true, default: { nested: new Set([1, new Map([['k', 2]])]) } }, b: { kind: 'Value', schema: { type: 'integer' }, default: 3 } };
  }); await flush(); assert.deepEqual(f.requests[0].plan.inputs.value, { nested: [1, [['k', 2]]] });
  assert.equal(f.requests[1].plan.inputs.value, 3); await f.reply(1, []); await f.reply(2, []);
});
test('Concat preserves order/duplicates and Join preserves strict keys/cartesian order', async () => {
  assert.deepEqual(joinRows([{ k: 1, l: 1 }, { k: '1' }, { k: null }], [{ k: 1, r: 2 }, { k: 1, r: 3 }], { on: [{ left: 'k', right: 'k' }] }),
    [{ k: 1, l: 1, r: 2 }, { k: 1, l: 1, r: 3 }, { k: '1' }, { k: null }]);
  const engine = createQueryEngine({ registry: { get() {} }, requestExecutor() { throw Error('unexpected'); } });
  const result = await engine.execute({ sources: {}, transform: { input: [1], steps: [{ kind: 'Concat', with: [[1, { label: 'x' }], [null]] }] } });
  assert.deepEqual(plain(result), [1, 1, { label: 'x' }, null]);
});
test('direct independent execution never uses a usage cache', async () => {
  let calls = 0; const queries = definitions();
  const engine = createQueryEngine({ registry: { get: (_, id) => queries[id] }, requestExecutor: async () => ({ body: ++calls }) });
  await engine.execute('root', { inputs: { a: 1, b: 1 } }); await engine.execute('root', { inputs: { a: 1, b: 1 } }); assert.equal(calls, 4);
});
test('missing/pending prepared inputs wait then become executable', async t => {
  let snapshot = { status: 'pending' };
  const f = setup(t, { inputs: { a: expression(() => snapshot), b: 1 } }); await flush(); assert.equal(f.requests.length, 0);
  assert.equal(f.query.snapshot().waitingReason, 'INPUT_NOT_READY'); snapshot = { status: 'ready', value: 2 };
  f.query.update({}); await flush(); assert.equal(f.requests.length, 2); await f.reply(1, []); await f.reply(2, []);
});
test('dependency errors surface as errors and pending dependencies keep incomplete inputs waiting', async t => {
  const f = setup(t, { inputs: {}, ready: false, inputError: { code: 'TYPE_MISMATCH', message: 'unsafe' } });
  assert.equal(f.query.snapshot().status, 'error'); assert.equal(f.query.snapshot().error.code, 'TYPE_MISMATCH');
  await assert.rejects(f.query.refresh(), error => error.code === 'TYPE_MISMATCH'); assert.equal(f.requests.length, 0);
  f.query.update({ inputError: { code: 'VALUE_PENDING' }, ready: false }); assert.equal(f.query.snapshot().status, 'waiting');
  f.query.update({ inputError: undefined, ready: true, inputs: { a: 1, b: 1 } }); await flush();
  assert.equal(f.requests.length, 2); await f.reply(1, []); await f.reply(2, []); assert.equal(f.query.snapshot().status, 'success');
});
test('updating a static interval replaces its timer and refresh re-enable restores polling', async t => {
  const f = setup(t, { intervalMs: 100 }); await f.initial(); await f.clock.advance(50);
  f.query.update({ intervalMs: 200 }); await f.clock.advance(100); assert.equal(f.requests.length, 2);
  await f.clock.advance(100); assert.equal(f.requests.length, 4); await f.reply(3, []); await f.reply(4, []);
  f.query.update({ refresh: false }); assert.equal(f.clock.tasks.size, 0);
  f.query.update({ refresh: true }); await f.clock.advance(200); assert.equal(f.requests.length, 6);
  await f.reply(5, []); await f.reply(6, []);
});
