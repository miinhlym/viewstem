import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBrowserHarness } from './browser-harness.mjs';

let harness;
before(async () => { harness = await startBrowserHarness(); });
after(async () => { await harness?.close(); });
async function browserTest(t, run) {
  const { page, errors } = await harness.page();
  t.after(async () => {
    try {
      await page.evaluate(async () => { if (window.e) { await e.renderer.dispose(); e.runtime.dispose(); } });
      assert.deepEqual(errors, [], 'no browser or console errors');
      assert.deepEqual(await page.evaluate(() => window.unhandled), [], 'no unhandled browser rejections');
    } finally { await page.close(); }
  });
  await run(page);
}

test('public renderer handles use the selected names without compatibility aliases', t => browserTest(t, async page => {
  const result = await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    const spec = { states: { value: F.state('new names') }, render: F.probe('value', F.p('/states/value')) };
    const owned = await e.renderer.mount({ target: e.target, view: spec }); await owned.initialComplete;
    const updated = await owned.update(spec); await updated.initialComplete;
    const replaced = await owned.replace({ view: spec }); await replaced.initialComplete;
    const external = await e.runtime.createView({ view: spec }); await external.initialComplete;
    const attachment = e.renderer.attach(external.view, F.target('borrowed')); await attachment.whenRendered();
    const host = F.mount(F.ViewstemView, { target: F.target('hosted'), props: { renderer: e.renderer, view: external.view }, transformError: F.transformError });
    await host.whenRendered();
    const result = {
      owned: Object.keys(owned).sort(), attachment: Object.keys(attachment).sort(),
      update: Object.keys(updated), replace: Object.keys(replaced),
      component: [typeof host.whenRendered, 'settled' in host],
      legacy: ['mount' in e.runtime, 'registerComponent' in e.registry, 'snapshot' in external.view, 'initial' in external, 'settled' in owned],
      exported: e.runtime.exportResource('Component', 'Probe').id,
      text: e.target.querySelector('[data-value]').textContent,
    };
    await F.unmount(host); await attachment.dispose();
    return result;
  });
  assert.deepEqual(result.owned, ['view', 'initialComplete', 'update', 'replace', 'whenRendered', 'dispose'].sort());
  assert.deepEqual(result.attachment, ['view', 'whenRendered', 'dispose'].sort());
  assert.deepEqual(result.update, ['initialComplete']); assert.deepEqual(result.replace, ['initialComplete']);
  assert.deepEqual(result.component, ['function', false]); assert.deepEqual(result.legacy, [false, false, false, false, false]);
  assert.equal(result.exported, 'Probe'); assert.equal(result.text, 'new names');
}));

test('default renderers own independent runtimes and expose their empty registries', t => browserTest(t, async page => {
  const result = await page.evaluate(async () => {
    const F = Fixture, first = F.createRenderer(), second = F.createRenderer({});
    const empty = [first.registry.list().length, second.registry.list().length];
    first.registry.registerComponentContract(F.resource('Component', 'Probe', { ports: { value: F.port() } }));
    first.registerComponent('Probe', F.Probe);
    const target = F.target();
    const rendered = await first.mount({ target, view: { states: { value: F.state('single import') }, render: F.probe('value', F.p('/states/value')) } });
    await rendered.initialComplete;
    const value = target.querySelector('[data-value]').textContent;
    const state = rendered.view.getState('value');
    const registryIdentity = first.registry === first.runtime.registry;
    await first.dispose();
    const cancelled = await F.errorOf(() => first.runtime.createView({ view: { render: F.probe('late', 'late') } }));
    const expired = await F.errorOf(() => state.write('late'));
    const survivor = second.runtime.stateStore.createScope().registerState('value', { schema: true, initial: 1 });
    const isolated = second.registry.list().length === 0 && survivor.read() === 1;
    const sameDisposal = first.dispose() === first.dispose();
    await second.dispose();
    return { empty, value, registryIdentity, cancelled, expired, isolated, sameDisposal, dom: target.textContent };
  });
  assert.deepEqual(result.empty, [0, 0]);
  assert.equal(result.value, 'single import');
  assert.equal(result.registryIdentity, true);
  assert.equal(result.cancelled.code, 'CANCELLED');
  // Core removes the State's scope on disposal; stale handles no longer resolve.
  assert.equal(result.expired.code, 'REFERENCE_NOT_FOUND');
  assert.equal(result.isolated, true);
  assert.equal(result.sameDisposal, true);
  assert.equal(result.dom, '');
}));

test('owned runtime disposal cancels direct View Query and Action execution with reentrant abort cleanup', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture;
    const requests = [];
    const renderer = F.createRenderer({ requestExecutor: (plan, { signal }) => new Promise(resolve => requests.push({ plan, signal, resolve })) });
    window.e = { renderer, runtime: renderer.runtime, requests, target: F.target() };
    renderer.registry.registerComponentContract(F.resource('Component', 'Probe', { ports: { value: F.port() } }));
    renderer.registerComponent('Probe', F.Probe);
    renderer.registry.registerAction(F.resource('Action', 'wait', {}), ({ signal }) => new Promise(resolve => {
      e.actionSignal = signal; e.finishAction = resolve;
      signal.addEventListener('abort', () => { e.reentrantDisposal = renderer.dispose(); });
    }));
    const mounted = await renderer.runtime.createView({ view: {
      queries: { response: { query: { sources: { response: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/owned' } } }, transform: { input: F.p('/sources/response') } } } },
      render: F.probe('value', F.p('/queries/response/data')),
    } });
    e.initialOutcome = F.errorOf(() => mounted.initialComplete);
    e.attachment = renderer.attach(mounted.view, e.target);
    e.actionOutcome = F.errorOf(() => renderer.runtime.invokeAction({ owner: mounted.view, actionRef: 'wait' }));
  });
  await page.waitForFunction(() => e.requests.length === 1 && e.actionSignal);
  const result = await page.evaluate(async () => {
    e.disposal = e.renderer.dispose();
    const immediate = [e.requests[0].signal.aborted, e.actionSignal.aborted, e.reentrantDisposal === e.disposal];
    e.requests[0].resolve({ status: 200, headers: {}, body: 'late response' }); e.finishAction();
    await e.disposal;
    return { immediate, initialComplete: await e.initialOutcome, action: await e.actionOutcome, dom: e.target.textContent, path: e.requests[0].plan.request.path };
  });
  assert.deepEqual(result.immediate, [true, true, true]);
  assert.equal(result.initialComplete.code, 'CANCELLED');
  assert.equal(result.action.code, 'CANCELLED');
  assert.equal(result.path, '/owned');
  assert.equal(result.dom, '');
}));

