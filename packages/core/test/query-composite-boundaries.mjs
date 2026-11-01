import { check as assert } from './query-fixtures.mjs';
import { cases, staticCases } from './query-composite-cases.mjs';
import { definitions, leaf, ref, flush, observe, CompositeEngine } from './query-composite-fixtures.mjs';
import { PollingHost } from './query-fixtures.mjs';

const add = (id, run, options = {}) => cases.push({ id, run, options });
add('C31-first-failure-aborts-siblings-and-ignores-late-rejection', async f => {
  await flush(); await f.reply(1, null, 'HTTP_ERROR');
  assert.equal(f.query.snapshot().error.location, '/spec/sources/left');
  assert.equal(f.requests[1].signal.aborted, true);
  const failed = f.query.snapshot(); await f.reply(2, null, 'TIMEOUT');
  assert.strictEqual(f.query.snapshot(), failed);
});
add('C32-timeout-resume-does-not-accept-late-partial-success', async f => {
  await flush(); f.query.configure({ autoRefreshWhen: true });
  await f.reply(1, ['partial']); await f.clock.advance(50);
  assert.equal(f.requests.length, 4); assert.equal(f.query.snapshot().data, undefined);
  await f.reply(2, ['obsolete']); assert.equal(f.query.snapshot().data, undefined);
  assert.equal(f.query.pending, null); await f.reply(3, ['fresh-left']); await f.reply(4, ['fresh-right']);
  assert.deepEqual(f.query.snapshot().data, { left: ['fresh-left'], right: ['fresh-right'] });
  await f.clock.advance(99); assert.equal(f.requests.length, 4);
  await f.clock.advance(1); assert.equal(f.requests.length, 6);
}, { Host: PollingHost, query: { intervalMs: 100, timeoutMs: 50, autoRefreshWhen: false } });
add('C33-cancelled-fresh-waiter-does-not-cancel-composite', async f => {
  await flush(); await f.reply(1, ['left']); await f.reply(2, ['right']);
  const caller = new AbortController(), waiter = observe(f.query.refresh(caller.signal)); await flush();
  caller.abort(); await flush(); assert.equal(waiter.code, 'CANCELLED');
  assert.equal(f.requests[2].signal.aborted, false); assert.equal(f.requests[3].signal.aborted, false);
  await f.reply(3, ['new-left']); await f.reply(4, ['new-right']);
  assert.deepEqual(f.query.snapshot().data, { left: ['new-left'], right: ['new-right'] });
});
add('C34-deep-child-reuse-and-fresh-propagation', async f => {
  await flush(); await f.reply(1, ['left']); await f.reply(2, ['right']);
  f.query.configure({ inputs: { a: 2, b: 1 } }); await flush();
  assert.equal(f.requests.length, 3); assert.equal(f.requests[2].request.path, '/left');
  await f.reply(3, ['next-left']);
  assert.deepEqual(f.query.snapshot().data, { left: ['next-left'], right: ['right'] });
  const fresh = observe(f.query.refresh()); await flush(); assert.equal(f.requests.length, 5);
  await f.reply(4, ['fresh-left']); await f.reply(5, ['fresh-right']); assert.equal(fresh.status, 'fulfilled');
}, { queries: (() => {
  const q = definitions(); q.group = { ...q.root, ports: { a: { required: true }, b: { required: true } } };
  q.root = { sources: { group: { queryRef: 'group', inputs: ref('/ports') } }, transform: { input: ref('/sources/group') } };
  return q;
})() });
add('C35-response-expression-shaped-data-is-not-evaluated', async f => {
  await flush(); const data = { '@path': '/ports/private', '@call': 'unexpected', nested: { '@@value': 1 } };
  await f.reply(1, data); await f.reply(2, ['right']);
  assert.deepEqual(f.query.snapshot().data.left, data);
});
add('C36-special-source-names-remain-own-data', async f => {
  await flush(); await f.reply(1, ['safe']); assert.deepEqual(f.query.snapshot().data, ['safe']);
}, { queries: JSON.parse(JSON.stringify({ root: { sources: Object.fromEntries([['__proto__', {
  query: leaf('/special'), inputs: { value: 1 },
}]]), transform: { input: ref('/sources/__proto__') } } })) });

