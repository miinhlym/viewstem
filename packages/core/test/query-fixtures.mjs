import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createQueryEngine } from '../src/query/index.mjs';
import { createRegistry } from '../src/registry.mjs';
import { error as publicError } from '../src/errors.mjs';

const plain = value => {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(plain);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
};
export const check = Object.assign((...args) => assert(...args), assert, { deepEqual: (a, b, message) => assert.deepEqual(plain(a), plain(b), message) });
export const flush = () => setImmediate();
export const clone = value => structuredClone(value);
export function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
export function observe(promise) {
  const result = { status: 'pending' };
  result.settled = promise.then(value => Object.assign(result, { status: 'fulfilled', value }), error => Object.assign(result, { status: 'rejected', code: error.code }));
  return result;
}
export const probeError = code => publicError(code);
export { publicError };
export class FakeClock {
  now = 0; nextId = 0; tasks = new Map();
  setTimeout(fn, delay) { const id = ++this.nextId; this.tasks.set(id, { at: this.now + delay, fn }); return id; }
  clearTimeout(id) { this.tasks.delete(id); }
  async advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, task] = next; this.now = task.at; this.tasks.delete(id); task.fn(); await flush();
    }
    this.now = end; await flush();
  }
}
export class ControlledTransport {
  requests = [];
  constructor(clock, trace) { Object.assign(this, { clock, trace }); }
  execute(inputs, metadata) {
    const completion = deferred(), request = { id: this.requests.length + 1, inputs: clone(inputs), ...metadata, completed: false, completion };
    this.requests.push(request); return request;
  }
  respond(id, value, code = null) {
    const request = this.requests.find(row => row.id === id);
    if (!request || request.completed) throw Error(`Invalid completion ${id}`);
    request.completed = true;
    if (code) request.completion.reject(publicError(code)); else request.completion.resolve(clone(value));
  }
  outstanding() { return this.requests.filter(row => !row.completed); }
}
export class ProbeHost {
  slots = new Map(); pollers = new Map(); nextOwner = 0;
  constructor(clock, transport, trace) { Object.assign(this, { clock, transport, trace }); }
  mount(name, options = {}) {
    if (options.intervalMs !== undefined && (!Number.isSafeInteger(options.intervalMs) || options.intervalMs <= 0)) throw publicError('INVALID_DEFINITION');
    this.slots.get(name)?.query.dispose();
    const owner = ++this.nextOwner;
    let query, deadlineEpoch, pollDeadline;
    const usageClock = {
      now: () => this.clock.now,
      clearTimeout: id => this.clock.clearTimeout(id),
      setTimeout: (fn, delay) => {
        const periodic = query && !query.active;
        if (periodic) {
          if (deadlineEpoch !== query.timerEpoch) { deadlineEpoch = query.timerEpoch; pollDeadline = this.clock.now + query.settings.intervalMs; }
          this.trace.push({ kind: 'poll-scheduled', at: this.clock.now, owner, deadline: pollDeadline, delay });
        }
        return this.clock.setTimeout(() => {
          const before = this.transport.requests.length; fn();
          if (periodic && this.transport.requests.length > before) this.trace.push({ kind: 'poll-tick', at: this.clock.now, owner });
        }, delay);
      },
    };
    const definition = { kind: 'Query', id: 'fixture', spec: {
      ports: { term: { kind: 'Value', required: true, schema: true }, filter: { kind: 'Value', schema: true } }, sources: { main: {
        datasource: { kind: 'Http', baseUrl: 'https://example.com' }, request: { method: 'GET', path: '/fixture' },
      } }, transform: { input: { '@path': '/sources/main' } },
    } };
    const engine = createQueryEngine({ registry: { get: () => definition }, requestTimeoutMs: options.timeoutMs ?? 30_000, clock: usageClock,
      requestExecutor: (plan, { signal }) => {
        const request = this.transport.execute(plan.inputs, { signal, owner, generation: query?.generation ?? 0 });
        if (query?.active) query.active.request = request;
        return request.completion.promise.then(body => ({ status: 200, headers: {}, body }));
      },
    });
    const execute = engine.execute;
    engine.execute = (use, metadata) => execute(use, metadata).then(value => {
      if (!metadata.isCurrent()) this.trace.push({ kind: 'discard-obsolete', owner }); return value;
    }, error => { if (!metadata.isCurrent()) this.trace.push({ kind: 'discard-obsolete', owner }); throw error; });
    query = engine.createUsage('fixture', { inputs: { term: 'A' }, owner, clock: usageClock, ...options,
      onChange: state => {
        if (state.status === 'success' || state.status === 'error') this.trace.push({ kind: 'accept', owner, code: state.error?.code ?? null });
      },
    });
    if (query.active) query.active.request = this.transport.requests.at(-1);
    this.slots.set(name, { owner, query }); this.pollers.set(name, query); return query;
  }
  getSnapshot(name = 'search') { return this.slots.get(name)?.query.getSnapshot(); }
}
export const PollingHost = ProbeHost;
export const MAX_NATIVE_TIMER_MS = 2_147_483_647;