test('owned runtime preserves supplied Store and independently owned Views attached to its renderer', t => browserTest(t, async page => {
  const result = await page.evaluate(async () => {
    const F = Fixture, store = F.createStateStore();
    const external = store.createScope().registerState('external', { schema: true, initial: 1 });
    const other = F.environment();
    const mounted = await other.runtime.createView({ view: { states: { value: F.state('external View') }, render: F.probe('value', F.p('/states/value')) } }); await mounted.initialComplete;
    const renderer = F.createRenderer({ stateStore: store, registry: other.registry });
    renderer.registerComponent('Probe', F.Probe);
    const attachment = renderer.attach(mounted.view, other.target); await attachment.whenRendered();
    await renderer.dispose();
    external.write(2); mounted.view.getState('value').write('still alive');
    const result = { external: external.read(), view: mounted.view.getState('value').read(), cancelled: await F.errorOf(() => renderer.runtime.createView({ view: { render: F.probe('late', 'late') } })), dom: other.target.textContent };
    await other.renderer.dispose(); other.runtime.dispose(); store.dispose();
    return result;
  });
  assert.equal(result.external, 2);
  assert.equal(result.view, 'still alive');
  assert.equal(result.cancelled.code, 'CANCELLED');
  assert.equal(result.dom, '');
}));

test('owned runtime disposal waits for a delayed resolver then releases the target without mounting', t => browserTest(t, async page => {
  await page.evaluate(() => {
    const F = Fixture;
    const renderer = F.createRenderer({ resourceResolver: () => new Promise(resolve => e.resolveResource = resolve) });
    window.e = { renderer, runtime: renderer.runtime, target: F.target() };
    renderer.registry.registerComponentContract(F.resource('Component', 'Probe', { ports: { value: F.port() } })); renderer.registerComponent('Probe', F.Probe);
    e.outcome = F.errorOf(() => renderer.mount({ target: e.target, viewRef: 'Delayed' }));
  });
  await page.waitForFunction(() => typeof e.resolveResource === 'function');
  await page.evaluate(() => { e.finished = false; e.disposal = e.renderer.dispose().then(() => { e.finished = true; }); });
  assert.equal(await page.evaluate(() => e.finished), false);
  const result = await page.evaluate(async () => {
    const F = Fixture;
    const cancelled = await F.errorOf(() => e.runtime.createView({ view: { render: F.probe('late', 'late') } }));
    e.resolveResource(F.resource('View', 'Delayed', { render: F.probe('delayed', 'must not render') }));
    const outcome = await e.outcome; await e.disposal;
    const empty = e.target.textContent;
    const next = F.createRenderer({ registry: e.renderer.registry }); next.registerComponent('Probe', F.Probe);
    const handle = await next.mount({ target: e.target, view: { render: F.probe('next', 'target released') } }); await handle.initialComplete;
    const text = e.target.querySelector('[data-value]').textContent; await next.dispose();
    return { cancelled, outcome, empty, text };
  });
  assert.equal(result.cancelled.code, 'CANCELLED');
  assert.equal(result.outcome.code, 'CANCELLED');
  assert.equal(result.empty, '');
  assert.equal(result.text, 'target released');
}));

test('runtime injection rejects conflicting creation options without changing the injected runtime', t => browserTest(t, async page => {
  const result = await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    const registry = await F.errorOf(() => F.createRenderer({ runtime: e.runtime, registry: F.createRegistry() }));
    const executor = await F.errorOf(() => F.createRenderer({ runtime: e.runtime, requestExecutor: () => { throw new Error('must not execute'); } }));
    const mounted = await e.runtime.createView({ view: { render: F.probe('ok', 'unchanged') } }); await mounted.initialComplete;
    const value = mounted.view.getSnapshot().roots[0].inputs.value; mounted.view.dispose();
    return { registry, executor, value };
  });
  assert.equal(result.registry.code, 'INVALID_DEFINITION');
  assert.equal(result.executor.code, 'INVALID_DEFINITION');
  assert.equal(result.value, 'unchanged');
}));

