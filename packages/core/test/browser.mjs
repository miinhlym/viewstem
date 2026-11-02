import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const bundle=await build({entryPoints:[new URL('./browser-fixture.mjs',import.meta.url).pathname],bundle:true,platform:'browser',format:'iife',globalName:'Fixture',write:false});
const requests=[];
const server=createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api'){requests.push(url.searchParams.get('n'));res.setHeader('content-type','application/json');res.end(JSON.stringify({label:`result:${url.searchParams.get('n')}`}));}else if(url.pathname==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Viewstem core adapter verification</title><label>Count <input id="count" type="number"></label><output id="double"></output><p id="result"></p><button id="confirm">Confirm</button><script src="/bundle.js"></script>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
const checks=[];const check=async(name,fn)=>{await fn();checks.push(name);};
try{
 await page.goto(`${origin}/screen?external=%2f%2F&empty=&p.count=3#section`);
 await page.evaluate(async()=>{window.fixture=await Fixture.startBrowserFixture();await fixture.initialComplete;});
 await check('URL restore precedes actual first HTTP request and Derived CEL',async()=>{assert.deepEqual(requests,['3']);assert.equal(await page.locator('#count').inputValue(),'3');assert.equal(await page.locator('#double').textContent(),'6');assert.equal(await page.locator('#result').textContent(),'result:3');});
 await page.locator('#count').fill('4');await page.waitForFunction(()=>document.querySelector('#result').textContent==='result:4');
 await check('native input event → Action → shared StateStore → UI/HTTP',async()=>{assert.equal(await page.evaluate(()=>fixture.view.getState('count').read()),4);assert.equal(await page.locator('#double').textContent(),'8');assert.equal(await page.evaluate(()=>fixture.calls),1);});
 await check('History push owns exact key and preserves raw service bytes and hash',async()=>{assert.equal(new URL(page.url()).search,'?external=%2f%2F&empty=&p.count=4');assert.equal(new URL(page.url()).hash,'#section');assert.equal(await page.evaluate(()=>fixture.writes.length),1);});
 await page.goBack();await page.waitForFunction(()=>document.querySelector('#result').textContent==='result:3');
 await check('actual popstate restores baseline without pushing again',async()=>{assert.equal(await page.locator('#count').inputValue(),'3');assert.equal(await page.evaluate(()=>fixture.writes.length),1);});
 await page.locator('#confirm').click();await page.waitForFunction(()=>fixture.view.getSnapshot().actions.confirmed.status==='success');
 await check('native boolean false is observable success',async()=>assert.equal(await page.evaluate(()=>fixture.view.getSnapshot().actions.confirmed.data),false));
 await page.evaluate(()=>fixture.replace());await page.waitForFunction(()=>document.querySelector('#result').textContent==='result:7');
 await check('replacement removes old URL key, uses new initial, preserves service State',async()=>{assert.equal(new URL(page.url()).search,'?external=%2f%2F&empty=');assert.equal(await page.locator('#count').inputValue(),'7');assert.equal(await page.evaluate(()=>fixture.shared.read()),42);});
 await check('no runtime or browser errors',async()=>{assert.deepEqual(pageErrors,[]);assert.deepEqual(await page.evaluate(()=>window.errors),[]);});
 await page.evaluate(()=>fixture.dispose());
 console.log(JSON.stringify({nodeVersion:process.version,chromium:browser.version(),checks,passed:checks.length,pageErrors,requests},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
