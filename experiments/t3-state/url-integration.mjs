import assert from 'node:assert/strict';
import { StateProbe, keyOf } from './state-probe.mjs';
import { compileSchema } from '../t1-values/schema-runtime.mjs';
import { CommitQueue, UrlProbeHost } from '../t2-url-races/url-probe.mjs';
import { memoryEndpoint } from '../t2-url-races/endpoints.mjs';
import { ProbeHost } from '../t2-query-races/query-probe.mjs';
import { FakeClock, ControlledTransport, flush } from '../t2-query-races/harness.mjs';
import { harness, report } from '../verification/report.mjs';
import { localDate } from '../t1-cel-patch/calendar.mjs';
const { test, results } = harness(), integer = { type: 'integer' }, string = { type: 'string' }, date = { 'x-viewstem-type': 'date' };
const link = values => '/view?' + new URLSearchParams(Object.entries(values).map(([key, value]) => [`p.${key}`, JSON.stringify(value)]));
function setup(url) {
  const endpoint = memoryEndpoint(url), queue = new CommitQueue(endpoint), urls = new UrlProbeHost(queue, { compileSchema }), store = new StateProbe(), scope = store.scope();
  return { endpoint, queue, urls, store, scope };
}
// A private bridge for ready initial values: existing URL codec/queue and State
// transaction model are used without changing either public experiment surface.
function bindReady(f, targets, types, storeId = 'shared') {
  const bindings = Object.entries(targets).map(([name, target]) => {
    const snapshot = target.snapshot(); assert.equal(snapshot.status, 'ready');
    return { name, type: types[name], baseline: snapshot.value, schema: f.store.contract(target).schema };
  });
  const connection = f.urls.connect(storeId, bindings), jobs = [], diagnostics = [];
  let restoring = false;
  const restore = () => {
    restoring = true;
    try { f.store.batch(Object.entries(targets).map(([name, target]) => [target, connection.values[name]]), { origin: 'url' }); }
    finally { restoring = false; }
  };
  restore();
  const unlisten = f.endpoint.subscribe(restore);
  const unsubscribe = f.store.subscribe(Object.values(targets).map(target => target.address), payload => {
    if (restoring || !payload.changes.length) return;
    const changed = new Set(payload.changes.map(change => keyOf(change.target)));
    const values = Object.fromEntries(Object.entries(targets).filter(([, target]) => changed.has(keyOf(target.address))).map(([name, target]) => [name, payload.values[keyOf(target.address)]]));
    try { jobs.push(connection.write(values)); } catch (error) { diagnostics.push(error.code); }
  });
  return { connection, jobs, diagnostics, dispose() { unsubscribe(); unlisten(); connection.dispose(); } };
}