test('consumer has no implicit adapters or resources; adapter registration is explicit and validated', t => browserTest(t, async page => {
  const result = await page.evaluate(async () => {
    const F = Fixture;
    const registry = F.createRegistry(), runtime = F.createRuntime({ registry });
    const renderer = F.createRenderer({ runtime });
    const empty = runtime.listResources().length;
    const unknown = await F.errorOf(() => renderer.registerComponent('Chart', F.Probe));
    registry.registerComponentContract(F.resource('Component', 'Probe', { ports: { value: F.port() } }));
    renderer.registerComponent('Probe', F.Probe);
    const duplicate = await F.errorOf(() => renderer.registerComponent('Probe', F.Probe));
    registry.registerResources([F.resource('Component', 'Declarative', { render: F.probe('inside', 'expanded') })]);
    const declarative = await F.errorOf(() => renderer.registerComponent('Declarative', F.Probe));
    const target = F.target();
    const invalidMount = await F.errorOf(() => renderer.mount({ target, viewRef: 'missing-view' }));
    const rendering = await renderer.mount({ target, view: { render: { id: 'outer', componentRef: 'Declarative' } } });
    await rendering.initialComplete;
    const text = target.querySelector('[data-value]')?.textContent;
    await renderer.dispose(); runtime.dispose();
    return { empty, unknown, duplicate, declarative, invalidMount, text };
  });
  assert.equal(result.empty, 0);
  assert.ok(result.unknown?.code);
  assert.ok(result.duplicate?.code);
  assert.ok(result.declarative?.code);
  assert.equal(result.invalidMount.code, 'REFERENCE_NOT_FOUND');
  assert.equal(result.text, 'expanded');
}));

test('renderer batch registration keeps contracts and adapters atomic', t => browserTest(t, async page => {
  const result = await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    const { registry, renderer } = e;
    const entry = id => ({ contract: F.resource('Component', id, { ports: { value: F.port() } }), component: F.Probe });
    registry.registerComponentContract(entry('ContractOnly').contract);
    const rejected = [];
    for (const later of [
      entry('Probe'),
      entry('ContractOnly'),
      entry('New'),
      { ...entry('InvalidAdapter'), component: {} },
      { ...entry('InvalidContract'), contract: F.resource('Component', 'InvalidContract', { render: F.probe('leaf', 'invalid') }) },
    ]) {
      const before = registry.list();
      const failure = await F.errorOf(() => renderer.registerComponents([entry('New'), later]));
      rejected.push({ code: failure?.code, unchanged: JSON.stringify(before) === JSON.stringify(registry.list()) });
    }
    renderer.registerComponents([entry('New'), entry('Second')]);
    const mounted = await renderer.mount({ target: e.target, view: { render: F.layout([
      { ...F.probe('first', 'first'), componentRef: 'New' },
      { ...F.probe('second', 'second'), componentRef: 'Second' },
    ]) } });
    await mounted.initialComplete;
    const rendered = [...e.target.querySelectorAll('[data-value]')].map(node => node.textContent);
    await renderer.dispose();
    const disposed = await F.errorOf(() => renderer.registerComponents([entry('Late')]));
    return { rejected, rendered, disposed: disposed?.code, late: registry.list('Component').some(contract => contract.id === 'Late') };
  });
  assert.deepEqual(result.rejected, Array.from({ length: 5 }, () => ({ code: 'INVALID_DEFINITION', unchanged: true })));
  assert.deepEqual(result.rendered, ['first', 'second']);
  assert.equal(result.disposed, 'CANCELLED');
  assert.equal(result.late, false);
}));

test('missing adapter is isolated, initial rejects, and text remains escaped', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    e.registry.registerComponentContract(F.resource('Component', 'Unbound', {}));
    e.rendering = await e.renderer.mount({ target: e.target, view: { render: F.layout([
      F.probe('ready', '<strong>plain text</strong>'), { id: 'unbound', componentRef: 'Unbound' },
    ]) } }); e.initialError = await F.errorOf(() => e.rendering.initialComplete);
  });
  assert.equal(await page.locator('[data-probe="ready"] [data-value]').textContent(), '<strong>plain text</strong>');
  assert.equal(await page.locator('strong').count(), 0);
  assert.equal(await page.evaluate(() => e.initialError.code), 'REFERENCE_NOT_FOUND');
  assert.ok(await page.evaluate(() => e.diagnostics.some(item => item.phase === 'render' && item.error.code)));
}));

test('required Value input waiting and type errors recover without replacing sibling DOM', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    e.registry.registerComponentContract(F.resource('Component', 'Strict', { ports: { value: F.port({ type: 'number' }) } }));
    e.renderer.registerComponent('Strict', F.Probe);
    e.spec = { ports: { value: F.port(true, false) }, render: F.layout([F.probe('stable', 'stable'), { id: 'required', componentRef: 'Strict', inputs: { value: F.p('/ports/value') } }]) };
    const mounted = await e.runtime.createView({ view: e.spec }); e.view = mounted.view;
    e.host = F.mount(F.Host, { target: e.target, props: { renderer: e.renderer, view: e.view } });
    await F.tick(); await e.host.whenRendered();
  });
  await page.locator('[data-probe="stable"] [data-local]').click();
  await page.locator('[data-probe="required"] [data-local]').click();
  assert.equal(await page.locator('[data-probe="required"]').getAttribute('data-status'), 'pending');
  await page.evaluate(async () => { await (await e.view.update(e.spec, { inputs: { value: 'invalid' } })).initialComplete; await e.host.whenRendered(); });
  assert.equal(await page.locator('[data-probe="required"]').getAttribute('data-status'), 'error');
  await page.evaluate(async () => { await (await e.view.update(e.spec, { inputs: { value: 0 } })).initialComplete; await e.host.whenRendered(); });
  assert.equal(await page.locator('[data-probe="required"] [data-value]').textContent(), '0');
  assert.equal(await page.locator('[data-probe="stable"] [data-local]').textContent(), 'local 1');
  assert.equal(await page.locator('[data-probe="required"] [data-local]').textContent(), 'local 1');
  await page.evaluate(async () => { await Fixture.unmount(e.host); });
}));

