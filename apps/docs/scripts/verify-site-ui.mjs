import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

// Run against a completed static build (including its Pagefind index).
const origin = process.env.SITE_UI_ORIGIN ?? 'http://127.0.0.1:4323';
const screenshotDir = process.env.SITE_UI_SCREENSHOTS;
if (screenshotDir) await fs.mkdir(screenshotDir, { recursive: true });
const checks = [], failures = [];
const browser = await chromium.launch();
const pages = { home: '/', docs: '/docs/svelte-ui/components/button/', examples: '/examples/', lesson: '/examples/value-call/', playground: '/playground/' };
try {
  const queue = ['en', 'ko'].flatMap(locale => ['light','dark'].flatMap(theme => [320,1440].flatMap(width => Object.entries(pages).map(([name,path]) => ({locale,theme,width,name,path})))));
  await Promise.all(Array.from({length:2},async()=>{
    for(let task;(task=queue.shift());){
      const {locale,theme,width,name,path}=task;
      const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme,reducedMotion:'reduce'});
      const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
      try{
        await page.goto(origin+(locale==='ko'?'/ko':'')+path);
        const themeTrigger=page.getByRole('button',{name:locale==='ko'?'색상 테마':'Color theme',exact:true});
        await themeTrigger.waitFor();await page.waitForFunction(()=>!document.querySelector('.masthead-tools button')?.disabled);
        if(name==='docs')await page.locator('[data-demo-ready]').waitFor();
        if(name==='lesson')await page.locator('[data-example-target] [data-viewstem-shadcn]').first().waitFor();
        if(name==='playground')await page.locator('.cm-editor').waitFor();
        await page.evaluate(()=>document.fonts.ready);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page has horizontal overflow');
        assert.equal(await page.locator('.masthead [data-viewstem-shadcn]').count(),0,'site header must not use svelte-ui');
        assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
        assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('dark')),theme==='dark');
        if(name==='docs'&&width===1440){
          assert.equal(await page.evaluate(()=>document.querySelector('.main-pane').getBoundingClientRect().left>=document.querySelector('#starlight__sidebar').getBoundingClientRect().right),true,'sidebar overlaps document');
        }
        await themeTrigger.click();
        await page.getByRole('menuitemradio',{name:theme==='dark'?(locale==='ko'?'밝게':'Light'):(locale==='ko'?'어둡게':'Dark'),exact:true}).click();
        assert.equal(await page.locator('html').getAttribute('data-theme'),theme==='dark'?'light':'dark');
        await themeTrigger.click();await page.getByRole('menuitemradio',{name:locale==='ko'?'시스템 설정':'System',exact:true}).click();
        assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
        if(width===320){
          const primary=page.locator('.masthead-mobile button');await primary.click();
          const sheet=page.getByRole('dialog',{name:'Viewstem',exact:true});await sheet.waitFor();
          assert.equal(await sheet.locator('nav a').count(),3);
          await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
          await page.waitForFunction(el => el === document.activeElement, await primary.elementHandle());
        }
        if(name==='lesson'){
          const files=page.locator('[data-example-file]');
          if(await files.count()>1){
            await files.nth(1).click();assert.equal(await files.nth(1).getAttribute('data-state'),'active');
            const key=await files.nth(1).getAttribute('data-example-file');assert.equal(await page.locator(`[data-source-key="${key}"]`).isVisible(),true);
            await files.nth(1).press('ArrowLeft');await page.waitForFunction(() => document.querySelector('[data-example-file]')?.getAttribute('data-state') === 'active');
          }
          await page.locator('[data-example-reset]').click();
        }
        if(screenshotDir&&locale==='ko'&&((width===1440&&theme==='light')||(width===320&&theme==='dark')))await page.screenshot({path:`${screenshotDir}/${name}-${width}-${theme}.png`});
        assert.deepEqual(errors,[]);checks.push(task);
      }catch(error){failures.push({...task,error:String(error)});}finally{await context.close();}
    }
  }));
}finally{await browser.close();}
console.log(JSON.stringify({expected:40,checked:checks.length,checks,failures},null,2));
if(checks.length!==40||failures.length)process.exitCode=1;
