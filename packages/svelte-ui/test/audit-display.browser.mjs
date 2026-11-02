import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createAuditHarness, identify, node, group, path, state, bind, record, read, write, waitState, slot } from './fixtures/audit-harness.mjs';

let harness;
before(async () => { harness = await createAuditHarness(); });
after(async () => { await harness?.close(); });

const render = (t, root, states = {}) => harness.setup(t, identify({ render: root, states }));
const text = (name, value, inputs = {}) => node(name, { ...inputs, text: value });
const from = name => path('/states/' + name);
const click = name => ({ on: { click: record(name) } });
const attr = async (locator, name, value) => assert.equal(await locator.getAttribute(name), value);
const recorded = async (page, name) => {
  await page.waitForFunction(name => events.some(event => event.name === name), name);
  return page.evaluate(name => events.filter(event => event.name === name), name);
};
const focused = async locator => assert.ok(await locator.evaluate(el => el === document.activeElement));

test('audit/alert: destructive presentation and nested action', async t => {
  const page = await render(t, node('Alert.Root', { variant: from('variant') }, [
    text('Alert.Title', 'Connection lost'), text('Alert.Description', 'Try again.'),
    node('Alert.Action', {}, [node('Button', { text: 'Retry' }, [], click('retry'))]),
  ]), { variant: state('default') });
  const alert = page.getByRole('alert');
  await alert.getByText('Try again.').waitFor();
  const before = await alert.evaluate(el => getComputedStyle(el).color);
  await write(page, 'variant', 'destructive');
  assert.notEqual(await alert.evaluate(el => getComputedStyle(el).color), before);
  await alert.getByRole('button', { name: 'Retry' }).press('Enter');
  assert.equal((await recorded(page, 'retry'))[0].payload.type, 'click');
});

test('audit/aspect-ratio: child layout follows reactive ratio', async t => {
  const page = await render(t, node('Field.Group', { style: 'width:240px' }, [
    node('AspectRatio', { ratio: from('ratio') }, [text('Typography', 'Preview contents')]),
  ]), { ratio: state(2) });
  const root = slot(page, 'aspect-ratio');
  await root.getByText('Preview contents').waitFor();
  const height = async () => (await root.boundingBox()).height;
  assert.equal(await height(), 120);
  await write(page, 'ratio', 1);
  assert.equal(await height(), 240);
});

test('audit/attachment: terminal presentation and separate child trigger and action', async t => {
  const page = await render(t, node('Attachment.Group', {}, [
    node('Attachment.Root', { size: 'sm', orientation: 'vertical', state: from('status') }, [
      text('Attachment.Media', 'PDF', { variant: 'icon' }),
      node('Attachment.Content', {}, [text('Attachment.Title', 'Report.pdf'), text('Attachment.Description', '32 KB')]),
      node('Attachment.Trigger', {}, [], { ...click('preview'), slots: { child: [text('Button', 'Preview file')] } }),
      node('Attachment.Actions', {}, [node('Attachment.Action', { text: 'Remove file', variant: 'ghost' }, [], click('remove'))]),
    ]),
  ]), { status: state('uploading') });
  const root = slot(page, 'attachment');
  await attr(root, 'data-size', 'sm');
  await attr(root, 'data-orientation', 'vertical');
  await attr(root, 'data-state', 'uploading');
  await root.getByText('Report.pdf').waitFor();
  for (const status of ['processing', 'error', 'done', 'idle']) {
    await write(page, 'status', status);
    await attr(root, 'data-state', status);
  }
  assert.equal(await root.locator('button button').count(), 0);
  await root.getByRole('button', { name: 'Preview file' }).press('Enter');
  await root.getByRole('button', { name: 'Remove file' }).press('Space');
  assert.equal((await recorded(page, 'preview')).length, 1);
  assert.equal((await recorded(page, 'remove')).length, 1);
});

