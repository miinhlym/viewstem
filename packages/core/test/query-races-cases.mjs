import { check as assert } from './query-fixtures.mjs';
import { FakeClock, ControlledTransport, flush, observe } from './query-fixtures.mjs';
import { ProbeHost } from './query-fixtures.mjs';

export function setup(options = {}, mutation = {}) {
  const trace = [];
  const clock = new FakeClock();
  const transport = new ControlledTransport(clock, trace);
  const host = new ProbeHost(clock, transport, trace, mutation);
  const query = host.mount('search', options);
  return { trace, clock, transport, host, query };
}

const input = term => ({ term });
const cases = [];
const add = (id, contracts, run, options = {}) => cases.push({ id, contracts, run, options });
const state = s => s.host.snapshot();
const request = s => s.transport.requests.at(-1);
const terms = s => s.transport.requests.map(item => item.inputs.term);
const replies = s => s.trace.filter(item => item.kind === 'accept');
async function reply(s, id, value, code = null) { s.transport.respond(id, value, code); await flush(); }
async function rejection(promise, code) { await assert.rejects(promise, error => error.code === code); }

add('R01-obsolete-success', ['Q07', 'K29'], async s => {
  s.query.configure({ inputs: input('B') });
  await reply(s, 1, 'old-A');
  assert.equal(state(s).data, undefined);
  assert.equal(state(s).status, 'running');
  assert.deepEqual(terms(s), ['A', 'B']);
  await reply(s, 2, 'new-B');
  assert.equal(state(s).data, 'new-B');
  assert.deepEqual(state(s).dataInputs, input('B'));
});

add('R02-obsolete-error', ['Q07', 'K29'], async s => {
  s.query.configure({ inputs: input('B') });
  await reply(s, 1, null, 'HTTP_ERROR');
  assert.equal(state(s).error, null);
  assert.equal(state(s).status, 'running');
  assert.equal(replies(s).length, 0);
  await reply(s, 2, 'B');
});

add('R03-input-ABA', ['Q07', 'Q08', 'K29'], async s => {
  s.query.configure({ inputs: input('B') });
  s.query.configure({ inputs: input('A') });
  await reply(s, 1, 'first-A');
  assert.equal(state(s).data, undefined);
  assert.deepEqual(terms(s), ['A', 'A']);
  await reply(s, 2, 'second-A');
  assert.equal(state(s).data, 'second-A');
});

add('R04-completion-queued-before-input-change', ['Q07', 'K29'], async s => {
  // The Promise resolved, but its reaction has not run: validate at publication.
  s.transport.respond(1, 'old-A');
  s.query.configure({ inputs: input('B') });
  await flush();
  assert.equal(state(s).data, undefined);
  assert.equal(replies(s).length, 0);
  await reply(s, 2, 'B');
});

add('R05-latest-pending-burst', ['Q08'], async s => {
  for (const term of ['B', 'C', 'D', 'E']) s.query.configure({ inputs: input(term) });
  assert.equal(s.transport.requests.length, 1);
  assert.equal(s.transport.outstanding().length, 1);
  await reply(s, 1, 'A');
  assert.deepEqual(terms(s), ['A', 'E']);
  assert.equal(s.transport.outstanding().length, 1);
  await reply(s, 2, 'E');
  assert.equal(s.query.pending, null);
});

add('R06-refresh-waves', ['Q11', 'K13'], async s => {
  const first = observe(s.query.refresh());
  const second = observe(s.query.refresh());
  await reply(s, 1, 'initial');
  assert.equal(first.status, 'pending');
  assert.equal(second.status, 'pending');
  const third = observe(s.query.refresh());
  await reply(s, 2, 'fresh-1');
  assert.equal(first.status, 'fulfilled');
  assert.equal(second.status, 'fulfilled');
  assert.equal(first.value, undefined);
  assert.equal(third.status, 'pending');
  assert.equal(s.transport.requests.length, 3);
  await reply(s, 3, 'fresh-2');
  assert.equal(third.status, 'fulfilled');
});

add('R07-refresh-follows-new-input-after-start', ['K13'], async s => {
  const fresh = observe(s.query.refresh());
  await reply(s, 1, 'initial-A');
  s.query.configure({ inputs: input('B') });
  const joined = observe(s.query.refresh());
  await reply(s, 2, 'obsolete-fresh-A');
  assert.equal(fresh.status, 'pending');
  assert.equal(joined.status, 'pending');
  assert.equal(state(s).data, 'initial-A');
  assert.equal(state(s).stale, true);
  await reply(s, 3, 'fresh-B');
  assert.equal(fresh.status, 'fulfilled');
  assert.equal(joined.status, 'fulfilled');
  assert.deepEqual(terms(s), ['A', 'A', 'B']);
});

