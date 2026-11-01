import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { Temporal } from '@js-temporal/polyfill';
import { Environment, evaluate } from '@marcbachmann/cel-js';
import { isCelError } from '@bufbuild/cel';
import { normalize, acceptDirect, normalizeDate, localInstant, fromCelInteger, ajv } from './values.mjs';
import { probeSchemas, profileGuard } from './schema-probe.mjs';
import { probeCel, engines, encode } from './cel-probe.mjs';

const rows=[];
function record(group,id,expected,actual,detail={}) {
  let matches=true;
  try { assert.deepStrictEqual(actual,expected); } catch { matches=false; }
  rows.push({group,id,expected,actual,matches,...detail});
}
function test(id,expected,fn) {
  let actual;
  try { actual=fn(); } catch(e) { actual={unexpectedError:e.message}; }
  record('adapter',id,expected,actual);
}
function rejects(id,fn) { test(id,true,()=>{try {fn();return false;}catch{return true;}}); }

await probeSchemas(record);
await probeCel(record);

for (const [name,value] of [['undefined',undefined],['NaN',NaN],['Infinity',Infinity],['negative-Infinity',-Infinity],
  ['bigint',1n],['symbol',Symbol()],['function',()=>1],['promise',Promise.resolve(1)],
  ['weak-map',new WeakMap()],['weak-set',new WeakSet()],['date-object',new Date(0)]]) {
  rejects(`value/${name}`,()=>normalize(value));
  rejects(`nested/${name}`,()=>normalize([value]));
}
test('object/omit-undefined', '{"nested":{},"nullable":null}',()=>JSON.stringify(normalize({x:undefined,nested:{x:undefined},nullable:null})));
test('object/source-preserved',true,()=>{const x={v:undefined,n:-0};normalize(x);return Object.hasOwn(x,'v')&&Object.is(x.n,-0)&&!Object.isFrozen(x);});
rejects('array/hole',()=>normalize(Array(1)));
rejects('set/undefined',()=>normalize(new Set([undefined])));
rejects('map/undefined',()=>normalize(new Map([['x',undefined]])));
rejects('map/null-key',()=>normalize(new Map([[null,1]])));
rejects('map/nan-key',()=>normalize(new Map([[NaN,1]])));
test('set/identity',2,()=>normalize(new Set([{x:-0},{x:0}])).size);
test('map/key-distinction', ['number','string','fraction'],()=>{
  const m=normalize(new Map([[1,'number'],['1','string'],[1.5,'fraction']]));return [m.get(1),m.get('1'),m.get(1.5)];
});
for(const name of ['object','array','set','map']) rejects(`cycle/${name}`,()=>{
  const x=name==='object'?{}:name==='array'?[]:name==='set'?new Set():new Map();
  if(name==='object')x.self=x;else if(name==='array')x.push(x);else if(name==='set')x.add(x);else x.set('self',x);
  normalize(x);
});
test('graph/shared-noncycle',true,()=>{const a={x:1};const b=normalize([a,a]);return b.length===2&&b[0]===b[1]&&b[0]!==a;});
test('number/minus-zero',false,()=>Object.is(normalize(-0),-0));
test('number/no-rounding',0.30000000000000004,()=>acceptDirect(0.1+0.2,{type:'number'}));
test('number/large-double',1e100,()=>acceptDirect(1e100,{type:'number'}));
for(const n of [-9007199254740991,0,9007199254740991]) test(`integer/${n}`,n,()=>acceptDirect(n,{type:'integer'}));
for(const n of [-9007199254740992,9007199254740992,1.5,'42']) rejects(`integer/reject-${n}`,()=>acceptDirect(n,{type:'integer'}));
rejects('integer/nested-unsafe',()=>acceptDirect({n:9007199254740992},{type:'object',properties:{n:{type:'integer'}}}));
rejects('integer/result-unsafe',()=>fromCelInteger(9007199254740992n));
rejects('set/invalid-item',()=>acceptDirect(new Set([1,'2']),{'x-viewstem-type':'set',items:{type:'number'}}));
test('set/typed-size',2,()=>acceptDirect(new Set([1,2]),{'x-viewstem-type':'set',items:{type:'integer'},minItems:2}).size);
test('map/typed-value',0,()=>acceptDirect(new Map([[1.5,-0]]),{'x-viewstem-type':'map',keys:{type:'number'},values:{type:'integer'}}).get(1.5));
test('date/nullable',null,()=>acceptDirect(null,{anyOf:[{'x-viewstem-type':'date'},{type:'null'}]}));