test('audit/avatar: source loading, failure and recovery drive fallback', async t => {
  const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>');
  const page = await render(t, node('Avatar.Group', {}, [
    node('Avatar.Root', { id: 'automatic-avatar', size: 'lg' }, [
      node('Avatar.Image', { src: from('source'), alt: 'Rae' }), text('Avatar.Fallback', 'RA'),
      text('Avatar.Badge', '•'),
    ], { on: bind('loading', 'loadingStatusChange') }),
    node('Avatar.Root', { id: 'forced-avatar', loadingStatus: 'loaded' }, [
      node('Avatar.Image', { src: from('source'), alt: 'Forced preview' }), text('Avatar.Fallback', 'FP'),
    ], { on: { loadingStatusChange: record('forced-avatar-status') } }),
    text('Avatar.GroupCount', '+2'),
  ]), { source: state(image), loading: state(null) });
  const root = page.locator('#automatic-avatar');
  const forced = page.locator('#forced-avatar');
  await attr(root, 'data-size', 'lg');
  await slot(page, 'avatar-group').getByText('+2').waitFor();
  await root.getByRole('img', { name: 'Rae' }).waitFor();
  await waitState(page, 'loading', 'loaded');
  await write(page, 'source', 'data:image/png;base64,bad-image');
  await root.getByText('RA').waitFor();
  await waitState(page, 'loading', 'error');
  await attr(forced, 'data-status', 'loaded');
  await forced.getByRole('img', { name: 'Forced preview' }).waitFor();
  await forced.getByText('FP').waitFor({ state: 'hidden' });
  assert.deepEqual(await page.evaluate(() => events.filter(event => event.name === 'forced-avatar-status')), []);
  assert.equal(await root.getByRole('img', { name: 'Rae' }).count(), 0);
  await write(page, 'source', image);
  await root.getByRole('img', { name: 'Rae' }).waitFor();
  await waitState(page, 'loading', 'loaded');
  await root.getByText('RA').waitFor({ state: 'hidden' });
});

test('audit/badge: span becomes a keyboard-activated link', async t => {
  const page = await render(t, node('Badge', { href: from('target'), variant: 'outline', text: 'Fallback' }, [
    text('Typography', 'Details', { as: 'span' }),
  ], click('badge')), { target: state(null) });
  const root = slot(page, 'badge');
  assert.equal(await root.evaluate(el => el.tagName), 'SPAN');
  assert.equal(await root.evaluate(el => getComputedStyle(el).borderTopWidth), '1px');
  assert.equal(await page.getByText('Fallback').count(), 0);
  await write(page, 'target', '#details');
  const link = page.getByRole('link', { name: 'Details' });
  await attr(link, 'href', '#details');
  await link.press('Enter');
  assert.equal((await recorded(page, 'badge'))[0].payload.type, 'click');
  assert.equal(new URL(page.url()).hash, '#details');
});

test('audit/bubble: content and reactions follow variant and alignment', async t => {
  const page = await render(t, node('Bubble.Group', {}, [
    node('Bubble.Root', { variant: from('variant'), align: 'end' }, [
      text('Bubble.Content', 'Ready'),
      node('Bubble.Reactions', { side: 'top', align: 'end' }, [
        node('Button', { text: 'Approve' }, [], click('approve')),
      ]),
    ]),
  ]), { variant: state('tinted') });
  const root = slot(page, 'bubble');
  await attr(root, 'data-align', 'end');
  await attr(root, 'data-variant', 'tinted');
  await root.locator('[data-slot=bubble-content]').getByText('Ready').waitFor();
  await attr(slot(page, 'bubble-reactions'), 'data-side', 'top');
  await write(page, 'variant', 'ghost');
  await attr(root, 'data-variant', 'ghost');
  await root.getByRole('button', { name: 'Approve' }).press('Space');
  assert.equal((await recorded(page, 'approve')).length, 1);
});

test('audit/card: compact layout retains header, content, footer and actions', async t => {
  const page = await render(t, node('Card.Root', { size: from('size') }, [
    node('Card.Header', {}, [
      text('Card.Title', 'Export'), text('Card.Description', 'CSV report'),
      node('Card.Action', {}, [node('Button', { text: 'Download' }, [], click('download'))]),
    ]),
    text('Card.Content', 'Three rows'), text('Card.Footer', 'Generated today'),
  ]), { size: state('default') });
  const root = slot(page, 'card');
  const gap = await root.evaluate(el => getComputedStyle(el).rowGap);
  await write(page, 'size', 'sm');
  await attr(root, 'data-size', 'sm');
  assert.notEqual(await root.evaluate(el => getComputedStyle(el).rowGap), gap);
  await slot(page, 'card-header').getByText('Export').waitFor();
  await slot(page, 'card-content').getByText('Three rows').waitFor();
  await slot(page, 'card-footer').getByText('Generated today').waitFor();
  await slot(page, 'card-action').getByRole('button', { name: 'Download' }).press('Enter');
  assert.equal((await recorded(page, 'download')).length, 1);
});