test('State and Query handles cross explicit ports and stay usable from adapter interactions', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    e.spec = { states: { count: F.state(2, { type: 'number' }) }, queries: { value: { query: { sources: {}, transform: { input: false } } } }, render: F.probe('handles', 'handles', { inputs: { value: 'handles', cell: F.p('/states/count'), query: F.p('/queries/value') } }) };
    e.rendering = await e.renderer.mount({ target: e.target, view: e.spec }); await e.rendering.initialComplete;
  });
  assert.equal(await page.locator('[data-cell]').textContent(), '2');
  assert.equal(JSON.parse(await page.locator('[data-query]').textContent()).data, false);
  await page.locator('[data-write]').click();
  await page.waitForFunction(() => document.querySelector('[data-cell]').textContent === '3');
  assert.equal(await page.evaluate(() => e.rendering.view.getState('count').read()), 3);
  await page.locator('[data-refresh]').click();
  await page.evaluate(() => e.rendering.whenRendered());
  assert.equal(JSON.parse(await page.locator('[data-query]').textContent()).data, false);
}));

test('named and empty forwarded slots preserve order and author scope; host context reaches adapters', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    e.registry.registerResources([
      F.resource('Component', 'Receiver', { slots: { body: { required: true } }, states: { label: F.state('receiver') }, render: { id: 'layout', componentRef: 'Layout', slots: { body: F.p('/slots/body'), header: [F.probe('header', 'header')], footer: [] } } }),
      F.resource('Component', 'Forwarder', { slots: { body: { required: true } }, render: { id: 'receiver', componentRef: 'Receiver', slots: { body: F.p('/slots/body') } } }),
    ]);
    e.rendering = await e.renderer.mount({ target: e.target, context: new Map([['viewstem-test-context', 'from-map']]), view: { states: { label: F.state('author') }, render: { id: 'forwarder', componentRef: 'Forwarder', slots: { body: [F.probe('first', F.p('/states/label')), F.probe('second', 'second')] } } } });
    await e.rendering.initialComplete;
  });
  assert.deepEqual(await page.locator('[data-slot="body"] [data-value]').allTextContents(), ['author', 'second']);
  assert.equal(await page.locator('[data-slot="header"] [data-value]').textContent(), 'header');
  assert.equal(await page.locator('[data-slot="footer"]').textContent(), '');
  assert.deepEqual(await page.locator('[data-context]').allTextContents(), ['from-map', 'from-map', 'from-map']);
  await page.evaluate(async () => { e.rendering.view.getState('label').write('author changed'); await e.rendering.whenRendered(); });
  assert.equal(await page.locator('[data-probe="first"] [data-value]').textContent(), 'author changed');
  await page.evaluate(async () => { const next = e.rendering.view.exportDefinition(); next.render.slots.body = []; await (await e.rendering.update(next)).initialComplete; });
  assert.equal(await page.locator('[data-slot="body"] [data-probe]').count(), 0);
}));

test('event forwarding validates payload and preserves native false output', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment(); e.calls = [];
    e.registry.registerComponentContract(F.resource('Component', 'StrictEvent', { ports: { payload: F.port() }, events: { change: { schema: { type: 'string' } } } }));
    e.renderer.registerComponent('StrictEvent', F.Probe);
    e.registry.registerAction(F.resource('Action', 'record', { ports: { value: F.port({ type: 'string' }) }, output: { schema: { type: 'boolean' } } }), ({ inputs }) => { e.calls.push(inputs.value); return false; });
    e.registry.registerResources([F.resource('Component', 'ForwardEvent', { ports: { payload: F.port() }, events: { selected: { schema: { type: 'string' } } }, render: { id: 'button', componentRef: 'StrictEvent', inputs: { payload: F.p('/ports/payload') }, on: { change: { emit: 'selected', payload: F.p('/event') } } } })]);
    e.spec = { ports: { payload: F.port() }, render: { id: 'forward', componentRef: 'ForwardEvent', inputs: { payload: F.p('/ports/payload') }, on: { selected: { id: 'record', actionRef: 'record', inputs: { value: F.p('/event') } } } } };
    e.rendering = await e.renderer.mount({ target: e.target, view: e.spec, inputs: { payload: 123 } }); await e.rendering.initialComplete;
  });
  await page.locator('[data-event]').click();
  await page.waitForFunction(() => document.querySelector('[data-event-result]').textContent === 'TYPE_MISMATCH');
  assert.deepEqual(await page.evaluate(() => e.calls), []);
  assert.equal(await page.evaluate(() => e.rendering.view.getSnapshot().actions.record.status), 'idle');
  await page.evaluate(async () => { await (await e.rendering.update(e.spec, { inputs: { payload: 'chosen' } })).initialComplete; });
  await page.locator('[data-event]').click();
  await page.waitForFunction(() => document.querySelector('[data-event-result]').textContent === 'false');
  assert.deepEqual(await page.evaluate(() => e.calls), ['chosen']);
  assert.equal(await page.evaluate(() => e.rendering.view.getSnapshot().actions.record.data), false);
  assert.ok(await page.evaluate(() => e.diagnostics.some(item => item.phase === 'event' && item.error.code === 'TYPE_MISMATCH')));
}));

