import assert from 'node:assert/strict';
import { definitions, leaf, ref, flush, observe, CompositeEngine } from './harness.mjs';
import { joinRows } from './composite-probe.mjs';
import { PollingHost } from '../t2-query-polling/polling-probe.mjs';

export const cases = [];
const add = (id, run, options = {}) => cases.push({ id, run, options });
const state = f => f.host.snapshot();
const pairs = f => f.requests.map(r => [r.request.path, r.inputs.value]);
const completed = f => f.trace.filter(r => r.reason === 'run-success');
async function initial(f) { await flush(); await f.reply(2, ['right-1']); await f.reply(1, ['left-1']); }

add('C01-siblings-start-independently-and-publish-once', async f => {
  await flush(); assert.equal(f.requests.length, 2);
  await f.reply(2, ['right']); assert.equal(state(f).status, 'running'); assert.equal(state(f).data, undefined);
  await f.reply(1, ['left']); assert.deepEqual(state(f).data, { left: ['left'], right: ['right'] });
  assert.equal(completed(f).length, 1); assert.deepEqual(state(f).dataInputs, { a: 1, b: 1 });
});
add('C02-reuse-only-unchanged-child-query', async f => {
  await initial(f); const previous = state(f);
  f.query.configure({ inputs: { a: 2, b: 1 } }); await flush();
  assert.deepEqual(pairs(f), [['/left', 1], ['/right', 1], ['/left', 2]]);
  assert.deepEqual(state(f).data, previous.data); assert.equal(state(f).stale, true);
  assert.deepEqual(state(f).dataInputs, { a: 1, b: 1 });
  await f.reply(3, ['left-2']); assert.deepEqual(state(f).data, { left: ['left-2'], right: ['right-1'] });
  assert.deepEqual(state(f).dataInputs, { a: 2, b: 1 }); assert.equal(state(f).stale, false);
  assert.deepEqual(previous.data, { left: ['left-1'], right: ['right-1'] });
});
add('C03-all-changed-inputs-wait-for-all-new-results', async f => {
  await initial(f); f.query.configure({ inputs: { a: 2, b: 2 } }); await flush();
  await f.reply(3, ['left-2']); assert.deepEqual(state(f).data, { left: ['left-1'], right: ['right-1'] });
  await f.reply(4, ['right-2']); assert.deepEqual(state(f).data, { left: ['left-2'], right: ['right-2'] });
});
add('C04-source-failure-preserves-location-and-old-pair', async f => {
  await initial(f); f.query.configure({ inputs: { a: 2, b: 2 } }); await flush();
  await f.reply(3, ['partial']); await f.reply(4, null, 'HTTP_ERROR');
  assert.equal(state(f).status, 'error'); assert.equal(state(f).error.location, '/spec/sources/right');
  assert.equal(state(f).error.cause.location, '/spec/sources/right/sources/main');
  assert.deepEqual(state(f).data, { left: ['left-1'], right: ['right-1'] });
  assert.deepEqual(state(f).dataInputs, { a: 1, b: 1 }); assert.equal(state(f).stale, true);
  assert.equal(JSON.stringify(state(f)).includes('raw transport'), false);
});
add('C05-fresh-refresh-refetches-unchanged-children', async f => {
  await initial(f); const waiter = observe(f.query.refresh()); await flush();
  assert.equal(f.requests.length, 4); assert.equal(waiter.status, 'pending');
  await f.reply(3, ['left-fresh']); assert.equal(waiter.status, 'pending');
  await f.reply(4, ['right-fresh']); assert.equal(waiter.status, 'fulfilled');
});
add('C06-obsolete-run-cannot-seed-current-cache', async f => {
  await initial(f); f.query.configure({ inputs: { a: 2, b: 1 } }); await flush();
  f.query.configure({ inputs: { a: 3, b: 1 } }); await f.reply(3, ['obsolete']);
  assert.deepEqual(pairs(f).at(-1), ['/left', 3]);
  assert.equal(f.engineTrace.filter(e => e.kind === 'cache-commit').length, 1);
  await f.reply(4, ['left-3']); assert.deepEqual(state(f).data, { left: ['left-3'], right: ['right-1'] });
});
add('C07-failed-partial-run-does-not-commit-cache', async f => {
  await initial(f); f.query.configure({ inputs: { a: 2, b: 2 } }); await flush();
  await f.reply(3, ['partial-left']); await f.reply(4, null, 'HTTP_ERROR');
  f.query.configure({ inputs: { a: 2, b: 3 } }); await flush();
  assert.deepEqual(pairs(f).slice(4), [['/left', 2], ['/right', 3]]);
  await f.reply(5, ['new-left']); await f.reply(6, ['new-right']);
});
add('C08-owner-replacement-and-old-response', async f => {
  await initial(f); f.query.configure({ inputs: { a: 2, b: 1 } }); await flush();
  const next = f.host.mount('search', { inputs: { a: 2, b: 1 } }); await flush();
  assert.equal(f.engine.caches.has(f.query.owner), false, 'Replaced owner cache must be released');
  assert.equal(f.requests.length, 5); await f.reply(3, ['old-owner']);
  assert.equal(next.snapshot().data, undefined);
  await f.reply(5, ['new-right']); await f.reply(4, ['new-left']);
  assert.deepEqual(state(f).data, { left: ['new-left'], right: ['new-right'] });
});
add('C09-first-source-failure-is-not-empty-success', async f => {
  await flush(); await f.reply(1, null, 'TIMEOUT');
  assert.equal(state(f).status, 'error'); assert.equal(state(f).data, undefined);
  assert.equal(state(f).dataInputs, undefined); assert.equal(state(f).stale, false);
  await f.reply(2, ['late']); assert.equal(state(f).status, 'error'); assert.equal(completed(f).length, 0);
});
add('C10-independent-owner-not-blocked', async f => {
  await flush(); const other = f.host.mount('other', { inputs: { a: 9, b: 9 } }); await flush();
  await f.reply(3, ['other-left']); await f.reply(4, ['other-right']);
  assert.equal(other.snapshot().status, 'success'); assert.equal(state(f).status, 'running');
  await f.reply(1, null, 'HTTP_ERROR'); assert.equal(other.snapshot().status, 'success');
});
add('C11-refresh-follows-latest-input-and-forces-fresh-children', async f => {
  await initial(f); f.query.configure({ inputs: { a: 2, b: 1 } }); await flush();
  const waiter = observe(f.query.refresh()); f.query.configure({ inputs: { a: 3, b: 1 } });
  await f.reply(3, ['obsolete']); await flush();
  assert.deepEqual(pairs(f).slice(3), [['/left', 3], ['/right', 1]]);
  await f.reply(4, ['fresh-left']); assert.equal(waiter.status, 'pending');
  await f.reply(5, ['fresh-right']); assert.equal(waiter.status, 'fulfilled');
});
add('C12-polling-starts-after-whole-composite-completes', async f => {
  await flush(); await f.clock.advance(25); await f.reply(1, ['left']);
  await f.clock.advance(100); assert.equal(f.requests.length, 2);
  await f.reply(2, ['right']); await f.clock.advance(19); assert.equal(f.requests.length, 2);
  await f.clock.advance(1); assert.equal(f.requests.length, 4);
  await f.reply(3, ['fresh-left']); await f.clock.advance(100); assert.equal(f.requests.length, 4);
  await f.reply(4, ['fresh-right']); await f.clock.advance(20); assert.equal(f.requests.length, 6);
}, { Host: PollingHost, query: { intervalMs: 20 } });
add('C13-polling-after-composite-failure-waits-full-interval', async f => {
  await initial(f); const waiter = observe(f.query.refresh()); await flush();
  await f.reply(3, null, 'HTTP_ERROR'); assert.equal(waiter.code, 'HTTP_ERROR');
  assert.equal(state(f).stale, true); await f.clock.advance(19); assert.equal(f.requests.length, 4);
  await f.clock.advance(1); assert.equal(f.requests.length, 6);
  await f.reply(4, ['obsolete-partial']); assert.equal(state(f).status, 'running');
  await f.reply(5, ['recovered-left']); await f.reply(6, ['recovered-right']);
  assert.equal(state(f).status, 'success');
}, { Host: PollingHost, query: { intervalMs: 20 } });

