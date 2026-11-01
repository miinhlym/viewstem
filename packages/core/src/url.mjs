import { compileSchema, equal } from './schema.mjs';
import { fail, safeError } from './errors.mjs';
const adapterOwners = new WeakMap();
const connectionTokens = new WeakMap();
const defaults = {maxOwnedBytes:8192,maxValueBytes:4096,maxItems:1000,maxKeys:128};
const bytes = value => new TextEncoder().encode(value).length;
const parts = href => new URL(href,'http://viewstem.invalid').search.slice(1).split('&').filter(Boolean).map(raw=>{
  const [key,value]=[...new URLSearchParams(raw)][0]??['',''];
  return {raw,key,value,encodedValue:raw.includes('=')?raw.slice(raw.indexOf('=')+1):''};
});
export function mergeOwnedUrl(href,patch) {
  const url=new URL(href,'http://viewstem.invalid'),changes=new Map(Object.entries(patch)),existing=parts(href);
  for(const [key,value] of changes){const found=existing.filter(p=>p.key===key);if(value===null?found.length===0:found.length===1&&found[0].value===value)changes.delete(key);}
  const retained=existing.filter(p=>!changes.has(p.key)).map(p=>p.raw);
  for(const [key,value] of changes)if(value!==null)retained.push(new URLSearchParams([[key,value]]).toString());
  url.search=retained.join('&');return url.href;
}
function profile(plan) {
  const types=plan.types.filter(kind=>kind!=='null');
  if(types.length!==1)fail('INVALID_DEFINITION');
  const kind=types[0];
  if(['string','number','boolean'].includes(kind))return kind;
  if(!['array','set'].includes(kind))fail('INVALID_DEFINITION');
  const child=kind==='array'?plan.items:plan.setItems;
  if(!child || child.types.length!==1 || !['string','number'].includes(child.types[0]) || plan.prefix.length)fail('INVALID_DEFINITION');
  return kind;
}
export function prepareStateUrl(store,{adapter,bindings,limits:custom={}}={},replacing) {
  if(!adapter || ['read','subscribe','writeOwned'].some(key=>typeof adapter[key]!=='function') || !Array.isArray(bindings))fail('INVALID_DEFINITION');
  const limits={...defaults,...custom};
  for(const [key,value] of Object.entries(limits))if(!(key in defaults)||!Number.isSafeInteger(value)||value<1)fail('INVALID_DEFINITION');
  if(bindings.length>limits.maxKeys)fail('LIMIT_EXCEEDED');
  const keys=new Set(),targets=new Set();
  const prepared=bindings.map(binding=>{
    const contract=store.contract(binding.target);if(!contract.writable)fail('TYPE_MISMATCH');
    const key=binding.key??`p.${binding.target.address.name}`,address=JSON.stringify(binding.target.address);
    if(typeof key!=='string'||keys.has(key)||targets.has(address))fail('INVALID_DEFINITION');keys.add(key);targets.add(address);
    const history=binding.history??'replace';if(!['push','replace'].includes(history))fail('INVALID_DEFINITION');
    const validator=compileSchema(contract.schema),kind=profile(validator.plan);
    return {...binding,key,history,kind,validator,baseline:store.baseline(binding.target)};
  });
  const claims=adapterOwners.get(adapter)??new Map();
  for(const key of keys)if(claims.has(key)&&claims.get(key)!==connectionTokens.get(replacing))fail('INVALID_DEFINITION');
  return {prepared,keys,limits,claims};
}
export function connectStateUrl(store,{adapter,bindings,limits:custom={},restore=true,onError=()=>{}}={},onDispose=()=>{}) {
  const {prepared,keys,limits,claims}=prepareStateUrl(store,{adapter,bindings,limits:custom});
  const token={};
  for(const key of keys)claims.set(key,token);adapterOwners.set(adapter,claims);
  let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});
  let initialized=prepared.every(binding=>binding.baseline.status!=='pending');
  let alive=true,revision=0,restoring=false,firstRestore=true,restorePending=restore;
  const initialPending=new Set(prepared.filter(binding=>binding.baseline.status==='pending').map(binding=>binding.target));
  let restoreSnapshots=new Map();
  const dirty=new Map(),diagnostics=[];
  const report=(caught,kind,key)=>{const item=Object.freeze({...safeError(caught,'TYPE_MISMATCH'),kind,...(key===undefined?{}:{key})});diagnostics.push(item);try{onError(item);}catch{}};
  const limitOutput=patch=>{
    const owned=parts(mergeOwnedUrl(adapter.read(),patch)).filter(part=>keys.has(part.key));
    if(bytes(owned.map(part=>part.raw).join('&'))>limits.maxOwnedBytes || owned.some(part=>bytes(part.encodedValue)>limits.maxValueBytes))fail('LIMIT_EXCEEDED');
  };
  const writeDirty=()=>{
    if(!alive||!initialized||restoring||!dirty.size)return;
    const current=++revision,isCurrent=()=>alive&&revision===current;
    const patch=Object.fromEntries([...dirty].map(([key,item])=>[key,item.value]));
    const mode=[...dirty.values()].some(item=>item.history==='push')?'push':'replace';
    try{
      if([...dirty.values()].some(item=>item.count>limits.maxItems))fail('LIMIT_EXCEEDED');limitOutput(patch);
      Promise.resolve(adapter.writeOwned(patch,{mode,isCurrent})).then(result=>{if(isCurrent()&&result?.applied!==false)dirty.clear();},caught=>{if(isCurrent())report(caught,'write');});
    }catch(caught){report(caught,'write');}
  };
  const applyRestore=()=>{
    const all=parts(adapter.read()),owned=all.filter(part=>keys.has(part.key));
    const tooLarge=bytes(owned.map(part=>part.raw).join('&'))>limits.maxOwnedBytes;
    const entries=prepared.map(binding=>{
      if(firstRestore&&(dirty.has(binding.key)||initialPending.has(binding.target)&&store.hasWritten(binding.target)))return [binding.target,binding.target.snapshot()];
      const found=owned.filter(part=>part.key===binding.key);let snapshot=binding.baseline;
      if(snapshot.status==='pending')snapshot={status:'missing'};
      if(found.length)try{
        if(tooLarge||found.some(part=>bytes(part.encodedValue)>limits.maxValueBytes))fail('LIMIT_EXCEEDED');
        if(found.length!==1)fail('TYPE_MISMATCH');
        let value=JSON.parse(found[0].value);
        if(Array.isArray(value)&&value.length>limits.maxItems)fail('LIMIT_EXCEEDED');
        if(binding.kind==='set'&&Array.isArray(value))value=new Set(value);
        snapshot={status:'ready',value:binding.validator.accept(value)};
      }catch(caught){report(caught,'restore',binding.key);}
      return [binding.target,snapshot];
    });
    // Transaction notifications may arrive after restore() returns. Keep the
    // expected snapshots until their notification, while allowing reentrant writes.
    firstRestore=false;restoreSnapshots=new Map(entries);restoring=true;
    try{store.restore(entries);}finally{restoring=false;}
    readyResolve();
  };
  const initialize=()=>{
    if(!alive||initialized)return;
    for(const binding of prepared)binding.baseline=store.baseline(binding.target);
    initialized=prepared.every(binding=>binding.baseline.status!=='pending');
    if(!initialized)return;
    if(restorePending)applyRestore();else{firstRestore=false;readyResolve();}
    writeDirty();
  };
  const restoreNow=()=>{
    if(!alive)return;++revision;dirty.clear();restorePending=true;
    if(!initialized)initialize();else{applyRestore();writeDirty();}
  };
  const stopUrl=adapter.subscribe(restoreNow);
  const stopBaseline=store.observeBaseline(initialize);
  const stopStore=store.subscribe(prepared.map(b=>b.target.address),payload=>{
    if(!alive||!payload.changes.length)return;
    if(!restoring)++revision;
    const changed=new Set(payload.changes.map(change=>JSON.stringify([change.target.scopeId,change.target.name])));
    for(const binding of prepared)if(changed.has(JSON.stringify([binding.target.address.scopeId,binding.target.address.name]))){
      const snapshot=payload.states[JSON.stringify([binding.target.address.scopeId,binding.target.address.name])];
      if(!snapshot||snapshot.status==='pending')continue;
      const restored=restoreSnapshots.get(binding.target);
      restoreSnapshots.delete(binding.target);
      if(restored&&snapshot.status===restored.status&&(snapshot.status==='ready'?equal(snapshot.value,restored.value):snapshot.status!=='error'||snapshot.error.code===restored.error.code))continue;
      // Initial settlement is not a user change. Retain explicit/reaction changes
      // until every baseline is ready, including writes to already-ready bindings.
      const baseline=store.baseline(binding.target),wasPending=initialPending.has(binding.target);
      if(baseline.status!=='pending')initialPending.delete(binding.target);
      if((!initialized||wasPending)&&snapshot===baseline&&!store.hasWritten(binding.target))continue;
      const value=snapshot.status==='ready'?snapshot.value:undefined;
      const count=value instanceof Set?value.size:Array.isArray(value)?value.length:0;
      dirty.set(binding.key,{value:value===undefined?null:JSON.stringify(value instanceof Set?[...value]:value),count,history:dirty.get(binding.key)?.history==='push'?'push':binding.history});
    }
    writeDirty();
  });
  if(initialized){if(restore)applyRestore();else{firstRestore=false;readyResolve();}writeDirty();}
  const connection=Object.freeze({ready,isReady:()=>initialized,restore:restoreNow,diagnostics:()=>[...diagnostics],
    async removeOwned(selected=prepared.map(b=>b.target)){
      const selectedKeys=prepared.filter(b=>selected.includes(b.target)).map(b=>b.key);const current=++revision;
      dirty.clear();try{return await adapter.writeOwned(Object.fromEntries(selectedKeys.map(key=>[key,null])),{mode:'replace',isCurrent:()=>alive&&revision===current});}catch(caught){if(alive&&revision===current)report(caught,'replace-cleanup');return {applied:false};}
    },
    dispose(){if(!alive)return;alive=false;++revision;dirty.clear();stopStore();stopUrl();stopBaseline();for(const key of keys)if(claims.get(key)===token)claims.delete(key);readyResolve();onDispose();}
  });
  connectionTokens.set(connection,token);return connection;
}
