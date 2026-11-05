import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { svelteConsumerPlugin } from './fixtures/svelte-consumer-plugin.mjs';

let browser, javascript, css;
before(async () => {
  const bundle = await build({ stdin: { contents: `
    export { createRenderer } from '@viewstem/svelte';
    export { registerComponents } from '@viewstem/svelte-ui';
    import { button } from '@viewstem/svelte-ui/shadcn/button';
    import { input } from '@viewstem/svelte-ui/shadcn/input';
    import { field } from '@viewstem/svelte-ui/shadcn/field';
    import { dialog } from '@viewstem/svelte-ui/shadcn/dialog';
    import { calendar } from '@viewstem/svelte-ui/shadcn/calendar';
    export const sets = [button,input,field,dialog,calendar];
  `, resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false,
    platform: 'browser', format: 'iife', globalName: 'API', conditions: ['svelte','browser'], plugins: [svelteConsumerPlugin] });
  javascript = bundle.outputFiles[0].text;
  css = await readFile(new URL(import.meta.resolve('@viewstem/svelte-ui/shadcn/styles.css')), 'utf8');
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); });
async function setup(t, view) {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://ui.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><button id="host">Host</button><div id="app"></div></body></html>' }));
  await page.goto('http://ui.test/');
  await page.addScriptTag({ content: javascript });
  await page.addStyleTag({ content: css });
  await page.evaluate(async view => {
    window.diagnostics = [];
    window.renderer = API.createRenderer({ onError: entry => diagnostics.push(entry) });
    API.registerComponents(renderer, API.sets);
    window.commits = 0;
    renderer.registry.registerAction({kind:'Action',id:'tracked',spec:{ports:{target:{kind:'State',schema:true},next:{kind:'Value',schema:true}}}},({inputs})=>{ commits++; inputs.target.write(inputs.next); });
    try { window.mounted = await renderer.mount({ target: document.querySelector('#app'), view }); } catch (error) { throw new Error(JSON.stringify(error)); }
    await mounted.initialComplete;
  }, view);
  t.after(async () => {
    try {
      await page.evaluate(async () => { await renderer.dispose(); });
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
  return page;
}
const path = value => ({ '@path': value });
const state = initial => ({ kind: 'State', schema: true, initial });
const node = (id, name, inputs = {}, rest = {}) => ({ id, componentRef: 'shadcn.' + name, inputs, ...rest });
const set = (name, next = path('/event/value'), event = 'input') => ({ [event]: {
  id: 'write-' + name, action: { ports: { target: { kind: 'State', schema: true }, next: { kind: 'Value', schema: true } }, steps: [{ kind: 'SetState', target: path('/ports/target'), value: path('/ports/next') }] },
  inputs: { target: path('/states/' + name), next },
} });
const group = children => node('group','Field.Group',{}, { slots: { default: children } });

test('IME draft survives unrelated projection and commits once; update, replace and disposal preserve lifetimes', async t => {
  const view = { states: { value: state('initial'), count: state(0) }, render: group([
    node('input','Input',{ id: 'editor', value: path('/states/value'), 'aria-valuenow': path('/states/count') },{ on: { input: { id:'tracked-input', actionRef:'tracked', inputs:{target:path('/states/value'),next:path('/event/value')} } } }),
    node('button','Button',{ text:'Increment' },{ on: set('count',1,'click') }),
  ]) };
  const page = await setup(t, view);
  await page.locator('#editor').focus();
  await page.locator('#editor').evaluate(element => {
    element.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    element.value='한'; element.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
  });
  assert.equal(await page.evaluate(() => mounted.view.getState('value').getSnapshot().value),'initial');
  await page.evaluate(async () => { renderer.runtime.stateStore; mounted.view.getState('count').write(1); await mounted.whenRendered(); });
  assert.equal(await page.locator('#editor').inputValue(),'한');
  await page.locator('#editor').evaluate(element => {
    element.value='한국어'; element.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'어'}));
    element.dispatchEvent(new InputEvent('input',{bubbles:true,data:'어'}));
  });
  await page.waitForFunction(() => mounted.view.getState('value').getSnapshot().value === '한국어');
  assert.equal(await page.locator('#editor').inputValue(),'한국어');
  assert.equal(await page.evaluate(()=>commits),1);
  assert.deepEqual(await page.evaluate(() => diagnostics),[]);
  await page.evaluate(async () => { await mounted.dispose(); });
  assert.equal(await page.locator('#editor').count(),0);
});

test('when, repeat and State writes update existing inputs; replaced callbacks cannot mutate the new lifetime', async t => {
  const view = { states: { shown: state(true), items: state([{id:'a',value:'A'},{id:'b',value:'B'}]) }, render: group([
    node('item','Input',{ value:path('/repeat/item/value'), 'aria-label':path('/repeat/item/id') }, { when:path('/states/shown'), repeat:{items:path('/states/items'),as:'item',key:path('/repeat/item/id')} }),
  ]) };
  const page = await setup(t,view);
  assert.deepEqual(await page.locator('#app input').evaluateAll(items => items.map(item=>item.value)),['A','B']);
  await page.evaluate(async () => { mounted.view.getState('items').write([{id:'b',value:'B2'},{id:'a',value:'A2'}]); await mounted.whenRendered(); });
  assert.deepEqual(await page.locator('#app input').evaluateAll(items => items.map(item=>item.value)),['B2','A2']);
  await page.evaluate(async () => { mounted.view.getState('shown').write(false); await mounted.whenRendered(); });
  assert.equal(await page.locator('#app input').count(),0);
  await page.evaluate(async () => { mounted.view.getState('shown').write(true); await mounted.whenRendered(); });
  assert.equal(await page.locator('#app input').count(),2);
  const result = await page.evaluate(async () => {
    const stale = mounted.view.getState('shown');
    await (await mounted.replace({view:{render:{id:'b',componentRef:'shadcn.Button',inputs:{text:'Replaced'}}}})).initialComplete;
    try { stale.write(false); return 'unexpected'; } catch(error) { return error.code; }
  });
  assert.equal(result,'REFERENCE_NOT_FOUND');
  assert.equal(await page.getByRole('button',{name:'Replaced'}).count(),1);
  assert.deepEqual(await page.evaluate(() => diagnostics),[]);
});

