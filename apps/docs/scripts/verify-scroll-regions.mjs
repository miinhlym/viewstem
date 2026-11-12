import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4321';
const out = process.env.REVIEW_DIR ?? '/tmp/viewstem-scroll-review';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({channel:'chrome'});
const checks = [], failures = [];
const viewport = '[data-slot="scroll-area-viewport"]';
try {
 for (const locale of ['ko','en']) for (const width of [375,768,1440]) for (const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme});
  const page=await context.newPage(); const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  const prefix=locale==='ko'?'/ko':'';
  for(const path of ['/','/examples/','/examples/first-view/','/playground/','/docs/quickstart/','/docs/ui/components/button/']) {
   try {
    await page.goto(origin+prefix+path);
    await page.waitForFunction(()=>!document.querySelector('astro-island[client="load"][ssr]'));
    if(path.includes('first-view')) await page.locator('[data-example-target] button').waitFor();
    if(path.includes('/components/')) await page.locator('[aria-labelledby="component-preview"][data-demo-ready="true"]').waitFor();
    const observation=await page.evaluate(()=>({
      width:document.documentElement.scrollWidth, client:document.documentElement.clientWidth,
      native:[...document.querySelectorAll('body *')].filter(e=>{
        const s=getComputedStyle(e);const r=e.getBoundingClientRect();
        return r.width>0&&r.height>0&&!e.closest('[data-viewstem-shadcn],.viewstem-shadcn-root')&&e.getAttribute('data-slot')!=='scroll-area-viewport'&&((e.scrollHeight>e.clientHeight+2&&/auto|scroll/.test(s.overflowY))||(e.scrollWidth>e.clientWidth+2&&/auto|scroll/.test(s.overflowX)));
      }).map(e=>({tag:e.tagName,cls:e.className,slot:e.getAttribute('data-slot')})),
      regions:document.querySelectorAll('[data-site-scroll]').length,
      headings:[...document.querySelectorAll('h1,h2')].slice(0,5).map(e=>({text:e.textContent,size:getComputedStyle(e).fontSize,weight:getComputedStyle(e).fontWeight})),
    }));
    assert.ok(observation.width<=observation.client+1,`Page overflow ${JSON.stringify(observation)}`);
    assert.deepEqual(observation.native,[],`Native internal scroller: ${JSON.stringify(observation.native)}`);
    assert.ok(observation.regions>0);
    if(locale==='ko'&&theme==='light'&&[375,1440].includes(width)) await page.screenshot({path:`${out}/${width}-${path.replaceAll('/','_')}.png`});
    checks.push({locale,width,theme,path,...observation});
    console.log('PASS',locale,width,theme,path);
   }catch(error){failures.push({locale,width,theme,path,error:String(error)});}
  }
  if(errors.length)failures.push({locale,width,theme,errors});
  await context.close();
 }
 // Real editor navigation, external scroll viewport, runtime update, and reset.
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 for(const prefix of ['/ko','']) {
  const ko=prefix==='/ko';
  await page.goto(origin+prefix+'/examples/first-view/');
  const edit=page.getByRole('textbox',{name:'view.json',exact:true});
  await edit.waitFor();await page.locator('[data-example-target] button').waitFor();
  const long=JSON.stringify({render:{id:'scroll-check',componentRef:'shadcn.Button',inputs:{text:'Scroll check'}}},null,2)+'\n'.repeat(100);
  await edit.fill(long);await edit.press('ControlOrMeta+End');
  await page.getByRole('button',{name:'Scroll check',exact:true}).waitFor();
  assert.ok(await page.locator(`.editor-scroll ${viewport}`).evaluate(e=>e.scrollTop)>300,'Editor caret must reveal itself in ScrollArea');
  await page.getByRole('button',{name:ko?'코드 초기화':'Reset code',exact:true}).click();
  await page.locator('[data-example-target] button').filter({hasText:ko?'안녕, Viewstem':'Hello, Viewstem'}).waitFor();
  await page.goto(origin+prefix+'/playground/');
  const editor=page.getByRole('textbox',{name:ko?'View 정의 (JSON)':'View definition (JSON)',exact:true});
  await editor.fill(long);await editor.press('ControlOrMeta+End');
  await editor.press('ControlOrMeta+Enter');
  await page.locator('.preview-target button').filter({hasText:'Scroll check'}).waitFor();
  assert.ok(await page.locator(`.editor-scroll ${viewport}`).evaluate(e=>e.scrollTop)>300);
  await editor.fill('{');await editor.press('ControlOrMeta+Enter');
  await page.locator('[data-slot="alert"]').waitFor();
  await editor.fill(long);await editor.press('ControlOrMeta+Enter');
  await page.locator('[data-slot="alert"]').waitFor({state:'detached'});
  checks.push({prefix,editor:'end-of-document caret + run + reset + invalid JSON recovery passed'});
 }
 await context.close();
} catch(error) {failures.push({interaction:String(error)});}
finally {await browser.close();}
await writeFile(`${out}/results.json`,JSON.stringify({origin,checks,failures},null,2));
console.log(JSON.stringify({checks:checks.length,failures},null,2));
if(failures.length)process.exitCode=1;