test('audit/chart: SVG kinds, series replacement and empty, null, invalid data', async t => {
  const data = [{ month: 'Jan', actual: 2, plan: 4 }, { month: 'Feb', actual: null, plan: 3 }, { month: 'Mar', actual: 5, plan: 2 }];
  const kinds = [['line', 'path[stroke="var(--chart-1)"]'], ['area', '.lc-area-path'], ['bar', '.lc-bar'], ['pie', '.lc-arc-line']];
  const series = [{ id: 'actual.value', key: 'actual' }];
  const page = await render(t, group(
    ...kinds.map(([kind]) => node('Chart', {
      kind, label: kind + ' chart', data: kind === 'line' ? from('data') : data,
      x: 'month', series: kind === 'line' ? from('series') : series,
    })),
    node('Chart.Container', { id: 'custom-chart', config: from('config') }, [
      text('Typography', 'Chart note'),
    ]),
  ), { data: state(data), series: state(series), config: state({ plan: { color: '#aa3322' } }) });
  const custom = page.locator('[data-chart=chart-custom-chart]');
  await custom.getByText('Chart note').waitFor();
  const planColor = () => custom.evaluate(el => getComputedStyle(el).getPropertyValue('--color-plan').trim());
  assert.equal(await planColor(), '#aa3322');
  await write(page, 'config', { plan: { color: '#2255aa' } });
  assert.equal(await planColor(), '#2255aa');
  for (const [kind, mark] of kinds) {
    const figure = page.getByRole('figure', { name: kind + ' chart' });
    await figure.locator('svg ' + mark).first().waitFor({ state: 'attached' });
    assert.equal(await figure.locator('svg path[d*="NaN"], svg rect[x*="NaN"], svg rect[y*="NaN"]').count(), 0);
    if (kind === 'pie') assert.equal(await figure.locator('svg ' + mark).count(), 2);
  }
  const line = page.getByRole('figure', { name: 'line chart' });
  await write(page, 'series', [{ id: 'plan', key: 'plan', color: '#aa3322', label: 'Plan' }]);
  await line.locator('path[stroke="#aa3322"]').waitFor({ state: 'attached' });
  await line.locator('path[stroke="var(--chart-1)"]').waitFor({ state: 'detached' });
  for (const empty of [[], [{ month: 'Jan', plan: null }]]) {
    await write(page, 'data', empty);
    await line.getByRole('status').getByText('No chart data.').waitFor();
    assert.equal(await line.locator('svg').count(), 0);
  }
  await write(page, 'data', [{ month: 'Jan', plan: '4' }]);
  await line.getByRole('status').getByText('Invalid chart data.').waitFor();
  await write(page, 'data', data);
  await line.locator('path[stroke="#aa3322"]').waitFor({ state: 'attached' });
});

test('audit/code-block: numbered and slotted lines, updated keyboard copy', async t => {
  const page = await render(t, node('CodeBlock.Root', { size: 'sm', variant: 'destructive' }, [
    node('CodeBlock.Header', {}, [
      text('CodeBlock.Title', 'script.js'), node('CodeBlock.Actions', {}, [
        node('CodeBlock.CopyButton', { value: from('code') }, [], click('copy')),
      ]),
    ]),
    node('CodeBlock.Content', { code: from('code'), lineNumbers: true, startLine: 8, wrap: true }),
    node('CodeBlock.Content', { 'aria-label': 'Diff' }, [
      node('CodeBlock.Line', { code: 'const removed = 1;', variant: 'removed' }),
      node('CodeBlock.Line', { code: 'const added = 2;', variant: 'added' }),
    ]),
    text('CodeBlock.Footer', 'JavaScript'),
  ]), { code: state('one\ntwo') });
  const pre = slot(page, 'code-block-content').first();
  await attr(pre, 'data-numbered', 'true');
  await attr(pre, 'data-wrap', 'true');
  assert.equal(await pre.evaluate(el => el.style.counterReset), 'line 7');
  await page.locator('[aria-label=Diff] [data-variant=removed]').getByText('const removed = 1;').waitFor();
  await write(page, 'code', 'const first = 1;\nconst second = 2;');
  assert.equal(await pre.locator('[data-slot=code-block-line]').count(), 2);
  await pre.getByText('const second = 2;').waitFor();
  await page.getByRole('button', { name: 'Copy', exact: true }).press('Space');
  await page.waitForFunction(async () => await navigator.clipboard.readText() === 'const first = 1;\nconst second = 2;');
  await page.getByRole('button', { name: 'Copied', exact: true }).waitFor();
  assert.equal((await recorded(page, 'copy')).length, 1);
});