test('repeat keys preserve Svelte and core state on reorder, and removal creates a new lifetime', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    e.registry.registerResources([F.resource('Component', 'Counter', { ports: { label: F.port() }, states: { count: F.state(0, { type: 'number' }) }, render: F.probe('counter', F.p('/states/count'), { inputs: { value: F.p('/states/count'), label: F.p('/ports/label'), cell: F.p('/states/count') } }) })]);
    e.spec = { states: { items: F.state([{ id: 'a' }, { id: 'b' }], { type: 'array' }) }, render: F.layout([{ id: 'item', componentRef: 'Counter', inputs: { label: F.p('/repeat/item/id') }, repeat: { items: F.p('/states/items'), as: 'item', key: F.p('/repeat/item/id') } }]) };
    e.rendering = await e.renderer.mount({ target: e.target, view: e.spec }); await e.rendering.initialComplete;
    e.original = F.flatten(e.rendering.view.getSnapshot()).find(node => node.id === 'counter' && node.inputs.label === 'a');
    e.originalHandle = F.flatten(e.rendering.view.getSnapshot()).find(node => node.id === 'item').instanceId;
  });
  await page.locator('[data-label="a"] [data-local]').click();
  await page.locator('[data-label="a"] [data-write]').click();
  await page.evaluate(async () => { e.rendering.view.getState('items').write([{ id: 'b' }, { id: 'a' }]); await e.rendering.whenRendered(); });
  assert.deepEqual(await page.locator('[data-probe="counter"]').evaluateAll(nodes => nodes.map(node => node.dataset.label)), ['b', 'a']);
  assert.equal(await page.locator('[data-label="a"] [data-local]').textContent(), 'local 1');
  assert.equal(await page.locator('[data-label="a"] [data-cell]').textContent(), '1');
  assert.equal(await page.locator('[data-label="a"]').getAttribute('data-address'), await page.evaluate(() => e.original.address));
  await page.evaluate(async () => { e.rendering.view.getState('items').write([{ id: 'b' }]); await e.rendering.whenRendered(); e.rendering.view.getState('items').write([{ id: 'a' }, { id: 'b' }]); await e.rendering.whenRendered(); });
  assert.equal(await page.locator('[data-label="a"] [data-local]').textContent(), 'local 0');
  assert.equal(await page.locator('[data-label="a"] [data-cell]').textContent(), '0');
  assert.ok(await page.evaluate(() => Fixture.observations.destroyed.includes(e.original.address)));
  assert.notEqual(await page.evaluate(() => Fixture.flatten(e.rendering.view.getSnapshot()).find(node => node.id === 'item').instanceId), await page.evaluate(() => e.originalHandle));
}));

test('when removal cancels async Action and stale adapter callback; recreation is independent', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment(); e.calls = 0;
    e.registry.registerAction(F.resource('Action', 'wait', { output: { schema: true } }), ({ signal }) => { e.calls++; e.signal = signal; return new Promise(resolve => e.release = resolve); });
    e.spec = { states: { show: F.state(true, { type: 'boolean' }) }, render: F.layout([F.probe('button', 'button', { when: F.p('/states/show'), on: { change: { id: 'waiting', actionRef: 'wait' } } })]) };
    e.rendering = await e.renderer.mount({ target: e.target, view: e.spec }); await e.rendering.initialComplete;
    e.oldCallback = Fixture.observations.callbacks.values().next().value;
  });
  await page.locator('[data-event]').click();
  await page.waitForFunction(() => e.calls === 1);
  await page.locator('[data-event]').click();
  assert.equal(await page.evaluate(() => e.calls), 1);
  await page.evaluate(async () => { e.rendering.view.getState('show').write(false); await e.rendering.whenRendered(); e.release('late'); });
  assert.equal(await page.locator('[data-probe]').count(), 0);
  assert.equal(await page.evaluate(() => e.signal.aborted), true);
  await page.evaluate(async () => { e.rendering.view.getState('show').write(true); await e.rendering.whenRendered(); });
  assert.equal(await page.locator('[data-local]').textContent(), 'local 0');
  assert.equal(await page.evaluate(() => e.rendering.view.getSnapshot().actions.waiting.status), 'idle');
  assert.deepEqual(await page.evaluate(() => e.oldCallback(null)), { error: 'CANCELLED' });
  assert.equal(await page.evaluate(() => e.calls), 1);
}));

test('Query initial waits for DOM commit while ready siblings render progressively; errors and retry recover', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.controlled();
    e.rendering = await e.renderer.mount({ target: e.target, view: { queries: { one: { queryRef: 'one' }, two: { queryRef: 'two' } }, render: F.layout([F.probe('static', 'ready before requests'), F.probe('one', F.p('/queries/one/data')), F.probe('two', F.p('/queries/two/data'))]) } });
    e.done = false; e.initialComplete = e.rendering.initialComplete.then(report => { e.done = true; e.committedText = e.target.textContent; return report; });
  });
  assert.equal(await page.locator('[data-probe="static"] [data-value]').textContent(), 'ready before requests');
  assert.equal(await page.evaluate(() => e.requests.length), 2);
  assert.equal(await page.evaluate(() => e.done), false);
  await page.evaluate(async () => { e.reply(0, 'first ready'); await e.rendering.whenRendered(); });
  await page.waitForFunction(() => document.querySelector('[data-probe="one"] [data-value]')?.textContent === 'first ready');
  assert.equal(await page.locator('[data-probe="two"]').getAttribute('data-status'), 'pending');
  assert.equal(await page.evaluate(() => e.done), false);
  const report = await page.evaluate(async () => { e.requests[1].reject({ code: 'HTTP_ERROR', message: 'fixture request failed' }); return e.initialComplete; });
  assert.equal(report.queryErrors.length, 1);
  assert.equal(report.queryErrors[0].error.code, 'HTTP_ERROR');
  assert.match(await page.evaluate(() => e.committedText), /first ready/);
  await page.evaluate(() => { e.retry = e.rendering.view.getQuery('two').retry(); e.retry.catch(() => {}); });
  await page.waitForFunction(() => e.requests.length === 3);
  await page.evaluate(async () => { e.reply(2, 'recovered'); await e.retry; await e.rendering.whenRendered(); });
  assert.equal(await page.locator('[data-probe="two"] [data-value]').textContent(), 'recovered');
}));

