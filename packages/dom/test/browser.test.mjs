import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const source = `
import { createRuntime, defineResourceSet } from '@viewstem/core';
import { createRenderer, DOM_CONNECTOR_ID } from '@viewstem/dom';

const string = { type: 'string' };
const flag = { kind: 'Value', schema: { type: 'boolean' } };
const text = { kind: 'Value', required: true, schema: string };
const path = value => ({ '@path': value });
const component = (id, spec, mount) => ({ contract: { kind: 'Component', id, spec }, connectorId: DOM_CONNECTOR_ID, implementation: { mount } });
const code = promise => promise.then(() => 'success', error => error.code);
const left = document.querySelector('#left'), right = document.querySelector('#right');

function fixture() {
  const runtime = createRuntime(), errors = [], disposed = [], oldSlots = [], delayed = [];
  const renderer = createRenderer({ runtime });
  const components = [
    component('List', { slots: { default: {} }, ports: { replace: flag } }, ctx => {
      const container = document.createElement('section');
      let currentHost, withdraw, replaced = ctx.node.inputs.replace;
      ctx.parent.insertBefore(container, ctx.anchor);
      function provide() {
        const next = document.createElement('div');
        container.append(next);
        const previous = withdraw;
        withdraw = ctx.provideSlot('default', next);
        if (previous) oldSlots.push(previous);
        currentHost?.remove();
        currentHost = next;
      }
      provide();
      return { update(next) {
        if (next.inputs.replace !== replaced) { replaced = next.inputs.replace; provide(); }
        else withdraw = ctx.provideSlot('default', currentHost);
      },
        setPending() {}, dispose() { container.remove(); } };
    }),
    component('Item', { ports: { label: text } }, ctx => {
      const input = document.createElement('input');
      const name = ctx.node.inputs.label;
      input.value = name;
      ctx.parent.insertBefore(input, ctx.anchor);
      return { update(next) {
        if (input.value !== next.inputs.label) input.value = next.inputs.label;
      }, setPending(pending) { input.toggleAttribute('aria-busy', pending); },
        dispose() { disposed.push(name); input.remove(); } };
    }),
    component('Slow', { ports: { value: text }, events: { click: { schema: true } } }, ctx => {
      const element = document.createElement('button');
      let value;
      const assign = next => { value = next.inputs.value; element.textContent = value; };
      assign(ctx.node);
      ctx.parent.insertBefore(element, ctx.anchor);
      return { update: assign, setPending(pending) { element.toggleAttribute('aria-busy', pending); }, whenRendered() {
        if (left.contains(element) && value === 'hold') return new Promise((_, reject) => delayed.push(reject));
        if (value === 'fail') throw new Error('render failure');
      }, dispose() { element.remove(); } };
    }),
  ];
  runtime.registry.registerResourceSet(defineResourceSet({ id: 'test', version: '1', components }));
  const reports = { onError: error => errors.push([error.phase, error.nodeId, error.error.code]) };
  return { runtime, renderer, errors, reports, disposed, oldSlots, delayed };
}

globalThis.keyed = async () => {
  const f = fixture();
  const mounted = f.renderer.mount({ target: left, source: {
    states: {
      items: { kind: 'State', schema: { type: 'array', items: string }, initial: ['one', 'two'] },
      replace: { kind: 'State', schema: { type: 'boolean' }, initial: false },
    },
    render: { id: 'list', componentRef: 'List', inputs: { replace: path('/states/replace') }, slots: {
      default: [{ id: 'item', componentRef: 'Item', inputs: { label: path('/repeat/item') },
        repeat: { items: path('/states/items'), as: 'item', key: path('/repeat/item') } }],
    } },
  } });
  const view = await mounted.ready;
  await mounted.whenRendered();
  const element = left.querySelector('input');
  element.focus(); element.setSelectionRange(1, 2);
  view.getState('items').write(['two', 'one']);
  await mounted.whenRendered();
  const kept = left.querySelectorAll('input')[1] === element && document.activeElement === element && element.selectionStart === 1;
  const before = view.getSnapshot().roots[0].slots.default.map(node => node.generation);
  view.getState('replace').write(true);
  await mounted.whenRendered();
  f.oldSlots[0]();
  await mounted.whenRendered();
  const result = { kept, replaced: !element.isConnected, children: [...left.querySelectorAll('input')].map(item => item.value),
    disposed: [...f.disposed].sort(), preserved: JSON.stringify(before) === JSON.stringify(view.getSnapshot().roots[0].slots.default.map(node => node.generation)) };
  await mounted.unmount();
  return { ...result, empty: left.childNodes.length === 0 };
};

globalThis.projections = async () => {
  const f = fixture();
  const mounted = f.renderer.mount({ target: left, ...f.reports, source: {
    states: { value: { kind: 'State', schema: string, initial: 'hold' } },
    render: { id: 'list', componentRef: 'List', slots: { default: [
      { id: 'slow', componentRef: 'Slow', inputs: { value: path('/states/value') } },
      { id: 'item', componentRef: 'Item', inputs: { label: 'sibling' } },
    ] } },
  } });
  const view = await mounted.ready;
  const attached = f.renderer.attach(view, right);
  let firstSettled = false;
  const first = code(mounted.whenRendered()).then(result => { firstSettled = true; return result; });
  await attached.whenRendered();
  const firstWasHeld = f.delayed.length > 0 && !firstSettled;
  view.getState('value').write('new');
  const followed = await first;
  for (const reject of f.delayed) reject(new Error('outdated render'));
  await mounted.whenRendered();
  const confirmed = left.querySelector('button')?.textContent;
  const noOutdatedErrors = f.errors.length === 0;
  view.getState('value').write('fail');
  const failed = await code(mounted.whenRendered());
  const result = { firstWasHeld, followed, confirmed, noOutdatedErrors, failed,
    sibling: left.querySelector('input')?.value, survivingView: view.getState('value').read(),
    errors: f.errors, badNodeRemoved: left.querySelector('button') === null };
  await attached.detach();
  await mounted.unmount();
  return result;
};

globalThis.staticFallback = async () => {
  const { renderer, runtime } = fixture();
  const mounted = renderer.mount({ target: left, source: {
    states: { value: { kind: 'State', schema: string }, sibling: { kind: 'State', schema: string, initial: 'before' } },
    render: { id: 'list', componentRef: 'List', slots: { default: [
      { id: 'pending', componentRef: 'Slow', inputs: { value: path('/states/value') } },
      { id: 'sibling', componentRef: 'Slow', inputs: { value: path('/states/sibling') } },
    ] } },
  }, fallback({ parent, anchor }) {
    const placeholder = document.createElement('span');
    placeholder.textContent = 'loading';
    parent.insertBefore(placeholder, anchor);
  } });
  const view = await mounted.ready;
  await mounted.whenRendered();
  const loading = left.textContent;
  const sibling = left.querySelector('button');
  view.getState('sibling').write('after');
  await mounted.whenRendered();
  const updatedWhilePending = left.textContent;
  view.getState('value').write('ready');
  await mounted.whenRendered();
  const ready = left.textContent;
  const keptSibling = left.querySelectorAll('button')[1] === sibling;
  await mounted.unmount();
  await renderer.dispose();
  runtime.dispose();
  return { loading, updatedWhilePending, ready, keptSibling, empty: left.textContent === '' };
};

globalThis.fallbackOrder = async first => {
  const runtime = createRuntime(), renderer = createRenderer({ runtime });
  const gates = new Map();
  for (const id of ['A', 'B']) {
    let release, show;
    const cleanup = new Promise(resolve => { release = resolve; });
    const fallback = new Promise(resolve => { show = resolve; });
    gates.set(id, { cleanup, release, fallback, show });
  }
  runtime.registry.registerResourceSet(defineResourceSet({ id: 'fallback-order', version: '1', components: [
    component('List', { slots: { default: {} } }, ctx => {
      ctx.provideSlot('default', ctx.parent);
      return { update() {}, setPending() {}, dispose() {} };
    }),
    component('Item', { ports: { fail: flag } }, ctx => {
      const id = ctx.node.id, element = document.createElement('span');
      const gate = gates.get(id);
      let failed = false;
      element.dataset.id = id;
      element.textContent = id;
      ctx.parent.insertBefore(element, ctx.anchor);
      return { update(next) {
        if (ctx.parent === left && gate && next.inputs.fail) { failed = true; throw Error('update failed'); }
      }, setPending() {}, async dispose() {
        if (failed) await gate.cleanup;
        element.remove();
      } };
    }),
  ] }));
  const view = await runtime.createView({
    states: { fail: { kind: 'State', schema: { type: 'boolean' }, initial: false } },
    render: { id: 'list', componentRef: 'List', slots: { default: ['A', 'B', 'C'].map(id =>
      ({ id, componentRef: 'Item', inputs: { fail: path('/states/fail') } })) } },
  });
  const screen = renderer.attach(view, left, { fallback({ parent, anchor, node }) {
    const element = document.createElement('span');
    element.textContent = node.id + '!';
    parent.insertBefore(element, anchor);
    gates.get(node.id).show();
  } });
  const mirror = renderer.attach(view, right);
  await Promise.all([screen.whenRendered(), mirror.whenRendered()]);
  const sibling = left.querySelector('[data-id="C"]'), mirrorFirst = right.querySelector('[data-id="A"]');
  view.getState('fail').write(true);
  const failed = code(screen.whenRendered());
  gates.get(first).release();
  await gates.get(first).fallback;
  gates.get(first === 'A' ? 'B' : 'A').release();
  const result = await failed;
  await mirror.whenRendered();
  const order = left.textContent;
  view.getState('fail').write(false);
  await screen.whenRendered();
  const restored = left.textContent;
  const kept = [left.querySelector('[data-id="C"]') === sibling, right.querySelector('[data-id="A"]') === mirrorFirst, right.textContent];
  await renderer.dispose();
  await runtime.dispose();
  return { result, order, restored, kept };
};

globalThis.fallbackTransitions = async updateInPlace => {
  const { renderer, runtime } = fixture();
  const mounts = [], disposals = [];
  const screen = renderer.mount({ target: left, source: {
    ports: { value: { kind: 'Value', schema: true } },
    states: { unrelated: { kind: 'State', schema: { type: 'boolean' }, initial: false } },
    render: { id: 'slow', componentRef: 'Slow', inputs: { value: path('/ports/value') } },
  }, fallback(context) {
    const label = next => next.error?.code ?? next.node.status;
    const original = label(context), element = document.createElement('span');
    mounts.push(original);
    element.textContent = original;
    context.parent.insertBefore(element, context.anchor);
    return {
      ...(updateInPlace ? { update(next) { element.textContent = label(next); } } : {}),
      dispose() { disposals.push(original); element.remove(); },
    };
  } });
  const view = await screen.ready;
  await screen.whenRendered();
  const starting = left.querySelector('span');
  const initial = left.textContent;
  view.getState('unrelated').write(true);
  await screen.whenRendered();
  const keptWhenUnrelated = left.querySelector('span') === starting;
  await screen.whenSettled(await view.setInputs({ value: 42 }));
  const error = [left.textContent, left.querySelector('span') === starting];
  await screen.whenSettled(await view.setInputs({}));
  const pendingAgain = left.textContent;
  await screen.whenSettled(await view.setInputs({ value: 'ready' }));
  const ready = left.textContent;
  await screen.unmount();
  await renderer.dispose();
  await runtime.dispose();
  return { initial, keptWhenUnrelated, error, pendingAgain, ready, mounts, disposals, empty: left.childNodes.length === 0 };
};

globalThis.closeDuringRender = async phase => {
  const runtime = createRuntime();
  const trace = [];
  const warm = phase === 'setPending' || phase === 'fallback.update';
  const withFallback = phase.startsWith('fallback');
  let screen, closing, armed = false;
  function observe(callback) {
    trace.push(callback);
    if (armed && callback === phase) {
      trace.push('detach');
      closing = screen.detach();
    }
  }
  const connector = { id: 'closing', accepts() { observe('accepts'); return true; },
    mount(_implementation, ctx) {
      const local = ctx.parent === left;
      if (local) observe('mount');
      const element = document.createElement('span');
      element.textContent = ctx.node.inputs.value;
      ctx.parent.insertBefore(element, ctx.anchor);
      return {
        update(next) { element.textContent = next.inputs.value; },
        setPending(pending) { if (local && pending) observe('setPending'); },
        whenRendered() { if (local) observe('whenRendered'); },
        dispose() { if (local) observe('dispose'); element.remove(); },
      };
    },
  };
  const renderer = createRenderer({ runtime, connectors: [connector] });
  runtime.registry.registerResourceSet(defineResourceSet({ id: 'close-render', version: '1', components: [{
    contract: { kind: 'Component', id: 'Leaf', spec: { ports: { value: text } } },
    connectorId: connector.id, implementation: {},
  }] }));
  const view = await runtime.createView({
    ports: { value: { kind: 'Value', schema: true } },
    render: { id: 'leaf', componentRef: 'Leaf', inputs: { value: path('/ports/value') } },
  }, { inputs: withFallback ? {} : { value: 'ready' } });
  const mirror = renderer.attach(view, right);
  await mirror.whenRendered();
  trace.length = 0;
  armed = !warm;
  screen = renderer.attach(view, left, { fallback({ parent, anchor }) {
    observe('fallback.mount');
    const element = document.createElement('span');
    element.textContent = 'fallback';
    parent.insertBefore(element, anchor);
    return {
      update() { observe('fallback.update'); },
      whenRendered() { observe('fallback.whenRendered'); },
      dispose() { observe('fallback.dispose'); },
    };
  } });
  if (warm) {
    await screen.whenRendered();
    trace.length = 0;
    armed = true;
    await view.setInputs(withFallback ? { value: 42 } : {});
  }
  const outcome = await code(screen.whenRendered());
  await closing;
  const closed = { trace: [...trace], outcome, empty: left.childNodes.length === 0 };
  armed = false;
  await view.setInputs({ value: 'restored' });
  const reused = renderer.attach(view, left);
  await Promise.all([reused.whenRendered(), mirror.whenRendered()]);
  const result = { ...closed, restored: [left.textContent, right.textContent] };
  await renderer.dispose();
  await runtime.dispose();
  return result;
};

globalThis.syncPending = async () => {
  const { renderer, runtime, disposed } = fixture();
  const mounted = renderer.mount({ target: left, inputs: { label: 'before' }, source: {
    ports: { label: { ...text, required: false } },
    render: { id: 'item', componentRef: 'Item', inputs: { label: path('/ports/label') } },
  } });
  const view = await mounted.ready;
  await mounted.whenRendered();
  const input = left.querySelector('input');
  await mounted.whenSettled(await view.setInputs({}));
  const waiting = [left.querySelector('input') === input, input.value, input.hasAttribute('aria-busy')];
  await mounted.whenSettled(await view.setInputs({ label: 'after' }));
  const resumed = [left.querySelector('input') === input, input.value, input.hasAttribute('aria-busy')];
  await mounted.unmount();
  await renderer.dispose();
  runtime.dispose();
  return { waiting, resumed, disposed, empty: left.childNodes.length === 0 };
};

globalThis.pendingSlots = async () => {
  const runtime = createRuntime();
  const renderer = createRenderer({ runtime });
  let releaseDisposal, startDisposal, offerSlot, emitOld;
  let disposed = 0;
  const disposal = new Promise(resolve => { releaseDisposal = resolve; });
  const disposing = new Promise(resolve => { startDisposal = resolve; });
  runtime.registry.registerResourceSet(defineResourceSet({ id: 'pending-slots', version: '1', components: [
    component('Parent', { ports: { value: text }, slots: { main: {}, aside: {} } }, ctx => {
      const parent = document.createElement('section');
      const main = document.createElement('div'), aside = document.createElement('div');
      parent.append(main, aside);
      ctx.parent.insertBefore(parent, ctx.anchor);
      const withdraw = ctx.provideSlot('main', main);
      ctx.provideSlot('aside', aside);
      offerSlot = () => ctx.provideSlot('main', main);
      return { update() {}, setPending(pending) {
        parent.toggleAttribute('aria-busy', pending);
        if (pending) withdraw();
      }, dispose() { parent.remove(); } };
    }),
    component('Child', { ports: { label: text }, events: { click: { schema: true } } }, ctx => {
      const child = document.createElement('button');
      const label = ctx.node.inputs.label;
      child.textContent = label;
      ctx.parent.insertBefore(child, ctx.anchor);
      if (label === 'main') emitOld ??= () => ctx.emit('click', null);
      return { update() {}, setPending() {}, async dispose() {
        if (label === 'main') { disposed++; startDisposal(); await disposal; }
        child.remove();
      } };
    }),
  ] }));
  const screen = renderer.mount({ target: left, inputs: { value: 'ready' }, source: {
    ports: { value: { ...text, required: false } },
    render: { id: 'parent', componentRef: 'Parent', inputs: { value: path('/ports/value') }, slots: {
      main: [{ id: 'main', componentRef: 'Child', inputs: { label: 'main' } }],
      aside: [{ id: 'aside', componentRef: 'Child', inputs: { label: 'aside' } }],
    } },
  } });
  const view = await screen.ready;
  await screen.whenRendered();
  const parent = left.querySelector('section');
  const [main, aside] = parent.querySelectorAll('button');
  const wasLive = await code(emitOld());
  const applied = await view.setInputs({});
  const settled = code(screen.whenSettled(applied));
  const waited = await Promise.race([disposing.then(() => true), settled.then(() => false)]);
  const retiredEvent = await code(emitOld());
  releaseDisposal();
  const result = await settled;
  const removed = !main.isConnected && disposed === 1;
  let offeredWhilePending = true;
  try { offerSlot(); } catch { offeredWhilePending = false; }
  await screen.whenRendered();
  const waiting = [parent.hasAttribute('aria-busy'), left.querySelector('section') === parent,
    parent.querySelector('button') === aside, parent.textContent];
  await screen.whenSettled(await view.setInputs({ value: 'resumed' }));
  const [newMain, sameAside] = parent.querySelectorAll('button');
  const resumed = [parent.hasAttribute('aria-busy'), newMain !== main, sameAside === aside, parent.textContent, disposed];
  await screen.unmount();
  await renderer.dispose();
  await runtime.dispose();
  return { wasLive, waited, retiredEvent, result, removed, offeredWhilePending, waiting, resumed, disposed };
};

globalThis.slotDisposalFailure = async () => {
  const runtime = createRuntime();
  const diagnostics = [], rightDiagnostics = [], disposed = [];
  const observe = diagnostic => diagnostics.push([diagnostic.phase, diagnostic.nodeId, diagnostic.error.code]);
  const renderer = createRenderer({ runtime, onError: observe });
  runtime.registry.registerResourceSet(defineResourceSet({ id: 'slot-disposal', version: '1', components: [
    component('Parent', { ports: { replace: flag }, slots: { main: {}, aside: {} } }, ctx => {
      const parent = document.createElement('section');
      const aside = document.createElement('aside');
      parent.append(aside);
      ctx.parent.insertBefore(parent, ctx.anchor);
      const onLeft = left.contains(parent);
      let host, replace = ctx.node.inputs.replace;
      function provideMain() {
        const next = document.createElement('div');
        parent.insertBefore(next, aside);
        ctx.provideSlot('main', next);
        host?.remove();
        host = next;
      }
      provideMain();
      ctx.provideSlot('aside', aside);
      return { update(next) {
        if (onLeft && replace !== next.inputs.replace) { replace = next.inputs.replace; provideMain(); }
      }, setPending() {}, dispose() { parent.remove(); } };
    }),
    component('Child', { ports: { label: text } }, ctx => {
      const child = document.createElement('span');
      const label = ctx.node.inputs.label;
      child.textContent = label;
      ctx.parent.insertBefore(child, ctx.anchor);
      const onLeft = left.contains(child);
      return { update() {}, setPending() {}, async dispose() {
        if (!onLeft) return;
        disposed.push(label);
        if (label !== 'stable') throw Error('child cleanup failed');
      } };
    }),
  ] }));
  const screen = renderer.mount({ target: left, onError: observe, inputs: { replace: false }, source: {
    ports: { replace: flag },
    render: { id: 'parent', componentRef: 'Parent', inputs: { replace: path('/ports/replace') }, slots: {
      main: [
        { id: 'main-one', componentRef: 'Child', inputs: { label: 'one' } },
        { id: 'main-two', componentRef: 'Child', inputs: { label: 'two' } },
      ],
      aside: [{ id: 'aside', componentRef: 'Child', inputs: { label: 'stable' } }],
    } },
  } });
  const view = await screen.ready;
  const other = createRenderer({ runtime });
  const attachment = other.attach(view, right, { onError: diagnostic => rightDiagnostics.push(diagnostic.phase) });
  await Promise.all([screen.whenRendered(), attachment.whenRendered()]);
  const parent = left.querySelector('section');
  const [one, two, aside] = parent.querySelectorAll('span');
  const rightOne = right.querySelector('span');
  const application = await view.setInputs({ replace: true });
  const results = await Promise.all([code(screen.whenSettled(application)), code(attachment.whenSettled(application))]);
  const replaced = [one, two].every(node => !node.isConnected) && left.querySelector('span') !== one;
  const display = [left.querySelector('section') === parent, left.querySelector('aside span') === aside,
    left.textContent, right.querySelector('span') === rightOne, right.textContent];
  const retired = [...disposed].sort();
  const explicit = await code(screen.unmount());
  await attachment.detach();
  await renderer.dispose();
  await other.dispose();
  await runtime.dispose();
  return { results, replaced, display, retired, diagnostics: diagnostics.sort(), rightDiagnostics, explicit, empty: left.childNodes.length === 0 };
};

globalThis.missingConnector = async () => {
  const runtime = createRuntime();
  runtime.registry.registerResourceSet(defineResourceSet({
    id: 'external', version: '1', components: [{
      contract: { kind: 'Component', id: 'Badge', spec: {} },
      connectorId: 'external', implementation: {},
    }],
  }));
  const renderer = createRenderer({ runtime });
  const mounted = renderer.mount({ target: left, source: {
    render: { id: 'badge', componentRef: 'Badge' },
  } });
  await mounted.ready;
  const failure = await mounted.whenRendered().catch(error => error);
  await renderer.dispose();
  await runtime.dispose();
  return failure;
};
`;

