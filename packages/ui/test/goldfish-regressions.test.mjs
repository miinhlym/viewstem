import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { sampleBySlug } from './fixtures/samples.mjs';

const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const styles = await readFile(new URL('../dist/styles.css', import.meta.url), 'utf8');
const bundle = await build({
  stdin: { resolveDir: workspace, contents: `
    import { createRegistry, createRuntime } from '@viewstem/core';
    import { attach, registerShadcn } from '@viewstem/ui';

    window.mount = async definition => {
      const registry = createRegistry();
      registerShadcn(registry);
      const runtime = createRuntime({ registry });
      const { view, initialComplete } = await runtime.createView({ view: definition });
      window.events = [];
      window.renderErrors = [];
      const attachment = attach({
        ...view,
        emit(node, event, payload) {
          if (!payload?.type) events.push([node.id, event, payload?.value]);
          return view.emit(node, event, payload);
        },
      }, document.querySelector('#app'), { onError: error => renderErrors.push(String(error.code ?? error)) });
      await initialComplete;
      window.view = view;
      window.viewErrors = () => view.getSnapshot().errors;
      window.dispose = () => {
        if (!window.view) return;
        const errors = window.viewErrors();
        window.viewErrors = () => errors;
        window.view = undefined;
        attachment.dispose();
        runtime.dispose();
      };
      return view.getSnapshot().roots.map(node => node.status);
    };
  ` },
  bundle: true, write: false, platform: 'browser', format: 'iife',
});

const string = { type: 'string' };
const boolean = { type: 'boolean' };
const path = value => ({ '@path': value });
const state = (initial, schema = true) => ({ kind: 'State', initial, schema });
const from = key => path('/states/' + key);
const node = (id, name, inputs = {}, children = [], on) => ({
  id, componentRef: 'shadcn.' + name, inputs,
  ...(children.length ? { slots: { default: children } } : {}),
  ...(on ? { on } : {}),
});
const group = (...nodes) => node('group', 'Field.Group', {}, nodes);
const fixture = slug => structuredClone(sampleBySlug.get(slug).view);
const write = (page, name, value) => page.evaluate(([key, next]) => window.view.getState(key).write(next), [name, value]);
const read = (page, name) => page.evaluate(key => window.view.getState(key).read(), name);
const waitState = (page, name, value) => page.waitForFunction(([key, expected]) =>
  JSON.stringify(window.view.getState(key).read()) === JSON.stringify(expected), [name, value]);
const payloads = (page, id, name) => page.evaluate(([id, name]) =>
  window.events.filter(event => event[0] === id && event[1] === name).map(event => event[2]), [id, name]);
const waitEvent = (page, id, name, value) => page.waitForFunction(([id, name, value]) =>
  window.events.some(event => event[0] === id && event[1] === name && event[2] === value), [id, name, value]);
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const pointerClick = async (page, locator) => {
  const rect = await locator.boundingBox();
  assert.ok(rect);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
};

function setState(key, schema, event, value = path('/event/value')) {
  return { [event]: {
    action: {
      ports: {
        target: { kind: 'State', schema, required: true },
        next: { kind: 'Value', schema, required: true },
      },
      steps: [{ kind: 'SetState', target: path('/ports/target'), value: path('/ports/next') }],
    },
    inputs: { target: from(key), next: value },
  } };
}

let browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(async () => { await browser?.close(); });

