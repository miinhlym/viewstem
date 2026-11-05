import fs from 'node:fs/promises';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
import {compile} from 'tailwindcss';
import {Scanner} from '@tailwindcss/oxide';
import {componentDemoSlugs} from '../src/examples/component-demos.mjs';

// Independent styling oracle: pinned upstream registry + Tailwind preflight/utilities.
// It deliberately does NOT read the Viewstem CSS generator or its generated stylesheet.
const require=createRequire(import.meta.url);
const archive=JSON.parse(gunzipSync(readFileSync(new URL('../../../packages/svelte-ui/upstream/source.json.gz',import.meta.url))));
const theme=JSON.parse(archive['docs/static/registry/colors/neutral.json']).cssVars;
const registry=Object.entries(archive).filter(([key])=>key.startsWith('docs/static/registry/styles/nova/')).flatMap(([,value])=>JSON.parse(value).files??[]);
const scanner=new Scanner({sources:[]});
const recipes=new URL('../../../packages/svelte-ui/src/lib/shadcn/recipes/',import.meta.url);
const compositionSources=readdirSync(recipes).filter(name=>name.endsWith('.svelte')).map(name=>({content:readFileSync(new URL(name,recipes),'utf8'),extension:'svelte'}));
const candidates=scanner.scanFiles([...registry.map(file=>({content:file.content,extension:'svelte'})),...compositionSources]);
const tokens=Object.keys(theme.light).filter(key=>key!=='radius');
const vars=mode=>Object.entries(theme[mode]).map(([key,value])=>`--${key}:${value};`).join('');
const colors=tokens.map(key=>`--color-${key}:var(--${key});`).join('');
const radii=Object.entries({sm:.6,md:.8,lg:1,xl:1.4,'2xl':1.8,'3xl':2.2,'4xl':2.6}).map(([key,value])=>`--radius-${key}:calc(var(--radius)*${value});`).join('');
const referenceCss=(await compile(`
@layer theme,base,components,utilities;
@layer theme {${readFileSync(require.resolve('tailwindcss/theme.css'),'utf8')} :root{${vars('light')}} .dark{${vars('dark')}} }
@layer base {${readFileSync(require.resolve('tailwindcss/preflight.css'),'utf8')}}
@theme inline {${colors}${radii}}
@custom-variant dark (&:where(.dark,.dark *));
${archive['packages/cli/src/tailwind.css']}
@layer utilities {@tailwind utilities;}
`)).build(candidates);
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
const server=createServer(async(req,res)=>{
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=resolve(dist,'.'+path,...(path.endsWith('/')?['index.html']:[]));
 if(!file.startsWith(dist.endsWith(sep)?dist:dist+sep)){res.writeHead(403).end();return;}
 try{const data=await fs.readFile(file);res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(file)]??'application/octet-stream'}).end(data);}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=process.env.FIDELITY_ORIGIN??`http://127.0.0.1:${server.address().port}`;
