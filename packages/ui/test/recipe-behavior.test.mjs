import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { sampleBySlug } from './fixtures/samples.mjs';

// The original catalog ViewSpecs are consumed through the public DOM entry points.
const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = await build({ stdin: { contents: `
  import { createRegistry, createRuntime } from '@viewstem/core';
  import { registerShadcn } from '@viewstem/ui';
  import { connect } from './packages/ui/dist/dom.js';
  window.mountRecipe = async definition => {
    window.errors = [];
    window.calendarEvents = [];
    window.sliderEvents = [];
    const observe = view => ({
      ...view,
      emit(node, event, payload) {
        if (['shadcn.Calendar.Root', 'shadcn.RangeCalendar.Root'].includes(node.componentRef) &&
            ['valueChange', 'placeholderChange', 'startValueChange', 'endValueChange'].includes(event)) {
          window.calendarEvents.push([event, payload.value]);
        }
        if (node.componentRef === 'shadcn.Slider' && ['valueChange', 'valueCommit'].includes(event)) {
          window.sliderEvents.push([event, payload]);
        }
        return view.emit(node, event, payload);
      },
    });
    const registry = createRegistry(); registerShadcn(registry);
    const runtime = createRuntime({ registry });
    const view = await runtime.createView(definition);
    const attachment = connect(observe(view), document.querySelector('#app'), e => errors.push(String(e.code ?? e)));
    await view.whenSettled(view.initial);
    window.view = view;
    window.disposeRecipe = () => { attachment.dispose(); view.dispose(); runtime.dispose(); };
  };
`, resolveDir: workspace }, bundle: true, write: false, platform: 'browser', format: 'iife' });

const sample = slug => {
  const result = sampleBySlug.get(slug);
  assert.ok(result, slug);
  return result.view;
};
const state = (page, name) => page.evaluate(name => window.view.getState(name).read(), name);
async function expectState(page, name, value, action) {
  await page.waitForFunction(({ name, value, action }) => {
    const snapshot = window.view.getSnapshot();
    return JSON.stringify(snapshot.states?.[name]?.value) === JSON.stringify(value) &&
      (!action || snapshot.actions?.[action]?.status === 'success');
  }, { name, value, action });
}
function day(page, date) {
  return page.locator(`[data-date="${date}"]`).first();
}
async function expectCalendarEvents(page, expected) {
  await page.waitForFunction(count => window.calendarEvents.length >= count, expected.length);
  assert.deepEqual(await page.evaluate(() => window.calendarEvents), expected);
}

function resizableTable() {
  const view = structuredClone(sample('data-table'));
  const target = { '@path': '/states/pageSize' };
  view.states.pageSize = { ...view.states.page, initial: 2 };
  view.render.inputs.pageSize = target;
  const pageAction = view.render.on.pageIndexChange;
  view.render.on.pageSizeChange = {
    ...pageAction,
    id: 'data-table-1-pageSizeChange',
    inputs: { ...pageAction.inputs, target },
  };
  return view;
}

test('Input and Textarea render numeric State values', { timeout: 30_000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<!doctype html><main id="app"></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const value = { '@path': '/states/quantity' };
  await page.evaluate(definition => window.mountRecipe(definition), {
    states: { quantity: { kind: 'State', schema: { type: 'number' }, initial: 42 } },
    render: {
      id: 'fields', componentRef: 'shadcn.Field.Group', slots: { default: [
        { id: 'quantity', componentRef: 'shadcn.Input', inputs: { type: 'number', value, 'aria-label': 'Quantity' } },
        { id: 'notes', componentRef: 'shadcn.Textarea', inputs: { value, 'aria-label': 'Notes' } },
      ] },
    },
  });

  const input = page.getByLabel('Quantity');
  const textarea = page.getByLabel('Notes');
  assert.equal(await input.inputValue(), '42');
  assert.equal(await textarea.inputValue(), '42');
  for (const next of [0, -3.5]) {
    await page.evaluate(value => window.view.getState('quantity').write(value), next);
    assert.equal(await input.inputValue(), String(next));
    assert.equal(await textarea.inputValue(), String(next));
  }
  assert.deepEqual(await page.evaluate(() => [window.errors, window.view.getSnapshot().errors]), [[], []]);
  await page.evaluate(() => window.disposeRecipe());
});

