import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rm, mkdir, realpath, rmdir, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { isAbsolute, join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { build as bundle } from 'esbuild';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = fileURLToPath(import.meta.url);
export const scenarios = [
 {id:'core-only', language:'en', expectedSkill:true, kind:'node', assessment:['strict NodeNext types','real core State and Action behavior','no Svelte dependencies'], prompt:`Implement src/main.ts for a Node-only consumer using @viewstem/core public APIs. Export async function run(): Promise<string[]> that creates a View with State initialized to "one", invokes a declarative SetState Action to write "two", then "three", and returns the three observed State values in order. Dispose the runtime. Use the installed package; no DOM or Svelte. npm run check and npm run build are available.`},
 {id:'version-unsupported', language:'ko', expectedSkill:true, kind:'diagnostic', assessment:['installed manifest and public type evidence','CEL support evidence','no invented version availability'], prompt:`이 앱이 더 새로운 Viewstem API createEngine()과 CEL 문자열 함수 reverse()를 지원한다고 가정했는데 실행 전에 확인해 주세요. 설치된 @viewstem/core의 package.json, 공개 타입, 공개 cel-support.json을 근거로 src/diagnosis.json을 작성하세요. 필드는 version (문자열), api (assumed, available, evidence, alternative), cel (function, supported, evidence)입니다. available/supported는 불리언, evidence는 실제 설치된 파일의 상대 경로 문자열이며 alternative는 설치된 공개 API에서 런타임을 생성하는 함수 이름입니다. 설치 버전에서 확인할 수 없는 다른 버전의 존재나 배포 여부를 추측하지 마세요. 의존성 변경은 하지 마세요.`},
 {id:'svelte-decoy', language:'en', expectedSkill:false, kind:'browser', assessment:['computed CSS color changes','button remains accessible'], prompt:`In src/Badge.svelte implement a plain Svelte badge with a button named "Toggle theme" and text "Status". Initially the badge text must have computed color rgb(0, 0, 255); each button click alternates it to rgb(255, 0, 0) and back. Keep the component self-contained. npm run check and npm run build are available.`},
 {id:'other-decoy', language:'ko', expectedSkill:false, kind:'node', assessment:['URL parsing and normalization','invalid input rejection'], prompt:`src/utility.ts에 export function uniqueHosts(urls: string[]): string[]를 구현하세요. Node의 URL을 이용해 각 URL의 hostname을 소문자로 얻고, 중복을 제거한 뒤 사전순으로 반환합니다. 잘못된 URL이 있으면 예외를 전파합니다. 입력 배열을 변경하지 마세요. npm run check와 npm run build를 사용할 수 있습니다.`}
];
const write = (project,path,data) => writeFile(join(project,path),data);
const run = (cmd,args,cwd,timeout) => { try { return {ok:true,output:execFileSync(cmd,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],...(timeout ? {timeout} : {})})}; } catch(e) {return {ok:false,output:`${e.stdout??''}${e.stderr??''}${e.message??''}`,timedOut:e.code==='ETIMEDOUT',signal:e.signal??null};} };
const requireScenario = value => { const item = typeof value === 'string' ? scenarios.find(x=>x.id===value) : scenarios.find(x=>x.id===value?.id); if (!item) throw Error('Unknown scenario'); return item; };
export async function prepare({project,scenario}) {
 scenario=requireScenario(scenario);
 if (!isAbsolute(project)) throw Error('Expected an absolute temporary project');
 const actual=await realpath(project); const roots=await Promise.all([tmpdir(),'/tmp'].map(path=>realpath(path)));
 if (!roots.some(root=>{const rel=relative(root,actual);return rel && !rel.startsWith('..') && !isAbsolute(rel)})) throw Error('Expected a temporary project beneath the temporary directory');
 await rm(join(project,'src'),{recursive:true,force:true}); await mkdir(join(project,'src'),{recursive:true});
 if (scenario.id==='core-only') {
  const pkg=JSON.parse(await readFile(join(project,'package.json'),'utf8')); pkg.dependencies={'@viewstem/core':pkg.dependencies['@viewstem/core']}; delete pkg.devDependencies; await write(project,'package.json',JSON.stringify(pkg,null,2));
  const pruned=run('npm',['prune','--ignore-scripts','--no-audit','--no-fund','--offline'],project); if(!pruned.ok) throw Error(`npm prune failed: ${pruned.output}`);
  for (const name of await readdir(join(project,'node_modules'))) if (/svelte/i.test(name)) { const path=join(project,'node_modules',name); if ((await readdir(path)).length===0) await rmdir(path); else throw Error(`Unexpected Svelte package remains: ${name}`); }
 }
 await write(project,'tsconfig.json',JSON.stringify({compilerOptions:{strict:true,skipLibCheck:scenario.id!=='core-only',noEmit:true,target:'ES2022',module:scenario.id==='svelte-decoy'?'ESNext':'NodeNext',moduleResolution:scenario.id==='svelte-decoy'?'Bundler':'NodeNext',lib:scenario.id==='svelte-decoy'?['ES2022','DOM','DOM.Iterable']:['ES2022'],...(scenario.id==='svelte-decoy'?{}:{types:['node'],typeRoots:[join(root,'node_modules/@types')]})},include:['src/**/*']},null,2));
 if(scenario.id==='core-only') await write(project,'src/main.ts',`export async function run(): Promise<string[]> { throw new Error('TODO'); }\n`);
 if(scenario.id==='other-decoy') await write(project,'src/utility.ts',`export function uniqueHosts(urls: string[]): string[] { throw new Error('TODO'); }\n`);
 if(scenario.id==='svelte-decoy') { await write(project,'src/Badge.svelte',`<button>Toggle theme</button>\n<span>Status</span>\n`); await write(project,'bootstrap.ts',`import { mount } from 'svelte';\nimport Badge from './src/Badge.svelte';\nmount(Badge, { target: document.getElementById('app')! });\n`); }
}
export async function check({project,scenario,finalResponse='',mode='check'}) {
 scenario=requireScenario(scenario); const result={ok:false,typecheck:null,build:null,runtime:null,assertions:[]};
 const assert=(name,fn)=>{try{const evidence=fn();result.assertions.push({name,ok:true,evidence});}catch(e){result.assertions.push({name,ok:false,evidence:e.message});}};
 try {
  if(scenario.id==='version-unsupported') {
   result.typecheck={ok:true,output:'Not applicable: diagnosis only'};result.build={ok:true,output:'Not applicable: diagnosis only'};
   if(mode!=='build') {
    const d=JSON.parse(await readFile(join(project,'src/diagnosis.json'),'utf8'));const pkg=JSON.parse(await readFile(join(project,'node_modules/@viewstem/core/package.json'),'utf8'));const types=await readFile(join(project,'node_modules/@viewstem/core/dist/index.d.ts'),'utf8');const cel=JSON.parse(await readFile(join(project,'node_modules/@viewstem/core/dist/cel-support.json'),'utf8'));
    const evidenceIs = async (value, expected) => { if (typeof value !== 'string' || isAbsolute(value)) return false; try { return await realpath(resolve(project,value)) === await realpath(join(project,expected)); } catch { return false; } };
    const apiEvidence = await evidenceIs(d.api?.evidence,'node_modules/@viewstem/core/dist/index.d.ts');
    const celEvidence = await evidenceIs(d.cel?.evidence,'node_modules/@viewstem/core/dist/cel-support.json');
    assert('manifest version',()=>{if(d.version!==pkg.version)throw Error('version mismatch');return d.version});
    assert('public API evidence',()=>{if(!/^createEngine(?:\(\))?$/.test(d.api?.assumed?.trim()??'') || d.api?.available!==false || !/^createRuntime(?:\(\))?$/.test(d.api?.alternative?.trim()??'') || !apiEvidence || /\bcreateEngine\b/.test(types) || !/\bcreateRuntime\b/.test(types)) throw Error('incorrect API diagnosis');return d.api});
    assert('CEL support evidence',()=>{if(!/^(?:string\.)?reverse(?:\(\))?$/.test(d.cel?.function?.trim()??'') || d.cel?.supported!==false || !celEvidence || [...cel.upstream,...cel.native].some(x=>/\breverse\s*\(/.test(x)))throw Error('incorrect CEL diagnosis');return d.cel});
    result.runtime={ok:result.assertions.every(x=>x.ok)};
   }
  } else {
   const cmd=scenario.id==='svelte-decoy'?join(root,'node_modules/svelte-check/bin/svelte-check'):join(root,'node_modules/typescript/bin/tsc');
   result.typecheck=run(process.execPath,scenario.id==='svelte-decoy'?[cmd,'--workspace',project,'--tsconfig',join(project,'tsconfig.json')]:[cmd,'-p',join(project,'tsconfig.json')],project);
   const req=createRequire(join(project,'package.json'));
   const plugin={name:'svelte',setup(b){b.onLoad({filter:/\.svelte$/},async({path})=>({contents:req('svelte/compiler').compile(await readFile(path,'utf8'),{filename:path,generate:'client',css:'injected'}).js.code,loader:'js'}));}};
   try {const entry=scenario.id==='core-only'?'src/main.ts':scenario.id==='other-decoy'?'src/utility.ts':'bootstrap.ts'; const output=await bundle({absWorkingDir:project,entryPoints:[entry],bundle:true,write:false,metafile:true,platform:scenario.kind==='browser'?'browser':'node',format:'esm',target:'es2022',conditions:['svelte','browser'],plugins:scenario.kind==='browser'?[plugin]:[],logLevel:'silent'}); result.build={ok:scenario.id!=='core-only'||Object.keys(output.metafile.inputs).some(x=>x.includes('node_modules/@viewstem/core/dist/')),output:'Bundled successfully'};
    if(mode!=='build') {
     if(scenario.kind==='node') {
      const out=join(project,'.verification-bundle.mjs'); await writeFile(out,output.outputFiles[0].contents);
      try {
       const childCode=`import {pathToFileURL} from 'node:url';
console.log=()=>{}; const emit=value=>process.stdout.write(JSON.stringify(value));
const m=await import(pathToFileURL(process.argv[1]).href);
if(process.argv[2]==='core-only') emit({values:await m.run()});
else {const input=['https://B.Example/x','http://a.example','https://b.example:44'];const before=JSON.stringify(input);const got=m.uniqueHosts(input);let threw=false;try{m.uniqueHosts(['bad'])}catch{threw=true}emit({got,inputUnchanged:JSON.stringify(input)===before,threw});}`;
       const child=run(process.execPath,['--input-type=module','-e',childCode,out,scenario.id],project,10000);
       if(!child.ok) {result.runtime={ok:false,error:child.output,timedOut:child.timedOut,signal:child.signal};}
       else {const data=JSON.parse(child.output);if(scenario.id==='core-only'){assert('State Action sequence',()=>{if(JSON.stringify(data.values)!=='["one","two","three"]')throw Error(JSON.stringify(data.values));return data.values});}else{assert('hostnames sorted and unique',()=>{if(JSON.stringify(data.got)!=='["a.example","b.example"]'||!data.inputUnchanged)throw Error(JSON.stringify(data.got));return data.got});assert('invalid URL throws',()=>{if(!data.threw)throw Error('did not throw');return 'threw'});}}
      } finally {await rm(out,{force:true});}
     }
     else {const server=createServer((q,r)=>{r.setHeader('content-type','text/html');r.end(`<div id="app"></div><script type="module">${output.outputFiles[0].text}</script>`)});await new Promise(done=>server.listen(0,'127.0.0.1',done));let browser;try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);const badge=page.getByText('Status',{exact:true});const colors=[];for(let i=0;i<3;i++){colors.push(await badge.evaluate(e=>getComputedStyle(e).color));if(i<2)await page.getByRole('button',{name:'Toggle theme',exact:true}).click()}assert('theme toggles',()=>{if(JSON.stringify(colors)!=='["rgb(0, 0, 255)","rgb(255, 0, 0)","rgb(0, 0, 255)"]')throw Error(JSON.stringify(colors));return colors});}finally{await browser?.close();await new Promise(done=>server.close(done));}}
     result.runtime ??= {ok:result.assertions.length>0&&result.assertions.every(x=>x.ok)};
    }
   } catch(e){result.build={ok:false,output:e.stack??e.message};}
  }
 } catch(e){result.runtime={ok:false,error:e.stack??e.message};}
 result.ok=Boolean(result.typecheck?.ok&&result.build?.ok&&(mode==='build'||result.runtime?.ok));return result;
}
if (process.argv[1] && resolve(process.argv[1])===script) {const [command,...args]=process.argv.slice(2);const opt=x=>args[args.indexOf(`--${x}`)+1];const project=opt('project'),scenario=opt('scenario');if(!['check','build'].includes(command)||!isAbsolute(project??''))throw Error('Usage: extended-other.mjs check|build --project ABS --scenario ID');const result=await check({project,scenario,mode:command});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}
