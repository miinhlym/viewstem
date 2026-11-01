import assert from 'node:assert/strict';
import { flush, input, observe, secretMarker, privateMarker, tokenMarker } from './harness.mjs';

export const cases = [];
const add = (id, run, options = {}, contracts = ['Q07', 'K13', 'K29']) => cases.push({ id, run, options, contracts });
const state = f => f.host.snapshot();
const accepted = f => f.trace.filter(row => row.kind === 'accept');
const terms = f => f.plans.map(plan => plan.inputs.term);
async function data(f, request, value, plan = f.plans.length) {
  await f.reply(request, { value }); await f.settle(plan);
}
async function failed(promise, code) { await assert.rejects(promise, error => error.code === code); }

for (const [label, value] of [['null', null], ['false', false], ['zero', 0], ['empty-string', ''], ['empty-array', []], ['array', [1, 2]], ['object', { item: 'A' }]]) {
  add(`I01-body-and-retention/${label}`, async f => {
    await f.waitFor(1); await data(f, 1, value);
    const snapshot = state(f);
    assert.equal(snapshot.status, 'success'); assert.deepEqual(snapshot.data, value);
    assert.deepEqual(snapshot.dataInputs, input('A'));
    f.query.configure({ inputs: input('B') });
    await f.waitFor(2); await f.reply(2, { status: 503, value: { private: 'api-error' } }); await f.settle(2);
    assert.equal(state(f).status, 'error'); assert.equal(state(f).error.code, 'HTTP_ERROR');
    assert.deepEqual(state(f).data, value); assert.deepEqual(state(f).dataInputs, input('A'));
    assert.equal(state(f).stale, true); assert.deepEqual(snapshot.data, value);
    assert.ok(Object.isFrozen(snapshot));
  }, {}, ['K25', 'K26']);
}

add('I02-input-burst-during-login', async f => {
  await f.waitFor(1);
  const waiter = observe(f.query.refresh());
  for (const term of ['B', 'C', 'D']) f.query.configure({ inputs: input(term) });
  assert.equal(f.plans.length, 1);
  await f.reply(1); await f.waitFor(2); await data(f, 2, { term: 'obsolete-A' }, 1);
  await f.waitFor(3);
  assert.deepEqual(terms(f), ['A', 'D']); assert.equal(waiter.status, 'pending');
  assert.equal(state(f).data, undefined); assert.equal(accepted(f).length, 0);
  await f.reply(3); await f.waitFor(4); await data(f, 4, { term: 'D' }, 2);
  assert.equal(waiter.status, 'fulfilled'); assert.equal(waiter.value, undefined);
  assert.deepEqual(state(f).dataInputs, input('D'));
  assert.deepEqual(f.received.map(r => [r.stage, r.term]), [['login', 'A'], ['data', 'A'], ['login', 'D'], ['data', 'D']]);
  assert.equal(f.received[1].headers.authorization, `Bearer ${tokenMarker}1`);
  assert.equal(f.received[3].headers.authorization, `Bearer ${tokenMarker}3`);
}, { login: true });

add('I03-refresh-waves', async f => {
  await f.waitFor(1);
  const a = observe(f.query.refresh()), b = observe(f.query.refresh());
  await data(f, 1, 'initial', 1);
  assert.equal(a.status, 'pending'); assert.equal(b.status, 'pending');
  assert.equal(f.plans.length, 2); await f.waitFor(2);
  const c = observe(f.query.refresh());
  await data(f, 2, 'fresh-one', 2); await f.waitFor(3);
  assert.equal(a.status, 'fulfilled'); assert.equal(b.status, 'fulfilled'); assert.equal(c.status, 'pending');
  await data(f, 3, 'fresh-two', 3);
  assert.equal(c.status, 'fulfilled'); assert.equal(c.value, undefined);
  assert.equal(f.plans.length, 3); assert.equal(state(f).data, 'fresh-two');
});

add('I04-refresh-follows-input-after-start', async f => {
  await f.waitFor(1); const waiter = observe(f.query.refresh());
  await data(f, 1, 'initial-A', 1); await f.waitFor(2);
  f.query.configure({ inputs: input('B') });
  await data(f, 2, 'obsolete-fresh-A', 2); await f.waitFor(3);
  assert.equal(waiter.status, 'pending'); assert.equal(state(f).data, 'initial-A');
  assert.equal(state(f).stale, true); assert.deepEqual(state(f).dataInputs, input('A'));
  await data(f, 3, 'fresh-B', 3);
  assert.equal(waiter.status, 'fulfilled'); assert.equal(state(f).data, 'fresh-B');
});