async function mount(t, definition, host = '<main id="app"></main>') {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    try {
      assert.deepEqual(await page.evaluate(() => [window.renderErrors, window.viewErrors?.()]), [[], []]);
      await page.evaluate(() => window.dispose?.());
      await frame(page);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
  await page.setContent('<!doctype html><html lang="en">' + host + '</html>');
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  assert.deepEqual(await page.evaluate(view => window.mount(view), definition), ['ready']);
  return page;
}

test('P1 design-critic-1-2: Select Root disables its real trigger and excludes its named input from forms', async t => {
  const definition = fixture('select');
  definition.states.disabled = state(true, boolean);
  Object.assign(definition.render.inputs, { disabled: from('disabled'), name: 'region' });
  const page = await mount(t, definition, '<form><main id="app"></main></form>');
  const trigger = page.locator('[data-vs-component="Select.Trigger"]');
  const formData = () => page.locator('form').evaluate(form => Object.fromEntries(new FormData(form)));
  assert.equal(await trigger.isDisabled(), true);
  await pointerClick(page, trigger);
  await page.keyboard.press('Enter');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(await payloads(page, definition.render.id, 'openChange'), []);
  assert.equal(await read(page, 'site'), 'seoul');
  assert.deepEqual(await formData(), {});
  await write(page, 'disabled', false);
  await trigger.press('ArrowDown');
  await page.getByRole('option', { name: '부산' }).click();
  await waitState(page, 'site', 'busan');
  assert.deepEqual(await formData(), { region: 'busan' });
  await trigger.click();
  await write(page, 'disabled', true);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(await formData(), {});
});

test('P1 structural-1-1: Dialog child-slot trigger cannot run its Action or open while disabled', async t => {
  const disabled = from('disabled');
  const trigger = node('trigger', 'Dialog.Trigger', { disabled }, [],
    setState('clicked', boolean, 'click', true));
  trigger.slots = { child: [node('child', 'Button', { text: 'Open settings' }, [], setState('childClicked', boolean, 'click', true))] };
  const nativeTrigger = node('native', 'Dialog.Trigger', { disabled, text: 'Open normally' });
  const content = node('content', 'Dialog.Content', {}, [node('title', 'Dialog.Title', { text: 'Settings' })]);
  const page = await mount(t, {
    states: { disabled: state(true, boolean), clicked: state(false, boolean), childClicked: state(false, boolean) },
    render: node('dialog', 'Dialog.Root', {}, [trigger, nativeTrigger, content]),
  });
  const button = page.locator('[data-vs-component="Button"]');
  await pointerClick(page, button);
  await button.evaluate(element => element.focus());
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('dialog').evaluate(el => el.open), false);
  assert.equal(await page.getByText('Open normally').isDisabled(), true);
  assert.equal(await read(page, 'clicked'), false);
  assert.equal(await read(page, 'childClicked'), false);
  await write(page, 'disabled', false);
  await button.press('Enter');
  await page.getByRole('dialog', { name: 'Settings' }).waitFor();
  await waitState(page, 'clicked', true);
  await waitState(page, 'childClicked', true);
});

test('P1 elephant-1-1: Command.Dialog Escape updates State once and survives unrelated projections', async t => {
  const page = await mount(t, {
    states: { open: state(true, boolean), label: state('Before', string) },
    render: group(node('status', 'Button', { text: from('label') }),
      node('command', 'Command.Dialog', { open: from('open'), title: 'Commands' }, [
        node('search', 'Command.Input', { 'aria-label': 'Search' }),
      ], setState('open', boolean, 'openChange'))),
  });
  const dialog = page.getByRole('dialog', { name: 'Commands' });
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await waitState(page, 'open', false);
  await write(page, 'label', 'After');
  assert.equal(await dialog.isVisible(), false);
  assert.deepEqual(await payloads(page, 'command', 'openChange'), [false]);
  await write(page, 'open', true);
  await dialog.waitFor();
  await write(page, 'open', false);
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(await payloads(page, 'command', 'openChange'), [false]);
});

test('P1 elephant-1-1: existing Command.Dialog JSON with no close Action stays dismissed until open changes', async t => {
  const page = await mount(t, {
    states: { open: state(true, boolean), label: state('Before', string) },
    render: group(node('status', 'Button', { text: from('label') }),
      node('command', 'Command.Dialog', { open: from('open'), title: 'Commands' }, [node('search', 'Command.Input')])),
  });
  const dialog = page.getByRole('dialog', { name: 'Commands' });
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await write(page, 'label', 'After');
  assert.equal(await dialog.isVisible(), false);
  await write(page, 'open', false);
  await write(page, 'open', true);
  await dialog.waitFor();
});