for(const [id,kind,input,expected] of [
  ['date','date','2026-10-29','2026-10-29'],['leap-date','date','2024-02-29','2024-02-29'],
  ['time','time','09:30','09:30:00.000'],['time-fraction','time','09:30:01.1','09:30:01.100'],
  ['datetime','datetime','2026-10-29T09:30:00+09:00','2026-10-29T00:30:00.000Z'],
  ['early-year','datetime','0001-01-01T00:00:00Z','0001-01-01T00:00:00.000Z'],
]) test(`date/${id}`,expected,()=>normalizeDate(input,kind));
for(const [kind,input] of [['date','2026-02-29'],['date','0000-01-01'],['time','24:00'],['time','09:30:00.1234'],
  ['datetime','2026-02-30T00:00:00Z'],['datetime','2026-10-29T09:30:00'],
  ['datetime','2026-10-29T09:30:00-00:00'],['datetime','2026-10-29T09:30:60Z'],
  ['datetime','0001-01-01T00:00:00+01:00']]) rejects(`date/reject-${input}`,()=>normalizeDate(input,kind));
test('date/same-instant',true,()=>normalizeDate('2026-10-29T09:30:00+09:00','datetime')===normalizeDate('2026-10-29T00:30:00Z','datetime'));
test('date/ordinary-string','2026-02-30',()=>acceptDirect('2026-02-30',{type:'string'}));
test('date/json-roundtrip','2026-10-29',()=>normalizeDate(JSON.parse(JSON.stringify(normalizeDate('2026-10-29','date'))),'date'));
test('date/seoul','2026-10-29T00:30:00.000Z',()=>localInstant('2026-10-29','09:30','Asia/Seoul'));
rejects('date/missing-zone',()=>localInstant('2026-10-29','09:30'));
rejects('date/invalid-zone',()=>localInstant('2026-10-29','09:30','Invalid/Zone'));
rejects('date/dst-gap',()=>localInstant('2026-03-08','02:30','America/New_York'));
rejects('date/dst-overlap',()=>localInstant('2026-11-01','01:30','America/New_York'));
test('date/calendar-day-not-24h',23,()=>{
  const t=Temporal.ZonedDateTime.from('2026-03-08T00:00:00[America/New_York]');
  return (t.add({days:1}).epochMilliseconds-t.epochMilliseconds)/3600000;
});
test('date/ambient-zone-independent',true,()=>{
  const original=process.env.TZ;const out=[];
  try {for(const zone of ['UTC','America/Los_Angeles','Asia/Seoul']){process.env.TZ=zone;out.push(localInstant('2026-10-29','09:30','Asia/Seoul'));}}
  finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
  return new Set(out).size===1;
});

for(const [name,schema] of [
  ['format',{type:'string',format:'date'}],['unknown',{type:'string',typo:1}],
  ['external-ref',{$ref:'https://example.invalid/schema'}],['cycle',{$defs:{x:{$ref:'#/$defs/x'}},$ref:'#/$defs/x'}],
  ['dynamic',{$dynamicRef:'#x'}],['multiple-of',{multipleOf:2}],
]) rejects(`profile/${name}`,()=>profileGuard(schema));
// Show why a raw validator is insufficient even when its JSON cases pass.
record('raw-gap','ajv/unsafe-integer',false,ajv.validate({type:'integer'},9007199254740992));
record('raw-gap','ajv/unknown-extension',false,ajv.validate({'x-viewstem-type':'set'},'not a set'));

