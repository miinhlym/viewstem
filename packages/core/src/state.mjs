import { compileSchema, equal } from './schema.mjs';
import { protect, trustedCopies } from './immutable.mjs';
import { safeError, error as coreError } from './errors.mjs';
import { prepareUrlConnection } from './url.mjs';

const fail = code => { throw coreError(({READ_ONLY:'TYPE_MISMATCH',DUPLICATE_STATE:'INVALID_DEFINITION',DUPLICATE_TARGET:'INVALID_DEFINITION',DUPLICATE_REACTION:'INVALID_DEFINITION',DEPENDENCY_CYCLE:'INVALID_DEFINITION'})[code] ?? code); };
export const keyOf = address => JSON.stringify([address.scopeId, address.name]);
const missing = Object.freeze({ status: 'missing' });
const pending = Object.freeze({ status: 'pending' });
const dependencyCycle = Symbol();
const errorState = error => Object.freeze({ status: 'error', error: safeError(error) });
const same = (a, b) => a.status === b.status && (a.status === 'ready' ? equal(a.value, b.value) : a.status !== 'error' || a.error.code === b.error.code);
const sameReaction = (a, b) => a === b || !!a && !!b && a.owner === b.owner && same(a.value, b.value)
  && a.watch.length === b.watch.length && a.watch.every((watch, index) => watch === b.watch[index]);
