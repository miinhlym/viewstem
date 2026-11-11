import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import {
  bind, createAuditHarness, group, identify, node, path, read, record, slot, state, waitState, write,
} from './fixtures/audit-harness.mjs';

let harness;
before(async () => { harness = await createAuditHarness(); });
after(() => harness?.close());

const setup = (t, render, states) => harness.setup(t, identify({ render, states }));
const ref = name => path('/states/' + name);
const on = (event, name = event) => ({ on: { [event]: record(name) } });
const text = (part, label, inputs = {}, extra = {}) => node(part, { ...inputs, text: label }, [], extra);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const events = page => page.evaluate(() => window.events);
const waitEvent = (page, name, payload, since = 0) => page.waitForFunction(({ name, payload, since }) =>
  window.events.slice(since).some(entry => entry.name === name && (payload === undefined ||
    JSON.stringify(entry.payload) === JSON.stringify(payload))), { name, payload, since });
const focus = async (page, locator) => page.waitForFunction(element => document.activeElement === element, await locator.elementHandle());
const absent = locator => locator.waitFor({ state: 'hidden' });
const part = family => (suffix, inputs, children, extra) => node(family + '.' + suffix, inputs, children, extra);
const label = family => (suffix, caption, inputs, extra) => text(family + '.' + suffix, caption, inputs, extra);

function openBindings(name, completion = name) {
  return { on: { ...bind(name, 'openChange'), openChangeComplete: record(completion) } };
}

for (const [slug, family] of [['alert-dialog', 'AlertDialog'], ['dialog', 'Dialog'], ['sheet', 'Sheet'], ['drawer', 'Drawer']]) {
  test('audit/' + slug + ': controlled modal and keyboard dismissal', async t => {
    const p = part(family);
    const l = label(family);
    const alert = family === 'AlertDialog';
    const drawer = family === 'Drawer';
    const sheet = family === 'Sheet';
    const closePart = alert ? 'Cancel' : 'Close';
    const content = [
      p('Header', {}, [l('Title', 'Panel title'), l('Description', 'Panel description')]),
      text('Button', 'Unavailable', { disabled: true }, on('click', 'disabled')),
      p('Footer', {}, [
        l(closePart, 'Cancel panel'),
        alert ? l('Action', 'Confirm panel', { variant: 'destructive' }, on('click', 'confirm'))
          : text('Button', 'Inside panel'),
      ]),
    ];
    if (drawer) content.splice(2, 0, p('NestedRoot', { open: ref('nested'), shouldScaleBackground: false }, [
      l('Trigger', 'Open nested'),
      p('Content', {}, [l('Title', 'Nested title'), l('Description', 'Nested details'), l('Close', 'Close nested')]),
    ], openBindings('nested')));
    const rootInputs = { open: ref('open'), ...(drawer ? { direction: 'bottom', shouldScaleBackground: false, autoFocus: true } : {}) };
    const contentInputs = sheet ? { side: 'left', showCloseButton: false }
      : alert || drawer ? {} : { showCloseButton: false };
    const page = await setup(t, p('Root', rootInputs, [
      p('Trigger', {}, [], { slots: { child: [text('Button', 'Open panel', { variant: 'outline' })] } }),
      p('Content', contentInputs, content),
    ], openBindings('open')), { open: state(false), nested: state(false) });

    const trigger = button(page, 'Open panel');
    const modal = page.getByRole(alert ? 'alertdialog' : 'dialog', { name: 'Panel title', exact: true });
    const cancel = button(page, 'Cancel panel');
    assert.equal(await trigger.locator('button').count(), 0, 'child slot must produce one button');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await waitState(page, 'open', true);
    await modal.waitFor();
    await waitEvent(page, 'open', { value: true });
    assert.equal(await modal.evaluate(element => !element.closest('#app')), true);
    assert.equal(await modal.getByRole('button', { name: 'Unavailable' }).isDisabled(), true);
    if (!drawer) {
      await cancel.focus();
      await page.keyboard.press('Tab');
      await focus(page, button(page, alert ? 'Confirm panel' : 'Inside panel'));
      await page.keyboard.press('Tab');
      await focus(page, cancel);
    } else {
      await button(page, 'Open nested').press('Enter');
      await waitState(page, 'nested', true);
      await page.getByRole('dialog', { name: 'Nested title' }).waitFor();
      await button(page, 'Close nested').press('Space');
      await waitState(page, 'nested', false);
      await absent(page.getByRole('dialog', { name: 'Nested title' }));
      assert.equal(await read(page, 'open'), true);
    }
    await page.keyboard.press('Escape');
    await waitState(page, 'open', false);
    await absent(modal);
    await waitEvent(page, 'open', { value: false });
    await focus(page, trigger);
    await write(page, 'open', true);
    await modal.waitFor();
    if (alert) {
      await button(page, 'Confirm panel').press('Space');
      await waitEvent(page, 'confirm');
      // AlertDialog.Action delegates closing to the caller.
      await cancel.press('Enter');
    } else {
      await cancel.press('Space');
    }
    await waitState(page, 'open', false);
    await absent(modal);
    assert.equal((await events(page)).some(entry => entry.name === 'disabled'), false);
  });
}