test('audit/data-table: controlled sorting, filtering, pagination, selection and replacement', async t => {
  const rows = [{ key: 'a', name: 'Apple', count: 1 }, { key: 'b', name: 'Banana', count: 12 }, { key: 'c', name: 'Cherry', count: 3 }];
  const page = await render(t, node('DataTable', {
    data: from('rows'), rowId: 'key',
    columns: [
      { id: 'name', accessorKey: 'name', label: 'Name', filterable: true },
      { id: 'count', accessorKey: 'count', label: 'Count', sortable: true },
    ],
    sorting: from('sorting'), filter: from('filter'), selectedIds: from('selected'),
    pageIndex: from('index'), pageSize: from('size'),
  }, [], { on: {
    ...bind('sorting', 'sortingChange'), ...bind('filter', 'filterChange'),
    ...bind('selected', 'selectedIdsChange'), ...bind('index', 'pageIndexChange'), ...bind('size', 'pageSizeChange'),
  } }), { rows: state(rows), sorting: state([]), filter: state(''), selected: state([]), index: state(0), size: state(1) });
  const table = page.getByRole('table');
  const cell = name => table.getByRole('cell', { name, exact: true });
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await cell('Apple').waitFor();
  await next.press('Enter');
  await waitState(page, 'index', 1);
  await cell('Banana').waitFor();
  await table.getByRole('button', { name: 'Count' }).press('Space');
  await waitState(page, 'index', 0);
  await waitState(page, 'sorting', [{ id: 'count', desc: true }]);
  await attr(table.getByRole('columnheader', { name: 'Count' }), 'aria-sort', 'descending');
  await cell('Banana').waitFor();
  const size = page.getByLabel('Rows per page');
  await size.selectOption('10');
  await waitState(page, 'size', 10);
  assert.equal(await size.inputValue(), '10');
  await cell('Apple').waitFor();
  const selected = table.getByRole('checkbox', { name: 'Select row b' });
  await selected.press('Space');
  await waitState(page, 'selected', ['b']);
  const search = page.getByRole('searchbox', { name: 'Filter rows' });
  await search.pressSequentially('apple');
  await waitState(page, 'filter', 'apple');
  await cell('Banana').waitFor({ state: 'detached' });
  await write(page, 'filter', '');
  assert.equal(await search.inputValue(), '');
  await selected.waitFor();
  assert.equal(await selected.isChecked(), true);
  await write(page, 'size', 1);
  await next.press('Enter');
  await waitState(page, 'index', 1);
  await write(page, 'rows', [{ key: 'b', name: 'Blueberry', count: 6 }]);
  await page.getByText('Page 1 of 1', { exact: true }).waitFor();
  await cell('Blueberry').waitFor();
  assert.equal(await read(page, 'index'), 1, 'data replacement preserves the controlled index');
  assert.equal(await page.getByRole('button', { name: 'Previous', exact: true }).isDisabled(), true);
  assert.equal(await next.isDisabled(), true);
  assert.equal(await cell('Banana').count(), 0);
  assert.equal(await selected.isChecked(), true);
  await write(page, 'selected', []);
  assert.equal(await selected.isChecked(), false);
  await write(page, 'rows', []);
  await cell('No rows.').waitFor();
  assert.equal(await next.isDisabled(), true);
});

test('audit/empty: media presentation and recovery action', async t => {
  const page = await render(t, node('Empty.Root', {}, [
    node('Empty.Header', {}, [
      text('Empty.Media', '+', { variant: from('media') }),
      text('Empty.Title', 'No reports'), text('Empty.Description', 'Create your first report.'),
    ]),
    node('Empty.Content', {}, [node('Button', { text: 'Create' }, [], click('create'))]),
  ]), { media: state('default') });
  await slot(page, 'empty-header').getByText('No reports').waitFor();
  await write(page, 'media', 'icon');
  await attr(slot(page, 'empty-icon'), 'data-variant', 'icon');
  await slot(page, 'empty-content').getByRole('button', { name: 'Create' }).press('Enter');
  assert.equal((await recorded(page, 'create')).length, 1);
});