const families=process.env.FIDELITY_FAMILIES?.split(',')??componentDemoSlugs;
const matrix=families.flatMap(family=>(process.env.FIDELITY_QUICK?['light']:['light','dark']).flatMap(theme=>(process.env.FIDELITY_QUICK?[1440]:[375,1440]).map(width=>({family,theme,width}))));
const expectedChecks=matrix.length;
const browser=await chromium.launch();const checks=[],failures=[];
const properties=['fontSize','fontWeight','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','borderTopWidth','borderTopStyle','borderTopLeftRadius','color','backgroundColor','display','alignItems','justifyContent','boxSizing'];
try{await Promise.all(Array.from({length:3},async()=>{for(let task;(task=matrix.shift());){
 const {family,theme,width}=task;const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme,reducedMotion:'reduce'});const page=await context.newPage();
 try{
  await page.goto(origin+'/ko/docs/svelte-ui/components/'+family+'/');await page.locator('[data-demo-ready]').waitFor({timeout:60000});
  const evidence=await page.evaluate(async({referenceCss,theme,properties})=>{
   const target=document.querySelector('[data-demo-target]');
   const before=[...target.querySelectorAll('[class],[data-slot],[data-viewstem-shadcn]')];
   const nodes=before.filter(el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0);
   const iframe=document.createElement('iframe');iframe.style.cssText=`position:fixed;left:-20000px;top:0;width:${window.innerWidth}px;height:2000px;border:0`;
   const frameReady=new Promise(resolve=>iframe.onload=resolve);
   iframe.srcdoc='<!doctype html><html'+(theme==='dark'?' class="dark"':'')+'><head></head><body><div id="reference"></div></body></html>';document.body.append(iframe);await frameReady;
   const doc=iframe.contentDocument;const style=doc.createElement('style');style.textContent=referenceCss+'\n*,*::before,*::after{animation:none!important;transition:none!important}';doc.head.append(style);
   doc.body.style.fontFamily=getComputedStyle(target).fontFamily;
   doc.body.style.color='var(--foreground)';doc.body.style.background='var(--background)';
   const surface=doc.querySelector('#reference');
   surface.style.width=(target.clientWidth-parseFloat(getComputedStyle(target).paddingLeft)-parseFloat(getComputedStyle(target).paddingRight))+'px';
   surface.innerHTML=target.innerHTML;
   const inheritedStyles=[];
   function inherit(rules){for(const rule of rules){
    if(rule.constructor.name==='CSSFontFaceRule') inheritedStyles.push(rule.cssText);
    else if(rule.selectorText?.includes('data-scroll-area-')) inheritedStyles.push(rule.cssText);
    else if(rule.constructor.name==='CSSLayerBlockRule' && ['component','components','base'].includes(rule.name)) inheritedStyles.push(rule.cssText.replace(/@layer component(?=\s*\{)/, '@layer components'));
    else if(rule.cssRules) inherit(rule.cssRules);
   }}
   for(const sheet of document.styleSheets){try{inherit(sheet.cssRules);}catch{}}
   const dependencies=doc.createElement('style');dependencies.textContent=inheritedStyles.join('\n');doc.head.append(dependencies);
   await doc.fonts.ready;
   const copies=[...doc.querySelectorAll('#reference :is([class],[data-slot],[data-viewstem-shadcn])')];
   const diffs=[];let compared=0;
   for(const el of nodes){const index=before.indexOf(el),copy=copies[index];if(!copy)throw Error('Reference DOM mismatch');const actual=getComputedStyle(el),expected=iframe.contentWindow.getComputedStyle(copy);const slot=el.getAttribute('data-slot');
    for(const property of properties){
     let a=actual[property], e=expected[property];
     // Chromium can serialize the physical margin as zero for logical auto margins
     // despite correctly centering the box. Compare used geometry in that case.
     if(el.style.marginInline==='auto' && ['marginLeft','marginRight'].includes(property)){
      const used=node=>{const r=node.getBoundingClientRect(),p=node.parentElement.getBoundingClientRect();return (property==='marginLeft'?r.left-p.left:p.right-r.right)+'px';};a=used(el);e=used(copy);
     }
     if(a!==e && !(property.startsWith('margin') && Math.abs(parseFloat(a)-parseFloat(e))<=1))diffs.push({index,tag:el.tagName,slot,property,actual:a,expected:e,class:el.getAttribute('class')});
    }compared++;
   }
   iframe.remove();return {compared,diffs};
  },{referenceCss,theme,properties});
  checks.push({...task,...evidence});
 }catch(error){failures.push({...task,error:String(error)});}finally{await context.close();}
}}));}finally{await browser.close();await new Promise(done=>server.close(done));}
if(checks.length + failures.length !== expectedChecks) throw new Error('Incomplete fidelity matrix');
console.log(JSON.stringify({expectedChecks,source:'Pinned Nova registry + unmodified Tailwind preflight/utilities; same rendered DOM, without site styles',properties,checks,failures},null,2));
if(failures.length || checks.some(check => check.diffs.length))process.exitCode=1;