test('audit/popover: nested overlay consumes Escape and restores focus', async t => {
  const page = await setup(t, node('Popover.Root', { open: ref('open') }, [
    text('Popover.Trigger', 'Open settings'),
    node('Popover.Content', { side: 'bottom', align: 'start' }, [
      text('Popover.Title', 'Settings'),
      node('Popover.Root', { open: ref('child') }, [
        text('Popover.Trigger', 'Open detail'),
        node('Popover.Content', { side: 'right' }, [text('Popover.Close', 'Close detail')]),
      ], openBindings('child')),
      text('Popover.Close', 'Close settings'),
    ]),
  ], openBindings('open')), { open: state(false), child: state(false) });
  const parent = button(page, 'Open settings');
  const child = button(page, 'Open detail');
  await parent.press('Space');
  await waitState(page, 'open', true);
  await child.press('Enter');
  await waitState(page, 'child', true);
  await button(page, 'Close detail').waitFor();
  await waitEvent(page, 'child', { value: true });
  await page.keyboard.press('Escape');
  await waitState(page, 'child', false);
  assert.equal(await read(page, 'open'), true, 'Escape closes only the child');
  await waitEvent(page, 'child', { value: false });
  await focus(page, child);
  await page.keyboard.press('Escape');
  await waitState(page, 'open', false);
  await waitEvent(page, 'open', { value: false });
  await focus(page, parent);
  await write(page, 'open', true);
  const since = (await events(page)).length;
  // Reverse a host-opened child as soon as its DOM commits, during the open animation.
  await page.evaluate(async () => {
    const nested = mounted.view.getState('child');
    nested.write(true);
    await mounted.whenRendered();
    nested.write(false);
    await mounted.whenRendered();
  });
  await waitEvent(page, 'child', { value: false }, since);
  await absent(button(page, 'Close detail'));
  assert.equal(await read(page, 'open'), true);
  await button(page, 'Close settings').press('Enter');
  await waitState(page, 'open', false);
});

for (const [slug, family] of [['hover-card', 'HoverCard'], ['tooltip', 'Tooltip']]) {
  test('audit/' + slug + ': hover, disabled, and focus lifecycle', async t => {
    const p = part(family);
    const l = label(family);
    const tooltip = family === 'Tooltip';
    const trigger = name => l('Trigger', name, tooltip ? {} : { href: '#profile' });
    const root = p('Root', { open: ref('open'), disabled: ref('disabled'), ...(tooltip ? {} : { openDelay: 0, closeDelay: 0 }) }, [
      trigger('Profile'),
      p('Content', { side: 'bottom' }, [text('Typography', 'Profile summary', { as: 'span' })]),
    ], openBindings('open'));
    const page = await setup(t, tooltip ? p('Provider', { delayDuration: 0 }, [root]) : root,
      { open: state(false), disabled: state(true) });
    const control = button(page, 'Profile');
    const content = slot(page, slug + '-content');
    await control.hover();
    await page.waitForFunction(() => document.querySelector('#app :hover'));
    assert.equal(await read(page, 'open'), false);
    await page.locator('#host').hover();
    await write(page, 'disabled', false);
    await control.hover();
    await content.waitFor();
    await waitState(page, 'open', true);
    await waitEvent(page, 'open', { value: true });
    await page.locator('#host').hover();
    await waitState(page, 'open', false);
    await absent(content);
    await page.locator('#host').focus();
    await page.keyboard.press('Tab');
    await focus(page, control);
    await content.waitFor();
    await page.keyboard.press('Escape');
    await waitState(page, 'open', false);
    await waitEvent(page, 'open', { value: false });
    await focus(page, control);
  });
}

