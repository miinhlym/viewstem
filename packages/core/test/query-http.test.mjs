import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createQueryEngine } from '../src/query/index.mjs';
import { createHttpExecutor } from '../src/http/index.mjs';
import { createRegistry } from '../src/registry.mjs';
import { FakeClock, check } from './query-fixtures.mjs';
const ref = path => ({ '@path': path });
const bounded = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('loopback watchdog')), 5000); })]); }
  finally { clearTimeout(timer); }
};
test('H01 real HTTP composite query, input reuse, failure retention and polling resume', async () => {
  const received = [], waiters = [], stateWaiters = [], clock = new FakeClock();
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.invalid'); received.push({ path: url.pathname, value: url.searchParams.get('value'), res });
    for (const waiter of waiters) if (received.length >= waiter.count) waiter.resolve();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const port = { kind: 'Value', schema: { type: 'number' }, required: true };
  const leaf = path => ({ kind: 'Query', id: path.slice(1), spec: { ports: { value: port }, sources: { main: {
    datasource: { kind: 'Http', baseUrl }, request: { method: 'GET', path, params: { value: ref('/ports/value') } },
  } }, transform: { input: ref('/sources/main') } } });
  const registry = createRegistry({ resources: [leaf('/left'), leaf('/right'), { kind: 'Query', id: 'root', spec: {
    ports: { a: port, b: port }, sources: {
      left: { queryRef: 'left', inputs: { value: ref('/ports/a') } }, right: { queryRef: 'right', inputs: { value: ref('/ports/b') } },
    }, transform: { input: { left: ref('/sources/left'), right: ref('/sources/right') } },
  } }] });
  const nativeHttp = createHttpExecutor();
  const engine = createQueryEngine({ registry, requestExecutor: nativeHttp, clock });
  const query = engine.createUsage('root', { inputs: { a: 1, b: 1 }, intervalMs: 20, clock,
    onChange: state => { for (const waiter of stateWaiters) if (waiter.predicate(state)) waiter.resolve(state); },
  });
  const wait = count => received.length >= count ? Promise.resolve() : bounded(new Promise(resolve => waiters.push({ count, resolve })));
  const state = predicate => predicate(query.getSnapshot()) ? Promise.resolve(query.getSnapshot()) : bounded(new Promise(resolve => stateWaiters.push({ predicate, resolve })));
  const reply = (path, start, value, status = 200) => {
    const { res } = received.find((row, index) => index >= start && row.path === path);
    res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value));
  };
  try {
    await wait(2); reply('/left', 0, ['left-1']); await clock.advance(1000);
    assert.equal(received.length, 2); assert.equal(query.getSnapshot().data, undefined);
    reply('/right', 0, ['right-1']); await query.initialSettled;
    check.deepEqual(query.getSnapshot().data, { left: ['left-1'], right: ['right-1'] });
    query.update({ inputs: { a: 2, b: 1 } }); await wait(3);
    assert.equal(received[2].path, '/left'); reply('/left', 2, ['left-2']); await state(s => s.status === 'success');
    check.deepEqual(query.getSnapshot().data, { left: ['left-2'], right: ['right-1'] });
    await clock.advance(19); assert.equal(received.length, 3); await clock.advance(1); await wait(5);
    reply('/left', 3, ['partial']); reply('/right', 3, {}, 503); await state(s => s.status === 'error');
    assert.equal(query.getSnapshot().error.location, '/spec/sources/right'); assert.equal(query.getSnapshot().error.cause.location, '/spec/sources/main');
    check.deepEqual(query.getSnapshot().data, { left: ['left-2'], right: ['right-1'] }); assert.equal(query.getSnapshot().stale, true);
    await clock.advance(20); await wait(7); reply('/left', 5, ['fresh-left']); reply('/right', 5, ['fresh-right']); await state(s => s.status === 'success');
    query.update({ autoRefreshWhen: false }); await clock.advance(100); assert.equal(received.length, 7);
    query.update({ autoRefreshWhen: true }); await wait(9); assert.equal(query.pending, null);
    reply('/left', 7, ['resumed-left']); reply('/right', 7, ['resumed-right']); await state(s => s.status === 'success');
    check.deepEqual(query.getSnapshot().data, { left: ['resumed-left'], right: ['resumed-right'] });
    await clock.advance(19); assert.equal(received.length, 9); await clock.advance(1); await wait(11);
    reply('/left', 9, ['polled-left']); reply('/right', 9, ['polled-right']); await state(s => s.status === 'success');
    assert.equal(query.getSnapshot().stale, false); query.dispose(); assert.equal(clock.tasks.size, 0);
  } finally {
    query.dispose(); for (const row of received) row.res.destroy(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('direct executor allows public plans and requires explicit trusted authorization for Login/secrets', async () => {
  let sent = 0;
  const executor = createHttpExecutor({ transport: async () => { ++sent; return new Response('{}', { headers: { 'content-type': 'application/json' } }); } });
  const plan = { version: 1, requestId: 'public', datasource: { kind: 'Http', baseUrl: 'https://example.com' }, request: { method: 'GET', path: '/data' }, inputs: {} };
  await executor(plan); assert.equal(sent, 1);
  await assert.rejects(executor({ ...plan, datasource: { ...plan.datasource, secrets: { key: 'reference' } } }), e => e.code === 'EXECUTION_BLOCKED');
  assert.equal(sent, 1);
});
