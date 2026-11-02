import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bind, createAuditHarness, group, identify, node, path, read, slot, state, waitState, write } from './fixtures/audit-harness.mjs';
import { samples } from './fixtures/samples.mjs';

let harness;
before(async () => { harness = await createAuditHarness(); });
after(async () => { await harness?.close(); });

const setup = (t, view) => harness.setup(t, identify(view));
const sample = slug => structuredClone(samples.find(entry => entry.slug === slug).view);
const bound = (component, name, property = 'value', event = 'valueChange', inputs = {}, children = [], on = {}) =>
  node(component, { ...inputs, [property]: path('/states/' + name) }, children, { on: { ...bind(name, event), ...on } });
const text = (component, label, inputs = {}, children = []) => node(component, { ...inputs, text: label }, children);
async function attr(locator, key, value) {
  await locator.waitFor({ state: 'attached' });
  assert.equal(await locator.getAttribute(key), value);
}
const exact = (page, label) => page.getByText(label, { exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const day = (page, date) => page.locator(`[data-calendar-day][data-value="${date}"]`).first();

test('audit/accordion: single and multiple panels honor keyboard and external selection', async t => {
  const view = sample('accordion');
  const items = [
    node('Accordion.Item', { value: 'one' }, [text('Accordion.Trigger', 'One'), text('Accordion.Content', 'First content')]),
    node('Accordion.Item', { value: 'two' }, [text('Accordion.Trigger', 'Two'), text('Accordion.Content', 'Second content')]),
    node('Accordion.Item', { value: 'locked', disabled: true }, [text('Accordion.Trigger', 'Locked')]),
  ];
  view.states.multi = state(['one']);
  view.render = group(view.render, bound('Accordion.Root', 'multi', 'value', 'valueChange', { type: 'multiple' }, items));
  const page = await setup(t, view);
  await button(page, '작업 공간').press('ArrowDown');
  assert.equal(await button(page, '결제').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Enter');
  await waitState(page, 'section', 'billing');
  await exact(page, '다음 결제 예정일을 확인합니다.').waitFor();
  await write(page, 'section', 'settings');
  await exact(page, '이 영역에서 팀 설정을 변경합니다.').waitFor();
  await button(page, 'Two').press('Space');
  await waitState(page, 'multi', ['one', 'two']);
  await exact(page, 'First content').waitFor();
  await exact(page, 'Second content').waitFor();
  assert.equal(await button(page, 'Locked').isDisabled(), true);
  await write(page, 'multi', []);
  await exact(page, 'Second content').waitFor({ state: 'hidden' });
});

test('audit/collapsible: keyboard opens and external close hides nested action', async t => {
  const view = sample('collapsible');
  view.states.locked = state(false);
  view.render.inputs.disabled = path('/states/locked');
  view.render.slots.default[1].slots = { default: [text('Button', 'Nested action')] };
  const page = await setup(t, view);
  const trigger = button(page, '오류 세부 정보');
  await trigger.press('Space');
  await waitState(page, 'open', true);
  await button(page, 'Nested action').waitFor();
  await write(page, 'open', false);
  await button(page, 'Nested action').waitFor({ state: 'hidden' });
  await write(page, 'locked', true);
  assert.equal(await trigger.isDisabled(), true);
  await trigger.press('Enter');
  assert.equal(await read(page, 'open'), false);
});

test('audit/tabs: arrows skip disabled triggers and State selects the matching panel', async t => {
  const page = await setup(t, sample('tabs'));
  const summary = page.getByRole('tab', { name: '요약' });
  const activity = page.getByRole('tab', { name: '활동' });
  await summary.press('ArrowRight');
  await waitState(page, 'tab', 'activity');
  await exact(page, '최근 7일 활동 내역').waitFor();
  assert.equal(await page.getByRole('tab', { name: '관리' }).isDisabled(), true);
  await activity.press('ArrowRight');
  await waitState(page, 'tab', 'summary');
  await write(page, 'tab', 'activity');
  await attr(activity, 'aria-selected', 'true');
  await exact(page, '완료한 보고서 58개').waitFor({ state: 'hidden' });
});

for (const [family, component, role, property, event, aria] of [
  ['checkbox', 'Checkbox', 'checkbox', 'checked', 'checkedChange', 'aria-checked'],
  ['switch', 'Switch', 'switch', 'checked', 'checkedChange', 'aria-checked'],
  ['toggle', 'Toggle', 'button', 'pressed', 'pressedChange', 'aria-pressed'],
]) {
  test(`audit/${family}: Space emits boolean and controlled disabled blocks changes`, async t => {
    const view = {
      states: { active: state(false), locked: state(false) },
      render: group(
        bound(component, 'active', property, event, { id: 'audit-control', disabled: path('/states/locked'), 'aria-label': 'Control' }),
        text('Label', 'Linked label', { for: 'audit-control' }),
      ),
    };
    if (family === 'checkbox') {
      view.states.mixed = state(true);
      const control = view.render.slots.default[0];
      control.inputs.indeterminate = path('/states/mixed');
      Object.assign(control.on, bind('mixed', 'indeterminateChange'));
    }
    const page = await setup(t, view);
    const control = page.getByRole(role, { name: 'Control' });
    await attr(control, aria, family === 'checkbox' ? 'mixed' : 'false');
    await control.press('Space');
    await waitState(page, 'active', true);
    if (family === 'checkbox') await waitState(page, 'mixed', false);
    await attr(control, aria, 'true');
    await write(page, 'active', false);
    await attr(control, aria, 'false');
    await write(page, 'locked', true);
    assert.equal(await control.isDisabled(), true);
    await control.press('Space');
    assert.equal(await read(page, 'active'), false);
  });
}

test('audit/radio-group: keyboard selection skips disabled item and follows State', async t => {
  const page = await setup(t, sample('radio-group'));
  const seoul = page.locator('#radio-seoul');
  const busan = page.locator('#radio-busan');
  await seoul.press('ArrowRight');
  await waitState(page, 'site', 'busan');
  await attr(busan, 'aria-checked', 'true');
  assert.equal(await page.locator('#radio-jeju').isDisabled(), true);
  await busan.press('ArrowRight');
  await waitState(page, 'site', 'seoul');
  await write(page, 'site', 'busan');
  await attr(busan, 'aria-checked', 'true');
});

test('audit/slider: numeric and range thumbs emit stepped values within limits', async t => {
  const view = sample('slider');
  view.states.range = state([20, 80]);
  view.states.commit = state(null);
  Object.assign(view.render.on, bind('commit', 'valueCommit'));
  view.states.locked = state(false);
  view.render.inputs.disabled = path('/states/locked');
  view.render = group(view.render, bound('Slider', 'range', 'value', 'valueChange', {
    type: 'multiple', min: 0, max: 100, step: 10, id: 'range-slider',
  }));
  const page = await setup(t, view);
  const slider = slot(page, 'slider-thumb').first();
  await slider.press('ArrowRight');
  await waitState(page, 'level', 40);
  await waitState(page, 'commit', 40);
  await slider.press('End');
  await waitState(page, 'level', 100);
  await waitState(page, 'commit', 100);
  await slider.press('ArrowRight');
  assert.equal(await read(page, 'level'), 100);
  await write(page, 'level', 15);
  await attr(slider, 'aria-valuenow', '15');
  await write(page, 'locked', true);
  await slider.press('ArrowRight');
  assert.equal(await read(page, 'level'), 15);
  const range = page.locator('#range-slider').getByRole('slider');
  assert.equal(await range.count(), 2);
  await range.first().press('ArrowRight');
  await waitState(page, 'range', [30, 80]);
  await write(page, 'range', [10, 90]);
  await attr(range.last(), 'aria-valuenow', '90');
});

test('audit/toggle-group: single replacement and multiple selection use distinct payloads', async t => {
  const view = sample('toggle-group');
  view.states.styles = state(['bold']);
  view.render = group(view.render, bound('ToggleGroup.Root', 'styles', 'value', 'valueChange', { type: 'multiple' }, [
    text('ToggleGroup.Item', 'Bold', { value: 'bold' }),
    text('ToggleGroup.Item', 'Italic', { value: 'italic' }),
    text('ToggleGroup.Item', 'Locked style', { value: 'locked', disabled: true }),
  ]));
  const page = await setup(t, view);
  await exact(page, '격자').press('Enter');
  await waitState(page, 'mode', 'grid');
  await write(page, 'mode', 'list');
  await attr(exact(page, '목록'), 'data-state', 'on');
  await button(page, 'Bold').press('ArrowRight');
  assert.equal(await button(page, 'Italic').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Space');
  await waitState(page, 'styles', ['bold', 'italic']);
  assert.equal(await button(page, 'Locked style').isDisabled(), true);
  await write(page, 'styles', []);
  await attr(button(page, 'Italic'), 'aria-pressed', 'false');
});

for (const [family, component, value, next] of [
  ['input', 'Input', 'Initial', 'End'],
  ['textarea', 'Textarea', 'Initial\nNote', 'End\nNote'],
]) {
  test(`audit/${family}: DOM input updates State and readonly preserves external text`, async t => {
    const page = await setup(t, {
      states: { value: state(value), locked: state(false), event: state(null) },
      render: group(
        text('Label', 'Report', { for: 'report' }),
        bound(component, 'value', 'value', 'input', {
          id: 'report', readonly: path('/states/locked'), maxlength: 20,
          ...(family === 'textarea' ? { rows: 4 } : { type: 'text' }),
        }, [], bind('event', 'keyDown', path('/event'))),
      ),
    });
    const input = page.getByRole('textbox', { name: 'Report' });
    assert.equal(await input.inputValue(), value);
    assert.equal(await input.getAttribute('maxlength'), '20');
    if (family === 'textarea') assert.equal(await input.getAttribute('rows'), '4');
    await input.fill(next);
    await waitState(page, 'value', next);
    await write(page, 'value', 'external');
    assert.equal(await input.inputValue(), 'external');
    await write(page, 'locked', true);
    await input.press('End');
    await page.keyboard.press('x');
    await page.waitForFunction(() => mounted.view.getState('event').read()?.key === 'x');
    assert.equal((await read(page, 'event')).type, 'keydown');
    assert.equal(await input.inputValue(), 'external');
    assert.equal(await read(page, 'value'), 'external');
  });
}

test('audit/input-otp: digits update derived slots and respect length and readonly', async t => {
  const view = sample('input-otp');
  view.states.locked = state(false);
  view.states.completed = state(null);
  Object.assign(view.render.on, bind('completed', 'complete'));
  view.render.inputs.readonly = path('/states/locked');
  const page = await setup(t, view);
  const input = page.getByRole('textbox', { name: '인증 코드' });
  await attr(input, 'maxlength', '6');
  for (const [key, expected] of [['1', '1'], ['2', '12'], ['x', '12'], ['3', '123'], ['4', '1234'], ['5', '12345'], ['6', '123456']]) {
    await input.press(key);
    await waitState(page, 'code', expected).catch(async error => {
      throw new Error(`OTP key ${key} produced input "${await input.inputValue()}" and State "${await read(page, 'code')}"`, { cause: error });
    });
    assert.equal(await input.inputValue(), expected);
  }
  await waitState(page, 'completed', '123456');
  assert.deepEqual((await slot(page, 'input-otp-slot').allTextContents()).map(value => value.trim()), [...'123456']);
  await input.press('7');
  const bounded = await input.inputValue();
  assert.match(bounded, /^12345[67]$/);
  await waitState(page, 'code', bounded);
  await write(page, 'code', '82');
  assert.equal(await input.inputValue(), '82');
  assert.deepEqual((await slot(page, 'input-otp-slot').allTextContents()).map(value => value.trim()), ['8', '2', '', '', '', '']);
  await write(page, 'locked', true);
  await input.press('Backspace');
  assert.equal(await input.inputValue(), '82');
});

test('audit/native-select: native change payload and external value preserve option grouping', async t => {
  const view = sample('native-select');
  const control = view.render.slots.default[1];
  control.slots.default[0].slots.default[2].inputs.disabled = true;
  view.states.key = state(null);
  Object.assign(control.on, bind('key', 'keyDown', path('/event/key')));
  view.states.selection = state(['a', 'c']);
  view.states.change = state(null);
  view.render.slots.default.push(bound('NativeSelect.Root', 'selection', 'value', 'change', {
    multiple: true, 'aria-label': 'Multiple options',
  }, ['a', 'b', 'c'].map(value => text('NativeSelect.Option', value.toUpperCase(), { value })),
  bind('change', 'change', path('/event'))));
  const page = await setup(t, view);
  const select = page.getByRole('combobox', { name: '지역' });
  assert.equal(await select.inputValue(), 'seoul');
  await select.selectOption('busan');
  await waitState(page, 'site', 'busan');
  await write(page, 'site', 'seoul');
  assert.equal(await select.inputValue(), 'seoul');
  assert.equal(await select.locator('optgroup[label="지역"] option:disabled').textContent(), '제주');
  await select.press('Escape');
  await waitState(page, 'key', 'Escape');
  assert.equal(await read(page, 'site'), 'seoul');

  const multiple = page.getByRole('listbox', { name: 'Multiple options' });
  const selected = () => multiple.locator('option:checked').allTextContents();
  assert.deepEqual(await selected(), ['A', 'C']);
  assert.deepEqual(await multiple.selectOption(['b', 'c']), ['b', 'c']);
  await waitState(page, 'change', { type: 'change', value: 'b' });
  assert.deepEqual(await read(page, 'selection'), ['a', 'c']);
  assert.deepEqual(await selected(), ['B', 'C']);
  await write(page, 'selection', ['a', 'b']);
  assert.deepEqual(await selected(), ['A', 'B']);
});

test('audit/select: portal options support keyboard selection and controlled open and value', async t => {
  const view = sample('select');
  view.states.open = state(false);
  view.render.inputs.open = path('/states/open');
  Object.assign(view.render.on, bind('open', 'openChange'));
  const content = view.render.slots.default[1].slots.default[0];
  const options = content.slots.default.find(item => item.componentRef === 'shadcn.Select.Group').slots.default
    .filter(item => item.componentRef === 'shadcn.Select.Item');
  options.at(-1).inputs.disabled = true;
  view.render.inputs.items = options.map(({ inputs: { value, label, disabled } }) =>
    ({ value, label, ...(disabled ? { disabled } : {}) }));
  const page = await setup(t, view);
  const trigger = page.getByRole('combobox');
  await trigger.press('Enter');
  await waitState(page, 'open', true);
  const jeju = page.getByRole('option', { name: '제주' });
  await attr(jeju, 'data-disabled', '');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitState(page, 'site', 'busan');
  await waitState(page, 'open', false);
  await write(page, 'site', 'seoul');
  assert.equal((await trigger.textContent()).trim(), '서울');
  await write(page, 'open', true);
  await page.getByRole('option', { name: '서울' }).waitFor();
  await page.keyboard.press('Escape');
  await waitState(page, 'open', false);
});

test('audit/select: multiple choices emit arrays and external clear restores placeholder', async t => {
  const view = sample('select');
  view.states.site = state(['seoul']);
  view.render.inputs.type = 'multiple';
  view.render.on = bind('site');
  const page = await setup(t, view);
  const trigger = page.getByRole('combobox');
  await trigger.press('Enter');
  await page.getByRole('option', { name: '부산' }).click();
  await waitState(page, 'site', ['seoul', 'busan']);
  await page.getByRole('option', { name: '서울' }).click();
  await waitState(page, 'site', ['busan']);
  await page.keyboard.press('Escape');
  await write(page, 'site', []);
  await trigger.getByText('지역 선택', { exact: true }).waitFor();
});

test('audit/combobox: search, keyboard choice, and external reset update the trigger', async t => {
  const page = await setup(t, {
    states: { choice: state('apple'), locked: state(false) },
    render: bound('Combobox', 'choice', 'value', 'valueChange', {
      placeholder: 'Pick fruit', searchPlaceholder: 'Search fruit', disabled: path('/states/locked'),
      options: [{ value: 'apple', label: 'Apple' }, { value: 'banana', label: 'Banana', disabled: true }, { value: 'pear', label: 'Pear' }],
    }),
  });
  await page.getByRole('combobox', { name: 'Apple' }).press('Enter');
  await attr(page.getByRole('option', { name: 'Banana' }), 'aria-disabled', 'true');
  const search = page.getByRole('combobox', { name: 'Search fruit' });
  await search.fill('Pear');
  await page.getByRole('option', { name: 'Apple' }).waitFor({ state: 'hidden' });
  await search.press('ArrowDown');
  await search.press('Enter');
  await waitState(page, 'choice', 'pear');
  await page.getByRole('combobox', { name: 'Pear' }).waitFor();
  await write(page, 'choice', '');
  const empty = page.getByRole('combobox', { name: 'Pick fruit' });
  await write(page, 'locked', true);
  assert.equal(await empty.isDisabled(), true);
});

test('audit/calendar: date codec, keyboard day navigation, limits and null reset', async t => {
  const view = sample('calendar');
  Object.assign(view.render.inputs, { minValue: '2026-11-02', maxValue: '2026-11-20', readonly: path('/states/locked') });
  view.states.locked = state(false);
  const page = await setup(t, view);
  await attr(day(page, '2026-11-01'), 'aria-disabled', 'true');
  await attr(day(page, '2026-11-21'), 'aria-disabled', 'true');
  await day(page, '2026-11-02').press('ArrowRight');
  await page.keyboard.press('Enter');
  await waitState(page, 'date', '2026-11-03');
  await day(page, '2026-11-03').press('Enter');
  await waitState(page, 'date', null);
  await write(page, 'date', '2026-11-05');
  await attr(day(page, '2026-11-05'), 'data-selected', '');
  await write(page, 'date', null);
  assert.equal(await page.locator('[data-calendar-day][data-selected]').count(), 0);
  await write(page, 'locked', true);
  await day(page, '2026-11-07').press('Enter');
  assert.equal(await read(page, 'date'), null);
});

test('audit/calendar: multiple dates round-trip as ISO arrays', async t => {
  const view = sample('calendar');
  view.states.date = state(['2026-11-02']);
  view.render.inputs.type = 'multiple';
  view.render.inputs.maxDays = 2;
  const page = await setup(t, view);
  await day(page, '2026-11-05').click();
  await waitState(page, 'date', ['2026-11-02', '2026-11-05']);
  await day(page, '2026-11-06').press('Enter');
  await waitState(page, 'date', ['2026-11-06']);
  await write(page, 'date', []);
  assert.equal(await page.locator('[data-calendar-day][data-selected]').count(), 0);
});

test('audit/range-calendar: completed ISO range and external clear update the grid', async t => {
  const view = sample('range-calendar');
  Object.assign(view.render.inputs, { minValue: '2026-11-02', maxValue: '2026-11-25' });
  const page = await setup(t, view);
  const rangeDay = value => page.locator(`[data-range-calendar-day][data-value="${value}"]`).first();
  await attr(rangeDay('2026-11-01'), 'aria-disabled', 'true');
  await attr(rangeDay('2026-11-26'), 'aria-disabled', 'true');
  await write(page, 'date', { start: '2026-11-09', end: null });
  await rangeDay('2026-11-09').press('ArrowRight');
  await page.keyboard.press('Enter');
  await waitState(page, 'date', { start: '2026-11-09', end: '2026-11-10' });
  await write(page, 'date', { start: null, end: null });
  assert.equal(await page.locator('[data-range-calendar-day][data-selected]').count(), 0);
});

test('audit/date-picker: single and range popup honor ISO changes and disabled state', async t => {
  const limits = { locale: 'en-US', min: '2026-11-03', max: '2026-11-29' };
  const page = await setup(t, {
    states: { date: state('2026-11-04'), range: state({ start: '2026-11-04', end: null }), locked: state(false) },
    render: group(
      bound('DatePicker', 'date', 'value', 'valueChange', { ...limits, placeholder: 'Pick date', disabled: path('/states/locked') }),
      bound('DatePicker', 'range', 'range', 'rangeChange', limits),
    ),
  });
  await button(page, 'November 4, 2026').first().press('Enter');
  await attr(day(page, '2026-11-02'), 'aria-disabled', 'true');
  await attr(day(page, '2026-11-30'), 'aria-disabled', 'true');
  await day(page, '2026-11-04').press('ArrowRight');
  await page.keyboard.press('Enter');
  await waitState(page, 'date', '2026-11-05');
  await write(page, 'date', null);
  await button(page, 'Pick date').waitFor();
  await write(page, 'locked', true);
  assert.equal(await button(page, 'Pick date').isDisabled(), true);
  await button(page, 'November 4, 2026').click();
  await page.locator('[data-range-calendar-day][data-value="2026-11-10"]').click();
  await waitState(page, 'range', { start: '2026-11-04', end: '2026-11-10' });
  await button(page, 'November 4, 2026 – November 10, 2026').waitFor();
  await write(page, 'range', { start: null, end: null });
  await button(page, 'Pick a date').waitFor();
});

test('audit/carousel: arrows and nested controls navigate to bounded slide positions', async t => {
  const view = sample('carousel');
  view.render.inputs.orientation = path('/states/orientation');
  view.render.slots.default[0].inputs = { style: 'height: 80px' };
  view.states = { key: state(null), clicked: state(null), orientation: state('horizontal') };
  view.render.on = bind('key', 'keyDown', path('/event/key'));
  view.render.slots.default[2].on = bind('clicked', 'click', path('/event/type'));
  const page = await setup(t, view);
  const previous = slot(page, 'carousel-previous');
  const next = slot(page, 'carousel-next');
  await page.waitForFunction(() => document.querySelector('[data-slot=carousel-previous]').disabled &&
    !document.querySelector('[data-slot=carousel-next]').disabled);
  const track = page.locator('[data-embla-container]');
  const initial = await track.evaluate(el => el.style.transform);
  await next.press('ArrowRight');
  await waitState(page, 'key', 'ArrowRight');
  await page.waitForFunction(initial => document.querySelector('[data-embla-container]').style.transform !== initial, initial);
  await next.press('Enter');
  await waitState(page, 'clicked', 'click');
  await page.waitForFunction(() => document.querySelector('[data-slot=carousel-next]').disabled);
  await previous.press('Enter');
  await page.waitForFunction(() => !document.querySelector('[data-slot=carousel-next]').disabled);
  await previous.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-slot=carousel-previous]').disabled);

  assert.equal(await track.evaluate(el => getComputedStyle(el).flexDirection), 'row');
  await write(page, 'orientation', 'vertical');
  assert.equal(await track.evaluate(el => getComputedStyle(el).flexDirection), 'column');
  await next.press('Enter');
  await page.waitForFunction(() => {
    const track = document.querySelector('[data-embla-container]');
    return Math.abs(new DOMMatrixReadOnly(track.style.transform).m42) > 5;
  });
});

test('audit/resizable: keyboard emits layout proportions and clamps minimum pane size', async t => {
  const view = sample('resizable');
  view.states = { layout: state(null) };
  view.render.on = bind('layout', 'layoutChange');
  const page = await setup(t, view);
  const handle = page.getByRole('separator');
  const pane = page.locator('[data-pane]').first();
  await waitState(page, 'layout', [45, 55]);
  const original = await pane.evaluate(el => el.getBoundingClientRect().width);
  await handle.press('ArrowRight');
  await page.waitForFunction(() => mounted.view.getState('layout').read()?.[0] > 45);
  await page.waitForFunction(original => document.querySelector('[data-pane]').getBoundingClientRect().width > original, original);
  await handle.press('Home');
  await page.waitForFunction(() => mounted.view.getState('layout').read()?.[0] < 45);
  const layout = await read(page, 'layout');
  assert.ok(layout[0] >= 20);
  assert.ok(layout[0] < 45);
  assert.ok(Math.abs(layout.reduce((sum, width) => sum + width, 0) - 100) < 0.01);
});

test('audit/questionnaire: required validation, controlled steps and keyboard submit', async t => {
  const view = sample('questionnaire');
  view.states.item = state('format');
  view.states.submitted = state(null);
  view.render.inputs.item = path('/states/item');
  view.render.on = { ...bind('item', 'itemChange'), ...bind('submitted', 'submit', path('/event/type')) };
  const page = await setup(t, view);
  const next = slot(page, 'questionnaire-next');
  await next.press('Enter');
  await exact(page, '보고서 형식을 선택하세요').waitFor();
  assert.equal(await read(page, 'item'), 'format');
  assert.equal(await read(page, 'submitted'), null);
  const summary = page.locator('input[name=format][value=summary]');
  await summary.press('Space');
  assert.equal(await summary.isChecked(), true);
  await next.press('Enter');
  await waitState(page, 'item', 'detail');
  await exact(page, '추가 범위를 선택하세요').waitFor();
  await write(page, 'item', 'format');
  assert.equal(await summary.isChecked(), true);
  await next.press('Enter');
  await waitState(page, 'item', 'detail');
  const comparison = page.locator('input[name=detail][value=comparison]');
  await comparison.press('Space');
  assert.equal(await comparison.isChecked(), true);
  const url = page.url();
  await slot(page, 'questionnaire-submit').press('Enter');
  await waitState(page, 'submitted', 'submit');
  assert.equal(page.url(), url);
});