for (const [label, build] of [
  ['null-steps', () => { const q = definitions(); q.root.transform.steps = null; return q; }],
  ['null-join-mode', () => { const q = definitions(); q.root.transform.steps = [{ kind: 'Join', mode: null, right: [], on: [{ left: 'id', right: 'id' }] }]; return q; }],
  ['null-child-inputs', () => { const q = definitions(); q.left.ports = {}; q.left.sources = {}; q.left.transform.input = null; q.root.sources.left.inputs = null; return q; }],
]) staticCases.push({ id: `S12-explicit-null-is-not-omission/${label}`, run() {
  assert.throws(() => new CompositeEngine({ queries: build(), executeHttp: () => assert.fail('No request during registration') }), e => e.code === 'INVALID_DEFINITION');
} });

staticCases.push({ id: 'S13-escaped-input-name-satisfies-required-port', async run() {
  const queries = { child: { ports: { '@name': { required: true } }, sources: {}, transform: { input: ref('/ports/@name') } },
    root: { sources: { child: { queryRef: 'child', inputs: { '@@name': 'value' } } }, transform: { input: ref('/sources/child') } } };
  const engine = new CompositeEngine({ queries, executeHttp: () => assert.fail('No HTTP') });
  assert.equal(await engine.execute('root', {}), 'value');
} });
staticCases.push({ id: 'S14-concat-many-arrays-does-not-use-call-argument-limit', async run() {
  const count = 150_000;
  const engine = new CompositeEngine({ queries: { root: { sources: {}, transform: {
    input: [-1], steps: [{ kind: 'Concat', with: Array.from({ length: count }, (_, i) => [i]) }],
  } } }, executeHttp: () => assert.fail('No HTTP') });
  const output = await engine.execute('root', {});
  assert.equal(output.length, count + 1); assert.equal(output[0], -1);
  assert.ok(output.slice(1).every((value, index) => value === index));
} });
staticCases.push({ id: 'S15-sequential-transforms-preserve-original-sources', async run() {
  const base = [{ id: 1, side: 'left' }], right = [{ id: 1, side: 'right' }];
  const original = structuredClone({ base, right });
  const engine = new CompositeEngine({ queries: { root: { sources: {}, transform: { input: ref('/ports/base'), steps: [
    { kind: 'Join', right: ref('/ports/right'), on: [{ left: 'id', right: 'id' }] },
    { kind: 'Concat', with: [ref('/ports/base'), []] },
  ] } } }, executeHttp: () => assert.fail('No HTTP') });
  assert.deepEqual(await engine.execute('root', { base, right }), [{ id: 1, side: 'right' }, { id: 1, side: 'left' }]);
  assert.deepEqual({ base, right }, original);
} });
staticCases.push({ id: 'S16-preaborted-call-starts-no-http', async run() {
  const engine = new CompositeEngine({ queries: definitions(), executeHttp: () => assert.fail('No HTTP') });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(engine.execute('root', { a: 1, b: 1 }, { signal: controller.signal }), e => e.code === 'CANCELLED');
} });
staticCases.push({ id: 'S17-definition-and-input-mutation-do-not-change-execution', async run() {
  const queries = { root: { sources: {}, transform: { input: ref('/ports/value') } } }, inputs = { value: { nested: [1] } };
  const engine = new CompositeEngine({ queries, executeHttp: () => assert.fail('No HTTP') });
  const result = engine.execute('root', inputs); queries.root.transform.input = null; inputs.value.nested.push(2);
  const output = await result; assert.deepEqual(output, { nested: [1] });
  assert.ok(Object.isFrozen(output)); assert.ok(Object.isFrozen(output.nested));
} });