add('I05-obsolete-http-failure', async f => {
  await f.waitFor(1); f.query.configure({ inputs: input('B') });
  await f.reply(1, { status: 500 }); await f.settle(1); await f.waitFor(2);
  assert.equal(state(f).status, 'running'); assert.equal(state(f).error, null);
  assert.equal(accepted(f).length, 0);
  await data(f, 2, 'B', 2);
});

add('I06-gate-closes-during-login', async f => {
  await f.waitFor(1); const waiter = observe(f.query.refresh());
  f.query.configure({ executeWhen: false }); await flush();
  assert.equal(waiter.code, 'EXECUTION_BLOCKED');
  await failed(f.query.refresh(), 'EXECUTION_BLOCKED');
  // The already-started plan may finish; it cannot publish or start a pending plan.
  await f.reply(1); await f.waitFor(2); await data(f, 2, 'obsolete', 1);
  assert.equal(f.plans.length, 1); assert.equal(state(f).status, 'waiting');
  assert.equal(state(f).waitingReason, 'EXECUTION_BLOCKED'); assert.equal(state(f).data, undefined);
  f.query.configure({ inputs: input('B'), executeWhen: true });
  await f.waitFor(3); await f.reply(3); await f.waitFor(4); await data(f, 4, 'B', 2);
  assert.equal(state(f).data, 'B');
}, { login: true });

add('I07-input-unready-during-response-body', async f => {
  await f.waitFor(1); f.headers(1);
  const waiter = observe(f.query.refresh()); f.query.configure({ ready: false });
  await failed(f.query.refresh(), 'INPUT_NOT_READY');
  await data(f, 1, 'obsolete', 1);
  assert.equal(state(f).waitingReason, 'INPUT_NOT_READY'); assert.equal(waiter.status, 'pending');
  assert.equal(f.plans.length, 1);
  f.query.configure({ inputs: input('B'), ready: true });
  await f.waitFor(2); await data(f, 2, 'B', 2);
  assert.equal(waiter.status, 'fulfilled');
});

add('I08-caller-cancel-keeps-shared-query', async f => {
  await f.waitFor(1); const caller = new AbortController();
  const cancelled = observe(f.query.handle(caller.signal).refresh());
  const remaining = observe(f.query.refresh()); caller.abort(); await flush();
  assert.equal(cancelled.code, 'CANCELLED'); assert.equal(f.plans[0].signal.aborted, false);
  await data(f, 1, 'initial', 1); await f.waitFor(2); await data(f, 2, 'fresh', 2);
  assert.equal(remaining.status, 'fulfilled'); assert.equal(cancelled.code, 'CANCELLED');
  assert.equal(state(f).data, 'fresh');
});

add('I09-cancel-only-pending-waiter', async f => {
  await f.waitFor(1); const caller = new AbortController();
  const waiter = observe(f.query.handle(caller.signal).refresh()); caller.abort(); await flush();
  await data(f, 1, 'initial', 1);
  assert.equal(waiter.code, 'CANCELLED'); assert.equal(f.plans.length, 1); assert.equal(f.query.pending, null);
});

add('I10-dispose-during-login', async f => {
  await f.waitFor(1); const waiter = observe(f.query.refresh());
  const snapshot = state(f); f.query.dispose(); await f.settle(1); await f.reply(1);
  assert.equal(waiter.code, 'CANCELLED'); assert.equal(f.plans[0].outcome.code, 'CANCELLED');
  assert.equal(f.plans[0].signal.aborted, true); assert.strictEqual(state(f), snapshot);
  assert.equal(f.received.length, 1); assert.equal(accepted(f).length, 0);
}, { login: true });

