import { isDeepStrictEqual } from 'node:util';
import { clone, deferred, probeError } from './harness.mjs';

// Preserve public source/transform locations, never raw exceptions/messages.
const publicCodes = new Set(['INVALID_DEFINITION', 'REFERENCE_NOT_FOUND', 'TYPE_MISMATCH', 'TYPE_CONTRACT_MISMATCH',
  'INVALID_EXPRESSION', 'INPUT_NOT_READY', 'VALUE_PENDING', 'EXECUTION_BLOCKED', 'QUERY_REFRESH_DISABLED',
  'INVALID_RETRY_STATE', 'ACTION_RECURSION', 'ASSERTION_FAILED', 'HTTP_ERROR', 'TIMEOUT', 'CANCELLED', 'LIMIT_EXCEEDED', 'INTERNAL_ERROR']);
function publicFailure(error, depth = 0) {
  let code = 'HTTP_ERROR', location, resource, cause;
  try {
    const field = key => Object.getOwnPropertyDescriptor(error, key)?.value;
    const candidate = field('code');
    if (typeof candidate === 'string' && publicCodes.has(candidate)) code = candidate;
    const path = field('location');
    if (typeof path === 'string' && path.startsWith('/') && !/~(?:[^01]|$)/.test(path)) location = path;
    const declared = field('resource');
    if (declared && typeof declared === 'object') {
      const kind = Object.getOwnPropertyDescriptor(declared, 'kind')?.value;
      const id = Object.getOwnPropertyDescriptor(declared, 'id')?.value;
      if (['Datasource', 'Query', 'Variable', 'Action', 'Component', 'View', 'Type'].includes(kind) && typeof id === 'string') resource = { kind, id };
    }
    const nested = field('cause');
    if (nested && depth < 8) cause = publicFailure(nested, depth + 1);
  } catch { /* Includes revoked Proxy/descriptor failures. */ }
  return { code, message: code, ...(location ? { location } : {}), ...(resource ? { resource } : {}), ...(cause ? { cause } : {}) };
}