test('Command.Dialog searches and selects commands by keyboard', { timeout: 30_000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const styles = await readFile(new URL('../dist/styles.css', import.meta.url), 'utf8');
  for (const nested of [false, true]) {
    await t.test(nested ? 'explicit Command.Root' : 'direct command slots', async t => {
      const page = await browser.newPage();
      t.after(() => page.close());
      await page.setContent('<!doctype html><main id="app"></main>');
      await page.addStyleTag({ content: styles });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const schema = { type: 'string' };
      const command = (id, text, disabled = false) => ({
        id,
        componentRef: 'shadcn.Command.Item',
        inputs: { text, value: id, disabled },
        on: { select: {
          action: {
            ports: { selection: { kind: 'State', schema, required: true } },
            steps: [{ kind: 'SetState', target: { '@path': '/ports/selection' }, value: id }],
          },
          inputs: { selection: { '@path': '/states/selection' } },
        } },
      });
      const parts = [
        { id: 'search', componentRef: 'shadcn.Command.Input', inputs: { 'aria-label': 'Search commands' } },
        { id: 'list', componentRef: 'shadcn.Command.List', slots: { default: [
          command('apple', 'Apple'), command('bread', 'Banana Bread'),
          command('disabled', 'Banana Disabled', true), command('split', 'Banana Split'),
        ] } },
      ];
      const children = nested ? [{ id: 'command', componentRef: 'shadcn.Command.Root', slots: { default: parts } }] : parts;
      await page.evaluate(definition => window.mountRecipe(definition), {
        states: { selection: { kind: 'State', schema, initial: '' } },
        render: {
          id: 'palette', componentRef: 'shadcn.Command.Dialog',
          inputs: { open: true, title: 'Commands' }, slots: { default: children },
        },
      });
      const dialog = page.getByRole('dialog', { name: 'Commands' });
      const search = dialog.getByLabel('Search commands');
      assert.equal(await dialog.locator('[data-command-initialized]').count(), 1);
      const activeCommand = () => search.evaluate(input =>
        input.ownerDocument.getElementById(input.getAttribute('aria-activedescendant'))?.textContent);
      await search.fill('banana');
      assert.equal(await dialog.getByText('Apple', { exact: true }).isVisible(), false);
      assert.equal(await activeCommand(), 'Banana Bread');
      await search.press('ArrowDown');
      assert.equal(await activeCommand(), 'Banana Split');
      await search.press('ArrowUp');
      assert.equal(await activeCommand(), 'Banana Bread');
      await search.press('ArrowDown');
      await search.press('Enter');
      await expectState(page, 'selection', 'split');
      assert.deepEqual(await page.evaluate(() => [window.errors, window.view.getSnapshot().errors]), [[], []]);
      await page.evaluate(() => window.disposeRecipe());
    });
  }
});

test('multi-thumb Slider emits the whole range and accepts external State updates', { timeout: 30_000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<!doctype html><main id="app"></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const definition = structuredClone(sample('slider'));
  const numbers = { type: 'array', items: { type: 'number' } };
  Object.assign(definition.states.level, { schema: numbers, initial: [20, 50, 80] });
  Object.assign(definition.render.inputs, { type: 'multiple', thumbLabels: ['Low', 'Middle', 'High'] });
  const { ports } = definition.render.on.valueChange.action;
  ports.target.schema = ports.next.schema = numbers;
  await page.evaluate(view => window.mountRecipe(view), definition);

  const thumbs = page.getByRole('slider');
  assert.equal(await thumbs.count(), 3);
  const middle = page.getByRole('slider', { name: 'Middle' });
  await middle.press('ArrowRight');
  await expectState(page, 'level', [20, 55, 80]);
  await middle.press('End');
  await expectState(page, 'level', [20, 80, 80]);
  await middle.press('ArrowRight');
  await page.evaluate(() => window.view.getState('level').write([10, 40, 90]));
  await page.waitForFunction(() => document.querySelector('[aria-label="Middle"]').getAttribute('aria-valuenow') === '40');
  assert.deepEqual(await page.evaluate(() => window.sliderEvents), [
    ['valueChange', { value: [20, 55, 80] }],
    ['valueCommit', { value: [20, 55, 80] }],
    ['valueChange', { value: [20, 80, 80] }],
    ['valueCommit', { value: [20, 80, 80] }],
  ]);
  assert.deepEqual(await page.evaluate(() => [window.errors, window.view.getSnapshot().errors]), [[], []]);
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.disposeRecipe());
});