test('audit/field: fieldset association, validation errors and controlled input', async t => {
  const page = await render(t, node('Field.Set', {}, [
    text('Field.Legend', 'Contact', { variant: 'legend' }),
    node('Field.Group', {}, [
      node('Field.Field', { orientation: from('orientation'), 'data-invalid': from('invalid') }, [
        text('Field.Label', 'Email', { for: 'audit-email' }),
        node('Field.Content', {}, [
          node('Input', { id: 'audit-email', type: 'email', value: from('email'), 'aria-invalid': from('invalid') }, [], { on: bind('email', 'input') }),
          text('Field.Description', 'Use your work address.'),
          node('Field.Error', { errors: from('errors') }),
        ]),
      ]),
    ]),
  ]), {
    orientation: state('horizontal'), invalid: state(true), email: state('bad'),
    errors: state([{ message: 'Domain missing' }, { message: 'Address invalid' }]),
  });
  const field = slot(page, 'field');
  const input = page.getByRole('textbox', { name: 'Email' });
  await page.getByRole('group', { name: 'Contact' }).getByText('Use your work address.').waitFor();
  assert.deepEqual(await page.getByRole('alert').getByRole('listitem').allTextContents(), ['Domain missing', 'Address invalid']);
  await slot(page, 'field-label').click();
  await focused(input);
  await input.press('End');
  await input.pressSequentially('@example.com');
  await waitState(page, 'email', 'bad@example.com');
  await write(page, 'email', 'team@example.com');
  assert.equal(await input.inputValue(), 'team@example.com');
  await write(page, 'errors', []);
  await write(page, 'invalid', false);
  await write(page, 'orientation', 'vertical');
  await page.getByRole('alert').waitFor({ state: 'detached' });
  await attr(input, 'aria-invalid', 'false');
  await attr(field, 'data-orientation', 'vertical');
});

test('audit/input-group: addon focus, keyboard clear and textarea round trips', async t => {
  const page = await render(t, group(
    node('InputGroup.Root', {}, [
      node('InputGroup.Addon', { align: 'inline-start' }, [text('InputGroup.Text', 'Find')]),
      node('InputGroup.Input', { 'aria-label': 'Search', placeholder: 'Search reports', value: from('query') }, [], { on: bind('query', 'input') }),
      node('InputGroup.Addon', { align: 'inline-end' }, [
        node('InputGroup.Button', { size: 'sm', variant: 'ghost', text: 'Clear' }, [], { on: bind('query', 'click', '') }),
      ]),
    ]),
    node('InputGroup.Root', {}, [
      node('InputGroup.Textarea', { 'aria-label': 'Notes', rows: 3, value: from('notes') }, [], { on: bind('notes', 'input') }),
      node('InputGroup.Addon', { align: 'block-end' }, [text('InputGroup.Text', 'Internal only')]),
    ]),
  ), { query: state('report'), notes: state('Line 1') });
  const query = page.getByRole('textbox', { name: 'Search' });
  const clear = page.getByRole('button', { name: 'Clear' });
  await slot(page, 'input-group-addon').filter({ hasText: 'Find' }).click();
  await focused(query);
  await query.press('End');
  await query.pressSequentially('s');
  await waitState(page, 'query', 'reports');
  await page.keyboard.press('Tab');
  await focused(clear);
  await page.keyboard.press('Space');
  await waitState(page, 'query', '');
  assert.equal(await query.inputValue(), '');
  const notes = page.getByRole('textbox', { name: 'Notes' });
  await attr(notes, 'rows', '3');
  await notes.press('End');
  await notes.press('Enter');
  await notes.pressSequentially('Line 2');
  await waitState(page, 'notes', 'Line 1\nLine 2');
  await write(page, 'notes', 'Reset');
  assert.equal(await notes.inputValue(), 'Reset');
  await attr(slot(page, 'input-group-addon').filter({ hasText: 'Internal only' }), 'data-align', 'block-end');
});

test('audit/item: variants, nested sections, separator and action', async t => {
  const page = await render(t, node('Item.Group', {}, [
    node('Item.Root', { variant: from('variant'), size: 'xs' }, [
      text('Item.Media', 'CSV', { variant: 'icon' }),
      node('Item.Content', {}, [
        node('Item.Header', {}, [text('Item.Title', 'Export')]),
        text('Item.Description', 'Download data'), text('Item.Footer', 'Updated today'),
      ]),
      node('Item.Actions', {}, [node('Button', { text: 'Open export' }, [], click('open-export'))]),
    ]),
    node('Item.Separator', { decorative: false }),
    node('Item.Root', {}, [text('Item.Title', 'Second export')]),
  ]), { variant: state('outline') });
  const root = slot(page, 'item').first();
  await attr(root, 'data-size', 'xs');
  await attr(root, 'data-variant', 'outline');
  await write(page, 'variant', 'muted');
  await attr(root, 'data-variant', 'muted');
  await root.locator('[data-slot=item-content]').getByText('Updated today').waitFor();
  await page.getByRole('separator').waitFor();
  await root.getByRole('button', { name: 'Open export' }).press('Enter');
  assert.equal((await recorded(page, 'open-export')).length, 1);
});

