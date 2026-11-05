import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=resolve(dist,'.'+pathname,...(pathname.endsWith('/')?['index.html']:[]));
  if(!file.startsWith(dist.endsWith(sep)?dist:dist+sep)){res.writeHead(403).end();return;}
  try{res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream'}).end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();const checks=[];
const ready=async page=>{await page.waitForFunction(()=>document.querySelector('[data-docs-sidebar]')&&!document.querySelector('[data-sidebar-bootstrap]'));};
const top=page=>page.locator('#starlight__sidebar').evaluate(el=>el.scrollTop);
try{
  for(const locale of ['en','ko'])for(const theme of ['light','dark'])for(const width of [1024,1440]){
    const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
    await page.addInitScript(()=>{
      window.sidebarFrames=[];
      function sample(){const el=document.getElementById('starlight__sidebar');if(el&&getComputedStyle(el).visibility==='visible')window.sidebarFrames.push(el.scrollTop);if(window.sidebarFrames.length<180)requestAnimationFrame(sample);}requestAnimationFrame(sample);
    });
    const base=`${locale==='ko'?'/ko':''}/docs/svelte-ui/components/`;
    await page.goto(origin+base+'tooltip/');await ready(page);await page.evaluate(()=>document.fonts.ready);
    const extraGroup=page.locator('[data-docs-sidebar] > astro-island [data-sidebar-group]').first();
    const extraTrigger=extraGroup.locator(':scope > button');
    if(await extraTrigger.getAttribute('aria-expanded')!=='true')await extraTrigger.click();
    const link=page.locator(`#starlight__sidebar a[href="${base}toggle/"]`);
    await link.evaluate(el=>el.scrollIntoView({block:'center'}));
    await page.locator('#starlight__sidebar').evaluate(el=>el.scrollTop-=65);
    const expected=await top(page);assert.ok(expected>500);
    let release;const gate=new Promise(resolve=>{release=resolve;});
    await page.route('**/SidebarNavigation.*.js',async route=>{await gate;await route.continue();});
    await link.click();await page.waitForURL(origin+base+'toggle/');
    await page.locator('[data-sidebar-bootstrap]').waitFor({state:'attached'});
    await page.waitForTimeout(350);
    assert.ok(Math.abs(await top(page)-expected)<=1,'Pre-hydration scroll is preserved');
    const layoutBefore=await extraGroup.locator(':scope > [data-slot="collapsible-content"]').evaluate(el=>el.getBoundingClientRect().height);
    assert.ok(layoutBefore>0,'Persisted non-current group is open before hydration');
    release();await ready(page);await page.waitForTimeout(300);
    assert.equal(await extraTrigger.getAttribute('aria-expanded'),'true');
    assert.ok(Math.abs(await top(page)-expected)<=1,'Hydration does not move scroll');
    const frames=await page.evaluate(()=>window.sidebarFrames);
    assert.ok(frames.length>10);
    assert.ok(frames.every(value=>Math.abs(value-expected)<=1),`Visible frames must not jump: ${[...new Set(frames)]}, expected ${expected}`);
    await page.unroute('**/SidebarNavigation.*.js');
    await page.reload();await ready(page);assert.ok(Math.abs(await top(page)-expected)<=1,'Reload preserves position');
    await page.goBack();await ready(page);assert.ok(Math.abs(await top(page)-expected)<=1,'Back preserves position');
    // Navigating to a different branch keeps the previously open component group.
    const componentGroup=page.locator('[data-docs-sidebar] [data-sidebar-group]').filter({has:page.locator(`a[href="${base}tooltip/"]`)}).last();
    const groupKey=await componentGroup.getAttribute('data-sidebar-group');
    await page.goto(origin+(locale==='ko'?'/ko':'')+'/docs/');await ready(page);
    assert.equal(await page.locator('[data-docs-sidebar] [data-sidebar-group]').evaluateAll((groups,key)=>groups.find(g=>g.dataset.sidebarGroup===key)?.querySelector(':scope > button')?.getAttribute('aria-expanded'),groupKey),'true','Auto-opened component branch persists across sections');
    assert.deepEqual(errors,[]);
    checks.push({locale,theme,width,expected,frames:frames.length,min:Math.min(...frames),max:Math.max(...frames),hydrationDelayMs:350});await context.close();
  }
  const blocked=await browser.newContext({viewport:{width:1440,height:900}});
  await blocked.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('unavailable')};Storage.prototype.setItem=()=>{throw Error('unavailable')};});
  const p=await blocked.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/ko/docs/svelte-ui/components/tooltip/');await ready(p);assert.ok(await top(p)>500);assert.deepEqual(errors,[]);await blocked.close();
  checks.push({storageUnavailable:'current item visible, no errors'});
  const mobile=await browser.newContext({viewport:{width:375,height:900}});await mobile.addInitScript(()=>sessionStorage.setItem('viewstem-docs-scroll:ko','1700'));
  const m=await mobile.newPage();await m.goto(origin+'/ko/docs/svelte-ui/components/button/');await ready(m);await m.getByRole('button',{name:'문서 메뉴',exact:true}).click();await m.getByRole('dialog').waitFor();await m.keyboard.press('Escape');assert.equal(await m.evaluate(()=>sessionStorage.getItem('viewstem-docs-scroll:ko')),'1700');await mobile.close();checks.push({mobile:'menu works without overwriting desktop scroll'});
  console.log(JSON.stringify({checks,failures:[]},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
