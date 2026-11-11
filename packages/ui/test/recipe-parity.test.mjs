import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { samples } from '../../svelte-ui/test/fixtures/samples.mjs';
import { svelteConsumerPlugin } from '../../svelte-ui/test/fixtures/svelte-consumer-plugin.mjs';
import { examples } from './comparison-fixtures.mjs';

// The exact catalog ViewSpecs are consumed by both public package entry points.
const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = await build({ stdin: { contents: `
  import { createRegistry, createRuntime } from '@viewstem/core';
  import { attach, registerShadcn } from '@viewstem/ui';
  import { createRenderer } from '@viewstem/svelte';
  import { registerComponents } from '@viewstem/svelte-ui';
  import { calendar } from '@viewstem/svelte-ui/shadcn/calendar';
  import { rangeCalendar } from '@viewstem/svelte-ui/shadcn/range-calendar';
  import { datePicker } from '@viewstem/svelte-ui/shadcn/date-picker';
  import { dataTable } from '@viewstem/svelte-ui/shadcn/data-table';
  window.mountRecipe = async (kind, definition) => {
    window.errors = [];
    window.calendarEvents = [];
    const observe = view => ({
      ...view,
      emit(node, event, payload) {
        if (['shadcn.Calendar.Root', 'shadcn.RangeCalendar.Root'].includes(node.componentRef) &&
            ['valueChange', 'placeholderChange', 'startValueChange', 'endValueChange'].includes(event)) {
          window.calendarEvents.push([event, payload.value]);
        }
        return view.emit(node, event, payload);
      },
    });
    if (kind === 'ui') {
      const registry = createRegistry(); registerShadcn(registry);
      const runtime = createRuntime({ registry });
      const mounted = await runtime.createView({ view: definition });
      const attachment = attach(observe(mounted.view), document.querySelector('#app'), { onError: e => errors.push(String(e.code ?? e)) });
      await mounted.initialComplete;
      window.view = mounted.view;
      window.disposeRecipe = () => { attachment.dispose(); runtime.dispose(); };
    } else {
      const renderer = createRenderer({ onError: e => errors.push(String(e.error?.code ?? e)) });
      registerComponents(renderer, [calendar, rangeCalendar, datePicker, dataTable]);
      const mounted = await renderer.runtime.createView({ view: definition });
      const attachment = renderer.attach(observe(mounted.view), document.querySelector('#app'));
      await mounted.initialComplete;
      await attachment.whenRendered();
      window.view = mounted.view;
      window.disposeRecipe = async () => { await attachment.dispose(); mounted.view.dispose(); await renderer.dispose(); };
    }
  };
`, resolveDir: workspace }, bundle: true, write: false, platform: 'browser', format: 'iife',
  conditions: ['svelte', 'browser'], plugins: [svelteConsumerPlugin] });

const sample = slug => {
  const result = samples.find(item => item.slug === slug);
  assert.ok(result, slug);
  assert.equal(examples.find(item => item.slug === slug)?.view, result.view);
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
function day(page, kind, date) {
  return page.locator(kind === 'ui' ? `[data-date="${date}"]` : `[data-value="${date}"][data-bits-day]`).first();
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

test('catalog recipes have equivalent State and action behavior in both adapters', { timeout: 120_000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const slug of ['calendar', 'range-calendar', 'date-picker', 'data-table']) {
    await t.test(slug, async t => {
      for (const kind of ['ui', 'svelte']) {
        await t.test(kind, async t => {
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
          await page.evaluate(async ({ kind, view }) => {
            try { await window.mountRecipe(kind, view); }
            catch (error) { throw new Error(error?.stack ?? JSON.stringify(error)); }
          }, { kind, view: sample(slug) });
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
            await page.evaluate(async ({ kind, view }) => {
              await window.disposeRecipe();
              await window.mountRecipe(kind, view);
            }, { kind, view: resizableTable() });
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
            await day(page, kind, '2026-11-09').click();
            if (slug === 'range-calendar') {
              await expectState(page, 'date', { start: '2026-11-09', end: null }, action);
              const first = [
                ['startValueChange', '2026-11-09'],
                ['endValueChange', null],
                ['valueChange', { start: '2026-11-09', end: null }],
                ['placeholderChange', '2026-11-09'],
              ];
              await expectCalendarEvents(page, first);
              await day(page, kind, '2026-11-09').press('ArrowRight');
              await page.waitForFunction(() => document.activeElement?.getAttribute('data-value') === '2026-11-10');
              await day(page, kind, '2026-11-12').click();
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
  }
});