test('audit/kbd: grouped native key labels update without becoming controls', async t => {
  const page = await render(t, node('Kbd.Group', {}, [text('Kbd.Root', 'Ctrl'), text('Kbd.Root', from('key'))]), { key: state('K') });
  const keys = slot(page, 'kbd-group').locator('kbd');
  assert.deepEqual(await keys.allTextContents(), ['Ctrl', 'K']);
  await write(page, 'key', 'L');
  assert.deepEqual(await keys.allTextContents(), ['Ctrl', 'L']);
  assert.deepEqual(await keys.evaluateAll(els => els.map(el => el.tabIndex)), [-1, -1]);
});

test('audit/label: changes its native label association and focuses the target', async t => {
  const page = await render(t, group(
    node('Label', { for: from('target') }, [text('Typography', 'Recipient', { as: 'span' })], click('label')),
    node('Input', { id: 'first' }), node('Input', { id: 'second' }),
  ), { target: state('first') });
  const label = slot(page, 'label');
  await page.getByRole('textbox', { name: 'Recipient' }).waitFor();
  assert.equal(await label.evaluate(el => el.control.id), 'first');
  await label.click();
  await focused(page.locator('#first'));
  await write(page, 'target', 'second');
  assert.equal(await label.evaluate(el => el.control.id), 'second');
  await label.click();
  await focused(page.getByRole('textbox', { name: 'Recipient' }));
  assert.equal(await page.locator('#second').evaluate(el => el === document.activeElement), true);
  await recorded(page, 'label');
});

test('audit/marker: status role retains icon and content across variants', async t => {
  const page = await render(t, node('Marker.Root', { variant: from('variant'), role: 'status' }, [
    text('Marker.Icon', '✓'), text('Marker.Content', from('label')),
  ]), { variant: state('border'), label: state('Queued') });
  const marker = page.getByRole('status');
  await attr(marker, 'data-variant', 'border');
  await marker.locator('[data-slot=marker-icon]').getByText('✓').waitFor();
  await write(page, 'variant', 'separator');
  await write(page, 'label', 'Completed');
  await attr(marker, 'data-variant', 'separator');
  await marker.locator('[data-slot=marker-content]').getByText('Completed').waitFor();
});

test('audit/message: group retains avatar, header, bubble and footer when alignment changes', async t => {
  const page = await render(t, node('Message.Group', {}, [
    node('Message.Root', { align: from('align') }, [
      node('Message.Avatar', {}, [node('Avatar.Root', {}, [text('Avatar.Fallback', 'AL')])]),
      node('Message.Content', {}, [
        text('Message.Header', 'Alex'),
        node('Bubble.Root', {}, [text('Bubble.Content', 'The report is ready.')]),
        text('Message.Footer', from('delivery')),
      ]),
    ]),
  ]), { align: state('start'), delivery: state('Sending') });
  const root = slot(page, 'message');
  await slot(page, 'message-avatar').getByText('AL').waitFor();
  await slot(page, 'message-content').getByText('The report is ready.').waitFor();
  await slot(page, 'message-header').getByText('Alex').waitFor();
  assert.equal(await root.evaluate(el => getComputedStyle(el).flexDirection), 'row');
  await write(page, 'align', 'end');
  await write(page, 'delivery', 'Delivered');
  await attr(root, 'data-align', 'end');
  assert.equal(await root.evaluate(el => getComputedStyle(el).flexDirection), 'row-reverse');
  await slot(page, 'message-footer').getByText('Delivered').waitFor();
});

test('audit/message-scroller: keyboard jump returns a composed viewport to its end', async t => {
  const page = await render(t, node('MessageScroller.Provider', { autoScroll: true }, [
    node('MessageScroller.Root', { style: 'height:160px' }, [
      node('MessageScroller.Viewport', {}, [
        node('MessageScroller.Content', {}, Array.from({ length: 16 }, (_, index) =>
          node('MessageScroller.Item', { style: 'min-height:36px' }, [text('Typography', index === 15 ? from('last') : 'Message ' + (index + 1))])),
        ),
      ], { on: { keyDown: record('message-home') } }),
      node('MessageScroller.Button', { text: 'Latest', direction: 'end' }, [], click('latest')),
    ]),
  ]), { last: state('Message 16') });
  const viewport = slot(page, 'message-scroller-viewport');
  const latest = page.getByRole('button', { name: 'Latest' });
  const atEnd = () => page.waitForFunction(() => {
    const el = document.querySelector('[data-slot=message-scroller-viewport]');
    return el.scrollHeight > el.clientHeight && el.scrollHeight - el.clientHeight - el.scrollTop < 12;
  });
  await atEnd();
  await write(page, 'last', 'Delivery confirmed');
  await viewport.getByText('Delivery confirmed').waitFor();
  await viewport.and(page.locator(':not([data-autoscrolling])')).waitFor();
  await viewport.press('Home');
  assert.equal((await recorded(page, 'message-home'))[0].payload.key, 'Home');
  await page.waitForFunction(() => document.querySelector('[data-slot=message-scroller-viewport]').scrollTop < 12);
  await latest.and(page.locator('[data-active=true]')).waitFor();
  await latest.press('Enter');
  await atEnd();
  assert.equal((await recorded(page, 'latest')).length, 1);
  await slot(page, 'message-scroller-button').and(page.locator('[data-active=false]')).waitFor({ state: 'attached' });
});

