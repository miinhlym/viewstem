import { compileSchema, equal } from './schema.mjs';
import { protect, trustedCopies } from './immutable.mjs';
import { safeError, error as coreError } from './errors.mjs';
import { prepareUrlConnection } from './url.mjs';

const fail = code => { throw coreError(({READ_ONLY:'TYPE_MISMATCH',DUPLICATE_STATE:'INVALID_DEFINITION',DUPLICATE_TARGET:'INVALID_DEFINITION',DUPLICATE_REACTION:'INVALID_DEFINITION',DEPENDENCY_CYCLE:'INVALID_DEFINITION'})[code] ?? code); };
export const keyOf = address => JSON.stringify([address.scopeId, address.name]);
const missing = Object.freeze({ status: 'missing' });
const pending = Object.freeze({ status: 'pending' });
const errorState = error => Object.freeze({ status: 'error', error: safeError(error) });
const same = (a, b) => a.status === b.status && (a.status === 'ready' ? equal(a.value, b.value) : a.status !== 'error' || a.error.code === b.error.code);
const changedValue = (before, after) => after.status === 'ready' && (before.status !== 'ready' || !equal(before.value, after.value));
const stateHandles = new WeakSet();
export const isStateHandle = value => stateHandles.has(value);
let nextScope = 0, nextGeneration = 0;

export class StateStore {
  #cells = new Map();
  #subscribers = new Set();
  #settledListeners = new Set();
  #baselineListeners = new Set();
  #reactions = new Map();
  #notifying = false;
  #publishing = false;
  #queued = [];
  #draining = false;
  #diagnostics = [];
  #transaction = null;
  #readingStage = null;
  #scopes = new Set();
  #scopeLifetimes = new WeakMap();
  #url = null;
  #urlChanges = new WeakSet();
  #runningPureCallback = false;