// Experimental scheduler for JSON-valued fixtures, not a core/SDK implementation.
// Mutation switches are used only to demonstrate that fixtures detect broken guards.
function immutable(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

export class ProbeHost {
  slots = new Map();
  nextOwner = 0;

  constructor(clock, transport, trace, mutation = {}) {
    Object.assign(this, { clock, transport, trace, mutation });
  }

  mount(name, options = {}) {
    this.slots.get(name)?.query.dispose();
    const owner = ++this.nextOwner;
    const query = new QueryProbe(this, name, owner, options);
    this.slots.set(name, { owner, query, state: query.state });
    query.start();
    return query;
  }

  isCurrent(query) { return this.slots.get(query.name)?.query === query && query.alive; }
  snapshot(name = 'search') { return this.slots.get(name)?.state; }
}

class QueryProbe {
  alive = true;
  generation = 0;
  active = null;
  pending = null;
  tickets = new Set();
  state = immutable({ status: 'idle', data: undefined, dataInputs: undefined,
    error: null, stale: false, waitingReason: null });

  constructor(host, name, owner, options) {
    Object.assign(this, { host, name, owner });
    this.inputs = clone(options.inputs ?? { term: 'A' });
    this.ready = options.ready ?? true;
    this.gate = options.executeWhen ?? true;
    this.refreshEnabled = options.refresh ?? true;
    this.autoRefreshWhen = options.autoRefreshWhen ?? true;
    // This timeout models one transport plan, not an entire composite Query.
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error('timeoutMs must be a positive safe integer');
    }
  }

  start() { this._changed(); }
  snapshot() { return this.state; }

  _live() { return this.host.isCurrent(this); }
  _canPublish() { return this.host.mutation.skipLifetimeGuard || this._live(); }

  _publish(patch, reason) {
    if (!this._canPublish()) return;
    const next = Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, immutable(clone(value))]));
    this.state = Object.freeze({ ...this.state, ...next });
    // The address is intentionally reused on replacement; lifetime must guard it.
    this.host.slots.get(this.name).state = this.state;
    this.host.trace.push({ kind: 'snapshot', at: this.host.clock.now,
      owner: this.owner, generation: this.generation, reason, state: this.state });
  }

  configure(options) {
    if (!this._live()) throw probeError('CANCELLED');
    const inputs = Object.hasOwn(options, 'inputs') ? clone(options.inputs) : this.inputs;
    const ready = options.ready ?? this.ready;
    const gate = options.executeWhen ?? this.gate;
    const changed = !isDeepStrictEqual(inputs, this.inputs) || ready !== this.ready || gate !== this.gate;
    Object.assign(this, { inputs, ready, gate });
    if (Object.hasOwn(options, 'autoRefreshWhen')) this.autoRefreshWhen = options.autoRefreshWhen;
    if (!changed) return;
    ++this.generation;
    this._changed();
  }

  _changed() {
    // Fresh-run waiters must follow the newest inputs, even if their run started.
    const transferred = this.active?.tickets.splice(0) ?? [];
    const fresh = this.active?.fresh === true;
    if (this.pending) this.pending.tickets.push(...transferred);
    else this.pending = { tickets: transferred, automatic: true };
    this.pending.automatic = true;
    this.pending.fresh ||= fresh || transferred.some(ticket => !ticket.done);
    const hasData = this.state.data !== undefined;
    if (!this.gate) {
      this._rejectAll('EXECUTION_BLOCKED');
      this.pending = null;
      this._publish({ status: 'waiting', waitingReason: 'EXECUTION_BLOCKED',
        stale: hasData }, 'gate-closed');
    } else if (!this.ready) {
      this._publish({ status: 'waiting', waitingReason: 'INPUT_NOT_READY',
        stale: hasData }, 'input-not-ready');
    } else if (this.active) {
      this._publish({ status: 'running', waitingReason: null, stale: hasData }, 'latest-pending');
    } else {
      this._drain(hasData);
    }
  }

  handle(signal) {
    return { refresh: () => this.refresh(signal), retry: () => this.retry(signal) };
  }

  refresh(signal) { return this._request('refresh', signal); }
  retry(signal) { return this._request('retry', signal); }

  _request(kind, signal) {
    let failure;
    if (!this._live() || signal?.aborted) failure = 'CANCELLED';
    else if (!this.gate) failure = 'EXECUTION_BLOCKED';
    else if (!this.ready) failure = 'INPUT_NOT_READY';
    else if (kind === 'refresh' && !this.refreshEnabled) failure = 'QUERY_REFRESH_DISABLED';
    else if (kind === 'retry' && this.state.status !== 'error') failure = 'INVALID_RETRY_STATE';
    if (failure) return Promise.reject(probeError(failure));

    const completion = deferred();
    const ticket = { completion, signal, done: false };
    ticket.abort = () => {
      this._settle(ticket, 'CANCELLED');
      if (this.pending && !this.pending.automatic && this.pending.tickets.every(item => item.done)) {
        this.pending = null;
      }
    };
    signal?.addEventListener('abort', ticket.abort, { once: true });
    this.tickets.add(ticket);
    if (this.active && this.host.mutation.completeRefreshOnActive) {
      this.active.tickets.push(ticket);
    } else {
      this.pending ??= { tickets: [], automatic: false };
      this.pending.fresh = true;
      this.pending.tickets.push(ticket);
      this._drain();
    }
    return completion.promise;
  }

  // Explicit tick, not a polling scheduler. Interval timing is outside this probe.
  periodicTick() {
    if (!this._live() || !this.gate || !this.ready || !this.refreshEnabled || !this.autoRefreshWhen) return;
    this.pending ??= { tickets: [], automatic: true };
    this.pending.automatic = true;
    this.pending.fresh = true;
    this._drain();
  }

  _settle(ticket, code = null) {
    if (ticket.done) return;
    ticket.done = true;
    ticket.signal?.removeEventListener('abort', ticket.abort);
    this.tickets.delete(ticket);
    if (code) ticket.completion.reject(probeError(code));
    else ticket.completion.resolve(); // RefreshQuery is void; observe state separately.
  }

  _rejectAll(code) {
    for (const ticket of this.tickets) this._settle(ticket, code);
    if (this.active) this.active.tickets = [];
  }

  _drain(stale = this.state.stale) {
    if (!this._live() || this.active || !this.pending || !this.gate || !this.ready) return;
    const pending = this.pending;
    this.pending = null;
    const controller = new AbortController();
    const request = this.host.transport.execute(this.inputs, {
      signal: controller.signal, owner: this.owner, generation: this.generation, fresh: pending.fresh === true,
    });
    const run = { request, controller, generation: this.generation,
      inputs: clone(this.inputs), tickets: pending.tickets, fresh: pending.fresh === true, done: false };
    this.active = run;
    this._publish({ status: 'running', error: null, waitingReason: null, stale }, 'run-start');
    run.timer = this.host.clock.setTimeout(() => {
      controller.abort();
      this._finish(run, undefined, 'TIMEOUT');
    }, this.timeoutMs);
    request.completion.promise.then(
      value => this._finish(run, value, null),
      error => { const failure = publicFailure(error); this._finish(run, undefined, failure.code, failure); },
    );
  }

  _finish(run, value, code, failure = null) {
    if (run.done && !this.host.mutation.skipTerminalGuard) {
      this.host.trace.push({ kind: 'discard-terminal', at: this.host.clock.now,
        owner: this.owner, id: run.request.id, code });
      return;
    }
    run.done = true;
    this.host.clock.clearTimeout(run.timer);
    if (this.active === run) this.active = null;
    const valid = this._canPublish() && this.gate && this.ready
      && (this.host.mutation.skipGenerationGuard || run.generation === this.generation);
    this.host.trace.push({ kind: valid ? 'accept' : 'discard-obsolete', at: this.host.clock.now,
      owner: this.owner, id: run.request.id, generation: run.generation, currentGeneration: this.generation, code });
    if (valid) {
      if (code) {
        this._publish({ status: 'error', error: failure ?? { code, message: code },
          stale: this.state.data !== undefined, waitingReason: null }, 'run-error');
      } else {
        this._publish({ status: 'success', data: value, dataInputs: run.inputs,
          error: null, stale: false, waitingReason: null }, 'run-success');
      }
      for (const ticket of run.tickets) this._settle(ticket, code);
    } else if (this._live() && this.gate && run.tickets.some(ticket => !ticket.done)) {
      this.pending ??= { tickets: [], automatic: true };
      this.pending.tickets.push(...run.tickets);
    }
    this._drain();
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this._rejectAll('CANCELLED');
    this.pending = null;
    if (this.active) {
      this.host.clock.clearTimeout(this.active.timer);
      this.active.controller.abort();
    }
    this.host.trace.push({ kind: 'dispose', at: this.host.clock.now, owner: this.owner });
    this.host.transport.disposeOwner?.(this.owner);
  }
}
