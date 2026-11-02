import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { svelteConsumerPlugin } from '../example/server.mjs';

let browser;
let javascript;
before(async () => {
  const bundle = await build({
    stdin: { resolveDir: fileURLToPath(new URL('../', import.meta.url)), contents: `
      export { createRenderer } from '@viewstem/svelte';
      export { registerComponents } from '@viewstem/svelte-ui';
      import { command } from '@viewstem/svelte-ui/shadcn/command';
      import { inputOtp } from '@viewstem/svelte-ui/shadcn/input-otp';
      export const sets = [command, inputOtp];
    ` },
    bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'API',
    conditions: ['svelte', 'browser'], plugins: [svelteConsumerPlugin],
  });
  javascript = bundle.outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); });

const path = value => ({ '@path': value });
const state = initial => ({ kind: 'State', schema: true, initial });
function spec(control, inputOptions) {
  const command = control === 'command';
  const event = command ? 'input' : 'valueChange';
  const editor = {
    id: 'editor',
    componentRef: command ? 'shadcn.Command.Input' : 'shadcn.InputOtp.Root',
    inputs: { 'aria-label': 'Editor', 'aria-valuenow': path('/states/revision'), value: path('/states/value'), ...(!command ? { maxlength: 6, inputmode: 'text' } : {}), ...inputOptions },
    on: { [event]: {
      id: 'track-commit', actionRef: 'tracked',
      inputs: { target: path('/states/value'), next: path('/event/value') },
    } },
  };
  if (!command) editor.on.complete = { actionRef: 'completed', inputs: { next: path('/event/value') } };
  return {
    states: { value: state(''), revision: state(0) },
    render: command ? {
      id: 'command', componentRef: 'shadcn.Command.Root', slots: { default: [editor] },
    } : editor,
  };
}

async function setup(t, control, inputOptions) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    try {
      await page.evaluate(() => window.renderer?.dispose());
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.diagnostics), []);
    } finally { await page.close(); }
  });
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: javascript });
  await page.evaluate(async view => {
    window.diagnostics = [];
    window.commits = [];
    window.completions = [];
    window.renderer = API.createRenderer({ onError: diagnostic => diagnostics.push(diagnostic) });
    API.registerComponents(renderer, API.sets);
    renderer.registry.registerAction({
      kind: 'Action', id: 'tracked', spec: {
        ports: { target: { kind: 'State', schema: true }, next: { kind: 'Value', schema: true } },
      },
    }, ({ inputs }) => {
      commits.push(inputs.next);
      inputs.target.write(inputs.next);
    });
    renderer.registry.registerAction({ kind: 'Action', id: 'completed', spec: { ports: { next: { kind: 'Value', schema: true } } } }, ({ inputs }) => { completions.push(inputs.next); });
    try { window.mounted = await renderer.mount({ target: document.querySelector('#app'), view }); }
    catch (error) { throw new Error(JSON.stringify(error)); }
    await mounted.initialComplete;
  }, spec(control, inputOptions));
  return { page, input: page.locator('#app input[aria-label="Editor"]') };
}

async function settle(page) {
  await page.evaluate(async () => {
    await mounted.whenRendered();
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
}
async function snapshot(page) {
  return page.evaluate(() => ({ value: mounted.view.getState('value').read(), commits }));
}

for (const [control, delayed] of [['command', false], ['command', true], ['otp', false], ['otp', true]]) {
  test(`${control} IME commits the final Korean value once (${delayed ? 'delayed' : 'immediate'} final input)`, async t => {
    const { page, input } = await setup(t, control);
    await input.focus();
    await input.evaluate(element => {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      element.value = '한';
      element.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: '한' }));
    });
    await settle(page);
    assert.deepEqual(await snapshot(page), { value: '', commits: [] });
    await page.evaluate(() => mounted.view.getState('revision').write(1));
    await settle(page);
    assert.equal(await input.getAttribute('aria-valuenow'), '1');
    assert.equal(await input.inputValue(), '한');
    await input.evaluate((element, delayed) => {
      element.value = '한국';
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '국' }));
      if (!delayed) element.dispatchEvent(new InputEvent('input', { bubbles: true, data: '국' }));
    }, delayed);
    if (delayed) {
      await settle(page);
      // Dispatch the final input in a separate task. Its value belongs to the IME commit,
      // even if an intervening render attempted to project the previous State back.
      await input.evaluate(element => {
        element.value = '한국';
        element.dispatchEvent(new InputEvent('input', { bubbles: true, data: '국' }));
      });
    }
    await settle(page);
    assert.deepEqual(await snapshot(page), { value: '한국', commits: ['한국'] });
    assert.equal(await input.inputValue(), '한국');
  });
}

for (const [name, inputOptions, draft, final, expected] of [
  ['maximum length', { maxlength: 2 }, '한', '한국어', { value: '한국', commits: ['한국'] }],
  ['numeric pattern', { pattern: '^[0-9]*$' }, '1', '1한', { value: '', commits: [] }],
  ['completion after composition', { maxlength: 2 }, '하나', '한국', { value: '한국', commits: ['한국'] }],
]) {
  test(`OTP IME respects the native ${name} rule`, async t => {
    const { page, input } = await setup(t, 'otp', inputOptions);
    await input.focus();
    await input.evaluate((element, value) => {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      element.value = value;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    }, draft);
    await settle(page);
    assert.deepEqual(await snapshot(page), { value: '', commits: [] });
    assert.deepEqual(await page.evaluate(() => completions), [], 'no completion while composing');
    await input.evaluate((element, value) => {
      element.value = value;
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    }, final);
    await settle(page);
    assert.deepEqual(await snapshot(page), expected, 'compositionend applies the rule to the final text');
    await input.evaluate((element, value) => {
      element.value = value;
      element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }, final);
    await settle(page);
    assert.deepEqual(await snapshot(page), expected, 'trailing native input adds no Action');
    assert.deepEqual(await page.evaluate(() => completions), inputOptions.maxlength ? ['한국'] : [], 'one completion after commit');
    if (inputOptions.maxlength) {
      await input.fill('');
      await settle(page);
      await input.fill('한국');
      await settle(page);
      assert.deepEqual(await page.evaluate(() => completions), ['한국', '한국'], 'a later edit can complete the same value again');
    }
  });
}