test('child slot preserves native trigger events, focus return and portal theme without a host CSS reset', async t => {
  const view = { states:{open:state(false)}, render: node('dialog','Dialog.Root',{open:path('/states/open')}, {on:set('open',path('/event/value'),'openChange'),slots:{default:[
    node('trigger','Dialog.Trigger',{}, {slots:{child:[node('button','Button',{text:'Open',size:'xs'})]}}),
    node('content','Dialog.Content',{}, {slots:{default:[node('title','Dialog.Title',{text:'Title'}),node('description','Dialog.Description',{text:'Description'}),node('close','Dialog.Close',{text:'Close'})]}}),
  ]}}) };
  const page = await setup(t,view);
  assert.equal(await page.locator('#host').evaluate(element=>getComputedStyle(element).fontSize),'13.3333px');
  assert.equal(await page.getByRole('button',{name:'Open'}).evaluate(element=>getComputedStyle(element).height),'24px');
  assert.equal(await page.locator('button button').count(),0);
  await page.getByRole('button',{name:'Open'}).click();
  const modal=page.getByRole('dialog'); await modal.waitFor();
  const light=await modal.evaluate(element=>getComputedStyle(element).backgroundColor);
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  const dark=await modal.evaluate(element=>getComputedStyle(element).backgroundColor);
  assert.notEqual(light,dark);
  await page.keyboard.press('Escape');
  await modal.waitFor({state:'hidden'});
  await page.waitForFunction(()=>getComputedStyle(document.body).pointerEvents !== 'none');
  assert.equal(await page.evaluate(()=>mounted.view.getState('open').read()),false);
  assert.equal(await page.getByRole('button',{name:'Open'}).evaluate(element=>element===document.activeElement),true);
  assert.deepEqual(await page.evaluate(()=>diagnostics),[]);
});

test('invalid union mode and executable URL become renderer diagnostics; corrected input recovers', async t => {
  const view={states:{url:state('java\nscript:alert(1)')},render:node('button','Button',{href:path('/states/url'),text:'Link'})};
  // A mount failure is intentional; exercise the borrowed view attachment to inspect diagnostics.
  const page=await setup(t,{render:node('base','Button',{text:'Base'})});
  const result=await page.evaluate(async view=>{
    try { await (await mounted.replace({view})).initialComplete; return null; } catch(error) { return error.code; }
  },view);
  assert.equal(result,'INTERNAL_ERROR');
  assert.equal(await page.locator('a[href^="javascript"]').count(),0);
  await page.evaluate(async()=>{mounted.view.getState('url').write('/safe'); await mounted.whenRendered();});
  await page.getByRole('link',{name:'Link'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Link'}).getAttribute('href'),'/safe');
});

test('native Calendar date values round trip and external null clears the selection', async t => {
  const page=await setup(t,{states:{date:state('2026-11-03')},render:node('calendar','Calendar.Root',{
    type:'single',value:path('/states/date'),placeholder:'2026-11-03',locale:'en-US',minValue:'2026-11-03',maxValue:'2026-11-29',
  },{on:set('date',path('/event/value'),'valueChange')})});
  await page.getByRole('button',{name:/Tuesday, November 10, 2026/}).click();
  await page.waitForFunction(()=>mounted.view.getState('date').read()==='2026-11-10');
  await page.evaluate(async()=>{mounted.view.getState('date').write(null);await mounted.whenRendered();});
  assert.equal(await page.locator('#app [data-selected]').count(),0);
  assert.deepEqual(await page.evaluate(()=>diagnostics),[]);
});

test('missing inputs defer native mount and invalid inputs disable the retained control until recovery', async t => {
  const view={states:{mode:{kind:'State',schema:true},disabled:state(false),count:state(0)},render:group([
    node('calendar','Calendar.Root',{type:path('/states/mode'),value:'2026-11-03'}),
    node('button','Button',{disabled:path('/states/disabled'),text:'Ready'},{on:set('count',1,'click')}),
  ])};
  const page=await setup(t,view);
  assert.equal(await page.getByRole('grid').count(),0);
  await page.evaluate(async()=>{mounted.view.getState('mode').write('single');await mounted.whenRendered();});
  assert.equal(await page.getByRole('grid').count(),1);
  await page.getByRole('button',{name:'Ready'}).waitFor();
  await page.evaluate(async()=>{mounted.view.getState('disabled').write('invalid');await mounted.whenRendered();});
  assert.equal(await page.getByRole('button',{name:'Ready'}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>mounted.view.getState('count').read()),0);
  await page.evaluate(async()=>{mounted.view.getState('disabled').write(false);await mounted.whenRendered();});
  await page.getByRole('button',{name:'Ready'}).click();
  await page.waitForFunction(()=>mounted.view.getState('count').read()===1);
});