for (const [slug, family] of [['dropdown-menu', 'DropdownMenu'], ['context-menu', 'ContextMenu'], ['menubar', 'Menubar']]) {
  test('audit/' + slug + ': disabled items, radio State, and keyboard submenu', async t => {
    const p = part(family);
    const l = label(family);
    const menubar = family === 'Menubar';
    const context = family === 'ContextMenu';
    const menu = (name, items) => [
      l('Trigger', name, context ? { tabindex: 0 } : {}),
      p('Portal', {}, [p('Content', { loop: true }, items)]),
    ];
    const submenuBindings = openBindings('sub');
    submenuBindings.on.openChange.action.steps.push({
      kind: 'Action', actionRef: 'audit-record',
      inputs: { name: 'sub-transition', payload: { value: path('/ports/next') } },
    });
    const items = [
      p('Group', {}, [
        l('Item', 'Archive', {}, on('select', 'archive')),
        l('Item', 'Blocked', { disabled: true }, on('select', 'blocked')),
      ]),
      p('RadioGroup', { value: ref('scope') }, [
        l('RadioItem', 'All records', { value: 'all', closeOnSelect: false }),
        l('RadioItem', 'My records', { value: 'mine', closeOnSelect: true }),
      ], { on: bind('scope') }),
      p('Sub', { open: ref('sub') }, [
        l('SubTrigger', 'Export', { textValue: 'Export' }),
        p('SubContent', {}, [l('Item', 'CSV', {}, on('select', 'csv'))]),
      ], submenuBindings),
    ];
    const page = await setup(t, menubar ? p('Root', { value: ref('menu'), loop: true }, [
      p('Menu', { value: 'actions' }, menu('Actions', items), on('openChange', 'menu-change')),
      p('Menu', { value: 'other' }, menu('Other', [l('Item', 'Help')])),
    ], { on: bind('menu') }) : p('Root', { open: ref('open') }, menu('Actions', items), openBindings('open')),
    { open: state(false), menu: state(''), sub: state(false), scope: state('all') });
    const trigger = context ? slot(page, 'context-menu-trigger') : menubar
      ? page.getByRole('menuitem', { name: 'Actions' }) : button(page, 'Actions');
    const item = name => page.getByRole('menuitem', { name, exact: true });
    const radio = name => page.getByRole('menuitemradio', { name, exact: true });
    const show = async () => {
      if (context) await trigger.click({ button: 'right' });
      else await trigger.press('Enter');
      await item('Archive').waitFor();
    };
    await show();
    if (menubar) {
      await waitState(page, 'menu', 'actions');
      await waitEvent(page, 'menu-change', { value: true });
    } else {
      await waitState(page, 'open', true);
      await waitEvent(page, 'open', { value: true });
    }
    assert.equal(await item('Blocked').getAttribute('aria-disabled'), 'true');
    await item('Archive').focus();
    await page.keyboard.press('ArrowDown');
    await focus(page, radio('All records'));
    const focusedRadio = await radio('All records').elementHandle();
    await write(page, 'scope', 'mine');
    assert.equal(await focusedRadio.evaluate(element => element.isConnected && document.activeElement === element), true);
    assert.equal(await radio('My records').getAttribute('aria-checked'), 'true');
    await radio('All records').press('Enter');
    await waitState(page, 'scope', 'all');
    assert.equal(await radio('All records').getAttribute('aria-checked'), 'true');
    await focus(page, radio('All records'));
    await radio('My records').press('Enter');
    await waitState(page, 'scope', 'mine');
    await waitState(page, menubar ? 'menu' : 'open', menubar ? '' : false);
    await absent(item('Archive'));
    await show();
    await page.keyboard.press('e');
    await focus(page, item('Export'));
    await page.keyboard.press('ArrowRight');
    await waitState(page, 'sub', true);
    await waitEvent(page, 'sub', { value: true });
    await focus(page, item('CSV'));
    await page.keyboard.press('ArrowLeft');
    await waitState(page, 'sub', false);
    await waitEvent(page, 'sub', { value: false });
    await focus(page, item('Export'));
    await page.keyboard.press('ArrowRight');
    await focus(page, item('CSV'));
    await page.keyboard.press('Enter');
    await waitEvent(page, 'csv', { type: 'menuitemselect' });
    await waitState(page, 'sub', false);
    await absent(item('Archive'));
    if (!context) await focus(page, trigger);
    await show();
    await page.keyboard.press('Escape');
    await absent(item('Archive'));
    if (!menubar) await waitEvent(page, 'open', { value: false });
    else {
      await trigger.focus();
      await page.keyboard.press('ArrowRight');
      await focus(page, item('Other'));
    }
    assert.equal((await events(page)).some(entry => entry.name === 'blocked' || entry.name === 'archive'), false);
    assert.deepEqual((await events(page)).filter(entry => entry.name === 'sub-transition').map(entry => entry.payload.value),
      [true, false, true, false]);
  });
}

