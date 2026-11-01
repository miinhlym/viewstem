import { ProbeHost } from '../t2-query-races/query-probe.mjs';

const MAX_TIMER_MS = 2_147_483_647;

// A private experiment adapter: attach completion-driven polling to the existing
// Query prototype without changing its source or exporting a production API.
export class PollingHost extends ProbeHost {
  pollers = new Map();

  mount(name, options = {}) {
    if (options.intervalMs !== undefined
        && (!Number.isSafeInteger(options.intervalMs) || options.intervalMs <= 0)) {
      throw Object.assign(new Error('intervalMs must be a positive safe integer'), { code: 'INVALID_DEFINITION' });
    }
    const query = super.mount(name, options);
    const poller = new CompletionPoller(query, options.intervalMs, this.mutation);
    this.pollers.set(name, poller);
    return query;
  }
}

class CompletionPoller {
  timer = null;
  deadline = null;
  lastCompletedAt = null;
  epoch = 0;
  disposed = false;

  constructor(query, intervalMs, mutation) {
    Object.assign(this, { query, intervalMs, mutation, host: query.host });
    const drain = query._drain.bind(query);
    query._drain = (...args) => {
      const previous = query.active;
      const result = drain(...args);
      if (query.active && query.active !== previous) this.started();
      return result;
    };
    const finish = query._finish.bind(query);
    query._finish = (run, value, code) => {
      const first = !run.done;
      const result = finish(run, value, code);
      if (first || mutation.rearmOnLateCompletion) this.completed(code);
      return result;
    };
    const configure = query.configure.bind(query);
    query.configure = options => { const result = configure(options); this.sync(); return result; };
    const dispose = query.dispose.bind(query);
    query.dispose = () => { this.dispose(); return dispose(); };
    if (query.active) this.started();
  }

  now() { return this.host.clock.now; }
  log(kind, detail = {}) {
    this.host.trace.push({ kind, at: this.now(), owner: this.query.owner, name: this.query.name, ...detail });
  }
  allowed() {
    return !this.disposed && this.host.isCurrent(this.query) && this.intervalMs !== undefined
      && this.query.gate && this.query.ready && this.query.refreshEnabled
      && (this.query.autoRefreshWhen || this.mutation.ignoreAutoRefreshWhen);
  }
  clear() {
    ++this.epoch;
    if (this.timer !== null) this.host.clock.clearTimeout(this.timer);
    this.timer = null; this.deadline = null;
  }
  started() {
    this.clear();
    this.log('poll-run-start');
    if (this.mutation.anchorAtStart && this.allowed()) this.arm(this.now() + this.intervalMs);
  }
  completed(code) {
    this.lastCompletedAt = this.now();
    this.log('poll-run-complete', { code });
    this.sync(code);
  }
  sync(code = null) {
    if (!this.allowed() || this.query.active) {
      if (!this.mutation.anchorAtStart || !this.query.active) this.clear();
      return;
    }
    if (this.lastCompletedAt === null) return;
    const deadline = this.mutation.retryImmediately && code ? this.now() : this.lastCompletedAt + this.intervalMs;
    if (this.timer !== null && this.deadline === deadline) return;
    this.clear(); this.arm(deadline);
  }
  arm(deadline) {
    const epoch = this.epoch;
    this.deadline = deadline;
    const remaining = Math.max(0, deadline - this.now());
    const delay = this.mutation.skipTimerChunking ? remaining : Math.min(remaining, MAX_TIMER_MS);
    this.log('poll-scheduled', { deadline, delay });
    this.timer = this.host.clock.setTimeout(() => {
      if (epoch !== this.epoch || !this.allowed()) return;
      this.timer = null;
      if (this.now() < deadline) { this.arm(deadline); return; }
      this.deadline = null;
      if (this.query.active && !this.mutation.anchorAtStart) return;
      this.log('poll-tick');
      if (this.mutation.ignoreAutoRefreshWhen) {
        const saved = this.query.autoRefreshWhen;
        this.query.autoRefreshWhen = true;
        try { this.query.periodicTick(); } finally { this.query.autoRefreshWhen = saved; }
      } else this.query.periodicTick();
    }, delay);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.mutation.skipDisposeCleanup) this.clear();
    this.log('poll-disposed');
  }
}

export const MAX_NATIVE_TIMER_MS = MAX_TIMER_MS;