async function browserPage(t) {
  const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL('../../../', import.meta.url)), contents: source },
    bundle: true, platform: 'browser', format: 'iife', write: false });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<main id="left"></main><main id="right"></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return page;
}

test('DOM display reconciles keyed ranges, scopes failures and follows the latest projection', async t => {
  const page = await browserPage(t);
  assert.deepEqual(await page.evaluate(() => globalThis.keyed()), {
    kept: true, replaced: true, children: ['two', 'one'], disposed: ['one', 'two'], preserved: true, empty: true,
  });
  assert.deepEqual(await page.evaluate(() => globalThis.projections()), {
    firstWasHeld: true, followed: 'success', confirmed: 'new', noOutdatedErrors: true, failed: 'INTERNAL_ERROR',
    sibling: 'sibling', survivingView: 'fail', errors: [['render', 'slow', 'INTERNAL_ERROR']], badNodeRemoved: true,
  });
  assert.deepEqual(await page.evaluate(() => globalThis.staticFallback()), {
    loading: 'loadingbefore', updatedWhilePending: 'loadingafter', ready: 'readyafter', keptSibling: true, empty: true,
  });
  assert.deepEqual(await page.evaluate(() => globalThis.syncPending()), {
    waiting: [true, 'before', true], resumed: [true, 'after', false], disposed: ['before'], empty: true,
  });
  const missing = await page.evaluate(() => globalThis.missingConnector());
  assert.equal(missing.code, 'REFERENCE_NOT_FOUND');
  assert.equal(missing.message, 'Connector "external" is unavailable on this display connection.');
  assert.deepEqual(missing.resource, { kind: 'Component', id: 'Badge' });
});

