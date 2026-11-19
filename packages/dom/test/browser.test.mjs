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

test('DOM display reconciles keyed ranges, scopes failures and follows the latest projection', async t => {
  const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL('../../../', import.meta.url)), contents: source },
    bundle: true, platform: 'browser', format: 'iife', write: false });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<main id="left"></main><main id="right"></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
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
