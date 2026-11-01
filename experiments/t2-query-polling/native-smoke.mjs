import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHttpProbe } from '../t2-http-boundary/http-probe.mjs';
import { flush, observe } from '../t2-query-races/harness.mjs';
import { PollingHost } from './polling-probe.mjs';

class NativeClock {
  tasks = new Map();
  nextId = 0;
  get now() { return performance.now(); }
  setTimeout(fn, ms) {
    const id = ++this.nextId;
    this.tasks.set(id, setTimeout(() => { this.tasks.delete(id); fn(); }, ms));
    return id;
  }
  clearTimeout(id) { clearTimeout(this.tasks.get(id)); this.tasks.delete(id); }
}
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Native fixture timeout: ${label}`)), 5000);
  })]); } finally { clearTimeout(timer); }
}

export async function nativeSmoke() {
  const clock = new NativeClock(), trace = [], requests = [], plans = [], arrivals = [];
  let host, query;
  const server = createServer((req, res) => {
    const request = { id: requests.length + 1, at: clock.now, res };
    requests.push(request);
    for (const arrival of arrivals) if (requests.length >= arrival.count) arrival.resolve();
  });
  const waitFor = async count => {
    if (requests.length >= count) return;
    await bounded(new Promise(resolve => arrivals.push({ count, resolve })), `request ${count}`);
  };
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const caller = Object.freeze({ id: 'polling-fixture' });
    const execute = createHttpProbe({
      clock: { now: () => clock.now, set: (fn, ms) => clock.setTimeout(fn, ms), clear: id => clock.clearTimeout(id) },
      requestTimeoutMs: 2000, caller,
      authorize: c => c.caller === caller && new URL(c.destination).origin === origin,
    });
    const transport = { execute(inputs, { signal }) {
      const promise = execute({ version: 1, requestId: `poll-${plans.length + 1}`,
        datasource: { kind: 'Http', baseUrl: `${origin}/v1` }, inputs,
        request: { method: 'GET', path: '/data' } }, { signal }).then(response => response.body);
      const request = { id: plans.length + 1, completion: { promise }, outcome: observe(promise), signal };
      plans.push(request); return request;
    } };
    host = new PollingHost(clock, transport, trace);
    query = host.mount('search', { intervalMs: 20, timeoutMs: 3000 });
    await waitFor(1);
    // Hold the real HTTP response across multiple configured intervals.
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(requests.length, 1); assert.equal(query.pending, null);
    requests[0].res.writeHead(200, { 'content-type': 'application/json' }); requests[0].res.end('{"ok":true}');
    await bounded(plans[0].outcome.settled, 'first completion'); await flush();
    const completion = trace.find(event => event.kind === 'poll-run-complete');
    assert.ok(completion); assert.deepEqual(query.snapshot().data, { ok: true });
    await waitFor(2);
    const tick = trace.find(event => event.kind === 'poll-tick');
    assert.ok(tick.at >= completion.at + 20, 'Native timer ticked before the completion-based deadline');
    assert.ok(requests[1].at >= tick.at);
    query.configure({ autoRefreshWhen: false });
    query.configure({ autoRefreshWhen: true }); query.configure({ autoRefreshWhen: true });
    assert.equal(plans.length, 2); assert.ok(query.pending);
    await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(requests.length, 2);
    requests[1].res.writeHead(200, { 'content-type': 'application/json' }); requests[1].res.end('{"run":2}');
    await bounded(plans[1].outcome.settled, 'active completion'); await flush();
    assert.equal(plans.length, 3); assert.equal(query.pending, null);
    assert.equal(trace.filter(event => event.kind === 'poll-tick').length, 1);
    await waitFor(3); await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(requests.length, 3); assert.equal(query.pending, null);
    requests[2].res.writeHead(200, { 'content-type': 'application/json' }); requests[2].res.end('{"run":3}');
    await bounded(plans[2].outcome.settled, 'resume completion'); await flush();
    const resumedCompletion = trace.filter(event => event.kind === 'poll-run-complete').at(-1);
    await waitFor(4);
    const resumedTick = trace.filter(event => event.kind === 'poll-tick').at(-1);
    assert.ok(resumedTick.at >= resumedCompletion.at + 20);
    query.dispose(); await bounded(plans[3].outcome.settled, 'cancelled fourth plan'); await flush();
    assert.equal(plans[3].outcome.code, 'CANCELLED'); assert.equal(clock.tasks.size, 0);
    return { id: 'N01-native-timer-real-http', passed: true,
      firstRequestAt: requests[0].at, completedAt: completion.at, nextTickAt: tick.at,
      secondRequestAt: requests[1].at, intervalMs: 20, requestCount: requests.length,
      resumedCompletedAt: resumedCompletion.at, resumedNextTickAt: resumedTick.at,
      finalPlanCode: plans[3].outcome.code, leakedTimers: clock.tasks.size, trace };
  } finally {
    query?.dispose();
    for (const request of requests) request.res.destroy();
    if (plans.length) await bounded(Promise.all(plans.map(plan => plan.outcome.settled)), 'cleanup');
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    for (const id of [...clock.tasks.keys()]) clock.clearTimeout(id);
  }
}
