import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const origin = process.env.DOCS_ORIGIN ?? 'http://localhost:4321';
const browser = await chromium.launch({ channel: 'chrome' });
const properties = ['font-family','font-size','font-weight','font-style','line-height','letter-spacing','word-spacing','font-feature-settings','font-variation-settings','font-kerning','font-optical-sizing','font-synthesis','-webkit-font-smoothing','text-rendering','text-size-adjust','text-autospace','word-break','overflow-wrap','color'];
const routes = ['/docs/quickstart/','/','/examples/','/examples/first-view/','/playground/','/docs/ui/components/button/'];
const checks = [], failures = [];
try {
 for (const locale of (process.env.TEST_LOCALES?.split(',') ?? ['ko','en'])) for (const width of (process.env.TEST_WIDTHS?.split(',').map(Number) ?? [375,768,1440])) for (const theme of (process.env.TEST_THEMES?.split(',') ?? ['light','dark'])) {
  const context = await browser.newContext({ viewport: {width,height:900}, colorScheme:theme });
  const page = await context.newPage(); const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  let baseline;
  for (const route of routes) {
   try {
    await page.goto(origin+(locale==='ko'?'/ko':'')+route);
    await page.waitForFunction(()=>!document.querySelector('astro-island[client="load"][ssr]'));
    const result=await page.evaluate(properties=>{
     const read=el=>Object.fromEntries(properties.map(p=>[p,getComputedStyle(el).getPropertyValue(p)]));
     const probe=document.createElement('div');
     probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none';
     probe.innerHTML='<p>한글 English → ∑ ✓</p><h1>Heading</h1><h2>Heading</h2><button>Button</button><input value="Text"><select><option>Option</option></select><textarea>Text</textarea><pre><code>view.json</code></pre><strong>Strong</strong><em>Emphasis</em>';
     document.body.append(probe);
     const primitives=Object.fromEntries([...probe.children].map(e=>[e.tagName,read(e)]));
     probe.remove();
     const toolbar=document.querySelector('.masthead');
     const button=document.querySelector('.masthead-tools button');
     return {html:read(document.documentElement),body:read(document.body),header:read(toolbar),button:read(button),primitives,
      theme:document.documentElement.dataset.theme,
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};
    },properties);
    assert.equal(result.theme,theme);
    assert.equal(result.overflow,false);
    assert.equal(result.body['-webkit-font-smoothing'],'antialiased');
    assert.equal(result.body['line-height'],'28px');
    assert.equal(result.body['word-break'],locale==='ko'?'keep-all':'normal');
    baseline ??= result;
    assert.deepEqual(result,baseline,`${locale}/${width}/${theme}${route}: defaults differ from documentation`);
    // Sheets render in body portals: compare the actual shared menu in every shell.
    if(width===375){
     await page.locator('.masthead-mobile button').click();
     const sheet=page.getByRole('dialog');await sheet.waitFor();
     const inherited=await sheet.locator('nav a > span').first().evaluate((el,props)=>Object.fromEntries(props.map(p=>[p,getComputedStyle(el).getPropertyValue(p)])),properties);
     assert.equal(inherited['-webkit-font-smoothing'],result.body['-webkit-font-smoothing']);
     assert.equal(inherited['font-family'],result.body['font-family']);
     assert.equal(inherited['word-break'],result.body['word-break']);
     assert.equal(inherited['line-height'],'22.4px');
     await page.keyboard.press('Escape');
    }
    if(route.includes('first-view')||route.includes('playground')){
     await page.locator('.cm-content').waitFor();
     const editor=await page.locator('.cm-scroller').first().evaluate(el=>({font:getComputedStyle(el).fontFamily,size:getComputedStyle(el).fontSize,line:getComputedStyle(el).lineHeight}));
     assert.ok(editor.font.startsWith('D2Coding'));assert.equal(editor.size,'14px');assert.equal(editor.line,'23.1px');
    }
    console.error('PASS',locale,width,theme,route);
    checks.push({locale,width,theme,route,body:result.body,sharedDefaults:true,portals:width===375});
   }catch(error){ failures.push({locale,width,theme,route,error:String(error),actual:error.actual,expected:error.expected}); }
  }
  if(errors.length)failures.push({locale,width,theme,errors});
  await context.close();
 }
}finally{await browser.close();}
const report={origin,checks,failures};
if(process.env.REPORT_PATH)await writeFile(process.env.REPORT_PATH,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(failures.length)process.exitCode=1;