for (const [label, value] of [['null', null], ['false', false], ['zero', 0], ['empty', []]]) {
  add(`C14-falsy-child-reuse/${label}`, async f => {
    await flush(); await f.reply(1, ['left']); await f.reply(2, value);
    f.query.configure({ inputs: { a: 2, b: 1 } }); await flush();
    assert.equal(f.requests.length, 3); await f.reply(3, ['next']);
    assert.deepEqual(state(f).data, { left: ['next'], right: value });
  });
}

const concat = definitions();
concat.root.transform = { input: ref('/sources/left'), steps: [{ kind: 'Concat', with: [ref('/sources/right'), [null]] }] };
add('C15-concat-order-duplicates-and-heterogeneous-data', async f => {
  await flush(); await f.reply(2, [1, { name: 'x' }]); await f.reply(1, [1]);
  assert.deepEqual(state(f).data, [1, 1, { name: 'x' }, null]);
}, { queries: concat });
add('C16-transform-error-location-and-no-partial-cache', async f => {
  await flush(); await f.reply(1, [1]); await f.reply(2, { invalid: 'array-required' });
  assert.equal(state(f).status, 'error'); assert.equal(state(f).error.code, 'TYPE_MISMATCH');
  assert.equal(state(f).error.location, '/spec/transform/steps/0');
  assert.equal(state(f).data, undefined); assert.equal(f.engine.caches.size, 0);
}, { queries: concat });