test('audit/navigation-menu: controlled panels and keyboard links', async t => {
  const p = part('NavigationMenu');
  const l = label('NavigationMenu');
  const page = await setup(t, p('Root', { value: ref('section'), viewport: false }, [
    p('List', {}, [
      p('Item', { value: 'docs', openOnHover: false }, [
        l('Trigger', 'Docs'),
        p('Content', {}, [l('Link', 'Start', { href: '#start', active: true }, on('click', 'start'))]),
      ]),
      p('Item', { value: 'blocked' }, [l('Trigger', 'Blocked', { disabled: true })]),
      p('Item', { value: 'api', openOnHover: false }, [
        l('Trigger', 'API'),
        p('Content', {}, [l('Link', 'Reference', { href: '#reference' })]),
      ]),
    ]),
  ], { on: bind('section') }), { section: state('') });
  const docs = button(page, 'Docs');
  const api = button(page, 'API');
  const start = page.getByRole('link', { name: 'Start' });
  assert.equal(await button(page, 'Blocked').isDisabled(), true);
  await docs.focus();
  await page.keyboard.press('ArrowRight');
  await focus(page, api);
  await page.keyboard.press('ArrowLeft');
  await focus(page, docs);
  await page.keyboard.press('Enter');
  await waitState(page, 'section', 'docs');
  await start.waitFor();
  assert.equal(await start.getAttribute('data-active'), '');
  await page.keyboard.press('ArrowDown');
  await focus(page, start);
  await page.keyboard.press('Escape');
  await waitState(page, 'section', '');
  await focus(page, docs);
  await write(page, 'section', 'api');
  await page.getByRole('link', { name: 'Reference' }).waitFor();
  await write(page, 'section', 'docs');
  await start.press('Enter');
  await waitEvent(page, 'start');
  assert.equal(new URL(page.url()).hash, '#start');
});

