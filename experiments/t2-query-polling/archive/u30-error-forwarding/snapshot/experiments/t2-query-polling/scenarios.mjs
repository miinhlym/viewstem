import assert from 'node:assert/strict';
import { ControlledTransport, FakeClock, flush, observe } from '../t2-query-races/harness.mjs';
import { MAX_NATIVE_TIMER_MS, PollingHost } from './polling-probe.mjs';

export const cases = [];
const add = (id, run, options = {}) => cases.push({ id, run, options });
export function setup(options = {}, mutation = {}) {
  const clock = new FakeClock(), trace = [];
  const transport = new ControlledTransport(clock, trace);
  const host = new PollingHost(clock, transport, trace, mutation);
  const query = host.mount('search', { intervalMs: 100, timeoutMs: 10_000, ...options });
  const f = { clock, trace, transport, host, query,
    async reply(id, value = `result-${id}`, code = null) { transport.respond(id, value, code); await flush(); },
    async close() {
      for (const slot of host.slots.values()) slot.query.dispose();
      await flush();
      assert.equal(clock.tasks.size, 0, 'Leaked timer after owner disposal');
      for (const slot of host.slots.values()) assert.equal(slot.query.tickets.size, 0, 'Leaked refresh waiter');
      for (const request of transport.outstanding()) transport.respond(request.id, undefined, 'CANCELLED');
      await flush();
      assert.equal(clock.tasks.size, 0, 'Late completion rearmed a disposed poller');
    },
  };
  return f;
}
const count = f => f.transport.requests.length;
const ticks = f => f.trace.filter(r => r.kind === 'poll-tick');
const snapshot = f => f.host.snapshot();
const schedule = f => f.trace.filter(r => r.kind === 'poll-scheduled').at(-1);

