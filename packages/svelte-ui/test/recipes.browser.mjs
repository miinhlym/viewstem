import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import support from '@viewstem/svelte-ui/shadcn/support.json' with { type: 'json' };
import { createAuditHarness, write } from './fixtures/audit-harness.mjs';

let harness;
before(async () => { harness = await createAuditHarness({ checkConsoleErrors: true }); });
after(async () => { await harness?.close(); });

const path = value => ({ '@path': value });
const read = name => path('/states/' + name);
const state = initial => ({ kind: 'State', schema: true, initial });
const component = (id, name, inputs = {}, extra = {}) => ({ id, componentRef: 'shadcn.' + name, inputs, ...extra });
const group = (...children) => component('group', 'Field.Group', {}, { slots: { default: children } });
const set = (id, event, name, next = path('/event/value')) => ({
  [event]: {
    id,
    action: {
      ports: { target: { kind: 'State', schema: true, required: true }, next: { kind: 'Value', schema: true, required: true } },
      steps: [{ kind: 'SetState', target: path('/ports/target'), value: path('/ports/next') }],
    },
    inputs: { target: read(name), next },
  },
});
const button = (id, text, name, next) => component(id, 'Button', { text }, { on: set(id + '-click', 'click', name, next) });

const render = (t, view) => harness.setup(t, view);

async function expectState(page, name, value, action) {
  await page.waitForFunction(({ name, value, action }) => {
    const snapshot = mounted.view.getSnapshot();
    return snapshot.states?.[name]?.status === 'ready' &&
      JSON.stringify(snapshot.states[name].value) === JSON.stringify(value) &&
      (!action || snapshot.actions?.[action]?.status === 'success');
  }, { name, value, action });
}

test('Combobox search and choice commit through a Viewstem Action', async t => {
  const page = await render(t, {
    states: { choice: state('apple') },
    render: component('choice', 'Combobox', {
      value: read('choice'),
      options: [
        { value: 'apple', label: 'Apple' },
        { value: 'banana', label: 'Banana', disabled: true },
        { value: 'pear', label: 'Korean pear' },
      ],
    }, { on: set('select-choice', 'valueChange', 'choice') }),
  });
  const initialTrigger = page.getByRole('combobox', { name: 'Apple' });
  await initialTrigger.locator('svg.lucide-chevron-down').waitFor();
  assert.equal(await initialTrigger.evaluate(element => element.getBoundingClientRect().width), 200);
  await initialTrigger.click();
  await page.getByRole('option', { name: 'Banana' }).waitFor();
  assert.equal(await page.locator('[data-slot="popover-content"]').evaluate(element => element.offsetWidth), 200);
  assert.equal(await page.getByRole('option', { name: 'Banana' }).getAttribute('aria-disabled'), 'true');
  await page.getByRole('combobox', { name: 'Search options…' }).fill('Korean');
  await page.getByRole('option', { name: 'Korean pear' }).click();
  await expectState(page, 'choice', 'pear', 'select-choice');
  const trigger = page.getByRole('combobox', { name: 'Korean pear' });
  await trigger.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Korean pear');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
});

test('DatePicker returns date-only single values and complete ranges', async t => {
  const limits = { locale: 'en-US', min: '2026-11-03', max: '2026-11-29' };
  const page = await render(t, {
    states: { date: state('2026-11-03'), range: state({ start: '2026-11-04', end: null }) },
    render: group(
      component('date', 'DatePicker', { ...limits, value: read('date') }, { on: set('select-date', 'valueChange', 'date') }),
      component('range', 'DatePicker', { ...limits, range: read('range') }, { on: set('select-range', 'rangeChange', 'range') }),
    ),
  });
  const trigger = page.getByRole('button', { name: 'November 3, 2026', exact: true });
  await trigger.locator('svg.lucide-chevron-down').waitFor();
  assert.equal(await trigger.evaluate(element => element.getBoundingClientRect().width), 212);
  await trigger.click();
  const beforeMinimum = page.locator('[data-calendar-day][data-value="2026-11-02"]');
  await beforeMinimum.waitFor();
  assert.equal(await beforeMinimum.getAttribute('aria-disabled'), 'true');
  await page.locator('[data-calendar-day][data-value="2026-11-09"]').click();
  await expectState(page, 'date', '2026-11-09', 'select-date');
  await page.getByRole('button', { name: 'November 9, 2026', exact: true }).waitFor();
  await page.getByRole('button', { name: 'November 4, 2026', exact: true }).click();
  await page.locator('[data-range-calendar-day][data-value="2026-11-10"]').click();
  await expectState(page, 'range', { start: '2026-11-04', end: '2026-11-10' }, 'select-range');
  await page.getByRole('button', { name: 'November 4, 2026 – November 10, 2026', exact: true }).waitFor();
});

