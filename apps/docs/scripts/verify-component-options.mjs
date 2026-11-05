import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { getComponentDemo } from '../src/examples/component-demos.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  const file = resolve(dist, '.' + pathname, ...(pathname.endsWith('/') ? ['index.html'] : []));
  if (!file.startsWith(dist.endsWith(sep) ? dist : dist + sep)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    if (url.searchParams.has('slow-html')) {
      const end = body.indexOf('</astro-island>') + '</astro-island>'.length;
      response.write(body.subarray(0, end));
      await new Promise(resolve => setTimeout(resolve, 1500));
      response.end(body.subarray(end));
    } else response.end(body);
  }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
import { getDemoControls, controlFamilies } from '../src/examples/component-demo-controls.mjs';
const browser = await chromium.launch();
const checks = [], failures = [];
let clipboardQueue = Promise.resolve();
const panelSelectors = { preview: '.workbench-preview', options: '[data-demo-options-host]', json: '.workbench-json' };
const tab = (page, name) => page.locator(`[data-demo-tab="${name}"]`);
const panel = (page, name) => page.locator(panelSelectors[name]);
async function selectPanel(page, name) {
  const trigger = tab(page, name);
  if (await trigger.isVisible() && await trigger.getAttribute('aria-selected') !== 'true') await trigger.click();
  await panel(page, name).waitFor({state:'visible'});
}
async function openOptionDetails(page, id) {
  await selectPanel(page, 'options');
  const trigger = page.locator(`[data-option-details="${id}"]`);
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
}
async function verifyClipboard(page) {
  const check = clipboardQueue.then(async () => {
    await page.locator('[data-demo-copy]').click();
    await page.waitForFunction(() => /JSON copied|JSON을 복사/.test(document.querySelector('[data-copy-status]').textContent));
    assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), await json(page));
  });
  clipboardQueue = check.catch(() => {});
  await check;
}
const getAt = (object, path) => path.reduce((item, key) => item?.[key], object);
async function ready(page) {
  await page.waitForFunction(() => {
    const demo = document.querySelector('[data-component-demo]');
    return demo?.hasAttribute('data-demo-error') || (demo?.hasAttribute('data-demo-ready') && demo.dataset.demoVersion === demo.dataset.demoAppliedVersion);
  });
  assert.equal(await page.locator('[data-component-demo]').getAttribute('data-demo-error'), null);
}
async function json(page) {
  const embedded = JSON.parse(await page.locator('[data-demo-view]').textContent());
  assert.deepEqual(JSON.parse(await page.locator('.source-code code').textContent()), embedded);
  return embedded;
}
async function assertColor(locator, property, expected, message) {
  const [actual, target] = await locator.evaluate((element, { property, expected }) => {
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(element).getPropertyValue(property).trim();
    const actual = probe.style.color;
    probe.style.color = expected;
    return [actual, probe.style.color];
  }, { property, expected });
  assert.equal(actual, target, message);
}
async function assertOnlyPanel(page, active) {
  for (const name of Object.keys(panelSelectors)) {
    assert.equal(await panel(page, name).isVisible(), name === active, `Mobile ${name} panel visibility with ${active} selected`);
  }
}
try {
  const queue = process.env.OPTIONS_FLOWS_ONLY ? [] : ['en','ko'].flatMap(locale => ['light','dark'].flatMap(theme => [320,1440].flatMap(width => controlFamilies.map(family => ({locale,theme,width,family})))));
  await Promise.all(Array.from({length:4}, async () => {
    for (let task; (task = queue.shift());) {
      const {locale,theme,width,family} = task;
      const context = await browser.newContext({viewport:{width,height:1000},colorScheme:theme, permissions:['clipboard-read','clipboard-write']});
      const page = await context.newPage(); const errors=[];
      page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(origin + `${locale==='ko'?'/ko':''}/docs/svelte-ui/components/${family}/`); await ready(page);
        const base = getComponentDemo(family,locale).view;
        assert.deepEqual(await json(page),base);
        const controls = getDemoControls(family,locale,base);
        const values = {};
        await selectPanel(page, 'preview');
        if (family === 'button') assert.ok(await page.locator('[data-demo-target] button').first().evaluate(el=>el.getBoundingClientRect().width<el.parentElement.getBoundingClientRect().width/2),'Button keeps intrinsic width');
        const initialButton = family === 'button' ? await page.locator('[data-demo-target] button').first().evaluate(el=>({height:el.getBoundingClientRect().height,bg:getComputedStyle(el).backgroundColor})) : null;
        await selectPanel(page, 'options');
        for (const booleanControl of controls.filter(c => c.kind === 'boolean')) {
          const size = await page.locator(`[data-control="${booleanControl.id}"]`).evaluate(el => ({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
          assert.deepEqual(size,{width:16,height:16},'Original Checkbox dimensions');
        }
        for (const control of controls) {
          const input = page.locator(`[data-control="${control.id}"]`);
          assert.equal(await page.locator(control.reference).count(),1,control.reference);
          // Exercise every exposed preset, not just the first alternate value.
          if (control.kind === 'select') {
            for (const option of control.options) {
              await input.selectOption(option.value);
              await ready(page);
              assert.equal(getAt(await json(page), control.path), option.value);
            }
          }
          const value = control.kind === 'boolean' ? !control.value : control.kind === 'select' ? control.options.find(o=>o.value!==control.value).value
            : control.kind === 'number' ? 70 : (locale==='ko'?'설정 한글 🙂':'Settings Ω 🙂') + ' </script><b> & "';
          await input.focus();
          if (control.kind === 'boolean') await input.setChecked(value);
          else if (control.kind === 'select') await input.selectOption(value);
          else await input.fill(String(value));
          await ready(page);
          values[control.id]=value;
          assert.equal(getAt(await json(page),control.path),value);
          assert.equal(await input.evaluate(el=>document.activeElement===el),true,'Option focus');
          assert.equal(await page.locator('.json-changed').count(),1);
        }
        await selectPanel(page, 'preview');
        const preview = page.locator('[data-demo-target]');
        if (family==='button') {
          assert.equal(await preview.getByRole('button').first().textContent(),values.text);
          assert.equal(await preview.getByRole('button').first().isDisabled(),true);
          const buttonStyle = await preview.getByRole('button').first().evaluate(el=>({height:el.getBoundingClientRect().height,bg:getComputedStyle(el).backgroundColor}));
          assert.notEqual(buttonStyle.height,initialButton.height,'Button size changes');
          assert.notEqual(buttonStyle.bg,initialButton.bg,'Button variant changes');
        }
        if (family==='input') {
          assert.equal(await preview.locator('input').inputValue(),values.initial);
          assert.equal(await preview.locator('input').getAttribute('placeholder'),values.placeholder);
          assert.equal(await preview.locator('input').isDisabled(),true);
        }
        if (family==='checkbox' || family==='switch') {
          assert.equal(await preview.getByRole(family).getAttribute('aria-checked'),String(values.initial));
          assert.equal(await preview.getByRole(family).isDisabled(),true);
        }
        if (family==='slider') assert.equal(await preview.getByRole('slider').getAttribute('aria-valuenow'),'70');
        if (family==='tabs') assert.equal(await preview.getByRole('tab',{selected:true}).textContent(),locale==='ko'?'활동':'Activity');
        if (family==='dialog') {
          await preview.getByRole('button').click();
          assert.equal(await page.getByRole('dialog').getByRole('heading').textContent(),values.text);
          await assertColor(page.getByRole('dialog'), '--primary', theme === 'dark' ? 'oklch(0.922 0 0)' : 'oklch(0.205 0 0)', 'Portal keeps Neutral theme');
          assert.ok((await page.getByRole('dialog').textContent()).includes(values.description));
          await page.keyboard.press('Escape');
        }
        if (family==='sonner') {
          await preview.getByRole('button').click();
          await page.locator('[data-sonner-toast]').waitFor();
          assert.equal(await page.locator('[data-sonner-toaster]').getAttribute('data-x-position'),'left');
          assert.equal(await page.locator('[data-sonner-toast] [data-close-button]').count(),0);
        }
        await selectPanel(page, 'json');
        await verifyClipboard(page);
        await assertColor(page.locator('.source-code pre'), 'background-color', theme === 'dark' ? 'oklch(0.205 0 0)' : 'oklch(1 0 0)', 'Live JSON matches site theme');
        const edited=await json(page);
        await selectPanel(page, 'preview');
        await page.locator('[data-demo-reset]').click(); await ready(page);
        assert.deepEqual(await json(page),edited);
        if(family==='sonner') await page.locator('[data-sonner-toast]').waitFor({state:'detached',timeout:3000});
        await selectPanel(page, 'options');
        await page.locator('[data-demo-restore]').click(); await ready(page);
        assert.deepEqual(await json(page),base);
        for(const control of controls) {
          const input=page.locator(`[data-control="${control.id}"]`);
          assert.equal(control.kind==='boolean'?await input.isChecked():await input.inputValue(),control.kind==='boolean'?control.value:String(control.value));
        }
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
        assert.equal(overflow,false);
        assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
        await assertColor(page.locator('.masthead-links [aria-current="page"]'), '--viewstem-primary', theme === 'dark' ? 'oklch(0.922 0 0)' : 'oklch(0.205 0 0)', 'Site header uses shadcn Neutral');
        const native = await page.locator('[data-control]').evaluateAll(elements => elements.every(el => ['input','checkbox','native-select'].includes(el.getAttribute('data-slot')) && !el.hasAttribute('data-viewstem-shadcn')));
        assert.equal(native,true,'Site options use directly installed shadcn-svelte, separate from the library preview');
        await selectPanel(page, 'preview');
        await assertColor(preview.locator('[data-viewstem-shadcn]').first(), '--primary', theme === 'dark' ? 'oklch(0.922 0 0)' : 'oklch(0.205 0 0)', 'Neutral primary palette');
        assert.deepEqual(errors,[]);
        checks.push({...task,controls:controls.length});
      } catch(error) { failures.push({...task,error:error.message}); console.error(JSON.stringify({...task,error:error.message})); }
      finally {await context.close();}
    }
  }));
  const context=await browser.newContext({viewport:{width:1280,height:1000},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();
  for(const locale of ['en','ko']) {
    const prefix=locale==='ko'?'/ko':'';
    await page.goto(origin+prefix+'/docs/svelte-ui/components/input/'); await ready(page);
    const original=await json(page), control=page.locator('[data-control="initial"]'), preview=page.locator('[data-demo-target] input');
    await selectPanel(page, 'options');
    await control.dispatchEvent('compositionstart'); await control.fill('한');
    assert.deepEqual(await json(page),original,'No JSON edits during IME composition');
    await control.fill('한글 Ω 🙂'); await control.dispatchEvent('compositionend'); await ready(page);
    await selectPanel(page, 'preview');
    assert.equal(await preview.inputValue(),'한글 Ω 🙂');
    await preview.fill('runtime edit');
    await page.locator('[data-demo-reset]').click(); await ready(page);
    assert.equal(await preview.inputValue(),'한글 Ω 🙂');
    assert.deepEqual((await json(page)).render,original.render,'Bindings remain intact');
    await selectPanel(page, 'options');
    await page.locator('[data-control="placeholder"]').fill('first');
    await page.locator('[data-control="placeholder"]').fill('second');
    await page.locator('[data-control="placeholder"]').fill('latest'); await ready(page);
    await selectPanel(page, 'preview');
    assert.equal(await preview.getAttribute('placeholder'),'latest');
    await selectPanel(page, 'options');
    await page.locator('[data-demo-restore]').click(); await ready(page);
    assert.deepEqual(await json(page),original);
    await openOptionDetails(page, 'placeholder');
    const reference=page.locator('#demo-option-placeholder a'); await reference.click();
    assert.equal(new URL(page.url()).hash,'#shadcn-input-input-placeholder');
    await page.locator('[data-demo-option-link][href="#demo-option-placeholder"]').click();
    assert.equal(await page.locator('[data-control="placeholder"]').evaluate(el=>document.activeElement===el),true);
    await openOptionDetails(page, 'initial');
    await page.locator('[data-show-json="initial"]').click();
    await panel(page, 'json').waitFor({state:'visible'});
    assert.equal(await page.locator('.source-scroll [data-slot="scroll-area-viewport"]').evaluate(el=>document.activeElement===el),true);
    await page.goto(origin+prefix+'/docs/svelte-ui/components/slider/');await ready(page);
    await selectPanel(page, 'options');
    const beforeInvalid=await json(page);await page.locator('[data-control="initial"]').fill('101');
    assert.equal(await page.locator('[data-control="initial"]').getAttribute('aria-invalid'),'true');assert.deepEqual(await json(page),beforeInvalid);
    await page.locator('[data-demo-restore]').click();await ready(page);
    assert.equal(await page.locator('[data-control="initial"]').getAttribute('aria-invalid'),null);
    checks.push({locale,flows:'IME, runtime reset, binding preservation, rapid edits, reference round trip, JSON focus, numeric validation'});
  }
  const streamingErrors=[]; page.on('pageerror', error=>streamingErrors.push(error.message));
  await page.goto(origin+'/docs/svelte-ui/components/button/?slow-html=1'); await ready(page);
  assert.deepEqual(streamingErrors,[],'Hydration waits for complete document HTML');
  await page.goto(origin+'/docs/svelte-ui/components/button/#demo-option-disabled'); await ready(page);
  await panel(page, 'options').waitFor({state:'visible'});
  const anchorBounds=await page.locator('#demo-option-disabled').boundingBox();
  assert.ok(anchorBounds.y>=0 && anchorBounds.y<1000,'Direct option deep link works with SSR');
  await page.goto(origin+'/ko/docs/svelte-ui/components/button/');await ready(page);
  await openOptionDetails(page, 'variant');
  await page.locator('[data-show-json="variant"]').click();assert.match(await page.locator('[data-copy-status]').textContent(),/생략/);
  await selectPanel(page, 'options');
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-control="variant"]').selectOption('outline');await ready(page);
  await selectPanel(page, 'json');
  assert.equal(await page.locator('.json-changed').evaluate(el=>getComputedStyle(el).animationName),'none');
  await selectPanel(page, 'options');
  await panel(page, 'options').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/Users/minholim/.codex/visualizations/2026/11/05/01a1a983-cc4a-7371-ac17-06e4546dad6f/component-options-light.png',fullPage:false});
  await page.setViewportSize({width:375,height:1000});await page.emulateMedia({colorScheme:'dark'});
  await selectPanel(page, 'options');
  await page.screenshot({path:'/Users/minholim/.codex/visualizations/2026/11/05/01a1a983-cc4a-7371-ac17-06e4546dad6f/component-options-mobile-dark.png',fullPage:false});
  await page.goto(origin+'/ko/docs/svelte-ui/components/tabs/'); await ready(page);
  await selectPanel(page, 'preview');
  await page.locator('[data-demo-target]').getByRole('tab',{name:'활동',exact:true}).click();
  assert.equal((await json(page)).states.tab.initial,'summary');
  await page.locator('[data-demo-reset]').click(); await ready(page);
  assert.equal(await page.locator('[data-demo-target]').getByRole('tab',{selected:true}).textContent(),'요약');
  const delayContext=await browser.newContext(); const delayed=await delayContext.newPage();
  let release; const gate=new Promise(resolve=>{release=resolve;}); let intercepted;
  const started=new Promise(resolve=>{intercepted=resolve;});
  await delayed.route('**/*component-demo-runtime*',async route=>{intercepted();await gate;await route.continue();});
  await delayed.goto(origin+'/docs/svelte-ui/components/button/'); await started;
  await selectPanel(delayed, 'options');
  await delayed.locator('[data-control="text"]').fill('First while loading');
  await delayed.locator('[data-control="text"]').fill('Latest while loading');
  release(); await ready(delayed);
  await selectPanel(delayed, 'preview');
  assert.equal(await delayed.locator('[data-demo-target] button').first().textContent(),'Latest while loading');
  await delayed.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  await delayed.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))); await ready(delayed);
  assert.equal(await delayed.locator('[data-demo-target] button').count(),2);
  assert.equal(await delayed.locator('[data-demo-target] button').first().textContent(),'Latest while loading');
  await delayContext.close();
  const failureContext=await browser.newContext(); const failurePage=await failureContext.newPage();
  await failurePage.route('**/*component-demo-runtime*',route=>route.abort());
  await failurePage.goto(origin+'/docs/svelte-ui/components/button/');await failurePage.locator('[data-demo-error]').waitFor();
  assert.equal(await failurePage.locator('[data-demo-target]').textContent(),'');
  await failurePage.unroute('**/*component-demo-runtime*');await failurePage.reload();await ready(failurePage);
  await failureContext.close();
  checks.push({flows:'streamed HTML hydration, SSR option deep link, omitted defaults, reduced motion, Tabs runtime reset, delayed import with latest edits, page lifecycle signals, failed module load and reload recovery'});
  await context.close();

  const workbenchPage = await browser.newPage({viewport:{width:375,height:1000}});
  await workbenchPage.goto(origin+'/docs/svelte-ui/components/input/');
  await ready(workbenchPage);
  await assertOnlyPanel(workbenchPage, 'preview');
  const inputPreview = workbenchPage.locator('[data-demo-target] input');
  const originalDefinition = await json(workbenchPage);
  const inputElement = await inputPreview.elementHandle();
  await inputPreview.fill('Runtime value survives tab changes');
  await selectPanel(workbenchPage, 'options');
  await assertOnlyPanel(workbenchPage, 'options');
  assert.equal(await workbenchPage.locator('[data-option-details="initial"]').getAttribute('aria-expanded'), 'false');
  assert.equal(await workbenchPage.locator('[data-show-json="initial"]').isVisible(), false);
  await selectPanel(workbenchPage, 'json');
  await assertOnlyPanel(workbenchPage, 'json');
  assert.deepEqual(await json(workbenchPage), originalDefinition, 'Runtime input does not change the definition');
  await selectPanel(workbenchPage, 'preview');
  assert.equal(await inputPreview.inputValue(), 'Runtime value survives tab changes');
  assert.equal(await inputPreview.evaluate((current, previous) => current === previous, inputElement), true, 'Tab switches keep the Svelte preview input mounted');
  await inputElement.dispose();

  await tab(workbenchPage, 'preview').focus();
  for (const [key, expected] of [['ArrowRight', 'options'], ['End', 'json'], ['Home', 'preview']]) {
    await workbenchPage.keyboard.press(key);
    await workbenchPage.waitForFunction(name => {
      const trigger = document.querySelector(`[data-demo-tab="${name}"]`);
      return trigger === document.activeElement && trigger.getAttribute('aria-selected') === 'true';
    }, expected);
    await assertOnlyPanel(workbenchPage, expected);
  }

  await workbenchPage.goto(origin+'/docs/svelte-ui/components/button/#component-json');
  await ready(workbenchPage);
  await panel(workbenchPage, 'json').waitFor({state:'visible'});
  assert.equal(await tab(workbenchPage, 'json').getAttribute('aria-selected'), 'true');
  await workbenchPage.waitForFunction(() => document.activeElement === document.querySelector('.source-scroll [data-slot="scroll-area-viewport"]'));
  await assertOnlyPanel(workbenchPage, 'json');
  await workbenchPage.goto(origin+'/ko/docs/svelte-ui/components/slider/#demo-option-initial');
  await ready(workbenchPage);
  await panel(workbenchPage, 'options').waitFor({state:'visible'});
  assert.equal(await tab(workbenchPage, 'options').getAttribute('aria-selected'), 'true');
  await assertOnlyPanel(workbenchPage, 'options');
  await workbenchPage.waitForFunction(() => document.activeElement === document.querySelector('[data-control=initial]'));
  await workbenchPage.waitForFunction(() => {
    const field = document.querySelector('#demo-option-initial')?.getBoundingClientRect();
    return field && field.top >= 0 && field.bottom <= window.innerHeight;
  });

  await workbenchPage.setViewportSize({width:1600,height:1000});
  await workbenchPage.goto(origin+'/docs/svelte-ui/components/input/');
  await ready(workbenchPage);
  assert.equal(await tab(workbenchPage, 'options').isVisible(), false, 'Wide workbench exposes an option rail');
  const widePreview = await panel(workbenchPage, 'preview').boundingBox();
  const wideOptions = await panel(workbenchPage, 'options').boundingBox();
  assert.ok(widePreview && wideOptions && widePreview.x + widePreview.width <= wideOptions.x && widePreview.y === wideOptions.y,
    'Wide options and preview share one row');
  await selectPanel(workbenchPage, 'json');
  assert.equal(await panel(workbenchPage, 'options').isVisible(), true, 'The option rail stays visible alongside JSON');
  await workbenchPage.locator('[data-control="initial"]').focus();
  await workbenchPage.setViewportSize({width:375,height:1000});
  await panel(workbenchPage, 'options').waitFor({state:'visible'});
  assert.equal(await workbenchPage.locator('[data-control="initial"]').evaluate(el => el === document.activeElement), true, 'Narrowing keeps the focused option visible');
  await tab(workbenchPage, 'options').focus();
  await workbenchPage.setViewportSize({width:1600,height:1000});
  await workbenchPage.waitForFunction(() => document.activeElement === document.querySelector('[data-demo-tab="preview"]'));
  await workbenchPage.setViewportSize({width:1440,height:1000});
  await workbenchPage.evaluate(() => document.documentElement.style.fontSize = '20px');
  await tab(workbenchPage, 'options').waitFor({state:'visible'});
  await selectPanel(workbenchPage, 'options');
  assert.equal(await panel(workbenchPage, 'options').getAttribute('role'), 'tabpanel', 'Enlarged root text keeps CSS and ARIA panel modes aligned');
  await workbenchPage.close();
  checks.push({flows:'mobile tab isolation, Svelte preview input identity and runtime state, keyboard ArrowRight/Home/End, mobile JSON and option direct links and focus, wide options rail, responsive focus preservation, enlarged root text'});

  const noScriptPage = await browser.newPage({javaScriptEnabled:false,viewport:{width:375,height:1000}});
  await noScriptPage.goto(origin+'/docs/svelte-ui/components/button/');
  await noScriptPage.locator('.source-code').waitFor({state:'visible'});
  assert.deepEqual(await json(noScriptPage), getComponentDemo('button', 'en').view);
  await noScriptPage.locator('.setup-code summary').click();
  const setupCode = noScriptPage.locator('.setup-code code');
  await setupCode.waitFor({state:'visible'});
  assert.match(await setupCode.textContent(), /createRenderer/);
  await noScriptPage.close();
  checks.push({flows:'visible JSON and expandable setup snippet with JavaScript disabled'});
} catch(error) { failures.push({flow:'additional flows',error:error.stack}); } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify({checks,failures},null,2));if(failures.length) process.exitCode=1;