test('multiple pending placeholders without addresses remain separate and recover in authored order', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    e.spec = { states: { a: F.state(undefined), b: F.state(undefined), guard: { kind: 'Derived', schema: { type: 'boolean' }, variable: { ports: { value: F.port() }, expression: 'value' }, inputs: { value: F.p('/states/a') } } }, render: F.layout([F.probe('a', 'A', { when: F.p('/states/guard') }), F.probe('b', 'B', { when: F.p('/states/b') })]) };
    const mounted = await e.runtime.createView({ view: e.spec }); e.view = mounted.view;
    e.host = F.mount(F.Host, { target: e.target, props: { renderer: e.renderer, view: e.view } }); await F.tick(); await e.host.whenRendered();
  });
  assert.deepEqual(await page.locator('[data-fallback]').evaluateAll(nodes => nodes.map(node => node.dataset.fallback)), ['a', 'b']);
  await page.evaluate(async () => { e.view.getState('b').write(true); await e.host.whenRendered(); });
  assert.equal(await page.locator('[data-fallback="a"]').count(), 1);
  assert.equal(await page.locator('[data-probe="b"] [data-value]').textContent(), 'B');
  await page.evaluate(async () => { e.view.getState('a').write('invalid boolean'); await e.host.whenRendered(); });
  assert.equal(await page.locator('[data-fallback="a"]').getAttribute('data-status'), 'error');
  assert.equal(await page.locator('[data-probe="b"] [data-value]').textContent(), 'B');
  await page.evaluate(async () => { e.view.getState('a').write(true); await e.host.whenRendered(); });
  assert.deepEqual(await page.locator('[data-probe] [data-value]').allTextContents(), ['A', 'B']);
  await page.evaluate(() => Fixture.unmount(e.host));
}));

test('invalid updates/replacements preserve DOM, State and generation; valid replace starts fresh lifetime', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    e.spec = { states: { count: F.state(1, { type: 'number' }) }, render: F.probe('counter', F.p('/states/count')) };
    e.rendering = await e.renderer.mount({ target: e.target, view: e.spec }); await e.rendering.initialComplete;
    e.oldState = e.rendering.view.getState('count'); e.oldState.write(7); await e.rendering.whenRendered();
    e.before = e.rendering.view.getSnapshot();
    e.badUpdate = await F.errorOf(() => e.rendering.update({ render: { id: 'invalid', componentRef: 'Unknown' } }));
    e.badReplace = await F.errorOf(() => e.rendering.replace({ view: { render: { id: 'invalid', componentRef: 'Unknown' } } }));
  });
  await page.locator('[data-local]').click();
  assert.equal(await page.locator('[data-value]').textContent(), '7');
  assert.equal(await page.evaluate(() => e.rendering.view.getSnapshot().generation), await page.evaluate(() => e.before.generation));
  assert.equal(await page.evaluate(() => e.badUpdate.code), 'REFERENCE_NOT_FOUND');
  assert.equal(await page.evaluate(() => e.badReplace.code), 'REFERENCE_NOT_FOUND');
  await page.evaluate(async () => { e.updateReport = await (await e.rendering.update(e.spec)).initialComplete; });
  assert.equal(await page.locator('[data-local]').textContent(), 'local 1');
  assert.equal(await page.locator('[data-value]').textContent(), '7');
  await page.evaluate(async () => { e.replaceReport = await (await e.rendering.replace({ view: e.spec })).initialComplete; });
  assert.equal(await page.locator('[data-local]').textContent(), 'local 0');
  assert.equal(await page.locator('[data-value]').textContent(), '1');
  assert.equal((await page.evaluate(() => Fixture.errorOf(() => e.oldState.read()))).code, 'CANCELLED');
}));

test('attachments and Svelte host borrow Views; renderer owns mounted Views and never injected runtime or Store', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture, store = F.createStateStore(); window.e = F.environment({ store });
    e.service = store.createScope(); e.shared = e.service.registerState('shared', { schema: true, initial: 42 });
    e.spec = { states: { count: F.state(1) }, render: F.probe('borrowed', F.p('/states/count')) };
    const first = await e.runtime.createView({ view: e.spec }); e.borrowed = first.view;
    e.attachment = e.renderer.attach(e.borrowed, e.target); await e.attachment.whenRendered();
    e.ownedTarget = F.target('owned'); e.owned = await e.renderer.mount({ target: e.ownedTarget, view: e.spec }); await e.owned.initialComplete;
    e.owned.view.getState('count').write(9); await e.owned.whenRendered();
  });
  assert.equal(await page.locator('#target [data-value]').textContent(), '1');
  assert.equal(await page.locator('#owned [data-value]').textContent(), '9');
  await page.evaluate(async () => { await e.attachment.dispose(); e.borrowed.getState('count').write(3); });
  assert.equal(await page.locator('#target [data-probe]').count(), 0);
  await page.evaluate(async () => { e.host = Fixture.mount(Fixture.Host, { target: e.target, props: { renderer: e.renderer, view: e.borrowed } }); await Fixture.tick(); await e.host.whenRendered(); });
  assert.equal(await page.locator('#target [data-value]').textContent(), '3');
  assert.equal(await page.locator('#target [data-context]').textContent(), 'from-parent');
  await page.evaluate(async () => { await Fixture.unmount(e.host); e.borrowed.getState('count').write(4); await e.renderer.dispose(); });
  assert.equal(await page.locator('[data-probe]').count(), 0);
  assert.equal(await page.evaluate(() => e.borrowed.getState('count').read()), 4);
  assert.equal((await page.evaluate(() => Fixture.errorOf(() => e.owned.view.getState('count').read()))).code, 'CANCELLED');
  assert.equal(await page.evaluate(() => e.shared.read()), 42);
  assert.equal(await page.evaluate(async () => { const fresh = await e.runtime.createView({ view: e.spec }); const value = fresh.view.getState('count').read(); fresh.view.dispose(); e.runtime.dispose(); return value; }), 1);
  assert.equal(await page.evaluate(() => e.shared.read()), 42);
  await page.evaluate(() => { e.service.dispose(); });
}));

