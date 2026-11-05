import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback;
const workspace = opt('workspace');
const host = opt('host', 'codex');
const arms = opt('arms', 'A,B').split(',');
const selected = opt('scenario');
const skill = resolve(opt('skill', join(root, 'skills/viewstem')));
const prepareOnly = args.includes('--prepare-only');
if (!workspace || !isAbsolute(workspace) || !['codex','claude-code'].includes(host) || arms.some(x => !['A','B','B2','C','D'].includes(x))) {
  throw Error('Use --workspace ABS --host codex|claude-code [--arms A,B] [--scenario ID] [--skill ABS] [--prepare-only]');
}
if (host === 'claude-code' && !prepareOnly) throw Error('This initial execution authorizes Claude Code preparation only');
const hash = value => createHash('sha256').update(value).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
async function manifest(dir, prefix = '') {
  const result = [];
  for (const entry of (await readdir(join(dir, prefix), {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await manifest(dir,path));
    else if (entry.isFile()) result.push({path,sha256:hash(await readFile(join(dir,path)))});
  }
  return result;
}
const scenarios = JSON.parse(await readFile(join(root,'skills/tests/scenarios.json'),'utf8')).scenarios.filter(x=>!selected || x.id===selected);
if (!scenarios.length) throw Error('Unknown scenario');
const globalTargets = [];
for (const path of [join(homedir(),'.agents/skills/viewstem'),join(homedir(),'.codex/skills/viewstem'),join(homedir(),'.claude/skills/viewstem')]) {
  if (await exists(path)) globalTargets.push(path);
}
if (host === 'codex' && globalTargets.some(x=>!x.includes('/.claude/'))) throw Error(`Baseline would contain an installed Viewstem skill: ${globalTargets.join(', ')}`);
const environment = {
  host,cli: host==='codex' ? execFileSync('codex',['--version'],{encoding:'utf8'}).trim() : 'not_run',
  model: host==='codex' ? 'gpt-6.1-terra' : null,effort: host==='codex' ? 'high' : null,
  maxSeconds:360,maxCommands:50,node:process.version,
  globalViewstemPaths:globalTargets,skillManifest:await manifest(skill),
  isolation:'fresh ephemeral session in external app; workspace-write; same unrelated personal skills; no filesystem read-isolation claim',
  forbiddenReads:'source repository src/docs/test fixtures and evaluator implementation; inspect traces before scoring'
};
await mkdir(join(workspace,'runs'),{recursive:true});
await writeFile(join(workspace,`${host}-environment.json`),JSON.stringify(environment,null,2)+'\n');
const prefix = `Work only in this consumer app. Edit files under src/ and keep mountApp's public signature. Read installed package README/types/support data and an available skill as needed. Do not read the Viewstem source checkout, evaluator implementation, other runs, private user files, or browse the web. Do not install dependencies or edit package.json, tsconfig.json, bootstrap.ts, or the checker. The supplied npm run check and npm run build commands may use maintainer tooling outside this app; execute those commands without inspecting that tooling. Keep to at most 50 command calls and 6 minutes. Report changes, checks actually run, and remaining limitations.\n\n`;
const frozenSkill = join(workspace,'skill-snapshots',hash(JSON.stringify(environment.skillManifest)) + '-' + host + '-' + (selected ?? 'all') + '-' + arms.join(''));
await mkdir(dirname(frozenSkill),{recursive:true});
if(!await exists(frozenSkill))await cp(skill,frozenSkill,{recursive:true});
const results = [];
for (const scenario of scenarios) for (const arm of arms) {
  const id = `${host}-${scenario.id}-${arm}`;
  const destination = join(workspace,'runs',id);
  if (await exists(destination)) throw Error(`Refusing to overwrite existing run ${destination}`);
  await cp(join(workspace,'baseline'),destination,{recursive:true,mode:constants.COPYFILE_FICLONE});
  const pkg = JSON.parse(await readFile(join(destination,'package.json'),'utf8'));
  for (const name of ['check','build']) pkg.scripts[name]=`node ${shellQuote(join(root,'skills/tests/consumer.mjs'))} ${name} --project ${shellQuote(destination)}`;
  await writeFile(join(destination,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  let installedSkill = null;
  if (arm !== 'A') {
    installedSkill = join(destination,host==='codex'?'.agents/skills/viewstem':'.claude/skills/viewstem');
    await cp(frozenSkill,installedSkill,{recursive:true});
  }
  const protectedFiles = ['package.json','package-lock.json','tsconfig.json','index.html','bootstrap.ts'];
  const protectedBefore = Object.fromEntries(await Promise.all(protectedFiles.map(async name=>[name,hash(await readFile(join(destination,name)))])));
  const prompt = prefix + scenario.prompt;
  await writeFile(join(destination,'prompt.txt'),prompt);
  const cliArgs = host==='codex' ? ['--no-daemon','-a','never','exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','workspace-write','--model','gpt-6.1-terra','-c','model_reasoning_effort="high"','--json','--cd',destination,'-'] : ['--print','--output-format','stream-json','--verbose','--no-session-persistence'];
  await writeFile(join(destination,'invocation.json'),JSON.stringify({command:host==='codex'?'codex':'claude',args:cliArgs,cwd:destination,prompt:'prompt.txt',promptDelivery:'stdin',requiresAuthentication:true,model:environment.model,configurationRequired:host==='claude-code'?['Verify installed CLI flags and version','Pin model and effective settings for both arms','Verify baseline discovery paths and apply the same execution budget']:[],execute:!prepareOnly},null,2)+'\n');
  const record = {id,host,scenario:scenario.id,arm,project:destination,promptSha256:hash(prompt),skillPath:installedSkill,skillManifest:installedSkill?environment.skillManifest:null,status:prepareOnly?'not_run':'running'};
  if (prepareOnly) {
    record.reason='user_requested_preparation_only';
  } else {
    const start=Date.now(); let log='',pending='',commands=0,stopReason=null;
    const child=spawn('codex',cliArgs,{cwd:destination,stdio:['pipe','pipe','pipe']});
    const stop = reason => { if(stopReason)return;stopReason=reason;child.kill('SIGTERM');setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');},2000).unref(); };
    const timer=setTimeout(()=>stop('wall_time_limit'),environment.maxSeconds*1000);
    child.stdout.on('data',data=>{
      const text=data.toString();log+=text;pending+=text;
      const lines=pending.split('\n');pending=lines.pop();
      for(const line of lines)try{const event=JSON.parse(line);if(event.type==='item.started'&&event.item?.type==='command_execution'&&++commands>environment.maxCommands)stop('command_limit');}catch{}
    });
    child.stderr.on('data',data=>{log+=data.toString();});
    child.stdin.end(prompt);
    const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});clearTimeout(timer);
    await writeFile(join(destination,'trace.jsonl'),log);
    const events=log.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
    const completed=events.filter(x=>x.type==='item.completed').map(x=>x.item);
    const commandItems=completed.filter(x=>x.type==='command_execution');
    const candidateRead=installedSkill && commandItems.some(x=>String(x.command).includes('SKILL.md')&&(String(x.command).includes('viewstem')||String(x.aggregated_output).includes('# Viewstem consumer apps')));
    Object.assign(record,{status:code===0&&!stopReason?'completed':'incomplete',exitCode:code,stopReason,wallSeconds:(Date.now()-start)/1000,commandCalls:commands,completedCommands:commandItems.length,usage:events.findLast(x=>x.type==='turn.completed')?.usage??null,skillReadObserved:Boolean(candidateRead),finalResponse:completed.filter(x=>x.type==='agent_message').at(-1)?.text??null,traceSha256:hash(log)});
    const checkStart=Date.now();
    const check=spawn(process.execPath,[join(root,'skills/tests/consumer.mjs'),'check','--project',destination,'--scenario',scenario.id],{cwd:destination,stdio:['ignore','pipe','pipe']});
    let checkLog='';check.stdout.on('data',d=>checkLog+=d);check.stderr.on('data',d=>checkLog+=d);
    const checkTimer=setTimeout(()=>check.kill('SIGTERM'),120000);
    record.checkExitCode=await new Promise((done,reject)=>{check.once('error',reject);check.once('close',done);});clearTimeout(checkTimer);
    await writeFile(join(destination,'check.log'),checkLog);
    record.checkSeconds=(Date.now()-checkStart)/1000;
    record.verification=await exists(join(destination,'verification.json'))?JSON.parse(await readFile(join(destination,'verification.json'),'utf8')):null;
    record.sourceManifest=await manifest(join(destination,'src'));
    record.protectedFileChanges=[];
    for(const name of protectedFiles)if(hash(await readFile(join(destination,name)))!==protectedBefore[name])record.protectedFileChanges.push(name);
  }
  results.push(record);
  await writeFile(join(destination,'result.json'),JSON.stringify(record,null,2)+'\n');
  await writeFile(join(workspace,`${host}-${selected??'all'}-${arms.join('')}-results.json`),JSON.stringify({environment,results},null,2)+'\n');
  console.log(JSON.stringify({id:record.id,status:record.status,passed:record.verification?.ok??null,skillRead:record.skillReadObserved??null,seconds:record.wallSeconds??null}));
}
