import { ApplicationRegistry, ApplicationProbe, createStoreFixture, URLFixture, HostPolicyFixture } from './application-probe.mjs';
import { ControlledTransport, FakeClock, deferred, flush, observe } from '../t2-query-races/harness.mjs';

const path = value => ({ '@path': value });
const component = (id, spec) => ({ kind: 'Component', id, spec });
export const text = (value, id = 'text') => ({ id, componentRef: 'Text', inputs: { text: value } });
export const primitives = () => [component('Text', { ports: { text: { kind: 'Value', schema: { type: ['string', 'number'] } } } }), component('Row', { slots: { default: {} } })];
export const registry = (extra = []) => new ApplicationRegistry([...primitives(), ...extra]);
const state = initial => ({ kind: 'State', schema: { type: 'number' }, initial });
export const staticView = label => ({ states: { count: state(1) }, render: text(label) });
const query = (id = 'q') => ({ kind: 'Query', id, spec: { ports: { term: { kind: 'Value', schema: { type: 'string' }, required: true } }, sources: [] } });
const queryUse = (term = 'x', extra = {}) => ({ queryRef: 'q', inputs: { term }, ...extra });
const row = children => ({ id: 'root', componentRef: 'Row', slots: { default: children } });
export function controlled(extra = [], options = {}) {
  const clock = new FakeClock(), trace = [], transport = new ControlledTransport(clock, trace);
  const runtime = new ApplicationProbe({ registry: registry([query(), ...extra]), transport, ...options }); runtime.clock = clock;
  return { runtime, transport, clock, trace };
}
const equal = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`ASSERT ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const ok = condition => { if (!condition) throw Error('ASSERT'); };
async function reject(run, code) { try { await run(); } catch (error) { if (!code || error.code === code || error.message === code) return; throw Error(`ASSERT expected ${code}, got ${error.code ?? error.message}`); } throw Error(`ASSERT expected rejection ${code}`); }

export async function scenarios(test) {
  await test('C03.lookup-never-falls-back-to-component-or-missing-kind', async () => {
    const r = registry([component('only-component', { render: text('ok') })]);
    for (const id of ['only-component', 'absent']) await reject(() => r.register([{ kind: 'View', id: 'v', spec: { queries: { q: { queryRef: id } }, render: text('x') } }]), 'REFERENCE_NOT_FOUND');
    equal(r.list().map(x => x.id), ['Text', 'Row', 'only-component']);
  });
  await test('C14.fixture-brand-accepts-created-store-rejects-duck-and-unbranded', async () => {
    const store = createStoreFixture(), runtime = new ApplicationProbe({ registry: registry(), stateStore: store });
    equal(runtime.stateStore === store, true);
    await reject(() => new ApplicationProbe({ registry: registry(), stateStore: { scope: () => store.scope(), subscribe: store.subscribe.bind(store) } }), 'STORE_BRAND');
    const { StateProbe } = await import('../t3-state/state-probe.mjs');
    await reject(() => new ApplicationProbe({ registry: registry(), stateStore: new StateProbe() }), 'STORE_BRAND');
  });
  await test('C16.same-id-query-component-resolve-in-expected-kind', async () => {
    const r = registry([query('shared'), component('shared', { render: text('component') })]);
    equal(r.get('Query', 'shared').kind, 'Query'); equal(r.get('Component', 'shared').kind, 'Component');
    const { runtime, transport } = controlled([query('shared'), component('shared', { render: text('component') })]);
    const { view, initial } = await runtime.mount({ view: { queries: { shared: { queryRef: 'shared', inputs: { term: 'q' } } }, render: { id: 'shared', componentRef: 'shared' } } });
    equal(view.snapshot().roots[0].children[0].inputs.text, 'component'); transport.respond(1, ['query']); await initial;
    equal(Object.values(view.snapshot().queries)[0].data, ['query']);
  });
  await test('C17.same-kind-batch-and-code-declarative-duplicates-atomic', async () => {
    const r = registry(), before = r.list();
    await reject(() => r.register([query('dup'), query('dup')]), 'INVALID_DEFINITION'); equal(r.list(), before);
    r.registerCode({ kind: 'Action', id: 'run', spec: {} }, () => undefined);
    await reject(() => r.register([{ kind: 'Action', id: 'run', spec: { steps: [] } }]), 'INVALID_DEFINITION');
    await reject(() => r.registerCode(component('Text', {}), () => undefined), 'INVALID_DEFINITION');
    const reverse = registry([{ kind: 'Action', id: 'run', spec: { steps: [] } }]);
    await reject(() => reverse.registerCode({ kind: 'Action', id: 'run', spec: {} }, () => undefined), 'INVALID_DEFINITION');
    const codeFirst = new ApplicationRegistry(); codeFirst.registerCode(primitives()[0], () => undefined);
    await reject(() => codeFirst.register([component('Text', { render: text('duplicate') })]), 'INVALID_DEFINITION');
    await reject(() => r.registerCode({ kind: 'Action', id: 'run', spec: {} }, () => undefined), 'INVALID_DEFINITION');
  });
  await test('M01.invalid-state-plus-valid-config-and-reverse-zero-partial', async () => {
    const runtime = new ApplicationProbe({ registry: registry() }), { view, initial } = await runtime.mount({ view: staticView('old') }); await initial;
    const handle = view.state('count'), notifications = [], off = view.subscribe(value => notifications.push(value));
    await reject(() => view.update(staticView('new'), { states: { count: 'bad' } }));
    equal(handle.read(), 1); equal(view.exportDefinition().render.inputs.text, 'old'); equal(notifications.length, 1);
    await reject(() => view.update({ ...staticView('bad'), render: { id: 'missing', componentRef: 'Absent' } }, { states: { count: 2 } }), 'REFERENCE_NOT_FOUND');
    equal(handle.read(), 1); equal(view.exportDefinition().render.inputs.text, 'old'); equal(notifications.length, 1); off();
  });
  await test('M01.valid-state-plus-config-one-coherent-projection', async () => {
    const runtime = new ApplicationProbe({ registry: registry() }), { view, initial } = await runtime.mount({ view: staticView('old') }); await initial;
    const seen = [], off = view.subscribe(value => seen.push(value));
    const result = await view.update({ ...staticView('ignored'), render: text(path('/states/count')) }, { states: { count: 7 } }); await result.initial;
    equal(seen.length, 2); equal([seen[1].states.count, seen[1].roots[0].inputs.text], [7, 7]); off();
  });
  await test('M02.commit-survives-query-error-and-reports-data-error', async () => {
    const { runtime, transport } = controlled(); const spec = { ...staticView('new-config'), queries: { data: queryUse() } };
    const { view, initial } = await runtime.mount({ view: spec }); transport.respond(1, null, 'HTTP_ERROR');
    const report = await initial; equal(report.queryErrors.map(x => [x.query, x.error.code]), [['data', 'HTTP_ERROR']]);
    equal(view.exportDefinition(), spec); equal(Object.values(view.snapshot().queries)[0].status, 'error'); equal(view.state('count').read(), 1);
  });
  await test('M02.synchronous-query-callback-error-is-data-error', async () => {
    const runtime = new ApplicationProbe({ registry: registry([query()]), transport: { execute() { throw Object.assign(Error('private service detail'), { code: 'HTTP_ERROR' }); } } });
    const { view, initial } = await runtime.mount({ view: { ...staticView('committed'), queries: { data: queryUse() } } });
    const report = await initial; equal(report.queryErrors[0].error.code, 'HTTP_ERROR'); equal(view.exportDefinition().render.inputs.text, 'committed');
    equal(JSON.stringify(report).includes('private service detail'), false);
  });
  await test('M03.instance-A-only-update-leaves-B-and-common-definition', async () => {
    const r = registry([component('Panel', { render: text('common') })]), runtime = new ApplicationProbe({ registry: r });
    const original = r.export('Component', 'Panel'), spec = { render: row([{ id: 'A', componentRef: 'Panel' }, { id: 'B', componentRef: 'Panel' }]) };
    const { view, initial } = await runtime.mount({ view: spec }); await initial;
    const b = view.snapshot().roots[0].children[1], next = structuredClone(spec);
    next.render.slots.default[0] = { id: 'A', component: { render: text('only-A') } };
    await (await view.update(next)).initial;
    equal(view.snapshot().roots[0].children[1], b); equal(r.export('Component', 'Panel'), original);
  });
  await test('M04.database-and-registry-edits-do-not-auto-follow', async () => {
    const db = component('Panel', { render: text('v1') }), r = registry([db]), runtime = new ApplicationProbe({ registry: r });
    const { view, initial } = await runtime.mount({ view: { render: { id: 'panel', componentRef: 'Panel' } } }); await initial;
    db.spec.render.inputs.text = 'db-v2'; r.edit('Component', 'Panel', { render: text('registry-v2') });
    equal(view.snapshot().roots[0].children[0].inputs.text, 'v1');
    await (await view.update(view.exportDefinition())).initial; equal(view.snapshot().roots[0].children[0].inputs.text, 'v1');
    await (await view.replace({ view: view.exportDefinition() })).initial; equal(view.snapshot().roots[0].children[0].inputs.text, 'registry-v2');
  });
  await test('M05.same-runtime-replace-cleans-owned-url-state-preserves-service', async () => {
    const store = createStoreFixture(), scope = store.scope(), external = scope.register('service', { schema: { type: 'number' }, initial: 9 });
    const url = new URLFixture('https://probe.test/?p.old=1&service=keep&outside=z'); const serviceToken = url.attach(['service']);
    const runtime = new ApplicationProbe({ registry: registry(), stateStore: store, url });
    const { view, initial } = await runtime.mount({ view: staticView('old') }, { urlKeys: ['p.old'], connections: [{ handle: external, schema: { type: 'number' } }] }); await initial;
    const old = view.state('count'), oldLifetime = view.snapshot().lifetime, oldToken = view.live.urlToken;
    await (await view.replace({ view: staticView('new') }, { urlKeys: ['p.new'] })).initial;
    await reject(() => old.read(), 'CANCELLED'); ok(view.snapshot().lifetime !== oldLifetime); equal(view.state('count').read(), 1);
    equal(oldToken.alive, false); equal(new URL(url.href).searchParams.has('p.old'), false); equal(new URL(url.href).searchParams.get('service'), 'keep'); equal(new URL(url.href).searchParams.get('outside'), 'z');
    equal(external.read(), 9); equal(serviceToken.alive, true); view.dispose(); view.dispose(); equal(external.read(), 9); external.write(10); equal(external.read(), 10);
  });
  await test('M06.three-change-targets-export-without-auto-save', async () => {
    let saves = 0; const r = registry([component('Panel', { render: text('original') })]), runtime = new ApplicationProbe({ registry: r });
    const { view, initial } = await runtime.mount({ view: staticView('original') }); await initial;
    await (await view.state('count').write(3)).initial; equal(view.state('count').read(), 3);
    await (await view.update(staticView('changed-current'))).initial; equal(view.exportDefinition().render.inputs.text, 'changed-current');
    r.edit('Component', 'Panel', { render: text('changed-definition') }); equal(r.export('Component', 'Panel').spec.render.inputs.text, 'changed-definition');
    const exported = view.exportDefinition(); exported.render.inputs.text = 'mutated-copy'; equal(view.exportDefinition().render.inputs.text, 'changed-current');
    equal(saves, 0); const explicitSave = () => ++saves; explicitSave(r.export('Component', 'Panel')); equal(saves, 1);
    equal(view.exportDefinition().states.count.initial, 1); // Definition export is not the live State snapshot.
  });
  await test('M07.listing-not-permission-public-owner-input-checks', async () => {
    let calls = 0; const r = registry(); r.registerCode({ kind: 'Action', id: 'public', spec: { ports: { value: { kind: 'Value', schema: { type: 'number' }, required: true } } } }, context => { equal(Object.keys(context).sort(), ['inputs', 'signal']); ++calls; return context.inputs.value; });
    r.registerCode({ kind: 'Action', id: 'hidden', spec: {} }, () => ++calls);
    const runtime = new ApplicationProbe({ registry: r }), { view, initial } = await runtime.mount({ view: staticView('view') }); await initial;
    const policy = new HostPolicyFixture(runtime, ['public']), agent = {}, ui = {}, forged = { permissions: ['invoke', 'change'] };
    equal(policy.list(), ['public']); await reject(() => policy.invoke(agent, view, 'public', { value: 1 }), 'HOST_DENIED');
    policy.grant(agent, ['invoke', 'change']); policy.grant(ui, ['invoke', 'change']);
    await reject(() => policy.invoke(forged, view, 'public', { value: 1 }), 'HOST_DENIED');
    await reject(() => policy.invoke(agent, { alive: true }, 'public', { value: 1 }), 'HOST_DENIED');
    await reject(() => policy.invoke(agent, view, 'hidden'), 'HOST_DENIED'); await reject(() => policy.invoke(agent, view, 'public', { value: 'bad' })); equal(calls, 0);
    equal(await policy.invoke(agent, view, 'public', { value: 4 }), 4); equal(await policy.invoke(ui, view, 'public', { value: 5 }), 5); equal(calls, 2);
    await (await policy.change(agent, view, view.exportDefinition(), { count: 6 })).initial; equal(view.state('count').read(), 6);
    await (await policy.change(ui, view, view.exportDefinition(), { count: 7 })).initial; equal(view.state('count').read(), 7);
    view.dispose(); await reject(() => policy.invoke(agent, view, 'public', { value: 1 }), 'HOST_DENIED');
  });
  await test('N01.inline-business-definitions-static-no-resolver-no-executor', async () => {
    const runtime = new ApplicationProbe({ registry: registry() });
    const spec = { render: { id: 'inline', component: { render: text('static') } } };
    const { view, initial } = await runtime.mount({ view: spec }); equal((await initial).queryErrors, []); equal(view.snapshot().roots[0].children[0].inputs.text, 'static');
    equal(runtime.trace.filter(x => x.kind === 'resolve' || x.kind === 'request').length, 0);
  });
  await test('N02.only-needed-resolver-and-executor-missing-errors', async () => {
    const runtime = new ApplicationProbe({ registry: registry([query()]) });
    await reject(() => runtime.mount({ viewRef: 'missing' }), 'REFERENCE_NOT_FOUND');
    await reject(() => runtime.mount({ view: { ...staticView('query'), queries: { q: queryUse() } } }), 'EXECUTOR_REQUIRED');
    equal(runtime.views.size, 0); equal(runtime.trace.filter(x => x.kind === 'commit').length, 0);
    const resolved = new ApplicationProbe({ registry: registry(), resolver: async (kind, id) => ({ kind, id, spec: staticView('resolved') }) });
    const { view, initial } = await resolved.mount({ viewRef: 'remote' }); await initial; equal(view.exportDefinition().render.inputs.text, 'resolved');
  });
  await test('N02.definition-resolution-allowed-data-query-starts-after-commit', async () => {
    const resolution = deferred(), commitGate = deferred(); let resolutions = 0;
    const { runtime, transport } = controlled([], { resolver: async () => { ++resolutions; return resolution.promise; } });
    const { view, initial } = await runtime.mount({ view: staticView('old') }); await initial;
    const prepared = view.replace({ viewRef: 'remote' }, { beforeCommit: () => commitGate.promise }); await flush();
    equal(resolutions, 1); equal(transport.requests.length, 0); equal(view.exportDefinition().render.inputs.text, 'old');
    resolution.resolve({ kind: 'View', id: 'remote', spec: { ...staticView('new'), queries: { data: queryUse() } } }); await flush();
    equal(transport.requests.length, 0); equal(view.exportDefinition().render.inputs.text, 'old');
    commitGate.resolve(); const committed = await prepared; equal(transport.requests.length, 1); equal(view.exportDefinition().render.inputs.text, 'new');
    transport.respond(1, ['done']); await committed.initial;
  });
  await test('N03.progressive-projection-first-query-before-second-initial', async () => {
    const { runtime, transport } = controlled(), seen = [];
    const { view, initial } = await runtime.mount({ view: { ...staticView('already-ready'), queries: { first: queryUse('one'), second: queryUse('two') } } });
    view.subscribe(value => seen.push(value)); const outcome = observe(initial); equal(seen[0].roots[0].inputs.text, 'already-ready'); equal(outcome.status, 'pending');
    transport.respond(1, ['ready-first']); await flush(); equal(outcome.status, 'pending');
    const projected = Object.values(seen.at(-1).queries); equal(projected.map(x => x.status), ['success', 'running']); equal(projected[0].data, ['ready-first']);
    transport.respond(2, ['ready-second']); await outcome.settled; equal(outcome.status, 'fulfilled'); equal(outcome.value.queryErrors, []);
  });
  await test('N04.query-errors-waiting-input-and-closed-gate-complete', async () => {
    const { runtime, transport } = controlled();
    const spec = { ...staticView('ready'), ports: { external: { kind: 'Value', schema: { type: 'string' } } }, queries: {
      failure: queryUse('fail'), external: queryUse(path('/ports/external')), gated: queryUse('blocked', { executeWhen: false }),
    } };
    const { view, initial } = await runtime.mount({ view: spec }); equal(transport.requests.length, 1); transport.respond(1, null, 'HTTP_ERROR');
    const report = await initial; equal(report.queryErrors.length, 1);
    equal(Object.values(view.snapshot().queries).map(x => [x.status, x.waitingReason]), [['error', null], ['waiting', 'INPUT_NOT_READY'], ['waiting', 'EXECUTION_BLOCKED']]);
    const result = await view.update(spec, { inputs: { external: 'now-ready' } }); equal(transport.requests.length, 2); transport.respond(2, ['ready']); await result.initial;
    equal(Object.values(view.snapshot().queries)[1].data, ['ready']);
  });
  await test('N04.waiting-with-no-executor-does-not-block-initial', async () => {
    const runtime = new ApplicationProbe({ registry: registry([query()]) });
    const { initial } = await runtime.mount({ view: { render: text('ready'), ports: { external: { kind: 'Value', schema: { type: 'string' } } }, queries: { external: queryUse(path('/ports/external')), gate: queryUse('x', { executeWhen: false }) } } });
    equal((await initial).queryErrors, []);
  });
  await test('N05.structural-reference-type-owner-conflicts-preserve-live', async () => {
    const store = createStoreFixture(), external = store.scope().register('selected', { schema: { type: 'number' }, initial: 8 }), url = new URLFixture('https://probe.test/?p.old=1&reserved=2');
    const reserved = url.attach(['reserved']), runtime = new ApplicationProbe({ registry: registry(), stateStore: store, url });
    const { view, initial } = await runtime.mount({ view: staticView('old') }, { urlKeys: ['p.old'], connections: [{ handle: external, schema: { type: 'number' } }] }); await initial;
    const snapshot = view.snapshot(), connection = view.live.urlToken, handle = view.state('count');
    const failures = [
      () => view.replace({ view: { render: [] } }),
      () => view.replace({ view: { render: { id: 'bad', componentRef: 'missing' } } }),
      () => view.update({ ...staticView('bad'), states: { count: { kind: 'State', schema: { type: 'string' }, initial: 'new' } } }),
      () => view.update(staticView('bad'), { connections: [{ handle: external, schema: { type: 'string' } }] }),
      () => view.replace({ view: staticView('bad') }, { urlKeys: ['reserved'] }),
    ];
    for (const run of failures) {
      await reject(run); equal(view.snapshot(), snapshot); equal(handle.read(), 1); equal(external.read(), 8); equal(view.live.urlToken === connection, true); equal(connection.alive, true); equal(url.cleanupCount, 0); equal(reserved.alive, true);
    }
  });
  await test('K23.no-data-query-or-action-during-failed-preparation', async () => {
    let actionCalls = 0; const button = component('Button', { events: { click: { schema: { type: 'object' } } } });
    const { runtime, transport } = controlled([button]); runtime.registry.registerCode({ kind: 'Action', id: 'effect', spec: {} }, () => ++actionCalls);
    const { view, initial } = await runtime.mount({ view: staticView('old') }); await initial;
    const bad = { ...staticView('new'), queries: { q: queryUse() }, render: row([
      { id: 'button', componentRef: 'Button', on: { click: { id: 'effect-call', actionRef: 'effect' } } }, { id: 'bad', componentRef: 'Absent' },
    ]) };
    await reject(() => view.update(bad)); await reject(() => view.replace({ view: bad }));
    const separate = controlled([button, { kind: 'Action', id: 'effect', spec: {} }]); await reject(() => separate.runtime.mount({ view: bad }));
    equal(transport.requests.length, 0); equal(separate.transport.requests.length, 0); equal(view.exportDefinition().render.inputs.text, 'old');
    equal(runtime.trace.filter(x => x.kind === 'action-start').length, 0); equal(actionCalls, 0);
  });
  await test('K23.query-error-report-on-mount-update-and-replace', async () => {
    const { runtime, transport } = controlled(), spec = { ...staticView('query-config'), queries: { data: queryUse() } };
    const mounted = await runtime.mount({ view: spec }); transport.respond(1, null, 'HTTP_ERROR'); equal((await mounted.initial).queryErrors[0].query, 'data');
    const updatedSpec = { ...spec, queries: { data: queryUse('new-input') } };
    const updated = await mounted.view.update(updatedSpec); transport.respond(2, null, 'HTTP_ERROR'); const updateReport = await updated.initial;
    equal(updateReport.queryErrors[0].error.code, 'HTTP_ERROR'); equal(mounted.view.exportDefinition(), updatedSpec);
    const replaced = await mounted.view.replace({ view: spec }); transport.respond(3, null, 'HTTP_ERROR'); const replaceReport = await replaced.initial;
    equal(replaceReport.queryErrors[0].error.code, 'HTTP_ERROR'); equal(mounted.view.exportDefinition(), spec);
    equal([updateReport.generation, replaceReport.generation], [2, 3]);
  });
  await test('K23.update-retains-state-query-replace-new-lifetime-cancels-initial', async () => {
    const { runtime, transport } = controlled(), spec = { ...staticView('old'), queries: { data: queryUse() } };
    const { view, initial } = await runtime.mount({ view: spec }), first = observe(initial), handle = view.state('count'), lifetime = view.snapshot().lifetime;
    const updated = await view.update({ ...spec, render: text('updated') }, { states: { count: 4 } });
    await first.settled; equal(first.code, 'CANCELLED'); equal(transport.requests.length, 1); equal(handle.read(), 4); equal(view.snapshot().lifetime, lifetime);
    transport.respond(1, ['valid']); await updated.initial;
    const replacement = await view.replace({ view: spec }); equal(transport.requests.length, 2); await reject(() => handle.read(), 'CANCELLED');
    equal(view.state('count').read(), 1); ok(view.snapshot().lifetime !== lifetime); transport.respond(2, ['new']); await replacement.initial;
  });
  await test('K23.replace-before-initial-cancels-old-late-response-discarded', async () => {
    const { runtime, transport } = controlled(); const { view, initial } = await runtime.mount({ view: { ...staticView('old'), queries: { q: queryUse() } } });
    const first = observe(initial), replaced = await view.replace({ view: staticView('new') }); await replaced.initial; await first.settled;
    equal(first.code, 'CANCELLED'); transport.respond(1, ['late']); await flush(); equal(view.exportDefinition().render.inputs.text, 'new'); equal(view.snapshot().queries, {});
  });
  await test('K23.failed-candidate-does-not-cancel-old-initial', async () => {
    const { runtime, transport } = controlled(), { view, initial } = await runtime.mount({ view: { ...staticView('old'), queries: { q: queryUse() } } });
    const first = observe(initial); await reject(() => view.replace({ view: { render: { id: 'x', componentRef: 'missing' } } })); equal(first.status, 'pending');
    transport.respond(1, ['old-success']); await first.settled; equal(first.status, 'fulfilled');
  });
  await test('K23.dispose-cancels-initial-and-repeated-dispose-safe', async () => {
    const { runtime } = controlled(), { view, initial } = await runtime.mount({ view: { ...staticView('old'), queries: { q: queryUse() } } });
    const first = observe(initial); view.dispose(); view.dispose(); await first.settled; equal(first.code, 'CANCELLED');
  });
  await test('K23.core-projection-vs-delayed-renderer-ack', async () => {
    const core = new ApplicationProbe({ registry: registry() }), mounted = await core.mount({ view: staticView('core') }); await mounted.initial;
    ok(core.trace.some(x => x.kind === 'core-projection-delivered'));
    const acks = [], rendered = new ApplicationProbe({ registry: registry(), renderer: (snapshot, context) => { const ack = deferred(); acks.push({ snapshot, context, ack }); return ack.promise; } });
    const { initial } = await rendered.mount({ view: staticView('renderer') }), outcome = observe(initial); await flush(); equal(outcome.status, 'pending');
    acks[0].ack.resolve(); await outcome.settled; equal(outcome.status, 'fulfilled');
    const trace = rendered.trace.map(x => x.kind); ok(trace.indexOf('commit') < trace.indexOf('projection')); ok(trace.indexOf('projection') < trace.indexOf('renderer-ack'));
  });
  await test('K23.obsolete-renderer-ack-and-prepared-candidate-do-not-commit', async () => {
    const acks = [], runtime = new ApplicationProbe({ registry: registry(), renderer: (snapshot, context) => { const ack = deferred(); acks.push({ snapshot, context, ack }); return ack.promise; } });
    const { view, initial } = await runtime.mount({ view: staticView('old') }), first = observe(initial);
    const gate = deferred(), obsolete = observe(view.replace({ view: staticView('obsolete') }, { beforeCommit: () => gate.promise })); await flush();
    const next = await view.replace({ view: staticView('new') }), nextOutcome = observe(next.initial); gate.resolve(); await obsolete.settled; equal(obsolete.code, 'CANCELLED');
    await first.settled; equal(first.code, 'CANCELLED'); equal(acks[0].context.isCurrent(), false); acks[0].ack.resolve(); await flush(); equal(nextOutcome.status, 'pending');
    equal(acks.at(-1).context.isCurrent(), true); acks.at(-1).ack.resolve(); await nextOutcome.settled; equal(nextOutcome.status, 'fulfilled'); equal(view.exportDefinition().render.inputs.text, 'new');
  });
  await test('REG.unused-registration-does-not-run-query-or-action', async () => {
    const { runtime, transport } = controlled([component('Unused', { queries: { q: queryUse() }, render: text('unused') }), { kind: 'Action', id: 'unused-action', spec: { steps: [{ kind: 'Query', queryRef: 'q', inputs: { term: 'unused' } }] } }]);
    let calls = 0; runtime.registry.registerCode({ kind: 'Action', id: 'unused-code-action', spec: {} }, () => ++calls);
    equal(transport.requests.length, 0); const { initial } = await runtime.mount({ view: staticView('only-used') }); await initial; equal(transport.requests.length, 0); equal(calls, 0);
  });
}