const sameReactions = (a, b) => a === b || !!a && !!b && a.length === b.length
  && a.every((reaction, index) => sameReaction(reaction, b[index]));
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
  #settleRead;
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
  transaction(run, beforeNotify, { viewCandidate = false } = {}) {
    this.assertCanWrite();
    if (this.#transaction) {
      if (beforeNotify) fail('INVALID_DEFINITION');
      return run();
    }
    if (this.#notifying && !beforeNotify) return this.#runTransaction(run, undefined, [], viewCandidate);
    return this.#runTransaction(run, beforeNotify, undefined, viewCandidate);
  }
  #runTransaction(run, beforeNotify, deferredMutations, viewCandidate) {
    const cells = new Map(this.#cells), reactions = new Map(this.#reactions), scopes = new Set(this.#scopes);
    const previous = new Map([...cells.values()].map(cell => [cell, {...cell}]));
    const lifetimes = new Map([...scopes].map(scope => [this.#scopeLifetimes.get(scope), this.#scopeLifetimes.get(scope).alive]));
    const pending = [];
    pending.viewCandidate = viewCandidate;
    pending.cyclicReactions = new Map();
    pending.previousCells = previous;
    pending.previousReactions = reactions;
    pending.initializers = new Set();
    pending.initializerErrors = new Map();
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
        this.#commit(new Map(), pending.explicitWrites, 'explicit', { baseline: pending.reactionBaseline });
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
    const initializers = this.#transaction?.initializers;
    if (cell.initialSettled && !initializers?.has(cell)) return;
    // Initialization is provisional until the enclosing plan commits. Its
    // inputs can change if a subsequent candidate discards reaction effects.
    initializers?.add(cell);
    let accepted = snapshot;
    this.#transaction?.initializerErrors.delete(cell);
    if (snapshot.status === 'ready') {
      try { accepted = this.#accept(cell, snapshot.value); }
      catch (caught) {
        if (!this.#transaction?.viewCandidate) throw caught;
        this.#transaction.initializerErrors.set(cell, caught);
        accepted = errorState(caught);
      }
    }
    cell.initialSettled = snapshot.status !== 'pending' && snapshot.status !== 'missing';
    cell.baseline = accepted;
    if (!cell.writes && !this.#transaction?.reactionEffects?.has(cell)) {
      this.#commit(new Map([[cell,accepted]]),new Set(),'initial');
    }
    if (this.#transaction) this.#transaction.baseline = true;
    else for (const listener of this.#baselineListeners) listener();
  }

  computed(handle, dependencies, compute, { recompute = true, externalChanged, trackDependencies = false } = {}) {
    const cell = this.#cellFor(handle), previous = {...cell};
    const next = dependencies.map(handle => this.#cellFor(handle));
    const graphChanged = next.length !== previous.dependencies.length ||
      next.some((dependency, index) => dependency !== previous.dependencies[index]);
    cell.derived = true; cell.computeSnapshot = compute; cell.externalChanged = externalChanged;
    cell.dependencies = next;
    cell.dynamicDependencies = trackDependencies ? { reads: [], blocked: [] } : undefined;
    // Rebinding an unchanged runtime owner keeps its latest context without
    // walking an otherwise unchanged dependency graph.
    try {
      if (graphChanged) {
        if (this.#transaction?.viewCandidate) this.#invalidateReactionGraph();
        else this.#validateDependencyGraph(this.#cells.values(), { observed: false });
      }
      if (recompute) this.#structuralCommit([], { recompute: cell });
    } catch (caught) { Object.assign(cell, previous); throw caught; }
  }
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
          if (removed.length) store.#invalidateReactionGraph();
          const removedCells = new Set(removed);
          store.#removeReactions((target, reaction) =>
            reaction.owner === scopeId || removedCells.has(target) || reaction.watch.some(cell => removedCells.has(cell)));
          store.#structuralCommit(removed.map(cell => store.#change(cell, 'removed')), { retired: removed });
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
  #invalidateReactionGraph() {
    if (this.#transaction?.viewCandidate) this.#transaction.cyclicReactions = undefined;
  }
  isCurrentHandle(handle) { return !!handle && this.#cells.get(keyOf(handle.address))?.handle === handle; }
  retireScopes(scopes) {
    const start = this.#transaction.length;
    const reactions = new Map(this.#reactions);
    for (const scope of scopes) scope.dispose();
    return [...reactions].some(([target, entries]) => this.#reactions.get(target) !== entries)
      || this.#transaction.length > start;
  }
  #snapshot(cell) {
    this.#current(cell);
    this.#settleRead?.(cell);
    return this.#readingStage?.get(cell) ?? cell.state;
  }
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
      derived: declaration.derived, computeSnapshot: undefined, externalChanged: undefined, dynamicDependencies: undefined,
      dependencies: (declaration.dependencies ?? []).map(handle => this.#cellFor(handle)) };
    if (cell.derived && typeof cell.derived !== 'function') fail('INVALID_DEFINITION');
    // Async initialization is distinct from ordinary stored data.
    if (Object.hasOwn(declaration, 'pendingInitial') && Object.hasOwn(declaration, 'initial')) fail('INVALID_DEFINITION');
    if (Object.hasOwn(declaration, 'pendingInitial')) {
      cell.state = pending; cell.baseline = pending;
      Promise.resolve(declaration.pendingInitial).then(value => this.#settleInitial(cell, value), error => this.#settleInitial(cell, undefined, error, true)).catch(error => this.#diagnostics.push(safeError(error)));
    } else if (Object.hasOwn(declaration, 'initial')) cell.state = cell.baseline = this.#accept(cell, declaration.initial);
    const store = this;
    cell.handle = Object.freeze({ address, generation: cell.generation,
      read() { const snapshot = store.#snapshot(cell); if (snapshot.status === 'pending') fail('VALUE_PENDING'); if (snapshot.status === 'error') throw snapshot.error; return snapshot.status === 'ready' ? snapshot.value : undefined; },
      getSnapshot() { return store.#snapshot(cell); },
      write(value) { store.writeBatch([[cell.handle, value]]); },
      reset() {
        store.assertCanWrite();
        store.#current(cell); if (cell.derived) fail('READ_ONLY');
        if (cell.baseline.status === 'pending') fail('VALUE_PENDING');
        if (cell.baseline.status === 'error') throw cell.baseline.error;
        store.#perform(() => store.#writePrepared(new Map([[cell, cell.baseline]]), 'explicit'));
      },
    });
    const initial = this.#transaction?.deferredMutations ? { ...cell } : undefined;
    this.#perform(() => {
      checkScope();
      if (this.#cells.get(key) !== previous) fail('CANCELLED');
      // Later mutations in the candidate may already have touched this cell.
      if (initial) Object.assign(cell, initial);
      this.#cells.set(key, cell);
      if (previous || cell.derived) this.#invalidateReactionGraph();
      if (previous) {
        this.#removeReactions((target, reaction) => target === previous || reaction.watch.includes(previous));
        this.#retireClock(previous);
      }
      this.#structuralCommit([this.#change(cell, previous ? 'replaced' : 'added')], {
        added: cell, retired: previous ? [previous] : [],
      });
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
      this.#invalidateReactionGraph();
      this.#removeReactions((target, reaction) => target === cell || reaction.watch.includes(cell));
      this.#retireClock(cell);
      this.#structuralCommit([this.#change(cell, 'removed')], { retired: [cell] });
    });
  }

  writeBatch(changes, { origin = 'explicit' } = {}) {
    this.assertCanWrite();
    const prepared = this.#prepareWrites(changes);
    this.#perform(() => this.#writePrepared(prepared, origin));
  }
  #prepareWrites(changes) {
    const prepared = new Map();
    for (const [handle, value] of changes) {
      const cell = this.#cellFor(handle);
      if (cell.derived) fail('READ_ONLY');
      if (prepared.has(cell)) fail('DUPLICATE_TARGET');
      prepared.set(cell, this.#accept(cell, value));
    }
    return prepared;
  }
  #writePrepared(prepared, origin) {
    for (const cell of prepared.keys()) this.#current(cell);
    for (const cell of prepared.keys()) if (origin !== 'initial') cell.writes++;
    this.#commit(prepared, new Set(prepared.keys()), origin);
  }
  stageBatch(changes) {
    this.assertCanWrite();
    const baseline = new Map([...this.#cells.values()].map(cell => [cell, cell.state]));
    const previouslyWritten = new Set([...baseline.keys()].filter(cell => cell.writes));
    const bindings = new Map([...baseline.keys()].filter(cell => cell.derived).map(cell => [cell, {
      dependencies: cell.dependencies, dynamicDependencies: cell.dynamicDependencies, computeSnapshot: cell.computeSnapshot,
    }]));
    const initializers = this.#transaction?.initializers;
    const initializedBeforeWrites = new Map([...(initializers ?? [])].map(cell => [cell, cell.baseline]));
    const prepared = this.#prepareWrites(changes);
    const explicit = new Set(prepared.keys());
    this.#perform(() => this.#writePrepared(prepared, 'stage'));
    const effects = new Map();
    const finalEffects = new Set();
    if (this.#transaction) this.#transaction.reactionEffects = effects;
    const recordReaction = (cell, snapshot, value) => {
      if (!effects.has(cell)) effects.set(cell, { snapshot, baseline: cell.baseline });
      if (!same(snapshot, value)) finalEffects.add(cell);
    };
    const settle = () => {
      // Replay the writes against the current candidate graph. Effects of a
      // reaction removed since a previous pass must not become input State.
      finalEffects.clear();
      for (const reactions of this.#reactions.values()) for (const reaction of reactions) {
        for (const watch of reaction.watch) if (!baseline.has(watch)) baseline.set(watch, watch.state);
      }
      const staged = new Map();
      for (const [cell, effect] of effects) {
        if (this.#cells.get(keyOf(cell.address)) !== cell) continue;
        // A newly completed initializer is part of the candidate, even if
        // another pass previously wrote this cell through a reaction.
        if (cell.baseline !== effect.baseline && !cell.writes) {
          effect.snapshot = effect.baseline = cell.baseline;
        }
        staged.set(cell, effect.snapshot);
      }
      for (const [cell, snapshot] of prepared) staged.set(cell, snapshot);
      const affected = new Set([...this.#cells.values()].filter(cell => cell.dynamicDependencies?.blocked.length));
      const reference = new Map([...this.#cells.values()].map(cell => [cell, baseline.get(cell) ?? cell.state]));
      const initialized = new Set();
      for (const cell of initializers ?? []) {
        const prior = initializedBeforeWrites.get(cell);
        if (!reference.has(cell) || previouslyWritten.has(cell) || prior && same(prior, cell.baseline)) continue;
        if (!same(reference.get(cell), cell.baseline)) {
          reference.set(cell, cell.baseline);
          initialized.add(cell);
        }
      }
      // Compare Reaction watches to a reference that includes initialization
      // but leaves the explicit writes and provisional Reaction effects out.
      if (initialized.size) this.#settle(reference, cell => initialized.has(cell)
        || !same(baseline.get(cell) ?? cell.state, reference.get(cell) ?? cell.state), { bindings });
      return this.#commit(staged, explicit, 'explicit', { baseline: reference, affected, recordReaction, provisional: true });
    };
    return {
      settle,
      finalize: () => {
        const written = new Set(finalEffects);
        for (const [cell, snapshot] of prepared) if (!same(baseline.get(cell), snapshot)) written.add(cell);
        const changes = [];
        for (const cell of written) {
          if (this.#cells.get(keyOf(cell.address)) !== cell) continue;
          const change = this.#change(cell, 'updated');
          this.#urlChanges.add(change);
          changes.push(change);
        }
        this.#notify(changes);
      },
    };
  }
  registerReaction(owner, { watch, target, value }, { candidate = false } = {}) {
    this.assertCanWrite();
    const lifetime = this.#scopeLifetimes.get(owner);
    if (!lifetime) fail('INVALID_DEFINITION');
    if (!lifetime.alive) fail('CANCELLED');
    if (!Array.isArray(watch) || watch.length === 0) fail('INVALID_DEFINITION');
    const cell = this.#cellFor(target), watched = watch.map(handle => this.#cellFor(handle));
    if (cell.derived) fail('READ_ONLY');
    if (!candidate && this.#reactions.has(cell)) fail('DUPLICATE_REACTION');
    const reaction = { owner: owner.scopeId, watch: watched, value: this.#accept(cell, value) };
    this.#mutate(() => {
      if (!lifetime.alive) fail('CANCELLED');
      this.#current(cell);
      for (const dependency of watched) this.#current(dependency);
      if (!candidate && this.#reactions.has(cell)) fail('DUPLICATE_REACTION');
      this.#reactions.set(cell, [...(this.#reactions.get(cell) ?? []), reaction]);
      this.#invalidateReactionGraph();
      if (!candidate) {
        try { this.#validateDependencyGraph(this.#cells.values()); } catch (error) { this.#reactions.delete(cell); throw error; }
      }
    });
    return () => {
      this.assertCanWrite();
      const remove = () => {
        if (!this.#removeReactions((target, entry) => target === cell && entry === reaction)) return;
        if (!candidate) this.#structuralCommit([], { retryBlocked: true });
      };
      if (candidate) this.#mutate(remove);
      else this.#perform(remove);
    };
  }
  #removeReactions(remove) {
    let changed = false;
    for (const [target, entries] of this.#reactions) {
      const remaining = entries.filter(entry => !remove(target, entry));
      if (remaining.length === entries.length) continue;
      if (remaining.length) this.#reactions.set(target, remaining);
      else this.#reactions.delete(target);
      changed = true;
    }
    if (changed) this.#invalidateReactionGraph();
    return changed;
  }
  #reaction(cell) {
    const entries = this.#reactions.get(cell);
    return entries?.length === 1 ? entries[0] : undefined;
  }
  settleReactionChanges() {
    return this.#structuralCommit([], { reevaluateDynamic: true });
  }
  recordReactionPlan(previous) {
    const values = new Map([...this.#cells.values()].map(cell => [cell, { state: cell.state, baseline: cell.baseline }]));
    const reactions = new Map(this.#reactions);
    const repeated = previous.some(plan =>
      plan.values.size === values.size && plan.reactions.size === reactions.size
      && [...values].every(([cell, value]) => {
        const prior = plan.values.get(cell);
        return prior && same(value.state, prior.state) && same(value.baseline, prior.baseline);
      })
      && [...reactions].every(([cell, entries]) => sameReactions(entries, plan.reactions.get(cell))));
    if (repeated) fail('DEPENDENCY_CYCLE');
    previous.push({ values, reactions });
  }
  validateCandidateDependencies(scopes, { includeBlocked } = {}) {
    const scopeIds = new Set(scopes.map(scope => scope.scopeId));
    const roots = new Set();
    for (const [cell, error] of this.#transaction?.initializerErrors ?? []) {
      if (this.#cells.get(keyOf(cell.address)) === cell) throw error;
    }
    for (const cell of this.#cells.values()) {
      const previous = this.#transaction?.previousCells.get(cell)?.dynamicDependencies?.blocked;
      if (scopeIds.has(cell.address.scopeId)
        || cell.dynamicDependencies?.blocked.some(dependency => !previous?.includes(dependency))) roots.add(cell);
    }
    // An owner can introduce edges exclusively between external State cells.
    for (const [target, entries] of this.#reactions) {
      if (entries.length > 1) fail('DUPLICATE_REACTION');
      if (!sameReactions(entries, this.#transaction?.previousReactions.get(target))) roots.add(target);
    }
    this.#validateDependencyGraph(roots, { includeBlocked });
  }
  #validateDependencyGraph(roots, { observed = true, includeBlocked = false } = {}) {
    const active = new Set(), done = new Set();
    const visit = cell => {
      if (this.#cells.get(keyOf(cell.address)) !== cell) return;
      if (active.has(cell)) fail('DEPENDENCY_CYCLE');
      if (done.has(cell)) return;
      active.add(cell);
      for (const dependency of cell.dependencies) visit(dependency);
      if (observed && cell.dynamicDependencies) {
        for (const dependency of cell.dynamicDependencies.reads) visit(dependency);
        // A candidate includes attempted reads. Live evaluation omits a
        // blocked edge from its usable graph and keeps it for recovery.
        if (includeBlocked) for (const dependency of cell.dynamicDependencies.blocked) visit(dependency);
      }
      for (const dependency of this.#reaction(cell)?.watch ?? []) visit(dependency);
      active.delete(cell); done.add(cell);
    };
    for (const cell of roots) visit(cell);
  }
  #cyclicReactionWatches() {
    const indices = new Map(), stack = [], cyclic = new Map();
    const visit = cell => {
      const node = { index: indices.size, low: indices.size, active: true };
      indices.set(cell, node);
      stack.push(cell);
      const watches = this.#reactions.get(cell)?.flatMap(reaction => reaction.watch) ?? [];
      for (const dependency of [...cell.dependencies, ...watches]) {
        if (this.#cells.get(keyOf(dependency.address)) !== dependency) continue;
        const seen = indices.get(dependency);
        if (!seen) node.low = Math.min(node.low, visit(dependency).low);
        else if (seen.active) node.low = Math.min(node.low, seen.index);
      }
      if (node.low === node.index) {
        const component = new Set();
        let member;
        do {
          member = stack.pop();
          indices.get(member).active = false;
          component.add(member);
        } while (member !== cell);
        for (const member of component) {
          if (this.#reactions.get(member)?.some(reaction => reaction.watch.some(watch => component.has(watch)))) {
            cyclic.set(member, component);
          }
        }
      }
      return node;
    };
    for (const cell of this.#cells.values()) if (!indices.has(cell)) visit(cell);
    return cyclic;
  }
  #settle(staged, changed, { affected, first, applyReaction, bindings } = {}) {
    const active = new Set(), done = new Set();
    // A preliminary View can contain a Reaction that its own independent
    // writes will retire. Evaluate other inputs and validate the final graph.
    const omitted = !bindings && this.#transaction?.viewCandidate && this.#reactions.size
      ? this.#transaction.cyclicReactions ??= this.#cyclicReactionWatches()
      : undefined;
    // Previously observed reads are invalidation hints. A changed input can
    // redirect a dynamic path, so validate the actual read during evaluation.
    const observedChanged = dependency => {
      try { settle(dependency); }
      catch (caught) { if (caught === dependencyCycle) return true; throw caught; }
      return changed(dependency);
    };
    const settle = cell => {
      if (!staged.has(cell) || done.has(cell)) return;
      if (active.has(cell)) throw dependencyCycle;
      active.add(cell);
      try {
        const binding = bindings?.get(cell) ?? cell;
        for (const dependency of binding.dependencies) settle(dependency);
        const reactions = bindings ? undefined : this.#reactions.get(cell);
        const blocked = omitted?.get(cell);
        for (const reaction of reactions ?? []) {
          for (const dependency of reaction.watch) if (!blocked?.has(dependency)) settle(dependency);
        }
        if (cell.derived && (affected?.has(cell) || binding.dependencies.some(changed)
          || binding.dynamicDependencies?.reads.some(observedChanged)
          || binding.dynamicDependencies?.blocked.some(observedChanged))) {
          staged.set(cell, this.#calculate(cell, binding, staged, settle, !bindings));
        }
        if (reactions) applyReaction?.(cell, reactions, blocked);
        done.add(cell);
      } finally { active.delete(cell); }
    };
    try {
      if (first) settle(first);
      for (const cell of staged.keys()) settle(cell);
    } catch (caught) {
      if (caught === dependencyCycle) fail('DEPENDENCY_CYCLE');
      throw caught;
    }
    return done;
  }
  #calculate(cell, binding, staged, settle, recordReads) {
    if (binding.dependencies.some(item => this.#cells.get(keyOf(item.address)) !== item)) return errorState({ code: 'CANCELLED' });
    if (binding.computeSnapshot) {
      const previous=this.#readingStage, previousRead=this.#settleRead;
      this.#readingStage=staged;
      const observed = binding.dynamicDependencies && { reads: [], blocked: [] };
      this.#settleRead = observed && (dependency => {
        try { settle(dependency); }
        catch (caught) {
          if (caught !== dependencyCycle) throw caught;
          // Remember the failed read for recovery, without adding a cycle
          // to the valid dependency graph.
          if (!observed.blocked.includes(dependency)) observed.blocked.push(dependency);
          fail('DEPENDENCY_CYCLE');
        }
        if (!binding.dependencies.includes(dependency) && !observed.reads.includes(dependency)) observed.reads.push(dependency);
      });
      try {
        const result=binding.computeSnapshot();
        return result.status === 'ready' ? this.#accept(cell,result.value) : result;
      } catch(caught) { return errorState(caught); }
      finally {
        this.#readingStage=previous;
        this.#settleRead=previousRead;
        if (observed && recordReads) cell.dynamicDependencies=observed;
      }
    }
    const snapshots = binding.dependencies.map(item => staged.get(item) ?? missing);
    const error = snapshots.find(item => item.status === 'error'); if (error) return error;
    if (snapshots.some(item => item.status === 'pending')) return pending;
    if (snapshots.some(item => item.status === 'missing')) return missing;
    try { return this.#accept(cell, cell.derived(...snapshots.map(item => item.value))); }
    catch (error) { return errorState(error); }
  }
  #structuralCommit(changes, { added, retired = [], recompute, reevaluateDynamic, retryBlocked } = {}) {
    // A dependency is a generation-bound cell, never an automatic name rebind.
    const removed = new Set(retired);
    const affected = new Set();
    if (added?.derived) affected.add(added);
    if (recompute) affected.add(recompute);
    for (const cell of this.#cells.values()) {
      if (cell.derived && (reevaluateDynamic && cell.dynamicDependencies
        || retryBlocked && cell.dynamicDependencies?.blocked.length || cell.externalChanged?.() || removed.size && (
        cell.dependencies.some(dependency => removed.has(dependency))
        || cell.dynamicDependencies?.reads.some(dependency => removed.has(dependency))
        || cell.dynamicDependencies?.blocked.some(dependency => removed.has(dependency))))) affected.add(cell);
    }
    if (affected.size) {
      const staged = new Map([...this.#cells.values()].map(cell => [cell, cell.state]));
      const changed = cell => removed.has(cell) || !same(cell.state, staged.get(cell) ?? cell.state);
      const settled = this.#settle(staged, changed, { affected, first: recompute });
      for (const cell of settled) {
        const snapshot = staged.get(cell);
        if (same(cell.state, snapshot)) continue;
        this.#transaction?.reactionBaseline.delete(cell);
        cell.state = snapshot;
        if (cell !== added) changes.push(this.#change(cell, 'updated'));
      }
    }
    this.#notify(changes);
    return changes.length > 0;
  }
  #commit(prepared, explicit, origin, { baseline, affected, recordReaction, provisional = false } = {}) {
    const before = new Map([...this.#cells.values()].map(cell => [cell, cell.state]));
    const staged = new Map(before);
    const deferReactions = origin === 'explicit' && !baseline && this.#transaction;
    if (deferReactions) for (const cell of explicit) deferReactions.explicitWrites.add(cell);
    for (const [cell, snapshot] of prepared) staged.set(cell, snapshot);
    const changed = cell => !same(before.get(cell) ?? missing, staged.get(cell) ?? missing);
    const applyReaction = origin === 'explicit' && !deferReactions ? (cell, reactions, blocked) => {
      if (explicit.has(cell)) return;
      let value;
      for (const reaction of reactions) {
        if (!reaction.watch.some(item => !blocked?.has(item)
          && changedValue(baseline?.get(item) ?? before.get(item) ?? missing, staged.get(item) ?? missing))) continue;
        if (value && !same(value, reaction.value)) return;
        value = reaction.value;
      }
      if (value) {
        recordReaction?.(cell, staged.get(cell), value);
        staged.set(cell, value);
      }
    } : undefined;
    this.#settle(staged, changed, { applyReaction, affected });
    const changes = [];
    for (const [cell, snapshot] of staged) if (!same(cell.state, snapshot)) {
      if (deferReactions && !deferReactions.reactionBaseline.has(cell)) deferReactions.reactionBaseline.set(cell, cell.state);
      if (origin !== 'explicit') this.#transaction?.reactionBaseline.delete(cell);
      cell.state = snapshot;
      const change = this.#change(cell, 'updated');
      if (origin === 'explicit' && !provisional) this.#urlChanges.add(change);
      changes.push(change);
    }
    this.#notify(changes);
    return changes.length > 0;
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
    const values = Object.create(null), states = Object.create(null);
    const append = (key, cell) => {
      states[key] = cell.state;
      values[key] = cell.state.status === 'ready' ? cell.state.value : undefined;
    };
    if (selector?.size === 1) {
      const [key] = selector;
      const cell = this.#cells.get(key);
      if (cell) append(key, cell);
    } else if (!selector || selector.size) {
      for (const [key, cell] of this.#cells) if (!selector || selector.has(key)) append(key, cell);
    }
    return Object.freeze({ values: Object.freeze(values), states: Object.freeze(states), changes: Object.freeze(changes) });
  }
  #notify(changes) {
    if (!changes.length) return;
    if (this.#transaction) { this.#transaction.push(...changes); return; }
    const keyed = changes.map(change => [keyOf(change.target), change]);
    let urlChanges;
    const notifications = [];
    for (const subscriber of this.#subscribers) {
      const source = subscriber.url ? (urlChanges ??= keyed.filter(([, change]) => this.#urlChanges.has(change))) : keyed;
      const selected = !subscriber.url && !subscriber.selector ? changes
        : source.filter(([key]) => !subscriber.selector || subscriber.selector.has(key)).map(([, change]) => change);
      if (selected.length) notifications.push([subscriber, this.#payload(subscriber.selector, selected)]);
    }
    this.#notifying = true;
    try {
      for (const [subscriber, payload] of notifications) if (this.#subscribers.has(subscriber)) {
        try { subscriber.listener(payload); } catch (error) { this.#diagnostics.push(errorState(error).error); }
      }
    } finally { this.#notifying = false; }
    const wasPublishing = this.#publishing;
    this.#publishing = true;
    try {
      const addresses = keyed.map(([key]) => key);
      for(const listener of this.#settledListeners)try{listener(addresses);}catch(caught){this.#diagnostics.push(safeError(caught));}
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
