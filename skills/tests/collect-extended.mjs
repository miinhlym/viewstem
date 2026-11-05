import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2);
const option=(key,fallback)=>args.includes(`--${key}`)?args[args.indexOf(`--${key}`)+1]:fallback;
const workspace=resolve(option('workspace'));
const output=option('output',join(root,'skills/tests/extended-results.json'));
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const sha=data=>createHash('sha256').update(data).digest('hex');
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
const initial=await readJson(join(root,'skills/tests/behavior-results.json'));
const runs=initial.runs.filter(r=>['first-view','native'].includes(r.scenario)&&['A','B2'].includes(r.arm)).map(r=>({...r,round:1,expectedSkill:true,origin:'reused_initial'}));
const pending=[];
const claude=[];
for(const name of (await readdir(join(workspace,'runs'))).sort()){
  const path=join(workspace,'runs',name,'result.json');if(!await exists(path))continue;
  const record=await readJson(path);
  if(record.host==='claude-code'){claude.push(record);continue;}
  if(!record.verification){pending.push({id:record.id,status:record.status});continue;}
  runs.push({...record,origin:'extended'});
}
const manifest=[];
async function skillFiles(prefix='') {for(const entry of (await readdir(join(root,'skills/viewstem',prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(prefix,entry.name);if(entry.isDirectory())await skillFiles(path);else if(entry.isFile())manifest.push({path,sha256:sha(await readFile(join(root,'skills/viewstem',path)))});}}
await skillFiles();
const body=(await readFile(join(root,'skills/viewstem/SKILL.md'),'utf8')).replace(/^---\n[\s\S]*?\n---\n/,'').split('\n').map(s=>s.trim()).filter(s=>s.length>=40);
const summaries={};
for(const run of runs){
  const trace=await readFile(join(run.project,'trace.jsonl'),'utf8');
  if(sha(trace)!==run.traceSha256)throw Error(`Trace changed: ${run.id}`);
  for(const f of run.sourceFiles)if(sha(f.content)!==f.sha256||sha(await readFile(join(run.project,f.path)))!==f.sha256)throw Error(`Source changed: ${run.id}/${f.path}`);
  const commands=trace.split('\n').flatMap(line=>{try{const event=JSON.parse(line);return event.type==='item.completed'&&event.item?.type==='command_execution'?[event.item]:[];}catch{return[];}});
  const accesses=commands.filter(c=>String(c.command).includes('SKILL.md')&&(/viewstem/.test(c.command)||String(c.aggregated_output).includes('# Viewstem consumer apps')));
  run.originalSkillReadObserved=run.skillReadObserved;
  run.skillReadObserved=accesses.some(c=>c.exit_code===0&&body.some(line=>String(c.aggregated_output).includes(line)));
  run.skillAccesses=accesses.map(c=>({command:c.command,exitCode:c.exit_code,bodyOutputConfirmed:c.exit_code===0&&body.some(line=>String(c.aggregated_output).includes(line))}));
  run.otherSkillReads=commands.filter(c=>String(c.command).includes('SKILL.md')&&!/viewstem/.test(c.command)).map(c=>c.command);
  run.sourceCheckoutCommandMentions=commands.filter(c=>String(c.command).includes(root.replace(/\/$/,''))).map(c=>c.command);
  const regrade=join(workspace,'regrades',run.id+'.json');
  if(await exists(regrade))run.regrade=await readJson(regrade);
  run.effectiveVerification=run.regrade?.verification??run.verification;
  run.scopePass=!(run.protectedFileChanges?.length)&&run.skillFilesUnchanged!==false;
  run.functionalPass=run.status==='completed'&&run.effectiveVerification.ok===true&&run.scopePass;
  const key=run.scenario;
  summaries[key]??={};
  const sum=summaries[key][run.arm]??={runs:0,functionalPasses:0,skillReads:0,commands:0,wallSeconds:0,inputTokens:0,cachedInputTokens:0,outputTokens:0,commandOutputBytes:0};
  sum.runs++;sum.functionalPasses+=Number(run.functionalPass);sum.skillReads+=Number(run.skillReadObserved);sum.commands+=run.commandCalls??0;sum.wallSeconds+=run.wallSeconds??0;sum.inputTokens+=run.usage?.input_tokens??0;sum.cachedInputTokens+=run.usage?.cached_input_tokens??0;sum.outputTokens+=run.usage?.output_tokens??0;sum.commandOutputBytes+=run.commandOutputBytes??0;
}
const plan=await readJson(join(root,'skills/tests/extended-plan.json'));
const finished=new Set(runs.map(r=>`${r.scenario}/${r.arm}/${r.round}`));
const remaining=[];for(const scenario of plan.cases)for(const arm of plan.arms)for(let round=1;round<=plan.rounds;round++)if(!finished.has(`${scenario}/${arm}/${round}`))remaining.push({scenario,arm,round});
if(plan.refinement)for(const scenario of plan.refinement.affectedScenarios)for(let round=1;round<=plan.rounds;round++)if(!finished.has(`${scenario}/${plan.refinement.candidate}/${round}`))remaining.push({scenario,arm:plan.refinement.candidate,round});
const result={schemaVersion:1,date:'2026-11-05',status:remaining.length?'in_progress':'collected',workspace,plan,packages:initial.packages,finalSkillManifest:manifest,measurement:'Successful SKILL body output; path listing and failed reads are not activation. Functional grading plus separate semantic review. Tokens are native cumulative counters; cached input is included in input.',summaries,runs,pending,remaining,claudeCode:{status:'not_run',reason:'user_requested_preparation_only',modelInvoked:false,prepared:claude},manualReview:await exists(join(workspace,'manual-review.json'))?await readJson(join(workspace,'manual-review.json')):null,packaging:await exists(join(workspace,'packaging/verification.json'))?await readJson(join(workspace,'packaging/verification.json')):null};
if(await exists(join(workspace,'runtime-finding.json')))result.runtimeFinding=await readJson(join(workspace,'runtime-finding.json'));
if(await exists(join(workspace,'b3-static.json')))result.refinementStaticVerification=await readJson(join(workspace,'b3-static.json'));
if(await exists(join(workspace,'discovery-smoke/results.json')))result.codexDiscovery=await readJson(join(workspace,'discovery-smoke/results.json'));
if(await exists(join(workspace,'packaging/verification-B3.json')))result.finalPackaging=await readJson(join(workspace,'packaging/verification-B3.json'));
if(!remaining.length&&await exists(join(workspace,'final-assessment.json')))Object.assign(result,await readJson(join(workspace,'final-assessment.json')));
await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({completed:runs.length,passed:runs.filter(r=>r.functionalPass).length,pending:pending.length,summaries},null,2));
