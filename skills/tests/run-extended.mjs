import { spawn, execFileSync } from 'node:child_process';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(`--${key}`) ? args[args.indexOf(`--${key}`) + 1] : fallback;
const workspace = option('workspace');
const baseline = option('baseline');
const ids = option('scenarios', 'first-view,native').split(',');
const rounds = option('rounds', '1,2,3').split(',').map(Number);
const arms = option('arms', 'A,B2').split(',');
const concurrency = Number(option('concurrency', '2'));
const skill = resolve(option('skill', join(root, 'skills/viewstem')));
const prepareOnly = args.includes('--prepare-only');
const host = option('host','codex');
if (!workspace || !baseline || !isAbsolute(workspace) || !isAbsolute(baseline) ||
    !['codex','claude-code'].includes(host) ||
    !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3 ||
    rounds.some(n => !Number.isInteger(n) || n < 1) || arms.some(a => !/^(A|B\d+)$/.test(a))) {
  throw Error('Use --workspace ABS --baseline ABS [--scenarios IDS] [--rounds 1,2,3] [--arms A,B2] [--concurrency 1..3] [--prepare-only]');
}
if(host==='claude-code'&&!prepareOnly)throw Error('Claude Code is preparation-only for this task');
const sha = value => createHash('sha256').update(value).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const json = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
async function files(dir, prefix = '') {
  const list = [];
  for (const entry of (await readdir(join(dir, prefix), {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) list.push(...await files(dir,path));
    else if (entry.isFile()) list.push({path,sha256:sha(await readFile(join(dir,path)))});
  }
  return list;
}
const initial = JSON.parse(await readFile(join(root,'skills/tests/scenarios.json'),'utf8'));
const definitions = initial.scenarios.filter(s=>['first-view','native'].includes(s.id)).map(s=>({...s,expectedSkill:true,kind:'browser',module:null}));
for (const name of ids.every(id=>['first-view','native'].includes(id)) ? [] : ['extended-browser.mjs','extended-other.mjs']) {
  const path = join(root,'skills/tests',name);
  if (await exists(path)) {
    const module = await import(pathToFileURL(path).href);
    definitions.push(...module.scenarios.map(s=>({...s,module,checker:path})));
  }
}
const scenarios = ids.map(id=> {
  const found = definitions.find(s=>s.id===id);
  if (!found) throw Error(`Scenario module not ready: ${id}`);
  return found;
});
const globalViewstemPaths = [];
for (const path of [join(homedir(),'.agents/skills/viewstem'),join(homedir(),'.codex/skills/viewstem')]) if(await exists(path))globalViewstemPaths.push(path);
if(host==='codex'&&globalViewstemPaths.length)throw Error(`Baseline contains a personal Viewstem skill: ${globalViewstemPaths.join(', ')}`);
const environment={host,cli:host==='codex'?execFileSync('codex',['--version'],{encoding:'utf8'}).trim():'not_run',node:process.version,model:host==='codex'?'gpt-6.1-terra':null,effort:host==='codex'?'high':null,maxSeconds:360,maxCommands:50,concurrency,globalViewstemPaths,skillManifest:await files(skill),isolation:'external consumer app, fresh ephemeral sessions; same unrelated skills remain available; no full filesystem isolation claim'};
await mkdir(join(workspace,'runs'),{recursive:true});
const frozenSkill=join(workspace,'skills',sha(JSON.stringify(environment.skillManifest))+'-'+host+'-'+ids.join('_')+'-'+rounds.join('')+'-'+arms.join(''));
await mkdir(dirname(frozenSkill),{recursive:true});
if(!await exists(frozenSkill))await cp(skill,frozenSkill,{recursive:true});
const skillBodyLines=(await readFile(join(frozenSkill,'SKILL.md'),'utf8')).replace(/^---\n[\s\S]*?\n---\n/,'').split('\n').map(line=>line.trim()).filter(line=>line.length>=40);
const initialPrefix=`Work only in this consumer app. Edit files under src/ and keep mountApp's public signature. Read installed package README/types/support data and an available skill as needed. Do not read the Viewstem source checkout, evaluator implementation, other runs, private user files, or browse the web. Do not install dependencies or edit package.json, tsconfig.json, bootstrap.ts, or the checker. The supplied npm run check and npm run build commands may use maintainer tooling outside this app; execute those commands without inspecting that tooling. Keep to at most 50 command calls and 6 minutes. Report changes, checks actually run, and remaining limitations.\n\n`;
const commonPrefix = scenario => `Work only in this app. Edit src/${scenario.editableFiles?.length ? ' and '+scenario.editableFiles.join(', ') : ''}; preserve the provided public signatures. Read installed documentation and available skills relevant to the requested task. Do not read the original library source checkout, evaluator implementation, other runs, private user files, or browse the web. Do not install dependencies or change package.json, package-lock.json, tsconfig.json, bootstrap.ts, or the checker. npm run check and npm run build may use maintainer tooling outside this app; run them without inspecting that tooling. Keep to 50 command calls and 6 minutes. Report changes, checks actually run, and remaining limitations.\n\n`;
const jobs=[];
// Alternate pair order across rounds; this is counterbalancing, not randomization.
for(const round of rounds)for(const scenario of scenarios)for(const arm of round%2 ? arms : [...arms].reverse())jobs.push({round,scenario,arm});
await json(join(workspace,`plan-${host}-${ids.join('_')}-${rounds.join('')}-${arms.join('')}.json`),{environment,baseline,prepareOnly,scenarios:scenarios.map(({module,...s})=>s),jobs:jobs.map(j=>({round:j.round,scenario:j.scenario.id,arm:j.arm}))});

async function command(command, argv, cwd, seconds=120) {
  const child=spawn(command,argv,{cwd,stdio:['ignore','pipe','pipe'],detached:true});
  let output='',stdout='',stderr='';child.stdout.on('data',d=>{output+=d;stdout+=d;});child.stderr.on('data',d=>{output+=d;stderr+=d;});
  const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},seconds*1000);
  const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});clearTimeout(timer);
  return {code,output,stdout,stderr};
}
async function runJob({round,scenario,arm}) {
  const id=`${host}-${scenario.id}-${arm}-r${round}`;
  const project=join(workspace,'runs',id);
  if(await exists(project)) {
    throw Error(`Refusing to overwrite or silently reuse an existing run; inspect its result or use a new workspace: ${project}`);
  }
  await cp(baseline,project,{recursive:true,mode:constants.COPYFILE_FICLONE});
  if(scenario.module)await scenario.module.prepare({project,scenario:scenario.id});
  const checker=scenario.checker??join(root,'skills/tests/consumer.mjs');
  const pkg=JSON.parse(await readFile(join(project,'package.json'),'utf8'));
  for(const name of ['check','build'])pkg.scripts[name]=`node ${quote(checker)} ${name} --project ${quote(project)}${scenario.module?' --scenario '+quote(scenario.id):''}`;
  await json(join(project,'package.json'),pkg);
  let skillPath=null;
  if(arm!=='A'){skillPath=join(project,host==='codex'?'.agents/skills/viewstem':'.claude/skills/viewstem');await cp(frozenSkill,skillPath,{recursive:true});}
  const protectedPaths=['package.json','package-lock.json','tsconfig.json','index.html','bootstrap.ts',...(scenario.protectedFiles??[])];
  const protectedBefore={};for(const p of protectedPaths)if(await exists(join(project,p)))protectedBefore[p]=sha(await readFile(join(project,p)));
  const initialSourceManifest=await files(join(project,'src'));
  const prompt=(scenario.module?commonPrefix(scenario):initialPrefix)+scenario.prompt;
  await writeFile(join(project,'prompt.txt'),prompt);
  const cliArgs=host==='codex'?['--no-daemon','-a','never','exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','workspace-write','--model',environment.model,'-c','model_reasoning_effort="high"','--json','--cd',project,'-']:['--print','--output-format','stream-json','--verbose','--no-session-persistence'];
  const record={id,host,scenario:scenario.id,round,arm,project,expectedSkill:scenario.expectedSkill,environment,skillPath,initialSourceManifest,protectedBefore,promptSha256:sha(prompt),status:prepareOnly?'not_run':'running',...(prepareOnly?{reason:'user_requested_preparation_only'}:{})};
  await json(join(project,'invocation.json'),{command:host==='codex'?'codex':'claude',args:cliArgs,cwd:project,prompt:'prompt.txt',promptDelivery:'stdin',model:environment.model,configurationRequired:host==='claude-code'?['Verify installed CLI flags/version','Pin model and settings for both arms','Check active skill discovery and enforce identical execution budgets']:[],execute:!prepareOnly});
  await json(join(project,'result.json'),record);
  if(prepareOnly){console.log(JSON.stringify({id,status:record.status}));return;}
  const start=Date.now();let log='',pending='',calls=0,stopReason=null;
  const child=spawn('codex',cliArgs,{cwd:project,stdio:['pipe','pipe','pipe'],detached:true});
  const stop=reason=>{if(stopReason)return;stopReason=reason;try{process.kill(-child.pid,'SIGTERM');}catch{}setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},2000).unref();};
  const timer=setTimeout(()=>stop('wall_time_limit'),environment.maxSeconds*1000);
  child.stdout.on('data',data=>{const value=data.toString();log+=value;pending+=value;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)try{const event=JSON.parse(line);if(event.type==='item.started'&&event.item?.type==='command_execution'&&++calls>environment.maxCommands)stop('command_limit');}catch{}});
  child.stderr.on('data',data=>log+=data.toString());child.stdin.end(prompt);
  let exitCode;try{exitCode=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});}finally{clearTimeout(timer);}
  await writeFile(join(project,'trace.jsonl'),log);
  const events=log.split('\n').flatMap(line=>{try{return[JSON.parse(line)];}catch{return[];}});
  const completed=events.filter(e=>e.type==='item.completed').map(e=>e.item);
  const commands=completed.filter(i=>i.type==='command_execution');
  const skillAccesses=commands.filter(i=>String(i.command).includes('SKILL.md')&&(/viewstem/.test(i.command)||String(i.aggregated_output).includes('# Viewstem consumer apps')));
  const skillReads=skillAccesses.filter(i=>i.exit_code===0&&skillBodyLines.some(line=>String(i.aggregated_output).includes(line)));
  Object.assign(record,{status:exitCode===0&&!stopReason?'completed':'incomplete',exitCode,stopReason,wallSeconds:(Date.now()-start)/1000,commandCalls:calls,completedCommands:commands.length,failedCommands:commands.filter(i=>i.exit_code!==0).length,commandOutputBytes:commands.reduce((n,i)=>n+Buffer.byteLength(i.aggregated_output??''),0),usage:events.findLast(e=>e.type==='turn.completed')?.usage??null,skillReadObserved:skillReads.length>0,skillReadCommands:skillReads.map(i=>i.command),skillAccessCommands:skillAccesses.map(i=>({command:i.command,exitCode:i.exit_code})),finalResponse:completed.filter(i=>i.type==='agent_message').at(-1)?.text??'',traceSha256:sha(log)});
  // Save model outcome before grading so an evaluator failure never erases it.
  await json(join(project,'result.json'),record);
  const checkStart=Date.now();
  try{
    const check=await command(process.execPath,[checker,'check','--project',project,'--scenario',scenario.id],project);
    await writeFile(join(project,'check.log'),check.output);
    record.checkExitCode=check.code;
    record.checkerSha256=sha(await readFile(checker));
    try{record.verification=JSON.parse(check.stdout);}catch{record.verification={ok:false,evaluatorError:'Checker did not return valid JSON',exitCode:check.code,stderr:check.stderr};}
    if(check.code!==0&&record.verification.ok)record.verification={...record.verification,ok:false,evaluatorError:'Checker exited unsuccessfully'};
  }catch(error){record.verification={ok:false,evaluatorError:String(error.stack??error)};}
  record.checkSeconds=(Date.now()-checkStart)/1000;
  record.sourceFiles=[];for(const f of await files(join(project,'src')))record.sourceFiles.push({...f,path:'src/'+f.path,content:await readFile(join(project,'src',f.path),'utf8')});
  for(const name of scenario.editableFiles??[])if(await exists(join(project,name)))record.sourceFiles.push({path:name,sha256:sha(await readFile(join(project,name))),content:await readFile(join(project,name),'utf8')});
  record.protectedFileChanges=[];for(const [name,before] of Object.entries(protectedBefore))if(!await exists(join(project,name))||sha(await readFile(join(project,name)))!==before)record.protectedFileChanges.push(name);
  record.skillFilesUnchanged=!skillPath||JSON.stringify(await files(skillPath))===JSON.stringify(environment.skillManifest);
  await json(join(project,'result.json'),record);
  console.log(JSON.stringify({id,status:record.status,passed:record.verification?.ok??false,skillRead:record.skillReadObserved,expectedSkill:record.expectedSkill,seconds:record.wallSeconds,protectedChanges:record.protectedFileChanges}));
}
const queue=[...jobs];
await Promise.all(Array.from({length:concurrency},async()=>{while(queue.length){const job=queue.shift();try{await runJob(job);}catch(error){console.error(JSON.stringify({scenario:job.scenario.id,arm:job.arm,round:job.round,infrastructureError:String(error.stack??error)}));process.exitCode=1;}}}));
