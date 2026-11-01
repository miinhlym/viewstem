import { readFile } from 'node:fs/promises';
import { evaluate, Environment } from '@marcbachmann/cel-js';
import { run, isCelError, isCelList, isCelMap, isCelUint, celEnv, parse, plan } from '@bufbuild/cel';
import { toCelInteger, fromCelInteger, normalizeDate, SetView, MapView } from './values.mjs';

export function decode(v) {
  switch (v.type) {
    case 'int': return BigInt(v.value);
    case 'list': return v.value.map(decode);
    case 'object': return Object.fromEntries(Object.entries(v.value).map(([k,v])=>[k,decode(v)]));
    case 'map': return new Map(v.value.map(([k,v])=>[decode(k),decode(v)]));
    default: return v.value;
  }
}
export function encode(v) {
  if (isCelError(v)) return {type:'error'};
  if (v === null) return {type:'null'};
  if (typeof v === 'bigint') return {type:'int',value:String(v)};
  if (typeof v === 'number') return {type:'double',value:Number.isFinite(v)?v:String(v)};
  if (typeof v === 'boolean') return {type:'bool',value:v};
  if (typeof v === 'string') return {type:'string',value:v};
  if (isCelUint(v) || v?.constructor?.name === 'UnsignedInt') return {type:'uint',value:String(v.value ?? v)};
  if (Array.isArray(v) || isCelList(v)) return {type:'list',value:[...v].map(encode)};
  if (v instanceof Map || isCelMap(v)) return {type:'map',value:[...v].map(([k,v])=>[encode(k),encode(v)])};
  return {type:'unsupported',name:v?.constructor?.name};
}
export const engines = {marc:evaluate,buf:run};
export async function probeCel(record) {
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/cel.json',import.meta.url),'utf8'));
  for (const f of fixtures) for (const [name,fn] of Object.entries(engines)) {
    let observed,detail;
    try {
      const value = fn(f.expression,Object.fromEntries(Object.entries(f.bindings).map(([k,v])=>[k,decode(v)])));
      observed = encode(value);
      if (isCelError(value)) detail = value.message;
    } catch(e) { observed={type:'error'}; detail=e.message.slice(0,300); }
    record('cel',`${name}/${f.id}`,f.expected,observed,{expression:f.expression,detail});
  }
  // Pure registration must catch unknown functions, without executing them.
  for (const expr of ['unknownFn(1)','1+"a"','missing+1']) {
    record('registration',`marc/${expr}`,true,!new Environment().check(expr).valid);
    let rejected=false;
    try { plan(celEnv(),parse(expr)); } catch { rejected=true; }
    record('registration',`buf/${expr}`,true,rejected);
  }
  // Direct native input is deliberately a separate capability experiment.
  for (const [id,expression,bindings,expected] of [
    ['set','size(s)',{s:new Set([{x:1},{x:1}])},{type:'int',value:'2'}],
    ['fractional-map','m[1.5]',{m:new Map([[1.5,'kept']])},{type:'string',value:'kept'}],
  ]) for (const [name,fn] of Object.entries(engines)) {
    let observed;
    try { observed=encode(fn(expression,bindings)); } catch { observed={type:'error'}; }
    record('native-raw',`${name}/${id}`,expected,observed);
  }
  const env = new Environment()
    .registerType('ViewstemSet',SetView).registerType('ViewstemMap',MapView)
    .registerVariable('s','ViewstemSet').registerVariable('m','ViewstemMap').registerVariable('entry','map')
    .registerFunction('setSize(ViewstemSet): int',s=>BigInt(s.value.size))
    .registerFunction('setHas(ViewstemSet, dyn): bool',(s,x)=>s.value.has(x))
    .registerFunction('mapGet(ViewstemMap, double): string',(m,k)=>m.value.get(k))
    .registerFunction('mapGet(ViewstemMap, string): string',(m,k)=>m.value.get(k))
    .registerFunction('checkedDatetime(string): string',s=>normalizeDate(s,'datetime'));
  const s=new SetView(new Set([{x:1},{x:1}]));
  const m=new MapView(new Map([[1.5,'number'],['1.5','string']]));
  for (const [expression,expected] of [['setSize(s)',2n],['mapGet(m,1.5)','number'],['mapGet(m,"1.5")','string']]) {
    record('adapter',`opaque/${expression}`,encode(expected),encode(env.evaluate(expression,{s,m})));
  }
  const item={x:1};const identitySet=new SetView(new Set([item]));
  for (const [label,entry,expected] of [['same-reference',item,true],['same-content',{x:1},false]]) {
    record('adapter',`opaque/${label}`,expected,env.evaluate('setHas(s,entry)',{s:identitySet,entry}));
  }
  record('adapter','pure-date-function', '2026-10-29T00:30:00.000Z',
    env.evaluate('checkedDatetime("2026-10-29T09:30:00+09:00")'));
  let invalidDateRejected=false;
  try { env.evaluate('checkedDatetime("2026-02-30T00:00:00Z")'); } catch { invalidDateRejected=true; }
  record('adapter','pure-date-function-invalid',true,invalidDateRejected);
  for (const [name,fn] of Object.entries(engines)) {
    record('adapter',`${name}/integer-roundtrip`,3,fromCelInteger(fn('n+1',{n:toCelInteger(2)})));
  }
}
