import { compileSchema } from './schema.mjs';
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
function prepareStateUrl(store, { adapter, bindings, limits: custom = {} }) {
  if (!adapter || !Array.isArray(bindings)) fail('INVALID_DEFINITION');
  const { read, subscribe, writeOwned } = adapter;
  if ([read, subscribe, writeOwned].some(method => typeof method !== 'function')) fail('INVALID_DEFINITION');
  const io = {
    read: () => Reflect.apply(read, adapter, []),
    subscribe: listener => Reflect.apply(subscribe, adapter, [listener]),
    writeOwned: (patch, options) => Reflect.apply(writeOwned, adapter, [patch, options]),
  };
  const limits={...defaults,...custom};
  for(const [key,value] of Object.entries(limits))if(!(key in defaults)||!Number.isSafeInteger(value)||value<1)fail('INVALID_DEFINITION');
  if(bindings.length>limits.maxKeys)fail('LIMIT_EXCEEDED');
  const keys=new Set(),targets=new Set();
  const prepared=bindings.map(({ target, key: configuredKey, history: configuredHistory })=>{
    const contract=store.contract(target);if(!contract.writable)fail('TYPE_MISMATCH');
    const key=configuredKey??`p.${target.address.name}`,address=JSON.stringify(target.address);
    if(typeof key!=='string'||keys.has(key)||targets.has(address))fail('INVALID_DEFINITION');keys.add(key);targets.add(address);
    const history = configuredHistory ?? 'replace';
    if(!['push','replace'].includes(history))fail('INVALID_DEFINITION');
    const validator=compileSchema(contract.schema),kind=profile(validator.plan);
    return {target,key,history,kind,validator};
  });
  return { adapter, io, prepared, keys, limits };
}
export function prepareUrlConnection(store, options, { previous = null, isOpen = () => true, viewOwned = false } = {}) {
  let previousKeys = connectionTokens.get(previous);
  if (!options && !previousKeys) fail('INVALID_DEFINITION');
  const { adapter, io, prepared = [], keys = new Set(), limits } = options ? prepareStateUrl(store, options) : {};
  const { restore = true, onError } = options ?? {};
  const token = {};
  let claims;
  const reserved = new Map();
  const controller = new AbortController();
  const { signal } = controller;
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  let alive = true, paused = false, started = false, activating = false, initialized = false;
  let revision = 0, restoring = false, firstRestore = true, restorePending = restore;
  const open = () => alive && store.urlConnection === connection && isOpen();
  const check = () => { if (!open()) fail('CANCELLED'); };
  const initialPending = new Set();
  const bindingByGeneration = new Map(prepared.map(binding => [binding.target.generation, binding]));
  const dirty = new Map(), diagnostics = [];
  const report = (caught, kind, key) => {
    if (!isOpen()) return;
    const failure = safeError(caught, 'TYPE_MISMATCH');
    const item = error(failure.code, { ...failure, kind, ...(key === undefined ? {} : { key }) });
    diagnostics.push(item);
    try { onError?.(item); } catch {}
  };
  const limitOutput=patch=>{
    const owned=parts(mergeOwnedUrl(io.read(),patch)).filter(part=>keys.has(part.key));
    if(bytes(owned.map(part=>part.raw).join('&'))>limits.maxOwnedBytes || owned.some(part=>bytes(part.encodedValue)>limits.maxValueBytes))fail('LIMIT_EXCEEDED');
  };
  const writeDirty=()=>{
    if(!open()||paused||!started||activating||!initialized||restoring||!dirty.size)return;
    const current=++revision,isCurrent=()=>open()&&!paused&&revision===current;
    const patch=Object.fromEntries([...dirty].map(([key,item])=>[key,item.value]));
    const mode=[...dirty.values()].some(item=>item.history==='push')?'push':'replace';
    try{
      if([...dirty.values()].some(item=>item.count>limits.maxItems))fail('LIMIT_EXCEEDED');limitOutput(patch);
      if (!isCurrent()) return;
      Promise.resolve(io.writeOwned(patch,{mode,isCurrent})).then(result=>{if(isCurrent()&&result?.applied!==false)dirty.clear();},caught=>{if(isCurrent())report(caught,'write');});
    }catch(caught){if(isCurrent())report(caught,'write');}
  };
  const applyRestore=()=>{
    const wasRestoring = restoring;
    restoring = true;
    try { restoreFromUrl(); }
    finally { restoring = wasRestoring; }
  };
  const restoreFromUrl=()=>{
    const restoringRevision = revision;
    const isCurrent = () => open() && !paused && revision === restoringRevision;
    const all=parts(io.read()),owned=all.filter(part=>keys.has(part.key));
    check();
    if (!isCurrent()) return;
    const tooLarge=bytes(owned.map(part=>part.raw).join('&'))>limits.maxOwnedBytes;
    const entries=prepared.map(binding=>{
      if (dirty.has(binding.key) || (firstRestore && initialPending.has(binding.target) && store.hasWritten(binding.target))) {
        return [binding.target, binding.target.getSnapshot()];
      }
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
    if (!isCurrent()) return;
    firstRestore=false;
    store.restore(entries,isCurrent);
    readyResolve();
  };
  const initialize=()=>{
    if(!open()||paused||!started||initialized)return;
    for(const binding of prepared)binding.baseline=store.baseline(binding.target);
    initialized=prepared.every(binding=>binding.baseline.status!=='pending');
    if(!initialized)return;
    if(restorePending)applyRestore();else{firstRestore=false;readyResolve();}
    writeDirty();
  };
  const guardedInitialize = () => {
    try { initialize(); }
    catch (caught) {
      dispose();
      report(caught, 'connect');
    }
  };
  const restoreNow=()=>{
    if(!open()||paused||!started)return;++revision;dirty.clear();restorePending=true;
    if(!initialized)guardedInitialize();
    else try { applyRestore(); writeDirty(); } catch (caught) { report(caught, 'restore'); }
  };
  const observeStore=payload=>{
    if (!open() || paused) return;
    let changed = false;
    for (const { target, generation } of payload.changes) {
      const binding = bindingByGeneration.get(generation);
      if (!binding) continue;
      // The first URL restore still takes precedence for ready baselines during startup.
      if (!started && restore && !initialPending.has(binding.target)) continue;
      const snapshot = payload.states[JSON.stringify([target.scopeId, target.name])];
      if (!snapshot || snapshot.status === 'pending') continue;
      const value = snapshot.status === 'ready' ? snapshot.value : undefined;
      const data = value instanceof Set ? [...value] : value;
      dirty.set(binding.key, {
        value: data === undefined ? null : JSON.stringify(data),
        count: Array.isArray(data) ? data.length : 0,
        history: binding.history,
      });
      changed = true;
    }
    if (changed) {
      if (!restoring) ++revision;
      writeDirty();
    }
  };
  let stopUrl, stopBaseline, stopStore;
  const stopAdapter = stop => {
    try { stop?.(); } catch (caught) { report(caught, 'cleanup'); }
  };
  const dispose = () => {
    if (!alive) return;
    alive = false;
    ++revision;
    dirty.clear();
    stopStore?.();
    stopBaseline?.();
    for (const [owned, ownedKeys] of reserved) {
      for (const key of ownedKeys) if (owned.get(key) === token) owned.delete(key);
    }
    store.releaseUrl(connection);
    controller.abort();
    readyResolve();
    stopAdapter(stopUrl);
  };
  const connection=Object.freeze({ready,isReady:()=>initialized,restore:restoreNow,getDiagnostics:()=>[...diagnostics], dispose,
    validateReservation() {
      const pending = prepared.filter(binding => store.baseline(binding.target).status === 'pending');
      store.validateUrlReservation(previous);
      const nextClaims = adapter ? adapterOwners.get(adapter) ?? new Map() : undefined;
      const old = previousKeys;
      if (nextClaims) for (const key of keys) {
        const owner = nextClaims.get(key);
        if (owner && (nextClaims !== old?.claims || owner !== old.token || !old.keys.has(key))) fail('INVALID_DEFINITION');
      }
      return { pending, claims: nextClaims, old, addresses: prepared.map(binding => binding.target.address) };
    },
    installReservation(reservation) {
      const { pending, old, addresses } = reservation;
      for (const binding of pending) initialPending.add(binding.target);
      claims = reservation.claims;
      store.reserveUrl(connection);
      if (old) reserved.set(old.claims, new Set(old.keys));
      if (claims) {
        adapterOwners.set(adapter, claims);
        reserved.set(claims, new Set([...(reserved.get(claims) ?? []), ...keys]));
      }
      for (const [owned, ownedKeys] of reserved) for (const key of ownedKeys) owned.set(key, token);
      previous?.pause();
      previous = null;
      if (io) stopStore = store.observeUrlChanges(addresses, observeStore);
      connectionTokens.set(connection, { token, keys, claims, io });
    },
    start() {
      if (!open()) return false;
      if (!io) { dispose(); return true; }
      activating = true;
      try {
        let initialNotifications = 0;
        const stop = io.subscribe(() => {
          if (started) restoreNow();
          else if (!viewOwned && open()) initialNotifications++;
        });
        if (typeof stop !== 'function') fail('INVALID_DEFINITION');
        if (!open()) { stopAdapter(stop); fail('CANCELLED'); }
        stopUrl = stop;
        stopBaseline = store.observeBaseline(guardedInitialize);
        started = true;
        initialize();
        while (initialNotifications-- > 0 && open()) restoreNow();
        check();
      } catch (caught) {
        const cancelled = !open();
        dispose();
        if (cancelled) return false;
        throw caught;
      } finally { activating = false; }
      writeDirty();
      return open();
    },
    pause() { paused = true; },
    async cleanupPrevious(timeout, clock) {
      const old = previousKeys;
      previousKeys = undefined;
      if (!old) return;
      const failure = await new Promise(resolve => {
        let active = true, timer;
        const set = clock ? clock.setTimeout.bind(clock) : setTimeout;
        const clear = clock ? clock.clearTimeout.bind(clock) : clearTimeout;
        const now = () => clock ? (typeof clock.now === 'function' ? clock.now() : clock.now) : Date.now();
        let deadline;
        const isCurrent = () => active && !signal.aborted && open() && [...old.keys].every(key => old.claims.get(key) === token);
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
          const patch = Object.fromEntries([...old.keys].map(key => [key, null]));
          Promise.resolve(old.io.writeOwned(patch, { mode: 'replace', isCurrent })).then(
            result => finish(result?.applied === false ? error('INTERNAL_ERROR') : undefined),
            caught => finish(safeError(caught)),
          );
        } catch (caught) { finish(safeError(caught)); }
      });
      for (const key of old.keys) {
        if (old.claims === claims && keys.has(key)) continue;
        if (old.claims.get(key) === token) old.claims.delete(key);
      }
      if (old.claims === claims) reserved.set(claims, keys);
      else reserved.delete(old.claims);
      return failure;
    },
    async removeOwned(selected=prepared.map(b=>b.target)){
      if (!open() || paused) return {applied:false};
      const selectedKeys=prepared.filter(b=>selected.includes(b.target)).map(b=>b.key);const current=++revision;
      dirty.clear();try{return await io.writeOwned(Object.fromEntries(selectedKeys.map(key=>[key,null])),{mode:'replace',isCurrent:()=>open()&&revision===current});}catch(caught){if(open()&&revision===current)report(caught,'replace-cleanup');return {applied:false};}
    },
  });
  return connection;
}