test('host adapter render failures are sanitized, isolated, and recover on valid updates', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    e.registry.registerComponentContract(F.resource('Component', 'Crash', { ports: { value: F.port() } })); e.renderer.registerComponent('Crash', F.Crash);
    e.spec = { states: { value: F.state('safe') }, render: F.layout([F.probe('sibling', 'stable'), { id: 'crash', componentRef: 'Crash', inputs: { value: F.p('/states/value') } }]) };
    e.rendering = await e.renderer.mount({ target: e.target, view: e.spec }); await e.rendering.initialComplete;
  });
  await page.locator('[data-probe="sibling"] [data-local]').click();
  const error = await page.evaluate(async () => { e.rendering.view.getState('value').write('crash'); return Fixture.errorOf(() => e.rendering.whenRendered()); });
  assert.equal(error.code, 'INTERNAL_ERROR');
  assert.equal(await page.locator('[data-crash]').count(), 0);
  assert.equal(await page.locator('[data-probe="sibling"] [data-local]').textContent(), 'local 1');
  assert.equal(await page.evaluate(() => JSON.stringify(e.diagnostics).includes('private adapter details')), false);
  await page.evaluate(async () => { e.rendering.view.getState('value').write('recovered'); await e.rendering.whenRendered(); });
  assert.equal(await page.locator('[data-crash]').textContent(), 'recovered');
  const proxyError = await page.evaluate(async () => { e.rendering.view.getState('value').write('proxy'); return Fixture.errorOf(() => e.rendering.whenRendered()); });
  assert.equal(proxyError.code, 'INTERNAL_ERROR');
  assert.equal(await page.evaluate(() => JSON.stringify(e.diagnostics).includes('private proxy')), false);
  await page.evaluate(async () => { e.rendering.view.getState('value').write('safe again'); await e.rendering.whenRendered(); });
  assert.equal(await page.locator('[data-crash]').textContent(), 'safe again');
}));

test('replacement cancels pending initial and prevents late Query results from reaching current DOM', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.controlled();
    e.spec = { queries: { result: { queryRef: 'one' } }, render: F.probe('result', F.p('/queries/result/data')) };
    e.rendering = await e.renderer.mount({ target: e.target, view: e.spec }); e.cancelledInitial = F.errorOf(() => e.rendering.initialComplete);
    e.replacement = await e.rendering.replace({ view: e.spec });
  });
  assert.equal((await page.evaluate(() => e.cancelledInitial)).code, 'CANCELLED');
  assert.equal(await page.evaluate(() => e.requests[0].signal.aborted), true);
  assert.equal(await page.evaluate(() => e.requests.length), 2);
  await page.evaluate(async () => { e.reply(0, 'stale'); await e.rendering.whenRendered(); });
  assert.equal(await page.locator('[data-value]').textContent(), '');
  const report = await page.evaluate(async () => { e.reply(1, 'current'); const report = await e.replacement.initialComplete; return { generation: report.generation, current: e.rendering.view.getSnapshot().generation, text: e.target.querySelector('[data-value]').textContent }; });
  assert.equal(report.generation, report.current);
  assert.equal(report.text, 'current');
}));

test('renderer disposal awaits delayed mount cleanup and preserves injected runtime usability', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment(); await e.renderer.dispose(); e.runtime.dispose();
    e.runtime = F.createRuntime({ registry: e.registry, resourceResolver: () => new Promise(resolve => e.resolveResource = resolve) });
    e.renderer = F.createRenderer({ runtime: e.runtime }); e.renderer.registerComponent('Probe', F.Probe);
    e.mountOutcome = F.errorOf(() => e.renderer.mount({ target: e.target, viewRef: 'Delayed' }));
  });
  await page.waitForFunction(() => typeof e.resolveResource === 'function');
  await page.evaluate(() => { e.disposed = false; e.disposal = e.renderer.dispose().then(() => { e.disposed = true; }); });
  assert.equal(await page.evaluate(() => e.disposed), false);
  const result = await page.evaluate(async () => {
    const F = Fixture;
    e.resolveResource(F.resource('View', 'Delayed', { render: F.probe('delayed', 'should not mount') }));
    const outcome = await e.mountOutcome; await e.disposal;
    const fresh = await e.runtime.createView({ view: { render: F.probe('fresh', 'runtime alive') } }); await fresh.initialComplete;
    const snapshot = fresh.view.getSnapshot(); fresh.view.dispose();
    return { outcome, disposed: e.disposed, freshValue: snapshot.roots[0].inputs.value };
  });
  assert.equal(result.outcome.code, 'CANCELLED');
  assert.equal(result.disposed, true);
  assert.equal(result.freshValue, 'runtime alive');
  assert.equal(await page.locator('[data-probe]').count(), 0);
}));