  get isRunningPureCallback() { return this.#runningPureCallback; }
  get isBusy() { return this.#runningPureCallback || this.#notifying || this.#publishing || this.#transaction !== null; }
  assertCanWrite() {
    if (this.#runningPureCallback) fail('INVALID_DEFINITION');
  }
  runPureCallback(run) {
    const previous = this.#runningPureCallback;
    this.#runningPureCallback = true;
    try { return run(); }
    finally { this.#runningPureCallback = previous; }
  }
  transaction(run, beforeNotify) {
    this.assertCanWrite();
    if (this.#transaction) {
      if (beforeNotify) fail('INVALID_DEFINITION');
      return run();
    }
    if (this.#notifying && !beforeNotify) return this.#runTransaction(run, undefined, []);
    return this.#runTransaction(run, beforeNotify);
  }
  #runTransaction(run, beforeNotify, deferredMutations) {
    const cells = new Map(this.#cells), reactions = new Map(this.#reactions), scopes = new Set(this.#scopes);
    const previous = new Map([...cells.values()].map(cell => [cell, {...cell}]));
    const lifetimes = new Map([...scopes].map(scope => [this.#scopeLifetimes.get(scope), this.#scopeLifetimes.get(scope).alive]));
    const pending = [];
    pending.createdScopes = new Set();
    pending.cleanup = [];
    pending.rollback = [];
    pending.deferredMutations = deferredMutations;
    pending.explicitWrites = new Set();
    pending.reactionBaseline = new Map();
    const restore = () => {
      this.#cells = cells; this.#reactions = reactions; this.#scopes = scopes;
      for (const [lifetime, alive] of lifetimes) lifetime.alive = alive;
      for (const [cell, fields] of previous) Object.assign(cell, fields);
    };
    this.#transaction = pending;
    let result;
    let afterCommit;
    try {
      result = run();
      if (result?.then) fail('INVALID_DEFINITION');
      if (pending.reactionBaseline.size) {
        this.#commit(new Map(), pending.explicitWrites, 'explicit', pending.reactionBaseline);
      }
      afterCommit = beforeNotify?.();
    }
    catch (caught) {
      for (const scope of pending.createdScopes) this.#scopeLifetimes.get(scope).alive = false;
      for (const undo of pending.rollback) undo();
      restore();
      throw caught;
    } finally { this.#transaction = null; }
    if (deferredMutations) {
      // The callback read its own writes. Restore the snapshot that the other
      // subscribers are still observing, then commit the mutations in FIFO order.
      for (const scope of pending.createdScopes) this.#scopeLifetimes.get(scope).alive = false;
      restore();
      if (deferredMutations.length || pending.rollback.length) {
        this.#queued.push(() => this.transaction(() => {
          this.#transaction.rollback.push(...pending.rollback);
          for (const mutate of deferredMutations) mutate();
        }));
      }
      return result;
    }
    const wasNotifying = this.#notifying;
    this.#notifying = true;
    try {
      afterCommit?.();
      for (const cleanup of pending.cleanup) cleanup();
    } finally { this.#notifying = wasNotifying; }
    const lastChanges = new Map(pending.map(change => [keyOf(change.target), change]));
    const changes = [];
    for (const [key, last] of lastChanges) {
      const before = cells.get(key), after = this.#cells.get(key);
      if (!before && !after) continue;
      if (before && before === after && same(previous.get(before).state, after.state)) {
        after.state = previous.get(before).state;
        continue;
      }
      const kind = !before ? 'added' : !after ? 'removed' : before === after ? 'updated' : 'replaced';
      const change = this.#change(after ?? before, kind);
      if (after?.generation === last.generation && this.#urlChanges.has(last)) this.#urlChanges.add(change);
      changes.push(change);
    }
    const wasPublishing = this.#publishing;
    this.#publishing = true;
    try {
      this.#notify(changes);
      if (pending.baseline) for (const listener of this.#baselineListeners) listener();
    } finally { this.#publishing = wasPublishing; }
    this.#drain();
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
    if (this.#transaction) this.#transaction.baseline = true;
    else for (const listener of this.#baselineListeners) listener();
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
  restore(prepareEntries, isCurrent, onRestored, onFailure) {
    this.#perform(() => {
      if (!isCurrent()) return;
      try {
        const entries = prepareEntries();
        if (!isCurrent()) return;
        const prepared = new Map(entries.map(([handle, snapshot]) => {
          const cell = this.#cellFor(handle);
          if (cell.derived) fail('TYPE_MISMATCH');
          return [cell, snapshot.status === 'ready' ? this.#accept(cell, snapshot.value) : snapshot.status === 'error' ? errorState(snapshot.error) : snapshot.status === 'pending' ? pending : missing];
        }));
        this.#commit(prepared, new Set(prepared.keys()), 'url');
      } catch (caught) { onFailure(caught); return; }
      if (isCurrent()) onRestored();
    });
  }
  get urlConnection() { return this.#url; }
  validateUrlReservation(previous) {
    if (this.#url !== previous) fail('INVALID_DEFINITION');
  }
  reserveUrl(connection) {
    this.#url = connection;
  }
  releaseUrl(connection) { if (this.#url === connection) this.#url = null; }
  connectUrl(options) {
    this.assertCanWrite();
    if (this.#url) fail('INVALID_DEFINITION');
    const connection = prepareUrlConnection(this, options);
    connection.installReservation(connection.validateReservation());
    if (!connection.start()) fail('CANCELLED');
    return connection;
  }
  dispose() { this.assertCanWrite(); this.#url?.dispose(); for(const scope of this.#scopes)scope.dispose();this.#subscribers.clear();this.#settledListeners.clear();this.#baselineListeners.clear(); }


  createScope() {
    this.assertCanWrite();
    const store = this, scopeId = `scope-${++nextScope}`;
    const lifetime = { alive: true, clockSubscriptions: new Set() }, { clockSubscriptions } = lifetime;
    const current = () => { if (!lifetime.alive) fail('CANCELLED'); };
    const scope = Object.freeze({ scopeId,
      connectClock(target, clock) {
        store.assertCanWrite();
        current();
        const cell = store.#cellFor(target);
        if (cell.derived) fail('READ_ONLY');
        if (!clock || typeof clock.now !== 'function' || typeof clock.subscribe !== 'function') fail('INVALID_DEFINITION');
        const isCurrent = () => lifetime.alive && store.#cells.get(keyOf(cell.address)) === cell;
        const accept = value => {
          if (!Number.isSafeInteger(value)) fail('TYPE_MISMATCH');
          return store.#accept(cell, value);
        };
        let initial = accept(clock.now());
        let active = true, subscribing = true, subscriptionError, stop;
        const update = (snapshot, initialWrite = false) => {
          store.assertCanWrite();
          store.#perform(() => {
            if (!active || !isCurrent()) {
              if (initialWrite && store.#transaction) fail('CANCELLED');
              return;
            }
            store.#writePrepared(new Map([[cell, snapshot]]), 'explicit');
          });
        };
        const unsubscribe = () => {
          if (!active) return;
          active = false;
          clockSubscriptions.delete(unsubscribe);
          cell.clockSubscriptions.delete(unsubscribe);
          if (typeof stop === 'function') {
            try { stop(); } catch (caught) { store.#diagnostics.push(safeError(caught)); }
          }
        };
        try {
          if (!isCurrent()) fail('CANCELLED');
          stop = clock.subscribe(value => {
            if (!active || !isCurrent()) return;
            if (subscribing) {
              try { initial = accept(value); } catch (caught) { subscriptionError ??= caught; }
            } else update(accept(value));
          });
          subscribing = false;
          if (typeof stop !== 'function') fail('INVALID_DEFINITION');
          if (!isCurrent()) fail('CANCELLED');
          if (subscriptionError) throw subscriptionError;
          clockSubscriptions.add(unsubscribe);
          cell.clockSubscriptions.add(unsubscribe);
          store.#transaction?.rollback.push(unsubscribe);
          update(initial, true);
          return unsubscribe;
        } catch (caught) {
          unsubscribe();
          throw caught;
        }
      },
      registerState(name, declaration) { current(); return store.#register(scopeId, name, declaration, false, current); },
      replaceState(name, declaration) { current(); return store.#register(scopeId, name, declaration, true, current); },
      getState(name) { current(); return store.#lookup({ scopeId, name }).handle; },
      removeState(name) { current(); store.#remove(store.#lookup({ scopeId, name })); },
      dispose() {
        store.assertCanWrite();
        if (!lifetime.alive) return;
        const close = () => {
          if (!lifetime.alive) return;
          lifetime.alive = false;
          store.#scopes.delete(scope);
          const cleanup = () => { if (!lifetime.alive) for (const stop of clockSubscriptions) stop(); };
          store.#afterCommit(cleanup);
        };
        const remove = () => {
          const removed = [...store.#cells.values()].filter(cell => cell.address.scopeId === scopeId);
          for (const cell of removed) {
            store.#cells.delete(keyOf(cell.address));
            store.#retireClock(cell);
          }
          for (const [target, reaction] of store.#reactions) if (reaction.owner === scopeId || removed.includes(target) || reaction.watch.some(cell => removed.includes(cell))) store.#reactions.delete(target);
          store.#structuralCommit(removed.map(cell => store.#change(cell, 'removed')));
        };
        if (store.#transaction) store.#perform(() => { close(); remove(); });
        else { close(); store.#perform(remove); }
      },
    });
    this.#scopeLifetimes.set(scope, lifetime);
    this.#mutate(() => {
      lifetime.alive = true;
      this.#scopes.add(scope);
      this.#transaction?.createdScopes.add(scope);
    });
    return scope;
  }

  #lookup(address) { return this.#cells.get(keyOf(address)) ?? fail('REFERENCE_NOT_FOUND'); }
  #current(cell) { if (this.#cells.get(keyOf(cell.address)) !== cell) fail('CANCELLED'); }
  #afterCommit(cleanup) {
    if (this.#transaction) { this.#transaction.cleanup.push(cleanup); return; }
    const wasNotifying = this.#notifying;
    this.#notifying = true;
    try { cleanup(); } finally { this.#notifying = wasNotifying; }
  }
  #retireClock(cell) {
    if (!cell.clockSubscriptions.size) return;
    this.#afterCommit(() => { for (const stop of cell.clockSubscriptions) stop(); });
  }
  #accept(cell, value) {
    try { return Object.freeze({ status: 'ready', value: protect(cell.validator.accept(value, trustedCopies(value))) }); }
    catch (error) { throw safeError(error, 'TYPE_MISMATCH'); }
  }
  #register(scopeId, name, declaration, replace, checkScope) {
    this.assertCanWrite();
    const address = Object.freeze({ scopeId, name }), key = keyOf(address), previous = this.#cells.get(key);
    if (replace ? !previous : previous) fail(replace ? 'REFERENCE_NOT_FOUND' : 'DUPLICATE_STATE');
    if (!declaration || typeof declaration !== 'object' || !Object.hasOwn(declaration, 'schema')) fail('INVALID_DEFINITION');
    let validator;try { validator = compileSchema(declaration.schema); } catch(caught) { throw safeError(caught,'INVALID_DEFINITION'); }
    const cell = { address, generation: ++nextGeneration, validator, schema: structuredClone(declaration.schema), initialSettled: Object.hasOwn(declaration, 'initial'), state: missing, baseline: missing, writes: 0, clockSubscriptions: new Set(),
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
        store.assertCanWrite();
        store.#current(cell); if (cell.derived) fail('READ_ONLY');
        if (cell.baseline.status === 'pending') fail('VALUE_PENDING');
        if (cell.baseline.status === 'error') throw cell.baseline.error;
        store.#perform(() => store.#writePrepared(new Map([[cell, cell.baseline]]), 'explicit'));
      },
    });
    // Structural preparation occurs before replacing the old generation.
    if (cell.derived) cell.state = this.#calculate(cell, new Map([...this.#cells.values()].map(item => [item, item.state])));
    const initial = this.#transaction?.deferredMutations ? { ...cell } : undefined;
    this.#perform(() => {
      checkScope();
      if (this.#cells.get(key) !== previous) fail('CANCELLED');
      // Later mutations in the candidate may already have touched this cell.
      if (initial) Object.assign(cell, initial);
      this.#cells.set(key, cell);
      if (previous) {
        for (const [target, reaction] of this.#reactions) if (target === previous || reaction.watch.includes(previous)) this.#reactions.delete(target);
        this.#retireClock(previous);
      }
      this.#structuralCommit([this.#change(cell, previous ? 'replaced' : 'added')]);
    });
    stateHandles.add(cell.handle);
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
    this.assertCanWrite();
    this.#perform(() => {
      this.#current(cell); this.#cells.delete(keyOf(cell.address));
      for (const [target, reaction] of this.#reactions) if (target === cell || reaction.watch.includes(cell)) this.#reactions.delete(target);
      this.#retireClock(cell);
      this.#structuralCommit([this.#change(cell, 'removed')]);
    });
  }

  writeBatch(changes, { origin = 'explicit' } = {}) {
    this.assertCanWrite();
    const prepared = new Map();
    for (const [handle, value] of changes) {
      const cell = this.#cellFor(handle);
      if (cell.derived) fail('READ_ONLY');
      if (prepared.has(cell)) fail('DUPLICATE_TARGET');
      prepared.set(cell, this.#accept(cell, value));
    }
    this.#perform(() => this.#writePrepared(prepared, origin));
  }
  #writePrepared(prepared, origin) {
    for (const cell of prepared.keys()) this.#current(cell);
    for (const cell of prepared.keys()) if (origin !== 'initial') cell.writes++;
    this.#commit(prepared, new Set(prepared.keys()), origin);
  }
  stageBatch(changes) {
    const before=new Map([...this.#cells.values()].map(cell=>[cell,cell.state]));
    const explicit=new Set(changes.map(([handle])=>this.#cellFor(handle)));
    this.writeBatch(changes,{origin:'stage'});
    return ()=>this.#commit(new Map(),explicit,'explicit',before);
  }
  registerReaction(owner, { watch, target, value }) {
    this.assertCanWrite();
    const lifetime = this.#scopeLifetimes.get(owner);
    if (!lifetime) fail('INVALID_DEFINITION');
    if (!lifetime.alive) fail('CANCELLED');
    if (!Array.isArray(watch) || watch.length === 0) fail('INVALID_DEFINITION');
    const cell = this.#cellFor(target), watched = watch.map(handle => this.#cellFor(handle));
    if (cell.derived) fail('READ_ONLY');
    if (this.#reactions.has(cell)) fail('DUPLICATE_REACTION');
    const reaction = { owner: owner.scopeId, watch: watched, value: this.#accept(cell, value) };
    this.#mutate(() => {
      if (!lifetime.alive) fail('CANCELLED');
      this.#current(cell);
      for (const dependency of watched) this.#current(dependency);
      if (this.#reactions.has(cell)) fail('DUPLICATE_REACTION');
      this.#reactions.set(cell, reaction);
      try { this.#order(); } catch (error) { this.#reactions.delete(cell); throw error; }
    });
    return () => this.#mutate(() => { if (this.#reactions.get(cell) === reaction) this.#reactions.delete(cell); });
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
      if (!same(cell.state, snapshot)) {
        this.#transaction?.reactionBaseline.delete(cell);
        cell.state = snapshot;
        changes.push(this.#change(cell, 'updated'));
      }
    }
    this.#notify(changes);
  }
  #commit(prepared, explicit, origin, baseline) {
    const before = new Map([...this.#cells.values()].map(cell => [cell, cell.state]));
    const staged = new Map(before);
    const deferReactions = origin === 'explicit' && !baseline && this.#transaction;
    if (deferReactions) for (const cell of explicit) deferReactions.explicitWrites.add(cell);
    for (const [cell, snapshot] of prepared) staged.set(cell, snapshot);
    for (const cell of this.#order()) {
      if (!staged.has(cell)) continue;
      if (cell.derived && cell.dependencies.some(item => !same(before.get(item) ?? missing, staged.get(item) ?? missing))) staged.set(cell, this.#calculate(cell, staged));
      const reaction = this.#reactions.get(cell);
      if (reaction && origin === 'explicit' && !deferReactions && !explicit.has(cell)
        && reaction.watch.some(item => changedValue(baseline?.get(item) ?? before.get(item) ?? missing, staged.get(item) ?? missing))) staged.set(cell, reaction.value);
    }
    const changes = [];
    for (const [cell, snapshot] of staged) if (!same(cell.state, snapshot)) {
      if (deferReactions && !deferReactions.reactionBaseline.has(cell)) deferReactions.reactionBaseline.set(cell, cell.state);
      if (origin !== 'explicit') this.#transaction?.reactionBaseline.delete(cell);
      cell.state = snapshot;
      const change = this.#change(cell, 'updated');
      if (origin === 'explicit' || origin === 'stage') this.#urlChanges.add(change);
      changes.push(change);
    }
    this.#notify(changes);
  }
  #change(cell, kind) { return Object.freeze({ kind, target: cell.address, generation: cell.generation }); }
  #mutate(run) {
    const result = run();
    this.#transaction?.deferredMutations?.push(run);
    return result;
  }
  #perform(run) {
    if (this.#transaction) return this.#mutate(run);
    if (this.#notifying) { this.#queued.push(run); return; }
    run();
    this.#drain();
  }
  #drain() {
    if (this.#draining || this.#notifying || this.#transaction) return;
    this.#draining = true;
    try {
      while (this.#queued.length) {
        try { this.#queued.shift()(); } catch (error) { this.#diagnostics.push(errorState(error).error); }
      }
    } finally { this.#draining = false; }
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
    let urlChanges;
    const notifications = [...this.#subscribers].map(subscriber => [subscriber, this.#payload(subscriber.selector,
      subscriber.url ? (urlChanges ??= changes.filter(change => this.#urlChanges.has(change))) : changes)]).filter(([, payload]) => payload.changes.length);
    this.#notifying = true;
    try {
      for (const [subscriber, payload] of notifications) if (this.#subscribers.has(subscriber)) {
        try { subscriber.listener(payload); } catch (error) { this.#diagnostics.push(errorState(error).error); }
      }
    } finally { this.#notifying = false; }
    const wasPublishing = this.#publishing;
    this.#publishing = true;
    try {
      for(const listener of this.#settledListeners)try{listener();}catch(caught){this.#diagnostics.push(safeError(caught));}
    } finally { this.#publishing = wasPublishing; }
  }
  observe(listener) { this.#settledListeners.add(listener);return ()=>this.#settledListeners.delete(listener); }
  observeUrlChanges(addresses, listener) {
    const subscriber = { selector: new Set(addresses.map(keyOf)), listener, url: true };
    this.#subscribers.add(subscriber);
    return () => this.#subscribers.delete(subscriber);
  }
  subscribe(selector, listener) {
    const selected = selector == null ? null : new Set((Array.isArray(selector) ? selector : [selector]).map(keyOf));
    const subscriber = { selector: selected, listener }; this.#subscribers.add(subscriber);
    const wasNotifying = this.#notifying;
    this.#notifying = true;
    try { listener(this.#payload(selected, [])); } catch (error) { this.#diagnostics.push(safeError(error)); }
    finally { this.#notifying = wasNotifying; }
    if (!wasNotifying) this.#drain();
    return () => this.#subscribers.delete(subscriber);
  }
  getDiagnostics() { return [...this.#diagnostics]; }
}

export const createStateStore = () => new StateStore();