test('audit/sidebar: desktop collapse, subnavigation, and keyboard shortcut', async t => {
  const p = part('Sidebar');
  const l = label('Sidebar');
  const page = await setup(t, p('Provider', { open: ref('open') }, [
    p('Root', { collapsible: 'icon' }, [
      p('Content', {}, [p('Menu', {}, [p('MenuItem', {}, [
        l('MenuButton', 'Reports', { isActive: true }),
        p('MenuSub', {}, [p('MenuSubItem', {}, [
          l('MenuSubButton', 'Monthly', { href: '#monthly' }, on('click', 'monthly')),
        ])]),
      ])])]),
    ]),
    p('Inset', {}, [p('Trigger', { 'aria-label': 'Toggle reports' })]),
  ], { on: bind('open', 'openChange') }), { open: state(true) });
  const trigger = button(page, 'Toggle reports');
  const menu = button(page, 'Reports');
  const sub = page.getByRole('link', { name: 'Monthly' });
  assert.equal(await menu.getAttribute('data-active'), 'true');
  await trigger.press('Space');
  await waitState(page, 'open', false);
  await absent(sub);
  await page.keyboard.press('Control+b');
  await waitState(page, 'open', true);
  await sub.waitFor();
  await sub.press('Enter');
  await waitEvent(page, 'monthly');
  assert.equal(new URL(page.url()).hash, '#monthly');
  await write(page, 'open', false);
  await absent(sub);
});

test('audit/command: filtering, disabled selection, and dialog State', async t => {
  const p = part('Command');
  const l = label('Command');
  const paletteDefinition = p('Dialog', { open: ref('open'), value: ref('value'), title: 'Palette', description: 'Find actions', label: 'Find action', loop: true }, [
    p('Input', { 'aria-label': 'Find action' }),
    p('List', {}, [
      l('Empty', 'No actions'),
      p('Group', { heading: 'Reports' }, [
        l('Item', 'Open', { value: 'open', keywords: ['document'] }, on('select', 'selected-open')),
        l('Item', 'Blocked', { value: 'blocked', disabled: true }, on('select', 'selected-blocked')),
        l('Item', 'Save', { value: 'save' }, on('select', 'selected-save')),
      ]),
    ]),
  ], { on: { ...bind('value'), ...bind('open', 'openChange'), openChangeComplete: record('palette-complete') } });
  const page = await setup(t, group(
    text('Typography', ref('summary'), { as: 'span' }),
    paletteDefinition,
  ), { open: state(false), value: state('open'), summary: state('Initial summary') });
  await write(page, 'open', true);
  const palette = page.getByRole('dialog', { name: 'Palette' });
  const input = palette.getByRole('combobox', { name: 'Find action' });
  const option = name => palette.getByRole('option', { name, exact: true });
  await input.waitFor();
  assert.equal(await option('Blocked').getAttribute('aria-disabled'), 'true');
  await input.focus();
  await page.keyboard.press('ArrowDown');
  await waitState(page, 'value', 'save');
  await page.keyboard.press('Enter');
  await waitEvent(page, 'selected-save');
  await input.fill('document');
  await option('Open').waitFor();
  await absent(option('Save'));
  const editor = await input.elementHandle();
  await write(page, 'summary', 'Updated summary');
  assert.equal(await page.getByText('Updated summary', { exact: true }).count(), 1);
  assert.equal(await editor.evaluate(element =>
    element.isConnected && document.activeElement === element && element.value === 'document'), true);
  await input.fill('no matching action');
  await palette.getByText('No actions').waitFor();
  await page.keyboard.press('Escape');
  await waitState(page, 'open', false);
  await absent(palette);
  await waitEvent(page, 'palette-complete', { value: false });
  assert.equal((await events(page)).some(entry => entry.name === 'selected-blocked'), false);
});