test('audit/progress: determinate, complete and indeterminate semantics', async t => {
  const page = await render(t, node('Progress', { value: from('progress'), max: 80, 'aria-label': 'Upload' }), { progress: state(20) });
  const progress = page.getByRole('progressbar', { name: 'Upload' });
  await attr(progress, 'aria-valuemax', '80');
  await attr(progress, 'aria-valuenow', '20');
  assert.equal(await slot(page, 'progress-indicator').evaluate(el => el.style.transform), 'translateX(-75%)');
  await write(page, 'progress', 80);
  await attr(progress, 'aria-valuenow', '80');
  await attr(progress, 'data-state', 'loaded');
  await write(page, 'progress', null);
  await attr(progress, 'aria-valuenow', null);
  await attr(progress, 'data-state', 'indeterminate');
});

test('audit/scroll-area: orientation changes axes and keyboard scrolls viewport', async t => {
  const page = await render(t, node('ScrollArea.Root', { orientation: from('orientation'), type: 'always', style: 'width:180px;height:120px' }, [
    node('Card.Root', { style: 'width:480px;height:480px' }, [text('Typography', 'Scrollable contents')]),
  ]), { orientation: state('vertical') });
  const viewport = slot(page, 'scroll-area-viewport');
  await viewport.getByText('Scrollable contents').waitFor();
  const bars = slot(page, 'scroll-area-scrollbar');
  await bars.and(page.locator('[data-orientation=vertical]')).waitFor();
  assert.equal(await bars.and(page.locator('[data-orientation=horizontal]')).count(), 0);
  await write(page, 'orientation', 'both');
  await bars.and(page.locator('[data-orientation=horizontal]')).waitFor();
  await viewport.press('End');
  await page.waitForFunction(() => document.querySelector('[data-slot=scroll-area-viewport]').scrollTop > 200);
});

test('audit/separator: decorative and semantic orientation changes', async t => {
  const page = await render(t, group(text('Typography', 'Left'), node('Separator', {
    decorative: from('decorative'), orientation: from('orientation'),
  }), text('Typography', 'Right')), { decorative: state(true), orientation: state('horizontal') });
  assert.equal(await page.getByRole('separator').count(), 0);
  await attr(slot(page, 'separator'), 'data-orientation', 'horizontal');
  await write(page, 'orientation', 'vertical');
  await write(page, 'decorative', false);
  const separator = page.getByRole('separator');
  await attr(separator, 'aria-orientation', 'vertical');
  assert.equal(await separator.evaluate(el => el.tabIndex), -1);
});

test('audit/skeleton: conditional loading geometry and content replacement', async t => {
  const page = await render(t, node('Card.Root', { 'aria-busy': from('loading') }, [
    node('Card.Content', {}, [
      node('Skeleton', { style: from('size'), 'aria-hidden': true }, [], { when: from('loading') }),
      node('Typography', { text: 'Loaded report' }, [], { when: from('ready') }),
    ]),
  ]), { loading: state(true), ready: state(false), size: state('width:80px;height:20px') });
  const skeleton = slot(page, 'skeleton');
  await attr(skeleton, 'aria-hidden', 'true');
  assert.equal((await skeleton.boundingBox()).width, 80);
  await write(page, 'size', 'width:120px;height:30px');
  assert.equal((await skeleton.boundingBox()).width, 120);
  await write(page, 'loading', false);
  await write(page, 'ready', true);
  await skeleton.waitFor({ state: 'detached' });
  await slot(page, 'card-content').getByText('Loaded report').waitFor();
  await attr(slot(page, 'card'), 'aria-busy', 'false');
});