test('original catalog recipes preserve State, Actions and calendar events', { timeout: 120_000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const slug of ['calendar', 'range-calendar', 'date-picker', 'data-table']) {
    await t.test(slug, async t => {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      t.after(async () => {
        try {
          const diagnostics = await page.evaluate(async () => {
            const viewErrors = window.view?.getSnapshot().errors ?? [];
            await window.disposeRecipe?.();
            return { errors: window.errors, viewErrors };
          });
          assert.deepEqual(diagnostics, { errors: [], viewErrors: [] });
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      });
      await page.setContent('<!doctype html><html lang="ko"><body><main id="app"></main></body></html>');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      assert.deepEqual(errors, []);
      await page.evaluate(async view => {
        try { await window.mountRecipe(view); }
        catch (error) { throw new Error(error?.stack ?? JSON.stringify(error)); }
      }, sample(slug));
      if (slug === 'data-table') {
        await page.getByRole('cell', { name: '1월' }).waitFor();
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expectState(page, 'page', 1, 'data-table-1-pageIndexChange');
        await page.getByRole('cell', { name: '3월' }).waitFor();
        await page.getByRole('button', { name: 'Previous', exact: true }).click();
        await expectState(page, 'page', 0, 'data-table-1-pageIndexChange');
        await page.getByRole('button', { name: '처리량' }).click();
        await expectState(page, 'sorting', [{ id: 'count', desc: true }], 'data-table-1-sortingChange');
        assert.deepEqual(await page.getByRole('cell').filter({ hasText: /^\d월$/ }).allTextContents(), ['4월', '2월']);
        await page.getByRole('checkbox', { name: 'Select row d' }).check();
        await expectState(page, 'selected', ['d'], 'data-table-1-selectedIdsChange');
        await page.getByRole('searchbox', { name: 'Filter rows' }).fill('1월');
        await expectState(page, 'filter', '1월', 'data-table-1-filterChange');
        await page.getByRole('cell', { name: '1월' }).waitFor();
        assert.deepEqual(await page.getByRole('cell').filter({ hasText: /^\d월$/ }).allTextContents(), ['1월']);
        // The original example uses a fixed size. Exercise the controlled port separately.
        await page.evaluate(async view => {
          await window.disposeRecipe();
          await window.mountRecipe(view);
        }, resizableTable());
        await page.getByRole('combobox', { name: 'Rows per page' }).selectOption('10');
        await expectState(page, 'pageSize', 10, 'data-table-1-pageSizeChange');
        await page.getByRole('cell', { name: '4월' }).waitFor();
      } else {
        const grid = page.getByRole('grid').first();
        const action = `${slug}-1-valueChange`;
        if (slug === 'date-picker') {
          await grid.waitFor({ state: 'hidden' });
          await page.getByRole('button').first().click();
        }
        await grid.waitFor({ state: 'visible' });
        await day(page, '2026-11-09').click();
        if (slug === 'range-calendar') {
          await expectState(page, 'date', { start: '2026-11-09', end: null }, action);
          const first = [
            ['startValueChange', '2026-11-09'],
            ['endValueChange', null],
            ['valueChange', { start: '2026-11-09', end: null }],
            ['placeholderChange', '2026-11-09'],
          ];
          await expectCalendarEvents(page, first);
          await day(page, '2026-11-09').press('ArrowRight');
          await page.waitForFunction(() => document.activeElement?.getAttribute('data-value') === '2026-11-10');
          await day(page, '2026-11-12').click();
          await expectState(page, 'date', { start: '2026-11-09', end: '2026-11-12' }, action);
          await expectCalendarEvents(page, [
            ...first,
            ['placeholderChange', '2026-11-10'],
            ['endValueChange', '2026-11-12'],
            ['valueChange', { start: '2026-11-09', end: '2026-11-12' }],
            ['placeholderChange', '2026-11-09'],
          ]);
        } else {
          await expectState(page, 'date', '2026-11-09', action);
          assert.equal(await state(page, 'date'), '2026-11-09');
          if (slug === 'date-picker') await grid.waitFor({ state: 'hidden' });
          else {
            await page.getByRole('button', { name: /^(Next|Switch to next month)$/ }).click();
            await page.getByRole('button', { name: /^(Previous|Switch to previous month)$/ }).click();
            await page.getByRole('combobox', { name: /select (a )?month/i }).selectOption('10');
            await expectCalendarEvents(page, [
              ['valueChange', '2026-11-09'],
              ['placeholderChange', '2026-11-09'],
              ['placeholderChange', '2026-12-02'],
              ['placeholderChange', '2026-11-02'],
              ['placeholderChange', '2026-10-02'],
            ]);
          }
        }
      }
    });
  }
});