add('R08-gate-closes-pending', ['Q09', 'Q19', 'K12', 'K13'], async s => {
  const fresh = observe(s.query.refresh());
  s.query.configure({ executeWhen: false });
  await flush();
  assert.equal(fresh.code, 'EXECUTION_BLOCKED');
  await rejection(s.query.refresh(), 'EXECUTION_BLOCKED');
  const before = state(s);
  await reply(s, 1, 'late-A');
  assert.strictEqual(state(s), before);
  assert.equal(s.transport.requests.length, 1);
  assert.equal(s.query.pending, null);
});

add('R09-gate-close-reopen-ABA', ['Q18', 'Q19', 'K29'], async s => {
  s.query.configure({ executeWhen: false });
  s.query.configure({ executeWhen: true });
  await reply(s, 1, 'before-close');
  assert.equal(state(s).data, undefined);
  assert.deepEqual(terms(s), ['A', 'A']);
  await reply(s, 2, 'after-open');
  assert.equal(state(s).data, 'after-open');
});

add('R10-atomic-gate-and-input', ['Q18'], async s => {
  s.query.configure({ executeWhen: false });
  await reply(s, 1, 'obsolete');
  s.query.configure({ executeWhen: true, inputs: input('B') });
  assert.deepEqual(terms(s), ['A', 'B']);
  await reply(s, 2, 'B');
  assert.equal(s.transport.requests.length, 2);
});

add('R11-unready-input-and-refresh-waiter', ['K03', 'K13'], async s => {
  const fresh = observe(s.query.refresh());
  s.query.configure({ ready: false });
  await rejection(s.query.refresh(), 'INPUT_NOT_READY');
  await reply(s, 1, 'obsolete');
  assert.equal(state(s).waitingReason, 'INPUT_NOT_READY');
  assert.equal(s.transport.requests.length, 1);
  assert.equal(fresh.status, 'pending');
  s.query.configure({ ready: true, inputs: input('B') });
  await reply(s, 2, 'B');
  assert.equal(fresh.status, 'fulfilled');
});

add('R12-replace-same-address-late-success', ['K29'], async s => {
  const old = s.query;
  const waiter = observe(old.refresh());
  s.query = s.host.mount('search', { inputs: input('B') });
  await reply(s, 2, 'new-owner-B');
  const before = state(s);
  await reply(s, 1, 'disposed-owner-A');
  assert.strictEqual(state(s), before);
  assert.equal(state(s).data, 'new-owner-B');
  assert.equal(waiter.code, 'CANCELLED');
  assert.equal(s.transport.requests[0].signal.aborted, true);
  await rejection(old.refresh(), 'CANCELLED');
});

add('R13-replace-same-address-late-error', ['K29'], async s => {
  s.query = s.host.mount('search', { inputs: input('B') });
  const before = state(s);
  await reply(s, 1, null, 'HTTP_ERROR');
  assert.strictEqual(state(s), before);
  assert.equal(state(s).status, 'running');
  await reply(s, 2, 'B');
});

add('R14-dispose-all-waiters-no-new-request', ['K29', 'K16'], async s => {
  const first = observe(s.query.refresh());
  const second = observe(s.query.refresh());
  s.query.dispose();
  await flush();
  assert.equal(first.code, 'CANCELLED');
  assert.equal(second.code, 'CANCELLED');
  const before = state(s);
  await reply(s, 1, 'late');
  await rejection(s.query.retry(), 'CANCELLED');
  assert.strictEqual(state(s), before);
  assert.equal(s.transport.requests.length, 1);
  assert.equal(s.clock.tasks.size, 0);
});

add('R15-caller-cancellation-preserves-shared-query', ['K16'], async s => {
  const controller = new AbortController();
  const handle = s.query.handle(controller.signal);
  const cancelled = observe(handle.refresh());
  const other = observe(s.query.refresh());
  controller.abort();
  await flush();
  assert.equal(cancelled.code, 'CANCELLED');
  await rejection(handle.refresh(), 'CANCELLED');
  await rejection(handle.retry(), 'CANCELLED');
  assert.equal(s.transport.requests[0].signal.aborted, false);
  await reply(s, 1, 'initial');
  assert.equal(other.status, 'pending');
  await reply(s, 2, 'fresh');
  assert.equal(other.status, 'fulfilled');
  assert.equal(state(s).data, 'fresh');
});

add('R16-timeout-late-success-after-retry', ['K11', 'K27', 'K29'], async s => {
  await s.clock.advance(30_000);
  assert.equal(state(s).error.code, 'TIMEOUT');
  assert.equal(s.transport.requests[0].signal.aborted, true);
  const retry = observe(s.query.retry());
  await reply(s, 2, 'retry-success');
  assert.equal(retry.status, 'fulfilled');
  const before = state(s);
  await reply(s, 1, 'late-timeout-result');
  assert.strictEqual(state(s), before);
});