await test('L02-C11-K18/initial-url-settlement-before-first-query-and-no-reaction', async () => {
  const f = setup(link({ org: 2, selected: 8 })); let resolveInitial;
  const org = f.scope.register('org', { schema: integer, pendingInitial: new Promise(resolve => { resolveInitial = resolve; }) });
  const selected = f.scope.register('selected', { schema: integer, initial: 7 }); f.store.reaction(f.scope, { watch: [org], target: selected, value: 0 });
  const clock = new FakeClock(), trace = [], transport = new ControlledTransport(clock, trace), queries = new ProbeHost(clock, transport, trace);
  const ready = new Promise(resolve => { let stop; stop = f.store.subscribe(org.address, payload => { if (payload.states[keyOf(org.address)]?.status === 'ready') { stop?.(); resolve(); } }); });
  assert.equal(transport.requests.length, 0); resolveInitial(1); await ready; assert.equal(selected.read(), 7);
  const binding = bindReady(f, { org, selected }, { org: 'number', selected: 'number' });
  assert.equal(org.read(), 2); assert.equal(selected.read(), 8); assert.equal(binding.jobs.length, 0); assert.equal(f.queue.jobs.length, 0);
  const query = queries.mount('query', { inputs: { org: org.read(), selected: selected.read() } });
  const stop = f.store.subscribe([org.address, selected.address], payload => query.configure({ inputs: { org: payload.values[keyOf(org.address)], selected: payload.values[keyOf(selected.address)] } }));
  assert.equal(transport.requests.length, 1); assert.deepEqual(transport.requests[0].inputs, { org: 2, selected: 8 });
  transport.respond(1, 'ready'); await flush(); org.write(3); await flush(); assert.equal(selected.read(), 0); assert.deepEqual(transport.requests[1].inputs, { org: 3, selected: 0 }); assert.equal(f.queue.jobs.length, 1);
  await f.queue.release(1); await binding.jobs[0]; transport.respond(2, 'next'); await flush();
  const before = f.queue.jobs.length; f.endpoint.navigate(link({ org: 4, selected: 9 })); await flush();
  assert.equal(selected.read(), 9); assert.equal(f.queue.jobs.length, before); assert.deepEqual(transport.requests[2].inputs, { org: 4, selected: 9 });
  stop(); query.dispose(); binding.dispose(); f.scope.dispose(); f.endpoint.dispose();
});
await test('L01/same-url-restores-baseline-from-different-previous-states', async () => {
  const f = setup('/view'), a = f.scope.register('a', { schema: integer, initial: 1 }), b = f.scope.register('b', { schema: string, initial: 'baseline' });
  const binding = bindReady(f, { a, b }, { a: 'number', b: 'string' });
  for (const [x, y] of [[7, 'first'], [9, 'second']]) {
    f.store.batch([[a, x], [b, y]]); const pending = f.queue.jobs.at(-1).id;
    f.endpoint.navigate(link({ a: 'wrong' })); assert.equal(a.read(), 1); assert.equal(b.read(), 'baseline');
    await f.queue.release(pending); await binding.jobs.at(-1); assert.equal(f.endpoint.read().includes('wrong'), true);
  }
  assert.equal(binding.connection.diagnostics.filter(item => item.kind === 'restore').length, 2);
  binding.dispose(); const missing = f.urls.connect('missing', [{ name: 'none', type: 'string' }]); assert.equal(missing.values.none, undefined);
  f.endpoint.navigate(link({ none: 12 })); assert.equal(missing.values.none, undefined); assert.notEqual(missing.values.none, null); missing.dispose(); f.endpoint.dispose();
});
await test('L11-L13/date-initial-stays-fixed-when-url-only-changes-zone', () => {
  const f = setup(link({ zone: 'America/Los_Angeles' })); let initialCalls = 0;
  const initial = () => { initialCalls++; return localDate(BigInt(Date.parse('2026-10-14T00:30:00Z')), 'Asia/Seoul'); };
  const day = f.scope.register('day', { schema: date, initial: initial() }), zone = f.scope.register('zone', { schema: string, initial: 'Asia/Seoul' });
  const binding = bindReady(f, { day, zone }, { day: 'string', zone: 'string' });
  assert.equal(day.read(), '2026-10-14'); assert.equal(zone.read(), 'America/Los_Angeles'); assert.equal(initialCalls, 1);
  assert.equal(f.queue.jobs.length, 0); assert.equal(f.endpoint.commits.length, 0); assert.equal(new URL(f.endpoint.read()).searchParams.has('p.day'), false);
  f.endpoint.navigate(link({ day: '2026-10-13', zone: 'America/Los_Angeles' })); assert.equal(day.read(), '2026-10-13'); assert.equal(initialCalls, 1); assert.equal(f.queue.jobs.length, 0);
  f.endpoint.navigate('/view'); assert.equal(day.read(), '2026-10-14'); assert.equal(zone.read(), 'Asia/Seoul'); assert.equal(initialCalls, 1); assert.equal(f.queue.jobs.length, 0); binding.dispose(); f.endpoint.dispose();
});
await test('L12/explicit-baseline-date-remains-in-share-link', async () => {
  const first = setup(link({ day: '2026-10-13' })), day = first.scope.register('day', { schema: date, initial: '2026-10-14' }), binding = bindReady(first, { day }, { day: 'string' });
  assert.equal(day.read(), '2026-10-13'); day.write('2026-10-14'); await first.queue.release(1); await binding.jobs[0];
  const shared = first.endpoint.read(); assert.equal(JSON.parse(new URL(shared).searchParams.get('p.day')), '2026-10-14');
  const second = setup(shared), otherDay = second.scope.register('day', { schema: date, initial: '2026-10-15' }), other = bindReady(second, { day: otherDay }, { day: 'string' });
  assert.equal(otherDay.read(), '2026-10-14'); assert.equal(second.queue.jobs.length, 0); assert.equal(second.endpoint.commits.length, 0);
  binding.dispose(); other.dispose(); first.endpoint.dispose(); second.endpoint.dispose();
});
await test('L03/all-supported-types-null-and-rejected-configurations', async () => {
  for (const [type, baseline] of [['string', ''], ['number', 0], ['boolean', false], ['array:string', ['a', 'a']], ['array:number', [0, -2]], ['set:string', new Set(['x'])], ['set:number', new Set([0, 1.5])]]) {
    const f = setup('/view'), connection = f.urls.connect('x', [{ name: 'x', type, baseline, nullable: true }]);
    const pending = connection.write({ x: baseline }); await f.queue.release(1); await pending; connection.dispose();
    const restored = f.urls.connect('x', [{ name: 'x', type, nullable: true }]); assert.deepEqual(restored.values.x, baseline);
    const nullable = restored.write({ x: null }); await f.queue.release(2); await nullable; restored.dispose();
    const again = f.urls.connect('x', [{ name: 'x', type, baseline, nullable: true }]); assert.equal(again.values.x, null); again.dispose(); f.endpoint.dispose();
  }
  for (const type of ['object', 'map', 'set:object', 'array:boolean', 'set:boolean', 'array:array', 'set:array']) {
    const f = setup('/view'); assert.throws(() => f.urls.connect('x', [{ name: 'x', type }]), error => error.code === 'UNSUPPORTED_BINDING'); assert.equal(f.endpoint.listeners.size, 0); f.endpoint.dispose();
  }
});
await test('L10/shared-service-url-connection-survives-consumer-dispose', async () => {
  const f = setup('/view'), service = f.scope, viewA = f.store.scope(), viewB = f.store.scope(), shared = service.register('selected', { schema: integer, initial: 1 });
  const binding = bindReady(f, { selected: shared }, { selected: 'number' });
  assert.throws(() => f.urls.connect('shared', [{ name: 'local', type: 'string' }]), error => error.code === 'DUPLICATE_CONNECTION');
  viewA.register('local', { schema: integer, initial: 0 }); viewB.register('local', { schema: integer, initial: 0 }); viewA.dispose();
  assert.equal(binding.connection.alive, true); assert.equal(f.urls.stores.size, 1); assert.equal(shared.read(), 1);
  shared.write(2); await f.queue.release(1); await binding.jobs[0]; assert.equal(JSON.parse(new URL(f.endpoint.read()).searchParams.get('p.selected')), 2);
  viewB.dispose(); assert.equal(binding.connection.alive, true); binding.dispose(); service.dispose(); assert.equal(f.endpoint.listeners.size, 0); f.endpoint.dispose();
});
await report({ base: import.meta.url, name: process.argv[2] ?? 'url-integration-node24.json', scope: 'Independent ready-State/URL/Query ordering integration, memory URL endpoint with existing codec; real History is covered by separate URL suite', results,
  sources: ['url-integration.mjs', 'state-probe.mjs', 'immutable.mjs', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package-lock.json', '../t1-cel-patch/calendar.mjs', '../t2-url-races/url-probe.mjs', '../t2-url-races/endpoints.mjs', '../t2-query-races/query-probe.mjs', '../t2-query-races/harness.mjs', '../verification/errors.mjs', '../verification/report.mjs'] });
