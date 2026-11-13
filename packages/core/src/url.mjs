import { compileSchema, equal } from './schema.mjs';
import { error, fail, safeError } from './errors.mjs';
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
  for(const key of keys)if(claims.has(key)&&claims.get(key)!==connectionTokens.get(replacing)?.token)fail('INVALID_DEFINITION');
  return {prepared,keys,limits,claims};
}
export function reserveStateUrl(store, options, previous, isOpen = () => true) {
  const old = connectionTokens.get(previous);
  const next = options && prepareStateUrl(store, options, previous);
  const token = {};
  const reserved = new Map();
  if (old) reserved.set(old.claims, new Set(old.keys));
  if (next) {
    const keys = reserved.get(next.claims) ?? new Set();
    for (const key of next.keys) keys.add(key);
    reserved.set(next.claims, keys);
  }
  const release = () => {
    for (const [claims, keys] of reserved) for (const key of keys) if (claims.get(key) === token) claims.delete(key);
  };
  const controller = new AbortController();
  return {
    token, next, options, signal: controller.signal, isOpen,
    commit() {
      if (next) adapterOwners.set(options.adapter, next.claims);
      for (const [claims, keys] of reserved) for (const key of keys) claims.set(key, token);
      store.reserveUrl(this);
    },
    dispose() { controller.abort(); release(); store.releaseUrl(this); },
    finish() { release(); },
  };
}