test('audit/button: native keyboard activation and disabled host control', async t => {
  const controls = group(
    node('Button', { text: 'Fallback', variant: 'outline', size: 'sm', type: 'button', disabled: ref('disabled') }, [
      text('Typography', 'Save', { as: 'span' }),
    ], { on: { click: record('save'), keyDown: record('save-key') } }),
    text('Button', 'Details', { href: '#details' }, on('click', 'details')),
    text('Button', 'Unavailable details', { href: '#unavailable', disabled: true }, {
      on: bind('activated', 'click', true),
    }),
  );
  const page = await setup(t, { ...controls, on: bind('bubbled', 'click', true) }, {
    disabled: state(true), activated: state(false), bubbled: state(false),
  });
  const save = button(page, 'Save');
  const details = page.getByRole('link', { name: 'Details', exact: true });
  assert.equal(await save.isDisabled(), true);
  await page.locator('#host').focus();
  await page.keyboard.press('Tab');
  await focus(page, details);
  assert.deepEqual(await events(page), []);
  await write(page, 'disabled', false);
  assert.equal(await save.getAttribute('type'), 'button');
  assert.equal(await save.evaluate(element => getComputedStyle(element).height), '28px');
  assert.equal(await save.evaluate(element => element.classList.contains('border-border')), true);
  await save.press('Enter');
  await waitEvent(page, 'save');
  await save.press('Space');
  await page.waitForFunction(() => window.events.filter(entry => entry.name === 'save').length === 2);
  assert.deepEqual((await events(page)).filter(entry => entry.name === 'save-key').map(entry => entry.payload.key), ['Enter', ' ']);
  await details.press('Enter');
  await waitEvent(page, 'details');
  assert.equal(new URL(page.url()).hash, '#details');

  await waitState(page, 'bubbled', true);
  await write(page, 'bubbled', false);
  const disabledLink = page.getByRole('link', { name: 'Unavailable details' });
  assert.equal(await disabledLink.getAttribute('href'), null);
  assert.equal(await disabledLink.getAttribute('aria-disabled'), 'true');
  assert.equal(await disabledLink.getAttribute('tabindex'), '-1');
  const bounds = await disabledLink.boundingBox();
  assert.ok(bounds);
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.evaluate(() => mounted.whenRendered());
  assert.equal(await read(page, 'activated'), false);
  assert.equal(await read(page, 'bubbled'), false);
  assert.equal(new URL(page.url()).hash, '#details');
});

test('audit/button-group: orientation and nested button tab order', async t => {
  const page = await setup(t, node('ButtonGroup.Root', { orientation: ref('orientation'), 'aria-label': 'Sort controls' }, [
    text('ButtonGroup.Text', 'Sort'),
    text('Button', 'Newest', { disabled: true }, on('click', 'disabled')),
    node('ButtonGroup.Separator', { orientation: 'horizontal', decorative: false }),
    node('ButtonGroup.Root', { orientation: 'horizontal' }, [
      text('Button', 'By name', {}, on('click', 'sort')),
      text('Button', 'By date'),
    ]),
  ]), { orientation: state('vertical') });
  const outer = page.getByRole('group', { name: 'Sort controls' });
  assert.equal(await outer.getAttribute('data-orientation'), 'vertical');
  await outer.getByRole('separator').waitFor();
  assert.equal(await outer.getByRole('group').count(), 1);
  await page.locator('#host').focus();
  await page.keyboard.press('Tab');
  await focus(page, button(page, 'By name'));
  await page.keyboard.press('Space');
  await waitEvent(page, 'sort');
  await page.keyboard.press('Tab');
  await focus(page, button(page, 'By date'));
  await write(page, 'orientation', 'horizontal');
  assert.equal(await outer.getAttribute('data-orientation'), 'horizontal');
  assert.equal((await events(page)).some(entry => entry.name === 'disabled'), false);
});

test('audit/breadcrumb: current page, link activation, and hidden separators', async t => {
  const p = part('Breadcrumb');
  const l = label('Breadcrumb');
  const page = await setup(t, p('Root', { 'aria-label': 'Report path' }, [
    p('List', {}, [
      p('Item', {}, [l('Link', 'Home', { href: '#home' }, on('click', 'home'))]),
      p('Separator'),
      p('Item', {}, [p('Ellipsis')]),
      p('Separator'),
      p('Item', {}, [l('Page', ref('page'))]),
    ]),
  ]), { page: state('Reports') });
  const nav = page.getByRole('navigation', { name: 'Report path' });
  const home = nav.getByRole('link', { name: 'Home' });
  const current = nav.locator('[aria-current="page"]');
  assert.equal(await current.textContent(), 'Reports');
  assert.equal(await current.getAttribute('aria-disabled'), 'true');
  assert.equal(await nav.locator('[data-slot="breadcrumb-separator"][aria-hidden="true"]').count(), 2);
  await page.locator('#host').focus();
  await page.keyboard.press('Tab');
  await focus(page, home);
  await page.keyboard.press('Enter');
  await waitEvent(page, 'home');
  assert.equal(new URL(page.url()).hash, '#home');
  await page.keyboard.press('Tab');
  await focus(page, page.locator('#after'));
  await write(page, 'page', 'Monthly report');
  assert.equal(await current.textContent(), 'Monthly report');
});