add('I11-replace-owner-during-response-body', async f => {
  await f.waitFor(1); f.headers(1);
  const waiter = observe(f.query.refresh()); const replacement = f.mount('search', { inputs: input('B') });
  await f.settle(1);
  assert.equal(f.trace.filter(row => row.kind === 'accept' && row.owner === f.query.owner).length, 0,
    'Disposed owner must not publish even a transient cancellation error');
  assert.equal(state(f).status, 'running'); assert.equal(state(f).error, null);
  await f.waitFor(2); await data(f, 2, 'new-owner', 2);
  const snapshot = state(f); await f.reply(1, { value: 'obsolete-owner' }); await flush();
  assert.equal(waiter.code, 'CANCELLED'); assert.equal(f.plans[0].signal.aborted, true);
  assert.strictEqual(state(f), snapshot); assert.equal(state(f).data, 'new-owner');
  assert.deepEqual(state(f).dataInputs, input('B')); assert.equal(replacement.alive, true);
});

add('I12-http-deadline-during-login-with-pending-input', async f => {
  await f.waitFor(1); const waiter = observe(f.query.refresh());
  f.query.configure({ inputs: input('B') });
  await f.clock.advance(50); await f.settle(1); await f.waitFor(2);
  assert.equal(f.plans[0].outcome.code, 'TIMEOUT'); assert.equal(waiter.status, 'pending');
  assert.equal(state(f).error, null); assert.equal(accepted(f).length, 0);
  await f.reply(1); await f.reply(2); await f.waitFor(3); await data(f, 3, 'B', 2);
  assert.equal(waiter.status, 'fulfilled'); assert.equal(state(f).data, 'B');
  assert.deepEqual(f.received.map(r => [r.stage, r.term]), [['login', 'A'], ['login', 'B'], ['data', 'B']]);
}, { login: true, httpTimeout: 50 });

add('I13-http-body-timeout-retains-success-and-retries', async f => {
  await f.waitFor(1); await data(f, 1, 'previous', 1);
  const waiter = observe(f.query.refresh()); await f.waitFor(2); f.headers(2);
  await f.clock.advance(50); await f.settle(2);
  assert.equal(waiter.code, 'TIMEOUT'); assert.equal(state(f).status, 'error');
  assert.equal(state(f).data, 'previous'); assert.equal(state(f).stale, true);
  const retry = observe(f.query.retry()); await f.waitFor(3); await data(f, 3, 'recovered', 3);
  await f.reply(2, { value: 'obsolete' });
  assert.equal(retry.status, 'fulfilled'); assert.equal(state(f).data, 'recovered'); assert.equal(state(f).stale, false);
}, { httpTimeout: 50 });

add('I14-query-deadline-aborts-http-plan', async f => {
  await f.waitFor(1); await f.clock.advance(50); await f.settle(1);
  assert.equal(state(f).status, 'error'); assert.equal(state(f).error.code, 'TIMEOUT');
  assert.equal(f.plans[0].signal.aborted, true); assert.equal(f.plans[0].outcome.code, 'CANCELLED');
  const retry = observe(f.query.retry()); await f.waitFor(2); await data(f, 2, 'recovered', 2);
  await f.reply(1, { value: 'obsolete' });
  assert.equal(retry.status, 'fulfilled'); assert.equal(state(f).data, 'recovered');
}, { queryTimeout: 50 });

for (const [label, config, code] of [
  ['status', { status: 503 }, 'HTTP_ERROR'],
  ['missing-token', { value: {} }, 'INPUT_NOT_READY'],
  ['non-string-token', { value: { token: 1 } }, 'HTTP_ERROR'],
  ['malformed-json', { raw: '{' }, 'HTTP_ERROR'],
]) {
  add(`I15-login-failure/${label}`, async f => {
    await f.waitFor(1); await f.reply(1, config); await f.settle(1);
    assert.equal(state(f).status, 'error'); assert.equal(state(f).error.code, code);
    assert.equal(state(f).data, undefined); assert.equal(state(f).dataInputs, undefined);
    assert.equal(state(f).stale, false); assert.equal(f.received.length, 1);
  }, { login: true }, ['H05', 'K25']);
}

add('I16-preflight-failure-is-query-error-without-network', async f => {
  await f.settle(1);
  assert.equal(state(f).status, 'error'); assert.equal(state(f).error.code, 'INVALID_DEFINITION');
  assert.equal(f.received.length, 0); assert.equal(f.timeline.some(e => e.kind === 'resolve-secret'), false);
}, { login: true, changePlan: plan => { plan.request.headers = { Host: 'fixture.invalid' }; } }, ['K09']);