add('P01-completion-not-start-anchors-next-interval', async f => {
  await f.clock.advance(500); assert.equal(count(f), 1); assert.equal(f.query.pending, null);
  await f.reply(1); assert.equal(schedule(f).deadline, 600);
  await f.clock.advance(99); assert.equal(count(f), 1);
  await f.clock.advance(1); assert.equal(count(f), 2); assert.equal(ticks(f).length, 1);
});
add('P02-failure-waits-full-interval', async f => {
  await f.clock.advance(40); await f.reply(1, undefined, 'HTTP_ERROR');
  assert.equal(snapshot(f).status, 'error'); assert.equal(count(f), 1);
  await f.clock.advance(99); assert.equal(count(f), 1);
  await f.clock.advance(1); assert.equal(count(f), 2); assert.equal(snapshot(f).error, null);
});
add('P03-timeout-anchors-interval-and-late-success-does-not-rearm', async f => {
  await f.clock.advance(50); assert.equal(snapshot(f).error.code, 'TIMEOUT');
  assert.equal(schedule(f).deadline, 150);
  await f.clock.advance(30); await f.reply(1, 'late-success');
  assert.equal(schedule(f).deadline, 150);
  await f.clock.advance(69); assert.equal(count(f), 1);
  await f.clock.advance(1); assert.equal(count(f), 2);
}, { timeoutMs: 50 });
add('P04-manual-refresh-cancels-old-poll-reservation', async f => {
  await f.reply(1); await f.clock.advance(40);
  const refreshed = observe(f.query.refresh()); assert.equal(count(f), 2);
  await f.clock.advance(150); assert.equal(count(f), 2); assert.equal(f.query.pending, null);
  await f.reply(2); assert.equal(refreshed.status, 'fulfilled'); assert.equal(schedule(f).deadline, 290);
  await f.clock.advance(100); assert.equal(count(f), 3);
});
add('P05-input-change-runs-immediately-and-reanchors-poll', async f => {
  await f.reply(1); await f.clock.advance(50);
  f.query.configure({ inputs: { term: 'B' } }); assert.equal(count(f), 2);
  await f.clock.advance(150); assert.equal(count(f), 2); assert.equal(f.query.pending, null);
  await f.reply(2, 'B'); assert.equal(schedule(f).deadline, 300);
  await f.clock.advance(100); assert.equal(count(f), 3);
  assert.deepEqual(f.transport.requests.map(r => r.inputs.term), ['A', 'B', 'B']);
});
add('P06-latest-pending-has-priority-over-poll', async f => {
  const fresh = observe(f.query.refresh());
  for (const term of ['B', 'C', 'D']) f.query.configure({ inputs: { term } });
  await f.clock.advance(400); assert.equal(count(f), 1);
  await f.reply(1, 'obsolete'); assert.equal(count(f), 2); assert.equal(fresh.status, 'pending');
  assert.equal(f.host.pollers.get('search').timer, null);
  await f.clock.advance(300); assert.equal(count(f), 2);
  await f.reply(2, 'D'); assert.equal(fresh.status, 'fulfilled');
  assert.equal(snapshot(f).data, 'D'); assert.equal(schedule(f).deadline, 800);
  await f.clock.advance(100); assert.equal(count(f), 3);
});
add('P07-refresh-waves-finish-before-poll-is-reserved', async f => {
  const first = observe(f.query.refresh()), second = observe(f.query.refresh());
  await f.reply(1); assert.equal(count(f), 2); assert.equal(first.status, 'pending');
  const third = observe(f.query.refresh()); await f.clock.advance(20); await f.reply(2);
  assert.equal(count(f), 3); assert.equal(first.status, 'fulfilled'); assert.equal(second.status, 'fulfilled');
  assert.equal(third.status, 'pending'); assert.equal(f.host.pollers.get('search').timer, null);
  await f.clock.advance(20); await f.reply(3); assert.equal(third.status, 'fulfilled');
  assert.equal(schedule(f).deadline, 140);
});
add('P08-auto-condition-affects-only-periodic-execution', async f => {
  await f.reply(1); await f.clock.advance(500); assert.equal(count(f), 1);
  const manual = observe(f.query.refresh()); assert.equal(count(f), 2); await f.reply(2);
  assert.equal(manual.status, 'fulfilled');
  f.query.configure({ inputs: { term: 'B' } }); assert.equal(count(f), 3); await f.reply(3);
  await f.clock.advance(500); assert.equal(count(f), 3);
  f.query.configure({ autoRefreshWhen: true }); await f.clock.advance(100); assert.equal(count(f), 4);
}, { autoRefreshWhen: false });
add('P09-refresh-disabled-keeps-initial-input-and-retry', async f => {
  await f.reply(1); await f.clock.advance(500); assert.equal(count(f), 1);
  await assert.rejects(f.query.refresh(), error => error.code === 'QUERY_REFRESH_DISABLED');
  f.query.configure({ inputs: { term: 'B' } }); assert.equal(count(f), 2);
  await f.reply(2, undefined, 'HTTP_ERROR');
  const retry = observe(f.query.retry()); assert.equal(count(f), 3); await f.reply(3, 'recovered');
  assert.equal(retry.status, 'fulfilled'); await f.clock.advance(500); assert.equal(count(f), 3);
}, { refresh: false });
add('P10-closed-gate-does-not-start-or-reserve', async f => {
  assert.equal(count(f), 0); assert.equal(f.clock.tasks.size, 0);
  await f.clock.advance(500); assert.equal(count(f), 0);
  f.query.configure({ executeWhen: true, inputs: { term: 'B' } }); assert.equal(count(f), 1);
  await f.reply(1); await f.clock.advance(100); assert.equal(count(f), 1);
}, { executeWhen: false, autoRefreshWhen: false });
add('P11-gate-transition-cancels-idle-poll-and-reopens-once', async f => {
  await f.reply(1); await f.clock.advance(50); f.query.configure({ executeWhen: false });
  assert.equal(f.clock.tasks.size, 0); await f.clock.advance(500); assert.equal(count(f), 1);
  f.query.configure({ executeWhen: true, inputs: { term: 'B' } }); assert.equal(count(f), 2);
  await f.reply(2); await f.clock.advance(100); assert.equal(count(f), 3);
});
add('P12-gate-closing-clears-pending-and-completion-cannot-poll', async f => {
  const fresh = observe(f.query.refresh()); f.query.configure({ inputs: { term: 'B' } });
  f.query.configure({ executeWhen: false }); await flush(); assert.equal(fresh.code, 'EXECUTION_BLOCKED');
  await f.reply(1, 'obsolete'); await f.clock.advance(500); assert.equal(count(f), 1);
  assert.equal(f.clock.tasks.size, 0); assert.equal(snapshot(f).data, undefined);
  f.query.configure({ executeWhen: true }); assert.equal(count(f), 2);
  assert.equal(f.transport.requests[1].inputs.term, 'B');
});
add('P13-readiness-blocks-poll-and-new-readiness-runs-once', async f => {
  assert.equal(count(f), 0); await f.clock.advance(500); assert.equal(count(f), 0);
  f.query.configure({ ready: true }); assert.equal(count(f), 1); await f.reply(1);
  await f.clock.advance(40); f.query.configure({ ready: false });
  assert.equal(f.clock.tasks.size, 0); await f.clock.advance(200); assert.equal(count(f), 1);
  f.query.configure({ ready: true, inputs: { term: 'B' } }); assert.equal(count(f), 2);
}, { ready: false });
add('P14-disposal-clears-poll-reservation', async f => {
  await f.reply(1); assert.equal(f.clock.tasks.size, 1);
  f.query.dispose(); assert.equal(f.clock.tasks.size, 0);
  await f.clock.advance(500); assert.equal(count(f), 1);
});
add('P15-owner-replacement-does-not-inherit-old-poll-timer', async f => {
  await f.reply(1); await f.clock.advance(50);
  const replacement = f.host.mount('search', { inputs: { term: 'B' }, intervalMs: 300, timeoutMs: 10_000 });
  assert.equal(f.query.alive, false); assert.equal(count(f), 2);
  await f.clock.advance(150); assert.equal(count(f), 2); assert.equal(replacement.pending, null);
  await f.reply(2, 'B'); assert.equal(schedule(f).deadline, 500);
  await f.clock.advance(300); assert.equal(count(f), 3);
});
add('P16-two-owners-have-independent-completion-times', async f => {
  f.host.mount('other', { inputs: { term: 'B' }, intervalMs: 200, timeoutMs: 10_000 });
  await f.clock.advance(40); await f.reply(1); await f.clock.advance(40); await f.reply(2);
  await f.clock.advance(59); assert.equal(count(f), 2);
  await f.clock.advance(1); assert.equal(count(f), 3); assert.equal(f.transport.requests[2].owner, f.query.owner);
  await f.clock.advance(140); assert.equal(count(f), 4); assert.equal(f.transport.requests[3].inputs.term, 'B');
});
add('P17-omitted-interval-does-not-create-hidden-default', async f => {
  await f.reply(1); await f.clock.advance(20_000); assert.equal(count(f), 1); assert.equal(f.clock.tasks.size, 0);
}, { intervalMs: undefined });
for (const value of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, '100']) {
  add(`P18-invalid-interval/${String(value)}`, async f => {
    const previous = f.query;
    assert.throws(() => f.host.mount('search', { intervalMs: value }), error => error.code === 'INVALID_DEFINITION');
    assert.equal(previous.alive, true); assert.strictEqual(f.host.slots.get('search').query, previous);
    assert.equal(count(f), 1);
  });
}
add('P19-native-timer-limit-is-chunked-with-one-final-tick', async f => {
  await f.reply(1); assert.equal(schedule(f).delay, MAX_NATIVE_TIMER_MS);
  await f.clock.advance(MAX_NATIVE_TIMER_MS); assert.equal(count(f), 1); assert.equal(schedule(f).delay, 20);
  await f.clock.advance(19); assert.equal(count(f), 1);
  await f.clock.advance(1); assert.equal(count(f), 2); assert.equal(ticks(f).length, 1);
}, { intervalMs: MAX_NATIVE_TIMER_MS + 20 });
add('P20-safe-integer-maximum-is-accepted-with-bounded-timer', async f => {
  await f.reply(1); assert.equal(schedule(f).deadline, Number.MAX_SAFE_INTEGER);
  assert.equal(schedule(f).delay, MAX_NATIVE_TIMER_MS); assert.equal(count(f), 1);
}, { intervalMs: Number.MAX_SAFE_INTEGER });
add('P21-stale-queued-callback-cannot-create-pending-work', async f => {
  await f.reply(1); const task = [...f.clock.tasks.values()][0];
  const manual = observe(f.query.refresh()); assert.equal(count(f), 2);
  task.fn(); await flush(); assert.equal(f.query.pending, null); assert.equal(count(f), 2);
  await f.reply(2); assert.equal(manual.status, 'fulfilled'); assert.equal(schedule(f).deadline, 100);
});
add('P22-unchanged-config-does-not-postpone-poll', async f => {
  await f.reply(1); await f.clock.advance(40); f.query.configure({ inputs: { term: 'A' } });
  assert.equal(schedule(f).deadline, 100); await f.clock.advance(60); assert.equal(count(f), 2);
});
add('P23-auto-condition-change-during-active-does-not-start-second-run', async f => {
  f.query.configure({ autoRefreshWhen: true }); assert.equal(count(f), 1);
  await f.clock.advance(500); assert.equal(count(f), 1); assert.equal(f.query.pending, null);
  await f.reply(1); await f.clock.advance(99); assert.equal(count(f), 1);
  await f.clock.advance(1); assert.equal(count(f), 2);
}, { autoRefreshWhen: false });
add('P24-poll-failure-retains-data-and-delays-next-attempt', async f => {
  await f.reply(1, 'previous'); await f.clock.advance(100); assert.equal(count(f), 2);
  await f.clock.advance(50); await f.reply(2, undefined, 'HTTP_ERROR');
  assert.equal(snapshot(f).data, 'previous'); assert.equal(snapshot(f).stale, true);
  assert.equal(snapshot(f).error.code, 'HTTP_ERROR'); await f.clock.advance(99); assert.equal(count(f), 2);
  await f.clock.advance(1); assert.equal(count(f), 3); assert.equal(snapshot(f).error, null);
  await f.reply(3, 'recovered'); assert.equal(snapshot(f).stale, false);
});
add('P25-cancelled-fresh-waiter-does-not-cancel-query-polling', async f => {
  await f.reply(1); const caller = new AbortController();
  const fresh = observe(f.query.handle(caller.signal).refresh()); caller.abort(); await flush();
  assert.equal(fresh.code, 'CANCELLED'); assert.equal(f.transport.requests[1].signal.aborted, false);
  await f.clock.advance(20); await f.reply(2, 'query-owned'); assert.equal(schedule(f).deadline, 120);
  await f.clock.advance(100); assert.equal(count(f), 3);
});
add('P26-gate-ABA-requires-current-generation-before-reserving-poll', async f => {
  f.query.configure({ executeWhen: false }); f.query.configure({ executeWhen: true });
  await f.clock.advance(200); await f.reply(1, 'obsolete'); assert.equal(count(f), 2);
  assert.equal(snapshot(f).data, undefined); assert.equal(f.host.pollers.get('search').timer, null);
  await f.clock.advance(50); await f.reply(2, 'current'); assert.equal(schedule(f).deadline, 350);
});
add('P27-public-source-location-and-cause-survive-polling-hook', async f => {
  const request = f.transport.requests[0]; request.completed = true;
  request.completion.reject({ code: 'HTTP_ERROR', message: 'private transport text', location: '/spec/sources/left',
    cause: { code: 'TYPE_MISMATCH', message: 'private transform text', location: '/spec/sources/left/transform/steps/0' } });
  await flush();
  assert.deepEqual(snapshot(f).error, { code: 'HTTP_ERROR', message: 'HTTP_ERROR', location: '/spec/sources/left',
    cause: { code: 'TYPE_MISMATCH', message: 'TYPE_MISMATCH', location: '/spec/sources/left/transform/steps/0' } });
  assert.equal(schedule(f).deadline, 100);
  await f.clock.advance(100); assert.equal(count(f), 2); await f.reply(2, 'recovered');
  assert.equal(snapshot(f).error, null); assert.equal(snapshot(f).data, 'recovered');
});

export const mutationWitnesses = [
  ['anchorAtStart', 'P01-completion-not-start-anchors-next-interval'],
  ['retryImmediately', 'P02-failure-waits-full-interval'],
  ['rearmOnLateCompletion', 'P03-timeout-anchors-interval-and-late-success-does-not-rearm'],
  ['ignoreAutoRefreshWhen', 'P08-auto-condition-affects-only-periodic-execution'],
  ['skipDisposeCleanup', 'P14-disposal-clears-poll-reservation'],
  ['skipTimerChunking', 'P19-native-timer-limit-is-chunked-with-one-final-tick'],
];
