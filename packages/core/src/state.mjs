import { compileSchema, equal } from './schema.mjs';
import { protect, trustedCopies } from './immutable.mjs';
import { safeError, error as coreError } from './errors.mjs';
import { connectStateUrl } from './url.mjs';

const fail = code => { throw coreError(({READ_ONLY:'TYPE_MISMATCH',DUPLICATE_STATE:'INVALID_DEFINITION',DUPLICATE_TARGET:'INVALID_DEFINITION',DUPLICATE_REACTION:'INVALID_DEFINITION',DEPENDENCY_CYCLE:'INVALID_DEFINITION'})[code] ?? code); };
export const keyOf = address => JSON.stringify([address.scopeId, address.name]);
const missing = Object.freeze({ status: 'missing' });
const pending = Object.freeze({ status: 'pending' });
const errorState = error => Object.freeze({ status: 'error', error: safeError(error) });
const same = (a, b) => a.status === b.status && (a.status === 'ready' ? equal(a.value, b.value) : a.status !== 'error' || a.error.code === b.error.code);
const changedValue = (before, after) => after.status === 'ready' && (before.status !== 'ready' || !equal(before.value, after.value));
let nextScope = 0, nextGeneration = 0;

export class StateStore {
  #cells = new Map();
  #subscribers = new Set();
  #settledListeners = new Set();
  #baselineListeners = new Set();
  #reactions = new Map();
  #notifying = false;
  #queued = [];
  #diagnostics = [];
  #transaction = null;
  #readingStage = null;
  #scopes = new Set();
  #scopeLifetimes = new WeakMap();
  #url = null;