add('I17-retry-with-refresh-disabled', async f => {
  await f.waitFor(1); await f.reply(1, { status: 500 }); await f.settle(1);
  await failed(f.query.refresh(), 'QUERY_REFRESH_DISABLED');
  const retry = observe(f.query.retry()); await f.waitFor(2); await data(f, 2, 'recovered', 2);
  assert.equal(retry.status, 'fulfilled'); assert.equal(f.plans.length, 2);
  await failed(f.query.retry(), 'INVALID_RETRY_STATE');
}, { query: { refresh: false } }, ['K12', 'K14']);

add('I18-input-snapshot-and-private-login-separation', async f => {
  await f.waitFor(1); await f.reply(1); await f.waitFor(2); await data(f, 2, { public: 'result' }, 1);
  const before = state(f), inputs = { term: 'B', nested: { revision: 1 } };
  f.query.configure({ inputs }); inputs.term = 'external-mutation'; inputs.nested.revision = 2;
  await f.waitFor(3); await f.reply(3); await f.waitFor(4); await data(f, 4, { public: 'second' }, 2);
  assert.deepEqual(state(f).dataInputs, { term: 'B', nested: { revision: 1 } });
  assert.deepEqual(before.dataInputs, input('A')); assert.deepEqual(before.data, { public: 'result' });
  assert.ok(Object.isFrozen(state(f).dataInputs.nested));
  assert.throws(() => { state(f).dataInputs.nested.revision = 9; }, TypeError);
  const publicData = JSON.stringify(f.trace);
  for (const marker of [secretMarker, privateMarker, tokenMarker]) assert.equal(publicData.includes(marker), false);
}, { login: true }, ['H03', 'H04', 'K25']);

add('I19-input-ABA-with-real-http', async f => {
  await f.waitFor(1); f.query.configure({ inputs: input('B') }); f.query.configure({ inputs: input('A') });
  await data(f, 1, 'obsolete-A', 1); await f.waitFor(2);
  assert.equal(accepted(f).length, 0); assert.equal(state(f).data, undefined);
  await data(f, 2, 'current-A', 2); assert.equal(state(f).data, 'current-A');
});

add('I20-independent-owners-do-not-share-login', async f => {
  await f.waitFor(1); const other = f.mount('other', { inputs: input('B') }); await f.waitFor(2);
  await f.reply(2); await f.waitFor(3); await data(f, 3, 'owner-B', 2);
  assert.equal(other.snapshot().data, 'owner-B'); assert.equal(state(f).data, undefined);
  await f.reply(1); await f.waitFor(4); await data(f, 4, 'owner-A', 1);
  assert.equal(state(f).data, 'owner-A'); assert.deepEqual(other.snapshot().dataInputs, input('B'));
  assert.equal(f.received[2].headers.authorization, `Bearer ${tokenMarker}2`);
  assert.equal(f.received[3].headers.authorization, `Bearer ${tokenMarker}1`);
}, { login: true }, ['H05', 'K25']);

add('I21-disconnect-preserves-last-success', async f => {
  await f.waitFor(1); await data(f, 1, 'previous', 1);
  const waiter = observe(f.query.refresh()); await f.waitFor(2); f.headers(2); f.received[1].res.destroy();
  await f.settle(2);
  assert.equal(waiter.code, 'HTTP_ERROR'); assert.equal(state(f).data, 'previous');
  assert.equal(state(f).error.code, 'HTTP_ERROR'); assert.equal(state(f).stale, true);
}, {}, ['K25']);

add('I22-api-response-content-remains-api-responsibility', async f => {
  await f.waitFor(1); await f.reply(1); await f.waitFor(2);
  const response = { serverEcho: f.received[1].headers.authorization };
  await data(f, 2, response, 1);
  assert.deepEqual(state(f).data, response); assert.deepEqual(state(f).dataInputs, input('A'));
  assert.equal(state(f).status, 'success');
}, { login: true }, ['U21']);

add('I23-active-failure-does-not-reject-fresh-waiter', async f => {
  await f.waitFor(1); const waiter = observe(f.query.refresh());
  await f.reply(1, { status: 503 }); await f.settle(1);
  assert.equal(waiter.status, 'pending'); assert.equal(f.plans.length, 2);
  assert.equal(state(f).status, 'running'); assert.equal(state(f).error, null);
  await f.waitFor(2); await data(f, 2, 'fresh-success', 2);
  assert.equal(waiter.status, 'fulfilled'); assert.equal(state(f).data, 'fresh-success');
});