test('direct Svelte host uses explicit root transformError for malicious adapter exceptions and recovery', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    e.registry.registerComponentContract(F.resource('Component', 'Crash', { ports: { value: F.port() } })); e.renderer.registerComponent('Crash', F.Crash);
    const mounted = await e.runtime.createView({ view: { states: { value: F.state('safe') }, render: { id: 'crash', componentRef: 'Crash', inputs: { value: F.p('/states/value') } } } }); e.view = mounted.view;
    e.host = F.mount(F.Host, { target: e.target, transformError: F.transformError, props: { renderer: e.renderer, view: e.view } }); await F.tick(); await e.host.whenRendered();
  });
  assert.equal(await page.locator('[data-crash]').textContent(), 'safe');
  const error = await page.evaluate(async () => { e.view.getState('value').write('proxy'); return Fixture.errorOf(() => e.host.whenRendered()); });
  assert.equal(error.code, 'INTERNAL_ERROR');
  assert.equal(await page.locator('[data-fallback="crash"]').getAttribute('data-error'), 'INTERNAL_ERROR');
  assert.equal(await page.evaluate(() => JSON.stringify(e.diagnostics).includes('private proxy')), false);
  await page.evaluate(async () => { e.view.getState('value').write('recovered'); await e.host.whenRendered(); });
  assert.equal(await page.locator('[data-crash]').textContent(), 'recovered');
  await page.evaluate(() => Fixture.unmount(e.host));
}));

test('components explicitly registered after mount are available on replacement', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    e.rendering = await e.renderer.mount({ target: e.target, view: { render: F.probe('original', 'original') } }); await e.rendering.initialComplete;
    e.registry.registerComponentContract(F.resource('Component', 'Later', { ports: { value: F.port() } })); e.renderer.registerComponent('Later', F.Probe);
    e.report = await (await e.rendering.replace({ view: { render: { id: 'later', componentRef: 'Later', inputs: { value: 'registered later' } } } })).initialComplete;
    e.committedText = e.target.querySelector('[data-probe="later"] [data-value]')?.textContent;
  });
  assert.equal(await page.locator('[data-probe="original"]').count(), 0);
  assert.equal(await page.locator('[data-probe="later"] [data-value]').textContent(), 'registered later');
  assert.equal(await page.evaluate(() => e.committedText), 'registered later');
  assert.deepEqual(await page.evaluate(() => e.diagnostics), []);
}));

test('saved emit checks current input readiness synchronously before Svelte has flushed', t => browserTest(t, async page => {
  await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment(); e.calls = 0;
    e.registry.registerComponentContract(F.resource('Component', 'Strict', { ports: { value: F.port({ type: 'number' }) }, events: { change: { schema: true } } })); e.renderer.registerComponent('Strict', F.Probe);
    e.registry.registerAction(F.resource('Action', 'mark', {}), () => { e.calls++; });
    e.rendering = await e.renderer.mount({ target: e.target, view: { states: { value: F.state(1) }, render: { id: 'strict', componentRef: 'Strict', inputs: { value: F.p('/states/value') }, on: { change: { actionRef: 'mark' } } } } }); await e.rendering.initialComplete;
    e.savedEmit = F.observations.emitters.get(e.rendering.view.getSnapshot().roots[0].address);
  });
  const result = await page.evaluate(async () => {
    e.rendering.view.getState('value').write('bad');
    const error = await Fixture.errorOf(() => e.savedEmit('change', null));
    return { error, calls: e.calls };
  });
  assert.equal(result.error.code, 'INPUT_NOT_READY');
  assert.equal(result.calls, 0);
  await page.evaluate(async () => { e.rendering.view.getState('value').write(2); await e.rendering.whenRendered(); await e.savedEmit('change', null); });
  assert.equal(await page.locator('[data-value]').textContent(), '2');
  assert.equal(await page.evaluate(() => e.calls), 1);
}));

test('reentrant renderer disposal from adapter initialization cancels mount and removes its DOM', t => browserTest(t, async page => {
  const result = await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    e.registry.registerComponentContract(F.resource('Component', 'Reentrant', {})); e.renderer.registerComponent('Reentrant', F.Reentrant);
    const outcome = await F.errorOf(async () => {
      const rendered = await e.renderer.mount({ target: e.target, context: new Map([['viewstem-dispose-on-init', () => { e.disposal = e.renderer.dispose(); }]]), view: { render: { id: 'reentrant', componentRef: 'Reentrant' } } });
      await rendered.initialComplete;
    });
    await e.disposal;
    const fresh = await e.runtime.createView({ view: { render: F.probe('fresh', 'runtime still usable') } }); await fresh.initialComplete;
    const value = fresh.view.getSnapshot().roots[0].inputs.value; fresh.view.dispose();
    return { outcome, value, text: e.target.textContent };
  });
  assert.equal(result.outcome.code, 'CANCELLED');
  assert.equal(result.value, 'runtime still usable');
  assert.equal(result.text, '');
  assert.equal(await page.locator('[data-reentrant]').count(), 0);
}));

test('emit after borrowed View disposal returns a rejected Promise while DOM is still attached', t => browserTest(t, async page => {
  const result = await page.evaluate(async () => {
    const F = Fixture; window.e = F.environment();
    const created = await e.runtime.createView({ view: { render: F.probe('value', 1) } });
    await created.initialComplete;
    const attachment = e.renderer.attach(created.view, e.target); await attachment.whenRendered();
    const emit = F.observations.emitters.get(created.view.getSnapshot().roots[0].address);
    created.view.dispose();
    const pending = emit('change', null);
    const promise = pending instanceof Promise;
    const error = await F.errorOf(() => pending);
    await attachment.dispose();
    return { promise, code: error.code, diagnostics: e.diagnostics.map(item => item.error.code) };
  });
  assert.deepEqual(result, { promise: true, code: 'CANCELLED', diagnostics: ['CANCELLED'] });
}));