test('DataTable controls round-trip pagination, sorting, filter and row selection', async t => {
  const page = await render(t, {
    states: { sorting: state([]), filter: state(''), selected: state([]), index: state(0), size: state(1) },
    render: component('table', 'DataTable', {
      data: [{ key: 'a', name: 'Apple', count: 1 }, { key: 'b', name: 'Banana', count: 12 }],
      rowId: 'key',
      columns: [
        { id: 'name', accessorKey: 'name', label: 'Name', filterable: true },
        { id: 'count', accessorKey: 'count', label: 'Count', sortable: true },
      ],
      sorting: read('sorting'), filter: read('filter'), selectedIds: read('selected'),
      pageIndex: read('index'), pageSize: read('size'),
    }, { on: {
      ...set('sort', 'sortingChange', 'sorting'),
      ...set('filter', 'filterChange', 'filter'),
      ...set('select', 'selectedIdsChange', 'selected'),
      ...set('page-index', 'pageIndexChange', 'index'),
      ...set('page-size', 'pageSizeChange', 'size'),
    } }),
  });
  const labelPort = await page.evaluate(() => renderer.registry.get('Component', 'shadcn.DataTable').spec.ports.labels);
  const supportEntry = support.components.find(({ id }) => id === 'shadcn.DataTable');
  assert.deepEqual(labelPort, {
    kind: 'Value',
    schema: {
      type: 'object',
      properties: Object.fromEntries(
        ['filter', 'select', 'selectRow', 'noRows', 'previous', 'next', 'page', 'rowsPerPage']
          .map(name => [name, { type: 'string' }]),
      ),
      required: [],
      additionalProperties: false,
    },
  });
  assert.deepEqual(support.properties[supportEntry.propertiesRef].labels.schema, labelPort.schema);
  const preview = page.locator('#app');
  await preview.getByRole('columnheader', { name: 'Select', exact: true }).waitFor();
  await preview.getByText('Page 1 of 2', { exact: true }).waitFor();
  await preview.getByRole('button', { name: 'Next', exact: true }).click();
  await expectState(page, 'index', 1, 'page-index');
  await preview.getByRole('cell', { name: 'Banana' }).waitFor();
  await preview.getByRole('button', { name: 'Previous', exact: true }).click();
  await expectState(page, 'index', 0, 'page-index');
  const pageSize = preview.getByLabel('Rows per page');
  assert.equal(await pageSize.getAttribute('data-slot'), 'native-select');
  await pageSize.selectOption('10');
  await expectState(page, 'size', 10, 'page-size');
  await preview.getByRole('button', { name: 'Count' }).click();
  await expectState(page, 'sorting', [{ id: 'count', desc: true }], 'sort');
  await preview.getByRole('row').nth(1).getByRole('cell', { name: 'Banana' }).waitFor();
  const checkbox = preview.getByRole('checkbox', { name: 'Select row b' });
  assert.equal(await checkbox.getAttribute('data-slot'), 'checkbox');
  await checkbox.press('Space');
  await expectState(page, 'selected', ['b'], 'select');
  const search = preview.getByRole('searchbox', { name: 'Filter rows' });
  assert.equal(await search.getAttribute('data-slot'), 'input');
  await search.fill('apple');
  await expectState(page, 'filter', 'apple', 'filter');
  await preview.getByRole('cell', { name: 'Banana' }).waitFor({ state: 'detached' });
  await preview.getByRole('cell', { name: 'Apple' }).waitFor();
  await search.fill('missing');
  await preview.getByRole('cell', { name: 'No rows.', exact: true }).waitFor();
  await search.clear();
  await checkbox.waitFor();
  assert.equal(await checkbox.isChecked(), true);
});

test('DataTable localizes JSON labels and uses English for omitted fields', async t => {
  const labels = {
    filter: '행 필터',
    selectRow: '{id} 행 선택',
    noRows: '표시할 행이 없습니다.',
    page: '전체 {pages}쪽 중 {page}쪽',
  };
  const page = await render(t, {
    states: { labels: state(labels), filter: state('') },
    render: component('table', 'DataTable', {
      data: [{ id: '$&', name: '사과' }, { id: 'b', name: '바나나' }],
      columns: [{ id: 'name', accessorKey: 'name', label: '이름', filterable: true }],
      pageSize: 1,
      filter: read('filter'),
      labels: read('labels'),
    }),
  });
  const preview = page.locator('#app');
  const search = preview.getByRole('searchbox', { name: '행 필터' });
  assert.equal(await search.getAttribute('placeholder'), '행 필터');
  await preview.getByRole('checkbox', { name: '$& 행 선택', exact: true }).waitFor();
  await preview.getByText('전체 2쪽 중 1쪽', { exact: true }).waitFor();
  await preview.getByRole('columnheader', { name: 'Select', exact: true }).waitFor();
  await preview.getByRole('button', { name: 'Previous', exact: true }).waitFor();
  await preview.getByRole('button', { name: 'Next', exact: true }).waitFor();
  await preview.getByLabel('Rows per page', { exact: true }).waitFor();

  await write(page, 'labels', { ...labels, select: '선택', previous: '이전', next: '다음', rowsPerPage: '페이지당 행 수' });
  await preview.getByRole('columnheader', { name: '선택', exact: true }).waitFor();
  await preview.getByRole('button', { name: '이전', exact: true }).waitFor();
  await preview.getByRole('button', { name: '다음', exact: true }).waitFor();
  await preview.getByLabel('페이지당 행 수', { exact: true }).waitFor();
  await write(page, 'filter', '없는 이름');
  await preview.getByRole('cell', { name: '표시할 행이 없습니다.', exact: true }).waitFor();
  await preview.getByText('전체 1쪽 중 1쪽', { exact: true }).waitFor();
});

