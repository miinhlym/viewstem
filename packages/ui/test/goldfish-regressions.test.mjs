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

test('P1 design-critic-1-1: Questionnaire excludes unavailable fields and keeps answers for restored questions', async t => {
  const definition = fixture('questionnaire');
  const items = definition.render.inputs.items;
  definition.states.items = state(items);
  definition.render.inputs.items = from('items');
  const page = await mount(t, definition);
  const formData = () => page.locator('form').evaluate(form => Object.fromEntries(new FormData(form)));
  const unavailable = page.locator('input[value="summary"]');
  await pointerClick(page, unavailable);
  await page.getByRole('button', { name: 'Next' }).click();
  await pointerClick(page, page.locator('input[value="comparison"]'));
  await write(page, 'items', [items[1]]);
  await page.getByRole('button', { name: 'Submit' }).click();
  await waitState(page, 'submitted', true);
  assert.deepEqual(await formData(), { detail: 'comparison' });
  await write(page, 'items', items);
  assert.deepEqual(await formData(), { format: 'summary', detail: 'comparison' });
  await page.getByRole('button', { name: 'Previous' }).click();
  await write(page, 'items', [{ ...items[0], choices: [{ value: 'summary', disabled: true }, { value: 'full' }] }, items[1]]);
  assert.equal(await unavailable.isDisabled(), true);
  await pointerClick(page, unavailable);
  assert.deepEqual(await formData(), { detail: 'comparison' });
  await page.getByRole('button', { name: 'Next' }).click();
  assert.equal(await page.getByText('보고서 형식을 선택하세요').isVisible(), true);
  await pointerClick(page, page.locator('input[value="full"]'));
  assert.deepEqual(await formData(), { format: 'full', detail: 'comparison' });
});

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

test('P1 codebase-details-1-5: disposing an open original DatePicker leaves no queued browser exception', async t => {
  const page = await mount(t, fixture('date-picker'));
  await page.getByRole('button').first().click();
  await page.getByRole('dialog').waitFor();
  await page.evaluate(() => window.dispose());
  await frame(page);
  assert.equal(await page.locator('#app').count(), 1);
  assert.equal(await page.locator('[data-viewstem-ui]').count(), 0);
  await page.evaluate(async definition => {
    await window.mount(definition);
    document.querySelector('.vs-date-trigger').click();
    window.dispose();
  }, fixture('date-picker'));
  await frame(page);
});

test('P2 design-critic-1-3: RadioGroup propagates disabled, required and name to form controls', async t => {
  const definition = fixture('radio-group');
  definition.states.site.initial = '';
  definition.states.disabled = state(true, boolean);
  Object.assign(definition.render.inputs, { disabled: from('disabled'), name: 'category', required: true });
  const page = await mount(t, definition, '<form><main id="app"></main></form>');
  const seoul = page.locator('#radio-seoul');
  const busan = page.locator('#radio-busan');
  const formData = () => page.locator('form').evaluate(form => Object.fromEntries(new FormData(form)));
  const valid = () => page.locator('form').evaluate(form => form.checkValidity());
  assert.equal(await seoul.isDisabled(), true);
  await pointerClick(page, busan);
  assert.equal(await read(page, 'site'), '');
  assert.equal(await valid(), true);
  assert.deepEqual(await formData(), {});
  await write(page, 'disabled', false);
  assert.equal(await seoul.isDisabled(), false);
  assert.equal(await page.locator('#radio-jeju').isDisabled(), true);
  assert.equal(await valid(), false);
  await busan.press('Space');
  await waitState(page, 'site', 'busan');
  assert.equal(await valid(), true);
  assert.deepEqual(await formData(), { category: 'busan' });
});

test('P2 design-critic-1-4: NativeSelect normalizes numeric values and clears explicit null', async t => {
  function select(id, multiple) {
    return node(id, 'NativeSelect.Root', { value: from(id), 'aria-label': id, multiple }, [
      node(id + 'One', 'NativeSelect.Option', { value: 1, text: 'One' }),
      node(id + 'Zero', 'NativeSelect.Option', { value: 0, text: 'Zero' }),
    ]);
  }
  const page = await mount(t, {
    states: { single: state(0), multiple: state([0, '1']) },
    render: group(select('single', false), select('multiple', true)),
  });
  const single = page.getByLabel('single', { exact: true });
  const multiple = page.getByLabel('multiple', { exact: true });
  assert.equal(await single.inputValue(), '0');
  assert.deepEqual(await multiple.evaluate(el => Array.from(el.selectedOptions, option => option.value)), ['1', '0']);
  await write(page, 'single', '0');
  assert.equal(await single.inputValue(), '0');
  await write(page, 'single', null);
  await write(page, 'multiple', null);
  assert.equal(await single.evaluate(el => el.selectedIndex), -1);
  assert.equal(await multiple.evaluate(el => el.selectedOptions.length), 0);
});