  transaction(run) {
    if (this.#transaction) return run();
    const cells = new Map(this.#cells), reactions = new Map(this.#reactions), scopes = new Set(this.#scopes);
    const previous = new Map([...cells.values()].map(cell => [cell, {...cell}]));
    const lifetimes = new Map([...scopes].map(scope => [this.#scopeLifetimes.get(scope), this.#scopeLifetimes.get(scope).alive]));
    const pending = []; pending.createdScopes = new Set(); pending.cleanup = [];
    this.#transaction = pending;
    let result;
    try { result = run(); if (result?.then) fail('INVALID_DEFINITION'); }
    catch (caught) {
      for (const scope of pending.createdScopes) {
        const lifetime = this.#scopeLifetimes.get(scope); lifetime.alive = false;
        for (const stop of lifetime.clockSubscriptions) stop();
      }
      this.#cells = cells; this.#reactions = reactions; this.#scopes = scopes;
      for (const [lifetime, alive] of lifetimes) lifetime.alive = alive;
      for (const [cell, fields] of previous) Object.assign(cell, fields);
      throw caught;
    } finally { this.#transaction = null; }
    for (const cleanup of pending.cleanup) cleanup();
    const changes = new Map();
    for (const change of pending) {
      const key = keyOf(change.target), first = changes.get(key);
      if (first?.kind === 'added' && change.kind === 'removed') changes.delete(key);
      else changes.set(key, first?.kind === 'added' ? {...change,kind:'added'} : first?.kind === 'removed' && change.kind === 'added' ? {...change,kind:'replaced'} : change);
    }
    for(const [key,change] of changes) {
      const before=cells.get(key),after=this.#cells.get(key);
      if(before && after===before && same(previous.get(before).state,after.state)) {
        after.state=previous.get(before).state;
        if(change.kind==='updated')changes.delete(key);
      }
    }
    this.#notify([...changes.values()]);
    this.#perform(() => {});
    return result;
  }

  preview(run) {
    const marker={};let result;
    try { this.transaction(()=>{result=run();throw marker;}); }
    catch(caught){if(caught!==marker)throw caught;}
    return result;
  }

  initialize(handle, snapshot) {
    const cell = this.#cellFor(handle);
    if (cell.initialSettled) return;
    let accepted = snapshot;
    if (snapshot.status === 'ready') accepted = this.#accept(cell, snapshot.value);
    if (snapshot.status !== 'pending' && snapshot.status !== 'missing') cell.initialSettled = true;
    cell.baseline = accepted;
    if (!cell.writes) this.#commit(new Map([[cell,accepted]]),new Set(),'initial');
    for(const listener of this.#baselineListeners)listener();
  }

  computed(handle, dependencies, compute, { recompute = true } = {}) {
    const cell = this.#cellFor(handle), previous = {...cell};
    cell.derived = true; cell.computeSnapshot = compute;
    cell.dependencies = dependencies.map(handle => this.#cellFor(handle));
    // Rebinding an unchanged runtime owner keeps its latest context without
    // re-evaluating an otherwise unchanged dependency graph.
    try { this.#order(); if(recompute)this.recompute(); } catch (caught) { Object.assign(cell,previous); throw caught; }
  }
  recompute() { this.#structuralCommit([]); }
  baseline(handle) { return this.#cellFor(handle).baseline; }
  hasWritten(handle) { return this.#cellFor(handle).writes > 0; }
  observeBaseline(listener) { this.#baselineListeners.add(listener);return ()=>this.#baselineListeners.delete(listener); }
  restore(entries) {
    const prepared = new Map(entries.map(([handle,snapshot]) => {
      const cell=this.#cellFor(handle);if(cell.derived)fail('TYPE_MISMATCH');
      return [cell,snapshot.status === 'ready' ? this.#accept(cell,snapshot.value) : snapshot.status === 'error' ? errorState(snapshot.error) : snapshot.status === 'pending' ? pending : missing];
    }));
    this.#perform(()=>this.#commit(prepared,new Set(prepared.keys()),'url'));
  }
  get urlConnection() { return this.#url; }
  connectUrl(options) {
    if(this.#url)fail('INVALID_DEFINITION');
    const connection = connectStateUrl(this,options,()=>{if(this.#url===connection)this.#url=null;});
    this.#url = connection;return connection;
  }
  dispose() { this.#url?.dispose(); for(const scope of this.#scopes)scope.dispose();this.#subscribers.clear();this.#settledListeners.clear();this.#baselineListeners.clear(); }


  createScope() {
    const store = this, scopeId = `scope-${++nextScope}`;
    const lifetime = { alive: true, clockSubscriptions: new Set() }, { clockSubscriptions } = lifetime;
    const current = () => { if (!lifetime.alive) fail('CANCELLED'); };
    const scope = Object.freeze({ scopeId,
      connectClock(target, clock) {
        current();store.#cellFor(target);
        if(!clock || typeof clock.now !== 'function' || typeof clock.subscribe !== 'function')fail('INVALID_DEFINITION');
        const update=value=>{if(!Number.isSafeInteger(value))fail('TYPE_MISMATCH');target.write(value);};
        update(clock.now());let active=true;
        const stop=clock.subscribe(value=>{if(active&&lifetime.alive)update(value);});
        if(typeof stop!=='function')fail('INVALID_DEFINITION');
        const unsubscribe = () => {
          if (!active) return;
          active = false;
          clockSubscriptions.delete(unsubscribe);
          try { stop(); } catch (caught) { store.#diagnostics.push(safeError(caught)); }
        };
        clockSubscriptions.add(unsubscribe);return unsubscribe;
      },
      registerState(name, declaration) { current(); return store.#register(scopeId, name, declaration); },
      replaceState(name, declaration) { current(); return store.#register(scopeId, name, declaration, true); },
      getState(name) { current(); return store.#lookup({ scopeId, name }).handle; },
      removeState(name) { current(); store.#remove(store.#lookup({ scopeId, name })); },
      dispose() {
        if (!lifetime.alive) return;
        lifetime.alive = false;
        store.#scopes.delete(scope);
        const cleanup = () => { if (!lifetime.alive) for(const stop of clockSubscriptions)stop(); };
        if (store.#transaction) store.#transaction.cleanup.push(cleanup); else cleanup();
        store.#perform(() => {
          const removed = [...store.#cells.values()].filter(cell => cell.address.scopeId === scopeId);
          for (const cell of removed) store.#cells.delete(keyOf(cell.address));
          for (const [target, reaction] of store.#reactions) if (reaction.owner === scopeId || removed.includes(target) || reaction.watch.some(cell => removed.includes(cell))) store.#reactions.delete(target);
          store.#structuralCommit(removed.map(cell => store.#change(cell, 'removed')));
        });
      },
    });
    this.#scopeLifetimes.set(scope,lifetime);this.#scopes.add(scope);this.#transaction?.createdScopes.add(scope);return scope;
  }

  #lookup(address) { return this.#cells.get(keyOf(address)) ?? fail('REFERENCE_NOT_FOUND'); }
  #current(cell) { if (this.#cells.get(keyOf(cell.address)) !== cell) fail('CANCELLED'); }
  #accept(cell, value) {
    try { return Object.freeze({ status: 'ready', value: protect(cell.validator.accept(value, trustedCopies(value))) }); }
    catch (error) { throw safeError(error, 'TYPE_MISMATCH'); }
  }
  #register(scopeId, name, declaration, replace = false) {
    const address = Object.freeze({ scopeId, name }), key = keyOf(address), previous = this.#cells.get(key);
    if (replace ? !previous : previous) fail(replace ? 'REFERENCE_NOT_FOUND' : 'DUPLICATE_STATE');
    if (!declaration || typeof declaration !== 'object' || !Object.hasOwn(declaration, 'schema')) fail('INVALID_DEFINITION');
    let validator;try { validator = compileSchema(declaration.schema); } catch(caught) { throw safeError(caught,'INVALID_DEFINITION'); }
    const cell = { address, generation: ++nextGeneration, validator, schema: structuredClone(declaration.schema), initialSettled: Object.hasOwn(declaration, 'initial'), state: missing, baseline: missing, writes: 0,
      derived: declaration.derived, dependencies: (declaration.dependencies ?? []).map(handle => this.#cellFor(handle)) };
    if (cell.derived && typeof cell.derived !== 'function') fail('INVALID_DEFINITION');
    // Async initialization is distinct from ordinary stored data.
    if (Object.hasOwn(declaration, 'pendingInitial') && Object.hasOwn(declaration, 'initial')) fail('INVALID_DEFINITION');
    if (Object.hasOwn(declaration, 'pendingInitial')) {
      cell.state = pending; cell.baseline = pending;
      Promise.resolve(declaration.pendingInitial).then(value => this.#settleInitial(cell, value), error => this.#settleInitial(cell, undefined, error, true)).catch(error => this.#diagnostics.push(safeError(error)));
    } else if (Object.hasOwn(declaration, 'initial')) cell.state = cell.baseline = this.#accept(cell, declaration.initial);
    const store = this;
    cell.handle = Object.freeze({ address, generation: cell.generation,
      read() { store.#current(cell); const snapshot = store.#readingStage?.get(cell) ?? cell.state; if (snapshot.status === 'pending') fail('VALUE_PENDING'); if (snapshot.status === 'error') throw snapshot.error; return snapshot.status === 'ready' ? snapshot.value : undefined; },
      getSnapshot() { store.#current(cell); return store.#readingStage?.get(cell) ?? cell.state; },
      write(value) { store.writeBatch([[cell.handle, value]]); },
      reset() {
        store.#current(cell); if (cell.derived) fail('READ_ONLY');
        if (cell.baseline.status === 'pending') fail('VALUE_PENDING');
        if (cell.baseline.status === 'error') throw cell.baseline.error;
        store.#perform(() => { store.#current(cell); cell.writes++; store.#commit(new Map([[cell, cell.baseline]]), new Set([cell]), 'explicit'); });
      },
    });
    // Structural preparation occurs before replacing the old generation.
    if (cell.derived) cell.state = this.#calculate(cell, new Map([...this.#cells.values()].map(item => [item, item.state])));
    this.#perform(() => {
      if (this.#cells.get(key) !== previous) fail('CANCELLED');
      this.#cells.set(key, cell);
      if (previous) for (const [target, reaction] of this.#reactions) if (target === previous || reaction.watch.includes(previous)) this.#reactions.delete(target);
      this.#structuralCommit([this.#change(cell, previous ? 'replaced' : 'added')]);
    });
    return cell.handle;
  }
  #cellFor(handle) {
    const cell = this.#lookup(handle.address);
    if (cell.handle !== handle) fail('CANCELLED');
    return cell;
  }
  // Internal capability inspection; handles are validated against their creating store.
  contract(handle) { const cell = this.#cellFor(handle); return { schema: structuredClone(cell.schema), writable: !cell.derived }; }
  #settleInitial(cell, value, error, failed = false) {
    if (this.#cells.get(keyOf(cell.address)) !== cell) return;
    let snapshot;
    try { snapshot = failed ? errorState(error) : this.#accept(cell, value); } catch (caught) { snapshot = errorState(caught); }
    this.#perform(() => {
      if (this.#cells.get(keyOf(cell.address)) !== cell) return;
      cell.baseline = snapshot;
      if (cell.writes === 0) this.#commit(new Map([[cell, snapshot]]), new Set(), 'initial');
      for(const listener of this.#baselineListeners)listener();
    });
  }
  #remove(cell) {
    this.#perform(() => {
      this.#current(cell); this.#cells.delete(keyOf(cell.address));
      for (const [target, reaction] of this.#reactions) if (target === cell || reaction.watch.includes(cell)) this.#reactions.delete(target);
      this.#structuralCommit([this.#change(cell, 'removed')]);
    });
  }

  writeBatch(changes, { origin = 'explicit' } = {}) {
    const prepared = new Map();
    for (const [handle, value] of changes) {
      const cell = this.#cellFor(handle);
      if (cell.derived) fail('READ_ONLY');
      if (prepared.has(cell)) fail('DUPLICATE_TARGET');
      prepared.set(cell, this.#accept(cell, value));
    }
    this.#perform(() => {
      for (const cell of prepared.keys()) this.#current(cell);
      for (const cell of prepared.keys()) if (origin !== 'initial') cell.writes++;
      this.#commit(prepared, new Set(prepared.keys()), origin);
    });
  }
  stageBatch(changes) {
    const before=new Map([...this.#cells.values()].map(cell=>[cell,cell.state]));
    const explicit=new Set(changes.map(([handle])=>this.#cellFor(handle)));
    this.writeBatch(changes,{origin:'stage'});
    return ()=>this.#commit(new Map(),explicit,'explicit',before);
  }
  registerReaction(owner, { watch, target, value }) {
    if (!Array.isArray(watch) || watch.length === 0) fail('INVALID_DEFINITION');
    const cell = this.#cellFor(target), watched = watch.map(handle => this.#cellFor(handle));
    if (cell.derived) fail('READ_ONLY');
    if (this.#reactions.has(cell)) fail('DUPLICATE_REACTION');
    const reaction = { owner: owner.scopeId, watch: watched, value: this.#accept(cell, value) };
    this.#reactions.set(cell, reaction);
    try { this.#order(); } catch (error) { this.#reactions.delete(cell); throw error; }
    return () => { if (this.#reactions.get(cell) === reaction) this.#reactions.delete(cell); };
  }
  #order() {
    const result = [], active = new Set(), done = new Set();
    const visit = cell => {
      if (this.#cells.get(keyOf(cell.address)) !== cell) return;
      if (active.has(cell)) fail('DEPENDENCY_CYCLE');
      if (done.has(cell)) return;
      active.add(cell);
      for (const dependency of [...cell.dependencies, ...(this.#reactions.get(cell)?.watch ?? [])]) visit(dependency);
      active.delete(cell); done.add(cell); result.push(cell);
    };
    for (const cell of this.#cells.values()) visit(cell);
    return result;
  }
  #calculate(cell, staged) {
    if (cell.dependencies.some(item => this.#cells.get(keyOf(item.address)) !== item)) return errorState({ code: 'CANCELLED' });
    if (cell.computeSnapshot) {
      const previous=this.#readingStage;this.#readingStage=staged;
      try { const result=cell.computeSnapshot();return result.status === 'ready' ? this.#accept(cell,result.value) : result; }
      catch(caught){return errorState(caught);}finally{this.#readingStage=previous;}
    }
    const snapshots = cell.dependencies.map(item => staged.get(item) ?? missing);
    const error = snapshots.find(item => item.status === 'error'); if (error) return error;
    if (snapshots.some(item => item.status === 'pending')) return pending;
    if (snapshots.some(item => item.status === 'missing')) return missing;
    try { return this.#accept(cell, cell.derived(...snapshots.map(item => item.value))); }
    catch (error) { return errorState(error); }
  }
  #structuralCommit(changes) {
    const staged = new Map([...this.#cells.values()].map(cell => [cell, cell.state]));
    // A dependency is a generation-bound cell, never an automatic name rebind.
    for (const cell of this.#order()) if (cell.derived) {
      const snapshot = this.#calculate(cell, staged); staged.set(cell, snapshot);
      if (!same(cell.state, snapshot)) { cell.state = snapshot; changes.push(this.#change(cell, 'updated')); }
    }
    this.#notify(changes);
  }
  #commit(prepared, explicit, origin, baseline) {
    const staged = new Map([...this.#cells.values()].map(cell => [cell, cell.state])), before=new Map(staged);
    if(baseline)for(const [cell,snapshot] of baseline)if(before.has(cell))before.set(cell,snapshot);
    for (const [cell, snapshot] of prepared) staged.set(cell, snapshot);
    for (const cell of this.#order()) {
      if (!staged.has(cell)) continue;
      if (cell.derived && cell.dependencies.some(item => !same(before.get(item) ?? missing, staged.get(item) ?? missing))) staged.set(cell, this.#calculate(cell, staged));
      const reaction = this.#reactions.get(cell);
      if (reaction && origin === 'explicit' && !explicit.has(cell)
        && reaction.watch.some(item => changedValue(before.get(item) ?? missing, staged.get(item) ?? missing))) staged.set(cell, reaction.value);
    }
    const changes = [];
    for (const [cell, snapshot] of staged) if (!same(cell.state, snapshot)) { cell.state = snapshot; changes.push(this.#change(cell, 'updated')); }
    this.#notify(changes);
  }
  #change(cell, kind) { return Object.freeze({ kind, target: cell.address, generation: cell.generation }); }
  #perform(run) {
    if (this.#notifying) { this.#queued.push(run); return; }
    run();
    while (this.#queued.length) {
      try { this.#queued.shift()(); } catch (error) { this.#diagnostics.push(errorState(error).error); }
    }
  }
  #payload(selector, changes) {
    const includes = cell => selector === null || selector.has(keyOf(cell.address));
    const values = Object.create(null), states = Object.create(null);
    for (const cell of this.#cells.values()) if (includes(cell)) {
      const key = keyOf(cell.address); states[key] = cell.state; values[key] = cell.state.status === 'ready' ? cell.state.value : undefined;
    }
    return Object.freeze({ values: Object.freeze(values), states: Object.freeze(states), changes: Object.freeze(changes.filter(change => selector === null || selector.has(keyOf(change.target)))) });
  }
  #notify(changes) {
    if (!changes.length) return;
    if (this.#transaction) { this.#transaction.push(...changes); return; }
    const notifications = [...this.#subscribers].map(subscriber => [subscriber, this.#payload(subscriber.selector, changes)]).filter(([, payload]) => payload.changes.length);
    this.#notifying = true;
    try {
      for (const [subscriber, payload] of notifications) if (this.#subscribers.has(subscriber)) {
        try { subscriber.listener(payload); } catch (error) { this.#diagnostics.push(errorState(error).error); }
      }
    } finally { this.#notifying = false; }
    for(const listener of this.#settledListeners)try{listener();}catch(caught){this.#diagnostics.push(safeError(caught));}
  }
  observe(listener) { this.#settledListeners.add(listener);return ()=>this.#settledListeners.delete(listener); }
  subscribe(selector, listener) {
    const selected = selector == null ? null : new Set((Array.isArray(selector) ? selector : [selector]).map(keyOf));
    const subscriber = { selector: selected, listener }; this.#subscribers.add(subscriber);
    const wasNotifying = this.#notifying;
    this.#notifying = true;
    try { listener(this.#payload(selected, [])); } catch (error) { this.#diagnostics.push(safeError(error)); }
    finally { this.#notifying = wasNotifying; }
    if (!wasNotifying) this.#perform(() => {});
    return () => this.#subscribers.delete(subscriber);
  }
  getDiagnostics() { return [...this.#diagnostics]; }
}

export const createStateStore = () => new StateStore();