test('P1 structural-1-2: Popover Close emits one close and never runs the Trigger Action', async t => {
  const definition = fixture('popover');
  definition.states.triggered = state(false, boolean);
  definition.render.slots.default[0].on = setState('triggered', boolean, 'click', true);
  const page = await mount(t, definition);
  const trigger = page.getByRole('button', { name: '알림 설정' });
  await trigger.click();
  await waitState(page, 'triggered', true);
  await waitState(page, 'open', true);
  await waitEvent(page, definition.render.id, 'openChangeComplete', true);
  await write(page, 'triggered', false);
  await page.getByRole('button', { name: '완료' }).click();
  await waitState(page, 'open', false);
  await waitEvent(page, definition.render.id, 'openChangeComplete', false);
  assert.equal(await read(page, 'triggered'), false);
  assert.deepEqual(await payloads(page, definition.render.id, 'openChange'), [true, false]);
  assert.deepEqual(await payloads(page, definition.render.id, 'openChangeComplete'), [true, false]);
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
});

const menu = (name, disabled = false) => node(name, 'Menubar.Menu', { value: name }, [
  node(name + 'Trigger', 'Menubar.Trigger', { text: name, disabled }),
  node(name + 'Content', 'Menubar.Content', {}, [node(name + 'Item', 'Menubar.Item', { text: 'Item' })]),
]);

test('P1 structural-1-3: Menubar skips disabled triggers and follows updated DOM order', async t => {
  const file = menu('File');
  const disabled = menu('Disabled', true);
  const view = menu('View');
  const help = menu('Help');
  const definition = { render: node('bar', 'Menubar.Root', {}, [file, disabled, view, help]) };
  const page = await mount(t, definition);
  const trigger = name => page.getByRole('menuitem', { name, exact: true });
  const focused = () => page.evaluate(() => document.activeElement.textContent);
  await page.keyboard.press('Tab');
  assert.equal(await focused(), 'File');
  await page.keyboard.press('ArrowRight');
  assert.equal(await focused(), 'View');
  assert.equal(await trigger('Disabled').getAttribute('tabindex'), '-1');
  await page.keyboard.press('End');
  assert.equal(await focused(), 'Help');
  await page.keyboard.press('Home');
  assert.equal(await focused(), 'File');
  definition.render.slots.default = [file, disabled, help, view];
  await page.evaluate(spec => window.view.update(spec), definition);
  await page.keyboard.press('ArrowRight');
  assert.equal(await focused(), 'Help');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await focused(), 'File');
});

function popover(id, { child = true, open, inside = [] } = {}) {
  const trigger = node(id + 'Trigger', 'Popover.Trigger', child ? {} : { text: id });
  if (child) trigger.slots = { child: [node(id + 'Button', 'Button', { text: id })] };
  return node(id, 'Popover.Root', open === undefined ? {} : { open }, [
    trigger,
    node(id + 'Content', 'Popover.Content', {}, [node(id + 'Close', 'Popover.Close', { text: 'Close ' + id }), ...inside]),
  ]);
}

test('P2 structural-1-4: Escape dismisses only the top nested Popover and restores its focus', async t => {
  const modal = node('modal', 'Dialog.Root', {}, [
    node('modalTrigger', 'Dialog.Trigger', { text: 'Open modal' }),
    node('modalContent', 'Dialog.Content', {}, [node('modalTitle', 'Dialog.Title', { text: 'Modal' })]),
  ]);
  const page = await mount(t, { render: popover('Outer', { inside: [popover('Inner'), modal] }) });
  const outer = page.getByRole('button', { name: 'Outer', exact: true });
  const inner = page.getByRole('button', { name: 'Inner', exact: true });
  await outer.click();
  await inner.click();
  assert.equal(await inner.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await inner.getAttribute('aria-expanded'), 'false');
  assert.equal(await outer.getAttribute('aria-expanded'), 'true');
  assert.equal(await inner.evaluate(el => el === document.activeElement), true);
  assert.deepEqual(await payloads(page, 'Outer', 'openChange'), [true]);
  assert.deepEqual(await payloads(page, 'Inner', 'openChange'), [true, false]);
  await page.getByRole('button', { name: 'Open modal' }).click();
  const dialog = page.getByRole('dialog', { name: 'Modal' });
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await outer.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await outer.getAttribute('aria-expanded'), 'false');
  assert.equal(await outer.evaluate(el => el === document.activeElement), true);
});