test('P2 design-critic-1-5: Input and Textarea clear null and preserve unbound edits', async t => {
  const page = await mount(t, {
    states: { amount: state(42, { type: ['number', 'null'] }) },
    render: group(
      node('input', 'Input', { type: 'number', value: from('amount'), 'aria-label': 'Amount' }),
      node('textarea', 'Textarea', { value: from('amount'), 'aria-label': 'Memo' }),
      node('unbound', 'Input', { 'aria-label': 'Local edit' }),
    ),
  });
  const amount = page.getByLabel('Amount');
  const memo = page.getByLabel('Memo');
  const unbound = page.getByLabel('Local edit');
  assert.equal(await amount.inputValue(), '42');
  assert.equal(await memo.inputValue(), '42');
  await unbound.fill('draft');
  await write(page, 'amount', null);
  assert.equal(await amount.inputValue(), '');
  assert.equal(await memo.inputValue(), '');
  assert.equal(await unbound.inputValue(), 'draft');
  await write(page, 'amount', 0);
  assert.equal(await amount.inputValue(), '0');
  assert.equal(await memo.inputValue(), '0');
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

test('P2 codebase-details-1-2: multiple Calendar protects selected days for pointer and keyboard', async t => {
  const dates = ['2026-11-09', '2026-11-12'];
  const page = await mount(t, {
    states: { dates: state(dates) },
    render: node('calendar', 'Calendar.Root', {
      type: 'multiple', value: from('dates'), preventDeselect: true, placeholder: '2026-11-09',
    }, [], setState('dates', true, 'valueChange')),
  });
  const ninth = page.locator('[data-date="2026-11-09"]').first();
  await ninth.click();
  await ninth.press('Enter');
  await ninth.press('Space');
  await frame(page);
  assert.deepEqual(await read(page, 'dates'), dates);
  assert.deepEqual(await payloads(page, 'calendar', 'valueChange'), []);
  await page.locator('[data-date="2026-11-15"]').first().click();
  await waitState(page, 'dates', [...dates, '2026-11-15']);
  assert.deepEqual(await payloads(page, 'calendar', 'valueChange'), [[...dates, '2026-11-15']]);
});

test('P2 codebase-details-1-3: DatePicker uses the same bounded date for its trigger and grid', async t => {
  const definition = fixture('date-picker');
  definition.states.date.initial = '2026-11-05';
  definition.states.min = state('2026-11-09', string);
  Object.assign(definition.render.inputs, { min: from('min'), locale: 'en-US' });
  const page = await mount(t, definition);
  const trigger = page.locator('.vs-date-trigger');
  const selected = date => page.locator(`[data-date="${date}"]`).first().evaluate(day => day.closest('td').getAttribute('aria-selected'));
  assert.equal(await trigger.textContent(), 'November 9, 2026');
  await trigger.click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await selected('2026-11-09'), 'true');
  await write(page, 'date', '2026-11-20');
  assert.equal(await trigger.textContent(), 'November 20, 2026');
  assert.equal(await selected('2026-11-20'), 'true');
  await write(page, 'date', '2026-11-05');
  assert.equal(await trigger.textContent(), 'November 9, 2026');
  assert.equal(await selected('2026-11-09'), 'true');
  assert.equal(await read(page, 'date'), '2026-11-05');
  await write(page, 'min', '2026-11-01');
  assert.equal(await trigger.textContent(), 'November 5, 2026');
  assert.equal(await selected('2026-11-05'), 'true');
  assert.deepEqual(await payloads(page, definition.render.id, 'valueChange'), []);
});

const column = { id: 'label', accessorKey: 'label', label: 'Label' };

test('P2 codebase-details-1-4: DataTable renders numeric row IDs and emits stable string selections', async t => {
  const page = await mount(t, {
    states: { selected: state([], { type: 'array', items: string }) },
    render: node('table', 'DataTable', {
      columns: [column], selectedIds: from('selected'),
      data: [{ id: 1, label: 'alpha' }, { id: '2', label: 'beta' }, { id: 0, label: 'gamma' }],
    }, [], setState('selected', { type: 'array', items: string }, 'selectedIdsChange')),
  });
  assert.deepEqual(await page.getByRole('cell').filter({ hasText: /alpha|beta|gamma/ }).allTextContents(), ['alpha', 'beta', 'gamma']);
  await page.getByRole('checkbox', { name: 'Select row 0' }).check();
  await waitState(page, 'selected', ['0']);
  assert.deepEqual(await payloads(page, 'table', 'selectedIdsChange'), [['0']]);
});

test('P2 codebase-details-1-6: DataTable resizes from the displayed page and publishes a valid index', async t => {
  const number = { type: 'number' };
  const page = await mount(t, {
    states: { index: state(5, number), size: state(50, number) },
    render: node('table', 'DataTable', {
      columns: [column], pageIndex: from('index'), pageSize: from('size'),
      data: Array.from({ length: 22 }, (_, index) => ({ id: String(index), label: 'row' + index })),
    }, [], { ...setState('index', number, 'pageIndexChange'), ...setState('size', number, 'pageSizeChange') }),
  });
  const first = () => page.getByRole('cell').filter({ hasText: /^row\d+$/ }).first().textContent();
  assert.equal(await first(), 'row0');
  await page.getByRole('combobox', { name: 'Rows per page' }).selectOption('10');
  await waitState(page, 'size', 10);
  await waitState(page, 'index', 0);
  assert.equal(await first(), 'row0');
  assert.deepEqual(await payloads(page, 'table', 'pageSizeChange'), [10]);
  assert.deepEqual(await payloads(page, 'table', 'pageIndexChange'), [0]);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await waitState(page, 'index', 1);
  assert.equal(await first(), 'row10');
});