test('Chart produces SVG marks for every recipe kind and Typography preserves semantics', async t => {
  const kinds = ['line', 'area', 'bar', 'pie'];
  const data = [{ month: 'Jan', value: 2, goal: 4 }, { month: 'Feb', value: null, goal: 3 }, { month: 'Mar', value: 5, goal: 2 }];
  const series = [{ id: 'actual.value', key: 'value' }, { id: 'goal', key: 'goal' }];
  const page = await render(t, {
    render: group(
      component('heading', 'Typography', { as: 'h2', variant: 'h2', text: 'Recipe charts' }),
      component('slotted-heading', 'Typography', { as: 'h3', text: 'Fallback text' }, {
        slots: { default: [component('heading-text', 'Typography', { as: 'span', text: 'Chart examples' })] },
      }),
      component('quote', 'Typography', { variant: 'blockquote', text: 'Source note' }),
      ...kinds.map(kind => component(kind, 'Chart', { kind, label: kind + ' chart', data, x: 'month', series: kind === 'pie' ? series.slice(0, 1) : series })),
      component('invalid', 'Chart', { label: 'invalid chart', data: [{ month: 'Jan', value: '2' }], x: 'month', series: series.slice(0, 1) }),
    ),
  });
  const marks = ['path[stroke="var(--chart-1)"]', '.lc-area-path', '.lc-bar', '.lc-arc-line'];
  for (const [index, kind] of kinds.entries()) {
    const figure = page.getByRole('figure', { name: kind + ' chart', exact: true });
    const mark = figure.locator('svg ' + marks[index]).first();
    await mark.waitFor({ state: 'attached' });
    assert.equal(await figure.locator('svg').first().evaluate(svg => svg.getBoundingClientRect().width > 0), true);
    assert.equal(await figure.locator('svg path[d*="NaN"], svg rect[x*="NaN"], svg rect[y*="NaN"]').count(), 0);
    if (kind === 'pie') assert.equal(await figure.locator('svg .lc-arc-line').count(), 2);

  }
  await page.getByRole('figure', { name: 'invalid chart' }).getByText('Invalid chart data.').waitFor();
  await page.getByRole('heading', { name: 'Recipe charts', level: 2 }).waitFor();
  await page.getByRole('heading', { name: 'Chart examples', level: 3 }).waitFor();
  const quote = page.locator('blockquote').filter({ hasText: 'Source note' });
  assert.equal(await quote.evaluate(element => getComputedStyle(element).borderInlineStartWidth), '2px');
  assert.equal(await page.getByText('Fallback text', { exact: true }).count(), 0);
});

test('Notifications isolate duplicate logical IDs and remove disposed toaster instances', async t => {
  const first = { id: 'shared', title: 'First toast', duration: 60000 };
  const second = { id: 'shared', title: 'Second toast', duration: 60000 };
  const updated = { ...first, title: 'Updated first toast' };
  const page = await render(t, {
    states: { show: state(true), messages: state([first]), dismissal: state(null) },
    render: group(
      button('update', 'Update first', 'messages', [updated]),
      button('hide', 'Dispose first', 'show', false),
      button('show', 'Remount first', 'show', true),
      component('first', 'Notifications', { notifications: read('messages'), position: 'bottom-right' }, { when: read('show') }),
      component('second', 'Notifications', { notifications: [second], position: 'top-left' }, { on: set('dismiss-second', 'dismiss', 'dismissal') }),
    ),
  });
  const firstList = page.locator('[data-sonner-toaster][data-x-position="right"]');
  const secondList = page.locator('[data-sonner-toaster][data-x-position="left"]');
  await firstList.getByText(first.title, { exact: true }).waitFor();
  await secondList.getByText(second.title, { exact: true }).waitFor();
  assert.equal(await firstList.getByText(second.title, { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Update first' }).click();
  await expectState(page, 'messages', [updated], 'update-click');
  await firstList.getByText(updated.title, { exact: true }).waitFor();
  assert.equal(await firstList.locator('[data-sonner-toast]').count(), 1);
  await page.getByRole('button', { name: 'Dispose first' }).click();
  await expectState(page, 'show', false, 'hide-click');
  await firstList.waitFor({ state: 'detached' });
  await secondList.getByText(second.title, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Remount first' }).click();
  await expectState(page, 'show', true, 'show-click');
  await firstList.getByText(updated.title, { exact: true }).waitFor();
  assert.equal(await firstList.locator('[data-sonner-toast]').count(), 1);
  await secondList.getByRole('button', { name: 'Close toast' }).click();
  await expectState(page, 'dismissal', { id: 'shared', reason: 'dismissed' }, 'dismiss-second');
  await secondList.getByText(second.title, { exact: true }).waitFor({ state: 'detached' });
  await firstList.getByText(updated.title, { exact: true }).waitFor();
});