function tooltip(inputs = {}, providerInputs = {}) {
  return node('provider', 'Tooltip.Provider', providerInputs, [
    node('tip', 'Tooltip.Root', inputs, [
      node('target', 'Tooltip.Trigger', { text: 'Tooltip target' }),
      node('explanation', 'Tooltip.Content', { text: 'Extra information' }),
    ]),
  ]);
}

test('P2 structural-1-5: controlled Popover and Tooltip wait for external open state', async t => {
  const page = await mount(t, {
    states: { popoverOpen: state(false, boolean), tipOpen: state(false, boolean) },
    render: group(popover('Settings', { open: from('popoverOpen'), child: false }), tooltip({ open: from('tipOpen') })),
  });
  const trigger = page.getByRole('button', { name: 'Settings', exact: true });
  const tipTrigger = page.getByText('Tooltip target', { exact: true });
  const tip = page.locator('[role="tooltip"]');
  await trigger.click();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(await payloads(page, 'Settings', 'openChange'), [true]);
  assert.deepEqual(await payloads(page, 'Settings', 'openChangeComplete'), []);
  await write(page, 'popoverOpen', true);
  const close = page.getByRole('button', { name: 'Close Settings' });
  await close.click();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await payloads(page, 'Settings', 'openChange'), [true, false]);
  await write(page, 'popoverOpen', false);
  await close.waitFor({ state: 'hidden' });
  await tipTrigger.focus();
  await page.waitForFunction(() => window.events.some(event => event[0] === 'tip' && event[1] === 'openChange'));
  assert.equal(await tip.isVisible(), false);
  assert.deepEqual(await payloads(page, 'tip', 'openChangeComplete'), []);
  await write(page, 'tipOpen', true);
  await tip.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await tip.isVisible(), true);
  assert.deepEqual(await payloads(page, 'tip', 'openChange'), [true, false]);
  await write(page, 'tipOpen', false);
  await tip.waitFor({ state: 'hidden' });
});

test('P2 structural-1-6: removing Popover.Content clears ARIA and stale event handlers', async t => {
  const definition = { render: popover('Settings') };
  const page = await mount(t, definition);
  const trigger = page.getByRole('button', { name: 'Settings', exact: true });
  await trigger.click();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  const incomplete = structuredClone(definition);
  incomplete.render.slots.default.pop();
  await page.evaluate(spec => window.view.update(spec), incomplete);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(await trigger.getAttribute('aria-controls'), null);
  const previous = await payloads(page, 'Settings', 'openChangeComplete');
  await trigger.click();
  await trigger.click();
  await frame(page);
  assert.deepEqual(await payloads(page, 'Settings', 'openChange'), [true]);
  assert.deepEqual(await payloads(page, 'Settings', 'openChangeComplete'), previous);
  await page.evaluate(spec => window.view.update(spec), definition);
  await trigger.click();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await payloads(page, 'Settings', 'openChange'), [true, true]);
});

test('P2 structural-1-7: disabling Tooltip.Provider cancels an already scheduled hover', async t => {
  const page = await mount(t, {
    states: { disabled: state(false, boolean) },
    render: tooltip({}, { disabled: from('disabled'), delayDuration: 300 }),
  });
  const trigger = page.getByText('Tooltip target', { exact: true });
  const tip = page.locator('[role="tooltip"]');
  await trigger.hover();
  await write(page, 'disabled', true);
  await page.waitForTimeout(350);
  assert.equal(await tip.isVisible(), false);
  assert.deepEqual(await payloads(page, 'tip', 'openChange'), []);
  await page.mouse.move(0, 0);
  await write(page, 'disabled', false);
  await trigger.hover();
  await tip.waitFor();
  assert.deepEqual(await payloads(page, 'tip', 'openChange'), [true]);
});