for (const mode of ['left', 'inner', 'right']) {
  const queries = definitions(); queries.root.transform = { input: ref('/sources/left'), steps: [
    { kind: 'Join', mode, right: ref('/sources/right'), on: [{ left: 'id', right: 'id' }] },
  ] };
  add(`C17-join-order-collision-and-unmatched/${mode}`, async f => {
    await flush(); const left = [{ id: 1, l: 'a', collision: 'left' }, { id: 2, l: 'b' }];
    const right = [{ id: 1, r: 'x', collision: 'right' }, { id: 1, r: 'y' }, { id: 3, r: 'z' }];
    await f.reply(2, right); await f.reply(1, left);
    const matched = [{ id: 1, l: 'a', r: 'x', collision: 'right' }, { id: 1, l: 'a', r: 'y', collision: 'left' }];
    assert.deepEqual(state(f).data, mode === 'inner' ? matched : mode === 'left' ? [...matched, { id: 2, l: 'b' }] : [...matched, { id: 3, r: 'z' }]);
    assert.equal(left[0].collision, 'left'); assert.equal(right[0].collision, 'right');
  }, { queries });
}
add('C18-nested-query-inputs-not-implicitly-inherited', async f => {
  await flush(); assert.equal(state(f).status, 'error'); assert.equal(state(f).error.code, 'INPUT_NOT_READY');
  assert.equal(f.requests.length, 1); // Unrelated sibling may start; the missing child's HTTP must not.
  assert.equal(f.requests[0].request.path, '/right');
}, { queries: (() => { const q = definitions(); delete q.root.sources.left.inputs; return q; })() });
add('C19-sibling-source-reference-is-unavailable', async f => {
  await flush(); assert.equal(state(f).status, 'error'); assert.equal(state(f).error.code, 'REFERENCE_NOT_FOUND');
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].request.path, '/right');
}, { queries: (() => { const q = definitions(); q.root.sources.left.inputs.value = ref('/sources/right'); return q; })() });
add('C20-diamond-definition-does-not-share-use-edge', async f => {
  await flush(); assert.equal(f.requests.length, 2); await f.reply(1, ['one']); await f.reply(2, ['two']);
  assert.deepEqual(state(f).data, { left: ['one'], right: ['two'] });
}, { queries: (() => { const q = definitions(); q.root.sources.right.queryRef = 'left'; return q; })() });
add('C21-inline-query-equals-reference', async f => { await initial(f); assert.deepEqual(state(f).data, { left: ['left-1'], right: ['right-1'] }); },
  { queries: (() => { const q = definitions(); q.root.sources.left = { query: leaf('/left'), inputs: { value: ref('/ports/a') } }; return q; })() });