add('R17-timeout-late-error-during-fresh-run', ['K11', 'K29'], async s => {
  const fresh = observe(s.query.refresh());
  await s.clock.advance(30_000);
  assert.equal(request(s).id, 2);
  const before = state(s);
  await reply(s, 1, null, 'HTTP_ERROR');
  assert.strictEqual(state(s), before);
  assert.equal(s.query.active.request.id, 2);
  assert.equal(fresh.status, 'pending');
  await reply(s, 2, 'fresh');
  assert.equal(fresh.status, 'fulfilled');
});

add('R18-response-before-deadline', ['K11'], async s => {
  s.clock.setTimeout(() => s.transport.respond(1, 'on-time'), 29_999);
  await s.clock.advance(30_001);
  assert.equal(state(s).data, 'on-time');
  assert.equal(state(s).error, null);
  assert.equal(s.clock.tasks.size, 0);
});

add('R19-timeout-queued-first-at-same-deadline', ['K11', 'K29'], async s => {
  // Fixture ordering, not a new public promise about exact wall-clock priority.
  s.clock.setTimeout(() => s.transport.respond(1, 'too-late'), 30_000);
  await s.clock.advance(30_000);
  assert.equal(state(s).error.code, 'TIMEOUT');
  assert.equal(state(s).data, undefined);
});

add('R20-last-success-failure-retry', ['K25', 'K27'], async s => {
  await reply(s, 1, { rows: ['A'] });
  const previous = state(s);
  s.query.configure({ inputs: input('B') });
  assert.equal(state(s).stale, true, 'previous data must become stale when inputs change');
  assert.strictEqual(state(s).data, previous.data, 'status changes must retain the preserved data reference');
  await reply(s, 2, null, 'HTTP_ERROR');
  assert.equal(state(s).status, 'error');
  assert.deepEqual(state(s).data, { rows: ['A'] });
  assert.deepEqual(state(s).dataInputs, input('A'));
  assert.equal(state(s).stale, true);
  const retry = observe(s.query.retry());
  assert.equal(state(s).error, null);
  assert.equal(state(s).stale, true);
  await reply(s, 3, { rows: ['B'] });
  assert.equal(retry.status, 'fulfilled');
  assert.deepEqual(state(s).dataInputs, input('B'));
  assert.equal(state(s).stale, false);
  assert.deepEqual(previous.data, { rows: ['A'] });
  assert.deepEqual(previous.dataInputs, input('A'));
});

for (const [label, value] of [['null', null], ['false', false], ['zero', 0], ['empty-string', ''], ['empty-array', []]]) {
  add(`R21-preserve-${label}`, ['K26'], async s => {
    await reply(s, 1, value);
    const fresh = observe(s.query.refresh());
    assert.equal(state(s).stale, false);
    await reply(s, 2, null, 'HTTP_ERROR');
    assert.equal(fresh.code, 'HTTP_ERROR');
    assert.deepEqual(state(s).data, value);
    assert.deepEqual(state(s).dataInputs, input('A'));
    assert.equal(state(s).stale, true);
  });
}

add('R22-first-failure-no-data', ['K25'], async s => {
  await reply(s, 1, null, 'HTTP_ERROR');
  assert.equal(state(s).data, undefined);
  assert.equal(state(s).dataInputs, undefined);
  assert.equal(state(s).stale, false);
});

add('R23-refresh-disabled-first-input-retry-allowed', ['K12', 'K14'], async s => {
  // A new lifetime provides static settings, as the actual contract requires.
  s.query = s.host.mount('search', { refresh: false });
  await reply(s, 1, 'old-lifetime');
  await rejection(s.query.refresh(), 'QUERY_REFRESH_DISABLED');
  await reply(s, 2, 'initial');
  s.query.periodicTick();
  assert.equal(s.transport.requests.length, 2);
  s.query.configure({ inputs: input('B') });
  await reply(s, 3, null, 'HTTP_ERROR');
  const retry = observe(s.query.retry());
  await reply(s, 4, 'B');
  assert.equal(retry.status, 'fulfilled');
  await rejection(s.query.retry(), 'INVALID_RETRY_STATE');
});

add('R24-auto-refresh-gate-does-not-block-manual', ['Q10'], async s => {
  await reply(s, 1, 'initial');
  s.query.configure({ autoRefreshWhen: false });
  s.query.periodicTick();
  assert.equal(s.transport.requests.length, 1);
  const fresh = observe(s.query.refresh());
  await reply(s, 2, 'manual');
  assert.equal(fresh.status, 'fulfilled');
});

add('R25-no-implicit-retry', ['K14'], async s => {
  await reply(s, 1, null, 'HTTP_ERROR');
  await s.clock.advance(100_000);
  assert.equal(s.transport.requests.length, 1);
  assert.equal(state(s).status, 'error');
});