test('a pending parent retires withdrawn slots, defers new children and keeps the other slots', async t => {
  const page = await browserPage(t);
  assert.deepEqual(await page.evaluate(() => globalThis.pendingSlots()), {
    wasLive: 'success', waited: true, retiredEvent: 'CANCELLED', result: 'success', removed: true,
    offeredWhilePending: true, waiting: [true, true, true, 'aside'], resumed: [false, true, true, 'mainaside', 1], disposed: 2,
  });
});

test('slot disposal failures report per child while replacement and other branches can render', async t => {
  const page = await browserPage(t);
  assert.deepEqual(await page.evaluate(() => globalThis.slotDisposalFailure()), {
    results: ['success', 'success'], replaced: true, display: [true, true, 'onetwostable', true, 'onetwostable'],
    retired: ['one', 'two'], diagnostics: [['dispose', 'main-one', 'INTERNAL_ERROR'], ['dispose', 'main-two', 'INTERNAL_ERROR']],
    rightDiagnostics: [], explicit: 'INTERNAL_ERROR', empty: true,
  });
});

test('fallbacks keep sibling order regardless of the failing components’ disposal order', { timeout: 10_000 }, async t => {
  const page = await browserPage(t);
  for (const first of ['A', 'B']) await t.test(first, async () => {
    assert.deepEqual(await page.evaluate(id => globalThis.fallbackOrder(id), first), {
      result: 'INTERNAL_ERROR', order: 'A!B!C', restored: 'ABC', kept: [true, true, 'ABC'],
    });
  });
});

