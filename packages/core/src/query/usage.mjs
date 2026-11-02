import { equal } from '../schema.mjs';
import { protect } from '../immutable.mjs';
import { safeError } from '../errors.mjs';

const failure = code => ({ code, message: code });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const nativeClock = { now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) };

/** One active execution and one replaceable pending intent per usage lifetime. */
export class QueryUsage {
  alive = true;
  generation = 0;
  active = null;
  pending = null;
  tickets = new Set();
  timer = null;
  timerEpoch = 0;
  state = Object.freeze({ status: 'idle', data: undefined, dataInputs: undefined, error: null, stale: false, waitingReason: null });

  constructor(engine, use, options) {
    this.engine = engine; this.use = use;
    this.owner = options.owner ?? this;
    this.clock = options.clock ?? nativeClock;
    this.onChange = options.onChange;
    this.initial = deferred(); this.initialSettled = this.initial.promise;
    this.settings = { inputs: {}, ready: true, executeWhen: true, refresh: true, autoRefreshWhen: true, ...options };
    this.validateSettings(this.settings);
    this.prepare();
    this.changed();
  }
  validateSettings(settings) {
    for (const key of ['ready', 'executeWhen', 'refresh', 'autoRefreshWhen']) {
      if (typeof settings[key] !== 'boolean') throw failure('TYPE_MISMATCH');
    }
    if (settings.intervalMs !== undefined && (!Number.isSafeInteger(settings.intervalMs) || settings.intervalMs <= 0)) throw failure('INVALID_DEFINITION');
  }
  prepare() {
    if (!this.settings.ready || this.settings.inputError) { this.inputs = protect(this.settings.inputs); this.ready = false; return; }
    const prepared = this.engine.prepare(this.use, this.settings.inputs, 'automatic');
    this.inputs = prepared.ports;
    this.ready = this.settings.ready && prepared.status === 'ready';
  }
  getSnapshot() { return this.state; }
  publish(patch) {
    if (!this.alive) return;
    this.state = Object.freeze({ ...this.state, ...patch });
    if (this.state.status !== 'running' && this.state.status !== 'idle') this.initial.resolve(this.state);
    // An observer must not be able to corrupt the scheduler through its exception.
    try { this.onChange?.(this.state); } catch { /* Observation does not own execution. */ }
  }
  update(options = {}) {
    if (!this.alive) throw failure('CANCELLED');
    const next = { ...this.settings, ...options }; this.validateSettings(next);
    const previous = this.settings, oldInputs = this.inputs, oldReady = this.ready;
    this.settings = next; this.prepare();
    const changed = !equal(oldInputs, this.inputs) || oldReady !== this.ready || previous.executeWhen !== next.executeWhen || !equal(previous.inputError, next.inputError);
    const resume = previous.autoRefreshWhen === false && next.autoRefreshWhen === true && this.pollAllowed();
    const scheduleChanged = previous.intervalMs !== next.intervalMs || previous.refresh !== next.refresh;
    if (scheduleChanged) this.clearTimer();
    if (!this.pollAllowed()) { this.clearTimer(); this.cancelPeriodic(); }
    if (changed) { ++this.generation; this.changed(false); }
    if (resume) { this.clearTimer(); this.periodic(false); }
    this.drain(changed ? this.state.data !== undefined || this.state.stale : this.state.stale);
    if (!changed && !resume && scheduleChanged) this.arm();
    return this.state;
  }
  // Alias keeps host adapters small when migrating completion-driven schedulers.
  configure(options) { return this.update(options); }
  changed(drain = true) {
    const transferred = this.active?.tickets.splice(0) ?? [];
    const fresh = this.active?.fresh === true;
    this.pending ??= { tickets: [], automatic: true };
    this.pending.tickets.push(...transferred);
    this.pending.automatic = true;
    this.pending.fresh ||= fresh || transferred.some(ticket => !ticket.done);
    const hasData = this.state.data !== undefined;
    if (this.settings.inputError && !['INPUT_NOT_READY', 'VALUE_PENDING'].includes(this.settings.inputError.code)) {
      const error = safeError(this.settings.inputError);
      this.rejectAll(error); this.pending = null;
      this.publish({ status: 'error', error, waitingReason: null, stale: hasData });
    } else if (!this.settings.executeWhen) {
      this.rejectAll('EXECUTION_BLOCKED'); this.pending = null;
      this.publish({ status: 'waiting', waitingReason: 'EXECUTION_BLOCKED', stale: hasData });
    } else if (!this.ready) {
      this.publish({ status: 'waiting', waitingReason: 'INPUT_NOT_READY', stale: hasData });
    } else if (this.active) {
      this.publish({ status: 'running', waitingReason: null, stale: hasData });
    }
    if (drain) this.drain(hasData || this.state.stale);
  }
  handle(signal) { return { refresh: () => this.refresh(signal), retry: () => this.retry(signal) }; }
  periodicTick() {
    if (!this.alive || !this.settings.executeWhen || !this.ready || !this.settings.refresh || !this.settings.autoRefreshWhen) return;
    this.pending ??= { tickets: [], automatic: false }; this.pending.periodic = true; this.drain();
  }
  refresh(signal) { return this.request('refresh', signal); }
  retry(signal) { return this.request('retry', signal); }
  request(kind, signal) {
    // Accept both AbortSignal and the conventional {signal} options shape.
    signal = signal?.signal ?? signal;
    let code;
    if (!this.alive || signal?.aborted) code = 'CANCELLED';
    else if (this.settings.inputError && !['INPUT_NOT_READY', 'VALUE_PENDING'].includes(this.settings.inputError.code)) return Promise.reject(safeError(this.settings.inputError));
    else if (!this.settings.executeWhen) code = 'EXECUTION_BLOCKED';
    else if (!this.ready) code = 'INPUT_NOT_READY';
    else if (kind === 'refresh' && !this.settings.refresh) code = 'QUERY_REFRESH_DISABLED';
    else if (kind === 'retry' && this.state.status !== 'error') code = 'INVALID_RETRY_STATE';
    if (code) return Promise.reject(failure(code));
    const ticket = { ...deferred(), signal, done: false };
    ticket.abort = () => {
      this.settle(ticket, failure('CANCELLED'));
      if (this.pending && !this.pending.automatic && !this.pending.periodic && this.pending.tickets.every(item => item.done)) this.pending = null;
    };
    signal?.addEventListener('abort', ticket.abort, { once: true });
    this.tickets.add(ticket);
    this.pending ??= { tickets: [], automatic: false };
    this.pending.fresh = true; this.pending.tickets.push(ticket);
    this.drain();
    return ticket.promise;
  }
  settle(ticket, error) {
    if (ticket.done) return;
    ticket.done = true; ticket.signal?.removeEventListener('abort', ticket.abort); this.tickets.delete(ticket);
    if (error) ticket.reject(error); else ticket.resolve();
  }
  rejectAll(code) {
    for (const ticket of this.tickets) this.settle(ticket, typeof code === 'string' ? failure(code) : code);
    if (this.active) this.active.tickets = [];
  }
  drain(stale = this.state.stale) {
    if (!this.alive || this.active || !this.pending || !this.settings.executeWhen || !this.ready) return;
    const pending = this.pending; this.pending = null;
    const run = { controller: new AbortController(), generation: this.generation, inputs: this.inputs,
      tickets: pending.tickets, fresh: pending.fresh === true || pending.periodic === true, done: false };
    this.active = run; this.clearTimer();
    this.publish({ status: 'running', error: null, waitingReason: null, stale });
    this.engine.execute(this.use, { inputs: run.inputs, owner: this.owner,
      fresh: run.fresh, signal: run.controller.signal,
      isCurrent: () => this.alive && this.settings.executeWhen && this.ready && run.generation === this.generation,
    }).then(value => this.finish(run, value), error => this.finish(run, undefined, safeError(error, 'HTTP_ERROR')));
  }
  finish(run, value, error) {
    if (run.done) return;
    run.done = true;
    if (this.active === run) this.active = null;
    const valid = this.alive && this.settings.executeWhen && this.ready && run.generation === this.generation;
    if (valid) {
      if (error) this.publish({ status: 'error', error: protect(error), stale: this.state.data !== undefined, waitingReason: null });
      else this.publish({ status: 'success', data: value, dataInputs: protect(run.inputs), error: null, stale: false, waitingReason: null });
      for (const ticket of run.tickets) this.settle(ticket, error);
    } else if (this.alive && this.settings.executeWhen && run.tickets.some(ticket => !ticket.done)) {
      this.pending ??= { tickets: [], automatic: true };
      this.pending.tickets.push(...run.tickets);
    }
    this.drain();
    this.arm();
  }
  pollAllowed() {
    return this.alive && this.settings.intervalMs !== undefined && this.settings.executeWhen && this.ready && this.settings.refresh && this.settings.autoRefreshWhen;
  }
  clearTimer() {
    ++this.timerEpoch;
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }
  cancelPeriodic() {
    if (!this.pending?.periodic) return;
    this.pending.periodic = false;
    if (!this.pending.automatic && this.pending.tickets.every(ticket => ticket.done)) this.pending = null;
  }
  periodic(drain = true) {
    if (!this.pollAllowed()) return;
    this.pending ??= { tickets: [], automatic: false };
    this.pending.periodic = true;
    if (drain) this.drain();
  }
  now() { return typeof this.clock.now === 'function' ? this.clock.now() : this.clock.now; }
  arm() {
    if (!this.pollAllowed() || this.active || this.pending || this.timer !== null) return;
    const deadline = this.now() + this.settings.intervalMs, epoch = this.timerEpoch;
    const schedule = () => {
      if (epoch !== this.timerEpoch || !this.pollAllowed()) return;
      const remaining = Math.max(0, deadline - this.now());
      this.timer = this.clock.setTimeout(() => {
        if (epoch !== this.timerEpoch || !this.pollAllowed()) return;
        this.timer = null;
        if (this.now() < deadline) schedule(); else this.periodic();
      }, Math.min(remaining, 2_147_483_647));
    };
    schedule();
  }
  dispose() {
    if (!this.alive) return;
    this.alive = false; this.clearTimer(); this.rejectAll('CANCELLED'); this.pending = null;
    this.active?.controller.abort(); this.engine.forget(this.owner); this.initial.resolve(this.state);
  }
}
