import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createAuditHarness, identify, node, group, state, path, record, write } from './fixtures/audit-harness.mjs';

let harness;
before(async () => { harness = await createAuditHarness(); });
after(async () => { await harness?.close(); });

test('audit/shared-dom: every declared common DOM event transports only its documented JSON payload', async t => {
  const support = JSON.parse(await readFile(new URL('../src/lib/shadcn/support.json', import.meta.url)));
  const input = support.components.find(entry => entry.id === 'shadcn.Input');
  const callbacks = Object.entries(support.callbacks[input.callbacksRef]).filter(([, callback]) => callback.codec === 'dom');
  const page = await harness.setup(t, identify({ render: node('Input', { id: 'probe', value: '한국어' }, [], {
    on: Object.fromEntries(callbacks.map(([name]) => [name, record(name)])),
  }) }));
  // Synthetic dispatch verifies all 40 transport names, including rare lifecycle
  // events. Native keyboard/IME/selection semantics have separate family tests.
  const expected = await page.locator('#probe').evaluate((element, names) => {
    const types = { doubleClick: 'dblclick', beforeInput: 'beforeinput', contextMenu: 'contextmenu' };
    for (const name of names) {
      const type = types[name] ?? name.toLowerCase();
      const event = name.startsWith('key')
        ? new KeyboardEvent(type, { bubbles: true, key: 'Enter', code: 'Enter', ctrlKey: true })
        : name.startsWith('composition') ? new CompositionEvent(type, { bubbles: true, data: '어' })
        : name.startsWith('mouse') || name === 'click' || name === 'doubleClick' || name === 'contextMenu'
          ? new MouseEvent(type, { bubbles: true, button: 1, buttons: 4, shiftKey: true })
          : new Event(type, { bubbles: true, cancelable: true });
      // reset normally targets a form. This input-only transport probe cancels
      // its default so Svelte's document form-reset handler cannot treat an
      // artificial input target as an HTMLFormElement.
      if (name === 'reset') event.preventDefault();
      element.dispatchEvent(event);
    }
    // Sorted callback order includes compositionEnd before compositionStart;
    // finish the final composition so its deferred input is also observable.
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '어' }));
    return names;
  }, callbacks.map(([name]) => name));
  await page.waitForFunction(names => names.every(name => events.some(event => event.name === name)), expected);
  const events = await page.evaluate(() => window.events);
  const allowed = new Set(['type', 'value', 'checked', 'key', 'code', 'button', 'buttons', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey']);
  for (const event of events) {
    assert.ok(Object.keys(event.payload).every(key => allowed.has(key)), event.name);
    assert.equal(event.payload.value, '한국어', event.name);
    assert.equal(typeof event.payload.type, 'string');
    assert.equal(event.payload.checked, false);
  }
  assert.equal(events.find(event => event.name === 'keyDown').payload.key, 'Enter');
  assert.equal(events.find(event => event.name === 'keyDown').payload.ctrlKey, true);
  assert.equal(events.find(event => event.name === 'click').payload.button, 1);
  assert.equal(expected.length, 40);
});

test('audit/shared-attributes: JSON attributes update and remove on the same native element', async t => {
  const page = await harness.setup(t, identify({
    states: { title: state('처음'), disabled: state(false), invalid: state(true), value: state('초기') },
    render: group(node('Input', {
      id: 'attributes', name: 'customer', value: path('/states/value'), title: path('/states/title'),
      disabled: path('/states/disabled'), 'aria-invalid': path('/states/invalid'), 'aria-label': '고객',
      'aria-describedby': 'help', required: true, minlength: 2, maxlength: 12, placeholder: '입력',
      autocomplete: 'off', inputmode: 'text', lang: 'ko', dir: 'ltr', class: 'audit-input', style: 'width: 280px;',
    }), node('Field.Description', { id: 'help', text: '도움말' })),
  }));
  const input = page.locator('#attributes');
  const original = await input.elementHandle();
  for (const [name, expected] of Object.entries({ name: 'customer', title: '처음', 'aria-invalid': 'true', 'aria-describedby': 'help', minlength: '2', maxlength: '12', placeholder: '입력', autocomplete: 'off', inputmode: 'text', lang: 'ko', dir: 'ltr' })) {
    assert.equal(await input.getAttribute(name), expected, name);
  }
  assert.equal(await input.evaluate(element => getComputedStyle(element).width), '280px');
  assert.ok((await input.getAttribute('class')).includes('audit-input'));
  await write(page, 'title', null);
  await write(page, 'value', '외부 변경');
  await write(page, 'invalid', false);
  await write(page, 'disabled', true);
  assert.equal(await input.getAttribute('title'), null);
  assert.equal(await input.inputValue(), '외부 변경');
  assert.equal(await input.getAttribute('aria-invalid'), 'false');
  assert.equal(await input.isDisabled(), true);
  assert.equal(await original.evaluate(element => element === document.querySelector('#attributes')), true);
  await write(page, 'disabled', false);
  await input.fill('수정 가능');
  assert.equal(await input.inputValue(), '수정 가능');
});