for(const [engine,fn] of Object.entries(engines)) for(const state of ['missing','pending','error']) {
  for(const flag of [false,true]) {
    let reads=0;const context={flag};
    Object.defineProperty(context,'x',{enumerable:true,get(){reads++;throw Error(`READINESS_${state}`);}});
    let result;
    try{const value=fn('flag ? x : 7',context);result=isCelError(value)?'blocked':encode(value);}
    catch{result='blocked';}
    record('readiness',`${engine}/${state}/${flag}`,flag?'blocked':{type:'int',value:'7'},result,{reads});
    record('readiness-access',`${engine}/${state}/${flag}`,flag?1:0,reads);
  }
}
test('limit/marc-parse',false,()=>new Environment({limits:{maxAstNodes:10}}).check(Array(30).fill('1').join('+')).valid);

async function boundedWorker(engine) {
  const start=performance.now();
  const worker=new Worker(new URL('./limit-worker.mjs',import.meta.url),{workerData:{engine},resourceLimits:{maxOldGenerationSizeMb:128}});
  return new Promise((resolve)=>{
    let timer,settled=false,started;
    const watchdog=setTimeout(()=>finish({kind:'startup-timeout'}),30000);
    async function finish(out) {
      if(settled)return;settled=true;clearTimeout(timer);clearTimeout(watchdog);
      await worker.terminate();
      resolve({...out,elapsedMs:Math.round(performance.now()-start),
        startupMs:started===undefined?null:Math.round(started-start),
        executionMs:started===undefined?null:Math.round(performance.now()-started),terminated:true});
    }
    worker.on('message',m=>{
      if(m.kind==='ready')worker.postMessage('go');
      else if(m.kind==='started'){
        started=performance.now();clearTimeout(watchdog);
        timer=setTimeout(()=>finish({kind:'deadline',budgetMs:200}),200);
      }
      else finish(m);
    });
    worker.on('error',e=>finish({kind:'worker-error',message:e.message}));
    worker.on('exit',code=>{if(!settled)finish({kind:'unexpected-exit',code});});
  });
}
for(const engine of ['marc','buf','schema-regex']) {
  const result=await boundedWorker(engine);
  record('containment',engine,'deadline',result.kind,result);
}

const root=fileURLToPath(new URL('.',import.meta.url));
const dart=spawnSync('dart',['run','bin/probe.dart','../fixtures/cel.json','../results/dart.json'],{cwd:root+'dart',encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
if(dart.status!==0)throw Error(`Dart probe did not complete: ${dart.error?.message??dart.stderr}`);
const dartReport=JSON.parse(await readFile(new URL('./results/dart.json',import.meta.url),'utf8'));
for(const row of dartReport.rows)record(row.group,row.id,row.expected,row.actual,{expression:row.expression,detail:row.detail});
const summary={};
for(const row of rows){const s=summary[row.group]??={matched:0,total:0};s.total++;if(row.matches)s.matched++;}
const sourceSha256 = {};
for (const name of ['run.mjs', 'values.mjs', 'schema-profile.mjs', 'schema-probe.mjs', 'cel-probe.mjs', 'limit-worker.mjs',
  'fixtures/cel.json', 'package.json', 'package-lock.json', 'dart/bin/probe.dart', 'dart/pubspec.yaml', 'dart/pubspec.lock']) {
  sourceSha256[name] = createHash('sha256').update(await readFile(new URL(name, import.meta.url))).digest('hex');
}
const report={scope:'T1 bounded experiment; NOT core/StateStore/full conformance',sourceSha256,node:process.version,
  platform:`${process.platform}/${process.arch}`,icu:process.versions.icu,tz:process.versions.tz,
  dart:dartReport.runtime,packages:JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8')).dependencies,
  summary,rows};
await writeFile(new URL(`./results/${process.argv[2] ?? 'latest.json'}`,import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
for(const row of rows.filter(x=>!x.matches))console.log(`MISMATCH ${row.group} ${row.id}: ${JSON.stringify(row.actual)}`);
// Candidate mismatches are measured outcomes, never silently repaired.
// Only our prototype/boundary assertions and real containment must all pass.
const failures=rows.filter(x=>!x.matches&&['adapter','schema-mutation','containment'].includes(x.group));
if(failures.length){console.error('Experiment assertion failures:',failures.map(x=>x.id));process.exitCode=1;}
