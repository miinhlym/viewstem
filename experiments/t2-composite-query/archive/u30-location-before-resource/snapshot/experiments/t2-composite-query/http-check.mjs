import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { FakeClock, flush } from '../t2-query-races/harness.mjs';
import { PollingHost } from '../t2-query-polling/polling-probe.mjs';
import { createHttpProbe } from '../t2-http-boundary/http-probe.mjs';
import { CompositeEngine, compositeTransport } from './composite-probe.mjs';
import { definitions } from './harness.mjs';

export async function checkHttpComposition() {
  const received = [], waiters = [], trace = [], clock = new FakeClock();
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.invalid');
    received.push({ path: url.pathname, value: url.searchParams.get('value'), res });
    for (const w of waiters) if (received.length >= w.count) w.resolve();
  });
  const bounded = async promise => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('HTTP fixture watchdog')), 5000); })]); }
    finally { clearTimeout(timer); }
  };
  const wait = count => received.length >= count ? Promise.resolve() : bounded(new Promise(resolve => waiters.push({ count, resolve })));
  const reply = (id, value, status = 200) => { const res = received[id - 1].res; res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  let host, query, engine, transport;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const queries = definitions();
    for (const id of ['left', 'right']) queries[id].sources.main.datasource.baseUrl = baseUrl;
    engine = new CompositeEngine({ queries, executeHttp: createHttpProbe({
      authorize: ({ destination }) => new URL(destination).origin === baseUrl,
      clock: { now: () => clock.now, set: (fn, ms) => clock.setTimeout(fn, ms), clear: id => clock.clearTimeout(id) },
    }) });
    transport = compositeTransport(engine, 'root', (owner, generation) => query?.alive && query.owner === owner && query.generation === generation);
    host = new PollingHost(clock, transport, trace);
    query = host.mount('search', { inputs: { a: 1, b: 1 }, intervalMs: 20 });
    const settle = async id => { await bounded(transport.requests[id - 1].completion.promise.catch(() => {})); await flush(); };
    const index = (path, from = 0) => received.findIndex((row, i) => i >= from && row.path === path) + 1;
    await wait(2); reply(index('/left'), ['left-1']); await clock.advance(1000);
    assert.equal(received.length, 2); assert.equal(query.snapshot().data, undefined);
    reply(index('/right'), ['right-1']); await settle(1);
    assert.deepEqual(query.snapshot().data, { left: ['left-1'], right: ['right-1'] });
    query.configure({ inputs: { a: 2, b: 1 } }); await wait(3);
    assert.equal(received[2].path, '/left'); reply(3, ['left-2']); await settle(2);
    assert.deepEqual(query.snapshot().data, { left: ['left-2'], right: ['right-1'] });
    await clock.advance(19); assert.equal(transport.requests.length, 2);
    await clock.advance(1); await wait(5);
    reply(index('/left', 3), ['partial-left']); reply(index('/right', 3), {}, 503); await settle(3);
    assert.equal(query.snapshot().error.location, '/spec/sources/right');
    assert.equal(query.snapshot().error.cause.location, '/spec/sources/right/sources/main');
    assert.deepEqual(query.snapshot().data, { left: ['left-2'], right: ['right-1'] });
    assert.equal(query.snapshot().stale, true);
    await clock.advance(19); assert.equal(transport.requests.length, 3);
    await clock.advance(1); await wait(7);
    reply(index('/left', 5), ['fresh-left']); reply(index('/right', 5), ['fresh-right']); await settle(4);
    assert.deepEqual(query.snapshot().data, { left: ['fresh-left'], right: ['fresh-right'] });
    assert.equal(query.snapshot().stale, false);
    query.dispose(); await flush(); assert.equal(clock.tasks.size, 0); assert.equal(engine.caches.size, 0);
    return { id: 'H01-real-http-composite-and-polling', passed: true,
      requests: received.map(({ path, value }) => ({ path, value })), plans: transport.requests.length,
      timerCount: clock.tasks.size, cacheOwners: engine.caches.size, snapshots: trace.filter(row => row.kind === 'snapshot') };
  } finally {
    query?.dispose();
    for (const row of received) row.res.destroy();
    if (transport) await bounded(Promise.allSettled(transport.requests.map(row => row.completion.promise)));
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