test('audit/spinner: accessible SVG label in a disabled action', async t => {
  const page = await render(t, node('Button', { disabled: from('busy') }, [
    node('Spinner', { 'aria-label': from('label'), 'data-icon': 'inline-start' }, [], { when: from('busy') }),
    text('Typography', 'Export', { as: 'span' }),
  ], click('export')), { busy: state(true), label: state('Preparing') });
  const button = page.getByRole('button', { name: /Export/ });
  const spinner = button.getByRole('status', { name: 'Preparing' });
  assert.equal(await spinner.evaluate(el => el.tagName), 'svg');
  assert.equal(await button.isDisabled(), true);
  await write(page, 'label', 'Uploading');
  await button.getByRole('status', { name: 'Uploading' }).waitFor();
  await write(page, 'busy', false);
  await button.getByRole('status').waitFor({ state: 'detached' });
  await button.press('Enter');
  assert.equal((await recorded(page, 'export')).length, 1);
});

test('audit/table: native caption and section structure retain a selected row', async t => {
  const page = await render(t, node('Table.Root', {}, [
    text('Table.Caption', 'Report totals'),
    node('Table.Header', {}, [node('Table.Row', {}, [text('Table.Head', 'Region', { scope: 'col' }), text('Table.Head', 'Count', { scope: 'col' })])]),
    node('Table.Body', {}, [
      node('Table.Row', { 'aria-selected': from('selection') }, [
        text('Table.Cell', 'East'), text('Table.Cell', from('count')),
      ]),
    ]),
    node('Table.Footer', {}, [node('Table.Row', {}, [text('Table.Cell', 'Total', { colspan: 2 })])]),
  ]), { selection: state(false), count: state('11') });
  const table = page.getByRole('table', { name: 'Report totals' });
  await attr(table.getByRole('columnheader', { name: 'Region' }), 'scope', 'col');
  await attr(table.locator('tfoot').getByRole('cell', { name: 'Total' }), 'colspan', '2');
  await write(page, 'selection', true);
  await write(page, 'count', '17');
  const row = table.locator('tbody').getByRole('row');
  await attr(row, 'aria-selected', 'true');
  await row.getByRole('cell', { name: '17' }).waitFor();
});

test('audit/trace: keyboard disclosure and line status transitions', async t => {
  const page = await render(t, node('Trace.Root', {}, [
    text('Trace.Icon', '✓'), text('Trace.Title', 'Run report'), text('Trace.Description', 'Reads the input file.'),
    node('Trace.Collapsible', { open: from('open') }, [
      text('Trace.CollapsibleTrigger', 'Run details'),
      node('Trace.CollapsibleContent', {}, [
        node('Trace.Line', { status: from('status') }, [text('Trace.Title', 'Read input')], { when: from('active') }),
        node('Trace.Line', {}, [text('Trace.Title', 'Read complete')], { when: from('finished') }),
      ]),
    ], { on: bind('open', 'openChange') }),
  ]), { open: state(false), status: state('pending'), active: state(true), finished: state(false) });
  const trigger = page.getByRole('button', { name: 'Run details' });
  const line = slot(page, 'trace-line');
  await attr(trigger, 'aria-expanded', 'false');
  await trigger.press('Enter');
  await waitState(page, 'open', true);
  await attr(trigger, 'aria-expanded', 'true');
  await line.getByText('Read input').waitFor();
  await attr(line, 'data-status', 'pending');
  for (const status of ['running', 'error']) {
    await write(page, 'status', status);
    await attr(line, 'data-status', status);
  }
  await write(page, 'active', false);
  await write(page, 'finished', true);
  await line.getByText('Read complete').waitFor();
  await attr(line, 'data-status', null);
  await trigger.press('Space');
  await waitState(page, 'open', false);
  await line.waitFor({ state: 'hidden' });
  await write(page, 'open', true);
  await line.waitFor();
});

test('audit/typography: semantic element replacement, slot precedence and safe text', async t => {
  const markup = '<img src=x onerror=alert(1)>';
  const page = await render(t, group(
    node('Typography', { as: from('tag'), variant: from('variant'), text: 'Fallback' }, [
      text('Typography', 'Guide', { as: 'span' }),
    ]),
    text('Typography', markup, { as: 'code', variant: 'code' }),
  ), { tag: state('h2'), variant: state('h2') });
  await page.getByRole('heading', { name: 'Guide', level: 2 }).waitFor();
  await write(page, 'tag', 'blockquote');
  await write(page, 'variant', 'blockquote');
  assert.match(await page.locator('blockquote').getAttribute('class'), /italic/);
  await page.locator('blockquote > span').getByText('Guide').waitFor();
  await page.locator('code').getByText(markup, { exact: true }).waitFor();
  assert.equal(await page.locator('#app img').count(), 0);
  assert.equal(await page.getByText('Fallback').count(), 0);
});