export function connectStateUrl(store,{adapter,bindings,limits:custom={},restore=true,onError=()=>{},pendingWrites}={},onDispose=()=>{},reservation) {
  const {prepared,keys,limits,claims}=reservation?.next ?? prepareStateUrl(store,{adapter,bindings,limits:custom});
  const token={};
  for(const key of keys)claims.set(key,token);adapterOwners.set(adapter,claims);
  let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});
  let initialized=prepared.every(binding=>binding.baseline.status!=='pending');
  let alive=true,paused=false,revision=0,restoring=false,firstRestore=true,restorePending=restore;
  const open = () => alive && (reservation?.isOpen?.() ?? true);
  const check = () => { if (!open()) fail('CANCELLED'); };
  const initialPending=new Set(prepared.filter(binding=>binding.baseline.status==='pending').map(binding=>binding.target));
  let restoreSnapshots=new Map();
  const dirty=new Map(pendingWrites),diagnostics=[];
  const report=(caught,kind,key)=>{if (!(reservation?.isOpen?.() ?? true)) return;const item=Object.freeze({...safeError(caught,'TYPE_MISMATCH'),kind,...(key===undefined?{}:{key})});diagnostics.push(item);try{onError(item);}catch{}};
  const limitOutput=patch=>{
    const owned=parts(mergeOwnedUrl(adapter.read(),patch)).filter(part=>keys.has(part.key));
    if(bytes(owned.map(part=>part.raw).join('&'))>limits.maxOwnedBytes || owned.some(part=>bytes(part.encodedValue)>limits.maxValueBytes))fail('LIMIT_EXCEEDED');
  };
  const writeDirty=()=>{
    if(!open()||paused||!initialized||restoring||!dirty.size)return;
    const current=++revision,isCurrent=()=>open()&&!paused&&revision===current;
    const patch=Object.fromEntries([...dirty].map(([key,item])=>[key,item.value]));
    const mode=[...dirty.values()].some(item=>item.history==='push')?'push':'replace';
    try{
      if([...dirty.values()].some(item=>item.count>limits.maxItems))fail('LIMIT_EXCEEDED');limitOutput(patch);
      if (!isCurrent()) return;
      Promise.resolve(adapter.writeOwned(patch,{mode,isCurrent})).then(result=>{if(isCurrent()&&result?.applied!==false)dirty.clear();},caught=>{if(isCurrent())report(caught,'write');});
    }catch(caught){if(isCurrent())report(caught,'write');}
  };
  const applyRestore=()=>{
    const restoringRevision = revision;
    const isCurrent = () => open() && !paused && revision === restoringRevision;
    const all=parts(adapter.read()),owned=all.filter(part=>keys.has(part.key));
    check();
    if (!isCurrent()) return;
    const tooLarge=bytes(owned.map(part=>part.raw).join('&'))>limits.maxOwnedBytes;
    const entries=prepared.map(binding=>{
      if(firstRestore&&(dirty.has(binding.key)||initialPending.has(binding.target)&&store.hasWritten(binding.target)))return [binding.target,binding.target.getSnapshot()];
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
    if (!isCurrent()) return;
    firstRestore=false;restoreSnapshots=new Map(entries);restoring=true;
    try{check();store.restore(entries,isCurrent);}finally{restoring=false;}
    readyResolve();
  };
  const initialize=()=>{
    if(!open()||paused||initialized)return;
    for(const binding of prepared)binding.baseline=store.baseline(binding.target);
    initialized=prepared.every(binding=>binding.baseline.status!=='pending');
    if(!initialized)return;
    if(restorePending)applyRestore();else{firstRestore=false;readyResolve();}
    writeDirty();
  };
  const guardedInitialize = () => {
    try { initialize(); }
    catch (caught) {
      cleanup();
      onDispose();
      report(caught, 'connect');
    }
  };
  const restoreNow=()=>{
    if(!open()||paused)return;++revision;dirty.clear();restorePending=true;
    if(!initialized)guardedInitialize();
    else try { applyRestore(); writeDirty(); } catch (caught) { report(caught, 'restore'); }
  };
  const observeStore=payload=>{
    if(!open()||paused||!payload.changes.length)return;
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
  };
  let stopUrl, stopBaseline, stopStore;
  const cleanup = () => {
    if (!alive) return;
    alive = false;
    ++revision;
    dirty.clear();
    stopStore?.();
    try { stopUrl?.(); } catch (caught) { report(safeError(caught), 'cleanup'); }
    stopBaseline?.();
    for (const key of keys) if (claims.get(key) === token) claims.delete(key);
    readyResolve();
  };
  try {
    check();
    let subscribing = true;
    stopUrl = adapter.subscribe(() => { if (!subscribing || !reservation) restoreNow(); });
    subscribing = false;
    if (typeof stopUrl !== 'function') fail('INVALID_DEFINITION');
    check();
    stopBaseline = store.observeBaseline(guardedInitialize);
    stopStore = store.subscribe(prepared.map(binding => binding.target.address), observeStore);
    check();
    if(initialized){if(restore)applyRestore();else{firstRestore=false;readyResolve();}writeDirty();}
  } catch (caught) {
    cleanup();
    throw caught;
  }
  const connection=Object.freeze({ready,isReady:()=>initialized,restore:restoreNow,getDiagnostics:()=>[...diagnostics],
    pause() { paused = true; },
    suspend() { cleanup(); },
    cleanupOwned(reservation, timeout, clock) {
      const { signal } = reservation;
      return new Promise(resolve => {
        let active = true, timer;
        const set = clock ? clock.setTimeout.bind(clock) : setTimeout;
        const clear = clock ? clock.clearTimeout.bind(clock) : clearTimeout;
        const now = () => clock ? (typeof clock.now === 'function' ? clock.now() : clock.now) : Date.now();
        let deadline;
        const isCurrent = () => active && !signal.aborted && reservation.isOpen() && [...keys].every(key => claims.get(key) === reservation.token);
        const clearTimer = handle => { if (handle !== undefined) try { clear(handle); } catch {} };
        const finish = failure => {
          if (!active) return;
          active = false;
          clearTimer(timer);
          signal.removeEventListener('abort', cancel);
          resolve(failure);
        };
        const cancel = () => finish();
        const arm = () => {
          try {
            if (!isCurrent()) { cancel(); return; }
            const remaining = deadline - now();
            if (!isCurrent()) { cancel(); return; }
            if (remaining <= 0) finish(error('TIMEOUT'));
            else {
              const handle = set(arm, Math.min(remaining, 2_147_483_647));
              if (!isCurrent()) { clearTimer(handle); cancel(); }
              else timer = handle;
            }
          } catch (cause) { finish(safeError(cause)); }
        };
        if (!isCurrent()) { cancel(); return; }
        signal.addEventListener('abort', cancel, { once: true });
        try {
          deadline = now() + timeout;
          arm();
          if (!isCurrent()) { cancel(); return; }
          const patch = Object.fromEntries([...keys].map(key => [key, null]));
          Promise.resolve(adapter.writeOwned(patch, { mode: 'replace', isCurrent })).then(
            result => finish(result?.applied === false ? error('INTERNAL_ERROR') : undefined),
            caught => finish(safeError(caught)),
          );
        } catch (caught) { finish(safeError(caught)); }
      });
    },
    async removeOwned(selected=prepared.map(b=>b.target)){
      if (!open()) return {applied:false};
      const selectedKeys=prepared.filter(b=>selected.includes(b.target)).map(b=>b.key);const current=++revision;
      dirty.clear();try{return await adapter.writeOwned(Object.fromEntries(selectedKeys.map(key=>[key,null])),{mode:'replace',isCurrent:()=>open()&&revision===current});}catch(caught){if(open()&&revision===current)report(caught,'replace-cleanup');return {applied:false};}
    },
    dispose() {
      if (!alive) return;
      cleanup();
      onDispose();
    }
  });
  connectionTokens.set(connection, { token, keys, claims, adapter });
  reservation?.finish();
  return connection;
}