test('a disposable fallback displays each node status with or without an update hook', async t => {
  const page = await browserPage(t);
  for (const update of [false, true]) await t.test(update ? 'update in place' : 'dispose only', async () => {
    const mounts = update ? ['pending'] : ['pending', 'TYPE_MISMATCH', 'pending'];
    assert.deepEqual(await page.evaluate(value => globalThis.fallbackTransitions(value), update), {
      initial: 'pending', keptWhenUnrelated: true, error: ['TYPE_MISMATCH', update], pendingAgain: 'pending', ready: 'ready',
      mounts, disposals: mounts, empty: true,
    });
  });
});

test('closing a display in a render callback stops later callbacks and releases its target', async t => {
  const page = await browserPage(t);
  const cases = [
    ['accepts', ['accepts', 'detach']],
    ['mount', ['accepts', 'mount', 'detach', 'dispose']],
    ['setPending', ['setPending', 'detach', 'dispose']],
    ['fallback.mount', ['fallback.mount', 'detach', 'fallback.dispose']],
    ['fallback.update', ['fallback.update', 'detach', 'fallback.dispose']],
  ];
  for (const [phase, trace] of cases) await t.test(phase, async () => {
    assert.deepEqual(await page.evaluate(name => globalThis.closeDuringRender(name), phase), {
      trace, outcome: 'CANCELLED', empty: true, restored: ['restored', 'restored'],
    });
  });
});
