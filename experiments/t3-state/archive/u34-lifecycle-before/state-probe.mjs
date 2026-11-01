import { compileSchema, equal } from '../t1-values/schema-runtime.mjs';
import { protect, trustedCopies } from './immutable.mjs';

const fail = code => { throw Object.assign(new Error(code), { code }); };
export const keyOf = address => JSON.stringify([address.scopeId, address.name]);
const missing = Object.freeze({ status: 'missing' });
const pending = Object.freeze({ status: 'pending' });
const errorState = error => Object.freeze({ status: 'error', error: Object.freeze({ code: error?.code ?? 'TYPE_MISMATCH', message: error?.code ?? 'TYPE_MISMATCH' }) });
const same = (a, b) => a.status === b.status && (a.status === 'ready' ? equal(a.value, b.value) : a.status !== 'error' || a.error.code === b.error.code);
const changedValue = (before, after) => after.status === 'ready' && (before.status !== 'ready' || !equal(before.value, after.value));
let nextScope = 0, nextGeneration = 0;

export class StateProbe {
  #cells = new Map();
  #subscribers = new Set();
  #reactions = new Map();
  #notifying = false;
  #queued = [];
  #diagnostics = [];

  scope() {
    const store = this, scopeId = `probe-scope-${++nextScope}`;
    let alive = true;
    const current = () => { if (!alive) fail('CANCELLED'); };
    return Object.freeze({ scopeId,
      register(name, declaration) { current(); return store.#register(scopeId, name, declaration); },
      replace(name, declaration) { current(); return store.#register(scopeId, name, declaration, true); },
      get(name) { current(); return store.#lookup({ scopeId, name }).handle; },
      remove(name) { current(); store.#remove(store.#lookup({ scopeId, name })); },
      dispose() {
        if (!alive) return;
        alive = false;
        store.#perform(() => {
          const removed = [...store.#cells.values()].filter(cell => cell.address.scopeId === scopeId);
          for (const cell of removed) store.#cells.delete(keyOf(cell.address));
          for (const [target, reaction] of store.#reactions) if (reaction.owner === scopeId || removed.includes(target) || reaction.watch.some(cell => removed.includes(cell))) store.#reactions.delete(target);
          store.#notify(removed.map(cell => store.#change(cell, 'removed')));
        });
      },
    });
  }

  #lookup(address) { return this.#cells.get(keyOf(address)) ?? fail('REFERENCE_NOT_FOUND'); }
  #current(cell) { if (this.#cells.get(keyOf(cell.address)) !== cell) fail('CANCELLED'); }
  #accept(cell, value) { return Object.freeze({ status: 'ready', value: protect(cell.validator.accept(value, trustedCopies(value))) }); }
  #register(scopeId, name, declaration, replace = false) {
    const address = Object.freeze({ scopeId, name }), key = keyOf(address), previous = this.#cells.get(key);
    if (replace ? !previous : previous) fail(replace ? 'REFERENCE_NOT_FOUND' : 'DUPLICATE_STATE');
    if (!declaration || typeof declaration !== 'object' || !Object.hasOwn(declaration, 'schema')) fail('INVALID_DEFINITION');
    const validator = compileSchema(declaration.schema);
    const cell = { address, generation: ++nextGeneration, validator, state: missing, baseline: missing, writes: 0,
      derived: declaration.derived, dependencies: (declaration.dependencies ?? []).map(handle => this.#cellFor(handle)) };
    if (cell.derived && typeof cell.derived !== 'function') fail('INVALID_DEFINITION');
    // pendingInitial is a private fixture hook for an unresolved initial expression,
    // never a promise admitted as an ordinary data value.
    if (Object.hasOwn(declaration, 'pendingInitial') && Object.hasOwn(declaration, 'initial')) fail('INVALID_DEFINITION');
    if (Object.hasOwn(declaration, 'pendingInitial')) {
      cell.state = pending; cell.baseline = pending;
      Promise.resolve(declaration.pendingInitial).then(value => this.#settleInitial(cell, value), error => this.#settleInitial(cell, undefined, error)).catch(error => this.#diagnostics.push(errorState(error).error));
    } else if (Object.hasOwn(declaration, 'initial')) cell.state = cell.baseline = this.#accept(cell, declaration.initial);
    const store = this;
    cell.handle = Object.freeze({ address, generation: cell.generation,
      read() { store.#current(cell); if (cell.state.status === 'pending') fail('VALUE_PENDING'); if (cell.state.status === 'error') throw cell.state.error; return cell.state.status === 'ready' ? cell.state.value : undefined; },
      snapshot() { store.#current(cell); return cell.state; },
      write(value) { store.batch([[cell.handle, value]]); },
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
      this.#notify([this.#change(cell, previous ? 'replaced' : 'added')]);
    });
    return cell.handle;
  }
  #cellFor(handle) {
    const cell = this.#lookup(handle.address);
    if (cell.handle !== handle) fail('CANCELLED');
    return cell;
  }
  #settleInitial(cell, value, error) {
    if (this.#cells.get(keyOf(cell.address)) !== cell) return;
    let snapshot;
    try { snapshot = error ? errorState(error) : this.#accept(cell, value); } catch (caught) { snapshot = errorState(caught); }
    this.#perform(() => {
      if (this.#cells.get(keyOf(cell.address)) !== cell) return;
      cell.baseline = snapshot;
      if (cell.writes === 0) this.#commit(new Map([[cell, snapshot]]), new Set(), 'initial');
    });
  }
  #remove(cell) {
    this.#perform(() => {
      this.#current(cell); this.#cells.delete(keyOf(cell.address));
      for (const [target, reaction] of this.#reactions) if (target === cell || reaction.watch.includes(cell)) this.#reactions.delete(target);
      this.#notify([this.#change(cell, 'removed')]);
    });
  }

  batch(changes, { origin = 'explicit' } = {}) {
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
  reaction(owner, { watch, target, value }) {
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
    const snapshots = cell.dependencies.map(item => staged.get(item) ?? missing);
    const error = snapshots.find(item => item.status === 'error'); if (error) return error;
    if (snapshots.some(item => item.status === 'pending')) return pending;
    if (snapshots.some(item => item.status === 'missing')) return missing;
    try { return this.#accept(cell, cell.derived(...snapshots.map(item => item.value))); }
    catch (error) { return errorState(error); }
  }
  #commit(prepared, explicit, origin) {
    const before = new Map([...this.#cells.values()].map(cell => [cell, cell.state])), staged = new Map(before);
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
    const notifications = [...this.#subscribers].map(subscriber => [subscriber, this.#payload(subscriber.selector, changes)]).filter(([, payload]) => payload.changes.length);
    this.#notifying = true;
    try {
      for (const [subscriber, payload] of notifications) if (this.#subscribers.has(subscriber)) {
        try { subscriber.listener(payload); } catch (error) { this.#diagnostics.push(errorState(error).error); }
      }
    } finally { this.#notifying = false; }
  }
  subscribe(selector, listener) {
    const selected = selector == null ? null : new Set((Array.isArray(selector) ? selector : [selector]).map(keyOf));
    const subscriber = { selector: selected, listener }; this.#subscribers.add(subscriber);
    listener(this.#payload(selected, []));
    return () => this.#subscribers.delete(subscriber);
  }
  diagnostics() { return [...this.#diagnostics]; }
}