test('audit/pagination: page State and disabled boundaries', async t => {
  const p = part('Pagination');
  const page = await setup(t, p('Root', { count: 22, perPage: 10, page: ref('page'), 'aria-label': 'Report pages' }, [
    p('Content', {}, [
      p('Item', {}, [p('Previous')]),
      p('Item', {}, [p('Link', { page: { type: 'page', value: 2 }, isActive: ref('active') })]),
      p('Item', {}, [p('Next')]),
    ]),
  ], { on: bind('page', 'pageChange') }), { page: state(1), active: state(false) });
  const nav = page.getByRole('navigation', { name: 'Report pages' });
  const previous = nav.getByRole('button', { name: /previous/i });
  const next = nav.getByRole('button', { name: /next/i });
  const second = nav.getByRole('button', { name: 'Page 2', exact: true });
  assert.equal(await second.textContent(), '2');
  assert.equal(await previous.isDisabled(), true);
  await page.locator('#host').focus();
  await page.keyboard.press('Tab');
  await focus(page, second);
  await page.keyboard.press('Enter');
  await waitState(page, 'page', 2);
  await write(page, 'active', true);
  assert.equal(await second.getAttribute('aria-current'), 'page');
  await next.press('Space');
  await waitState(page, 'page', 3);
  assert.equal(await next.isDisabled(), true);
  await write(page, 'page', 1);
  assert.equal(await previous.isDisabled(), true);
  assert.equal(await next.isDisabled(), false);
});

test('audit/sonner: raw toaster stays separate from State notifications', async t => {
  const first = { id: 'one', title: 'One message', duration: 60000 };
  const second = { id: 'two', title: 'Two message', duration: 60000 };
  const page = await setup(t, group(
    node('Sonner', { position: 'top-left', closeButton: true, containerAriaLabel: 'Host messages' }),
    node('Notifications', { notifications: ref('messages'), position: 'bottom-right', closeButton: true }, [], {
      ...on('dismiss'), when: ref('show'),
    }),
  ), { messages: state([first, second]), show: state(true) });
  const raw = page.locator('section[aria-label^="Host messages"]');
  const recipe = page.locator('[data-sonner-toaster][data-x-position="right"]');
  await recipe.getByText(first.title).waitFor();
  await recipe.getByText(second.title).waitFor();
  assert.equal(await raw.locator('[data-sonner-toast]').count(), 0);
  const hostToast = await page.evaluate(() => API.toast('Host toast', { duration: 60000 }));
  await raw.getByText('Host toast').waitFor();
  assert.equal(await raw.locator('[data-sonner-toaster]').getAttribute('data-x-position'), 'left');
  assert.equal(await recipe.getByText('Host toast').count(), 0);
  await write(page, 'messages', [second]);
  await absent(recipe.getByText(first.title));
  assert.deepEqual(await events(page), [], 'host removal does not dismiss');
  await recipe.getByRole('button', { name: 'Close toast' }).press('Enter');
  await waitEvent(page, 'dismiss', { value: { id: 'two', reason: 'dismissed' } });
  await absent(recipe.getByText(second.title));
  await write(page, 'messages', [first]);
  await recipe.getByText(first.title).waitFor();
  await write(page, 'show', false);
  await absent(recipe);
  await raw.getByText('Host toast').waitFor();
  await page.evaluate(id => API.toast.dismiss(id), hostToast);
  await absent(raw.getByText('Host toast'));
  await write(page, 'show', true);
  await recipe.getByText(first.title).waitFor();
  assert.equal(await recipe.getByText(second.title).count(), 0);
  assert.equal(await raw.locator('[data-sonner-toast]').count(), 0);
});