add('I24-fresh-http-failure-rejects-waiter-keeps-success', async f => {
  await f.waitFor(1); await f.reply(1); await f.waitFor(2); await data(f, 2, 'previous', 1);
  const waiter = observe(f.query.refresh()); await f.waitFor(3); await f.reply(3); await f.waitFor(4);
  await f.reply(4, { status: 500, value: { internal: privateMarker } }); await f.settle(2);
  assert.equal(waiter.code, 'HTTP_ERROR'); assert.equal(state(f).status, 'error');
  assert.equal(state(f).data, 'previous'); assert.deepEqual(state(f).dataInputs, input('A'));
  assert.equal(state(f).stale, true); assert.equal(JSON.stringify(state(f)).includes(privateMarker), false);
}, { login: true }, ['K13', 'K25']);

add('I25-timeout-one-owner-does-not-stop-another', async f => {
  await f.waitFor(1); await f.clock.advance(25);
  const other = f.mount('other', { inputs: input('B') }); await f.waitFor(2);
  await f.clock.advance(25); await f.settle(1);
  assert.equal(state(f).error.code, 'TIMEOUT'); assert.equal(other.snapshot().status, 'running');
  assert.equal(f.plans[1].signal.aborted, false);
  await data(f, 2, 'independent', 2); assert.equal(other.snapshot().data, 'independent');
}, { httpTimeout: 50 }, ['K11', 'K25']);

add('I26-gate-closes-after-fresh-start', async f => {
  await f.waitFor(1); await data(f, 1, 'previous', 1);
  const waiter = observe(f.query.refresh()); await f.waitFor(2);
  f.query.configure({ executeWhen: false }); await flush();
  assert.equal(waiter.code, 'EXECUTION_BLOCKED'); assert.equal(state(f).stale, true);
  await data(f, 2, 'obsolete-fresh', 2);
  assert.equal(state(f).status, 'waiting'); assert.equal(state(f).waitingReason, 'EXECUTION_BLOCKED');
  assert.equal(state(f).data, 'previous'); assert.equal(f.plans.length, 2);
});

add('I27-login-and-data-share-one-deadline', async f => {
  await f.waitFor(1); await f.clock.advance(30); await f.reply(1); await f.waitFor(2); f.headers(2);
  await f.clock.advance(19); assert.equal(f.plans[0].outcome.status, 'pending');
  await f.clock.advance(1); await f.settle(1);
  assert.equal(state(f).error.code, 'TIMEOUT'); assert.equal(state(f).data, undefined);
  const retry = observe(f.query.retry()); await f.waitFor(3);
  await f.reply(3); await f.waitFor(4); await data(f, 4, 'recovered', 2);
  await f.reply(2, { value: 'late' });
  assert.equal(retry.status, 'fulfilled'); assert.equal(state(f).data, 'recovered');
  assert.deepEqual(f.received.map(r => r.stage), ['login', 'data', 'login', 'data']);
}, { login: true, httpTimeout: 50 }, ['K11', 'K13']);

add('I28-cancel-waiter-after-fresh-start', async f => {
  await f.waitFor(1); await data(f, 1, 'previous', 1);
  const caller = new AbortController(), waiter = observe(f.query.handle(caller.signal).refresh());
  await f.waitFor(2); caller.abort(); await flush();
  assert.equal(waiter.code, 'CANCELLED'); assert.equal(f.plans[1].signal.aborted, false);
  await data(f, 2, 'query-owned-success', 2);
  assert.equal(state(f).data, 'query-owned-success'); assert.equal(f.plans.length, 2);
  assert.equal(waiter.code, 'CANCELLED'); assert.equal(f.query.tickets.size, 0);
});

for (const [name, initial, configure, code] of [
  ['closed-gate', { executeWhen: false }, { executeWhen: true }, 'EXECUTION_BLOCKED'],
  ['unready-input', { ready: false }, { ready: true }, 'INPUT_NOT_READY'],
]) {
  add(`I29-no-network-until-ready/${name}`, async f => {
    await failed(f.query.refresh(), code);
    assert.equal(f.plans.length, 0); assert.equal(f.received.length, 0);
    assert.equal(state(f).waitingReason, code);
    f.query.configure(configure); await f.waitFor(1); await data(f, 1, 'ready', 1);
    assert.equal(state(f).data, 'ready'); assert.equal(f.plans.length, 1);
  }, { query: initial }, ['K03', 'K12']);
}