add('C22-source-name-pointer-escape', async f => {
  await flush(); await f.reply(1, ['value']); assert.deepEqual(state(f).data, ['value']);
}, { queries: { root: { sources: { 'a~/b': { query: leaf('/left'), inputs: { value: 1 } } }, transform: { input: ref('/sources/a~0~1b') } } } });

export const staticCases = [
  ['S01-cycle-unused-definition', () => { const q = definitions(); q.unused = { sources: { self: { queryRef: 'unused', inputs: {} } }, transform: { input: null } }; return q; }, 'INVALID_DEFINITION'],
  ['S02-indirect-inline-cycle', () => { const q = definitions(); q.left.sources = { child: { query: { sources: { back: { queryRef: 'root', inputs: {} } }, transform: { input: null } }, inputs: {} } }; return q; }, 'INVALID_DEFINITION'],
  ['S03-unknown-query-reference', () => { const q = definitions(); q.root.sources.left.queryRef = 'absent'; return q; }, 'REFERENCE_NOT_FOUND'],
  ['S04-inline-ref-xor', () => { const q = definitions(); q.root.sources.left.query = leaf('/left'); return q; }, 'INVALID_DEFINITION'],
  ['S05-transform-input-required', () => { const q = definitions(); delete q.root.transform.input; return q; }, 'INVALID_DEFINITION'],
  ['S06-concat-with-required', () => { const q = definitions(); q.root.transform.steps = [{ kind: 'Concat' }]; return q; }, 'INVALID_DEFINITION'],
  ['S07-join-key-required', () => { const q = definitions(); q.root.transform.steps = [{ kind: 'Join', right: [], on: [] }]; return q; }, 'INVALID_DEFINITION'],
].map(([id, build, code]) => ({ id, run() {
  let calls = 0;
  assert.throws(() => new CompositeEngine({ queries: build(), executeHttp: () => { calls++; } }), error => error.code === code);
  assert.equal(calls, 0);
} }));

for (const [label, left, right, expected] of [
  ['strict-types', [{ k: 1 }, { k: '1' }, { k: true }], [{ k: '1', r: 1 }], [{ k: 1 }, { k: '1', r: 1 }, { k: true }]],
  ['null-unmatched', [{ k: null }], [{ k: null, r: 1 }], [{ k: null }]],
  ['own-dot-key', [{ 'a.b': 1 }], [{ 'a.b': 1, r: true }], [{ 'a.b': 1, r: true }]],
]) staticCases.push({ id: `S08-join-key/${label}`, run() {
  const key = label === 'own-dot-key' ? 'a.b' : 'k';
  assert.deepEqual(joinRows(left, right, { on: [{ left: key, right: key }] }), expected);
} });
for (const [label, row, code] of [['missing', {}, 'REFERENCE_NOT_FOUND'], ['object', { k: {} }, 'TYPE_MISMATCH'], ['nan', { k: NaN }, 'TYPE_MISMATCH']]) {
  staticCases.push({ id: `S09-join-invalid-key/${label}`, run() { assert.throws(() => joinRows([row], [{ k: 1 }], { on: [{ left: 'k', right: 'k' }] }), e => e.code === code); } });
}