add('R26-independent-owners', ['K16', 'K29'], async s => {
  const other = s.host.mount('other', { inputs: input('C') });
  const otherFresh = observe(other.refresh());
  s.query.dispose();
  assert.equal(s.transport.requests[1].signal.aborted, false);
  await reply(s, 1, null, 'HTTP_ERROR');
  await reply(s, 2, 'other-initial');
  await reply(s, 3, 'other-fresh');
  assert.equal(otherFresh.status, 'fulfilled');
  assert.equal(s.host.snapshot('other').data, 'other-fresh');
  other.dispose();
});

add('R27-input-and-result-snapshot-isolation', ['K29'], async s => {
  const next = { term: 'B', filter: { enabled: true } };
  s.query.configure({ inputs: next });
  next.filter.enabled = false;
  await reply(s, 1, 'obsolete');
  assert.equal(request(s).inputs.filter.enabled, true);
  const result = { rows: ['B'] };
  s.transport.respond(2, result);
  result.rows.push('mutated');
  await flush();
  assert.deepEqual(state(s).data, { rows: ['B'] });
  assert.equal(Object.isFrozen(state(s).data.rows), true);
});

add('R28-fresh-failure-stops-awaiting-step', ['Q11', 'K28'], async s => {
  let after = 0;
  const action = observe((async () => { await s.query.refresh(); ++after; })());
  await reply(s, 1, 'initial');
  assert.equal(after, 0);
  await reply(s, 2, null, 'HTTP_ERROR');
  assert.equal(action.code, 'HTTP_ERROR');
  assert.equal(after, 0);
  assert.equal(state(s).data, 'initial');
});

add('R29-dispose-after-transport-completion-before-microtask', ['K29'], async s => {
  s.transport.respond(1, 'already-resolved');
  s.query.dispose();
  const before = state(s);
  await flush();
  assert.strictEqual(state(s), before);
});

add('R30-active-fresh-waiter-rejected-when-gate-closes', ['K13'], async s => {
  await reply(s, 1, 'initial');
  const fresh = observe(s.query.refresh());
  s.query.configure({ executeWhen: false });
  await flush();
  assert.equal(fresh.code, 'EXECUTION_BLOCKED');
  const before = state(s);
  await reply(s, 2, null, 'HTTP_ERROR');
  assert.strictEqual(state(s), before);
});

add('R31-initial-gate-blocked', ['Q09', 'Q18'], async s => {
  assert.equal(s.transport.requests.length, 0);
  assert.equal(state(s).waitingReason, 'EXECUTION_BLOCKED');
  await rejection(s.query.refresh(), 'EXECUTION_BLOCKED');
  s.query.configure({ executeWhen: true, inputs: input('B') });
  assert.deepEqual(terms(s), ['B']);
  await reply(s, 1, 'B');
}, { executeWhen: false });

add('R32-initial-input-unready', ['K03'], async s => {
  assert.equal(s.transport.requests.length, 0);
  assert.equal(state(s).waitingReason, 'INPUT_NOT_READY');
  await rejection(s.query.refresh(), 'INPUT_NOT_READY');
  s.query.configure({ ready: true, inputs: input('B') });
  await reply(s, 1, null);
  assert.equal(state(s).data, null);
  assert.deepEqual(state(s).dataInputs, input('B'));
}, { ready: false });

export { cases };

export async function runBurstSeed(seed) {
  const s = setup();
  let random = seed >>> 0;
  const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
  const waits = [];
  let finalInput = input('A');
  // Every seed includes changes and returns to an earlier value; only the last runs.
  for (let i = 0; i < 40; ++i) {
    finalInput = input(String.fromCharCode(65 + next() % 5));
    s.query.configure({ inputs: finalInput });
    if (next() % 3 === 0) waits.push(observe(s.query.refresh()));
    assert.equal(s.transport.requests.length, 1);
    assert.equal(s.transport.outstanding().length, 1);
  }
  if (next() % 2) await reply(s, 1, 'obsolete');
  else await reply(s, 1, null, 'HTTP_ERROR');
  assert.equal(replies(s).length, 0);
  assert.equal(state(s).data, undefined);
  assert.deepEqual(request(s).inputs, finalInput);
  assert.equal(s.transport.requests.length, 2);
  assert.ok(waits.every(wait => wait.status === 'pending'));
  await reply(s, 2, { for: finalInput.term });
  assert.deepEqual(state(s).dataInputs, finalInput);
  assert.ok(waits.every(wait => wait.status === 'fulfilled'));
  s.query.dispose();
  assert.equal(s.clock.tasks.size, 0);
  assert.equal(s.query.tickets.size, 0);
  return { seed, changes: 40, refreshCalls: waits.length, requestTerms: terms(s), passed: true };
}
