import { setImmediate } from 'node:timers/promises';

// Drain real Promise reactions without sleeping or issuing network requests.
export const flush = () => setImmediate();
export const clone = value => structuredClone(value);

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function observe(promise) {
  const result = { status: 'pending' };
  result.settled = promise.then(
    value => Object.assign(result, { status: 'fulfilled', value }),
    error => Object.assign(result, { status: 'rejected', code: error.code }),
  );
  return result;
}

export function probeError(code) {
  return Object.assign(new Error(code), { code });
}

export class FakeClock {
  now = 0;
  nextId = 0;
  tasks = new Map();

  setTimeout(fn, delay) {
    const id = ++this.nextId;
    this.tasks.set(id, { at: this.now + delay, fn });
    return id;
  }

  clearTimeout(id) { this.tasks.delete(id); }

  async advance(ms) {
    const end = this.now + ms;
    while (true) {
      const next = [...this.tasks].filter(([, task]) => task.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, task] = next;
      this.now = task.at;
      this.tasks.delete(id);
      task.fn();
      await flush();
    }
    this.now = end;
    await flush();
  }
}

// Deliberately ignores AbortSignal: an aborted request can still resolve/reject.
export class ControlledTransport {
  requests = [];

  constructor(clock, trace) { this.clock = clock; this.trace = trace; }

  execute(inputs, { signal, owner, generation }) {
    const completion = deferred();
    const request = {
      id: this.requests.length + 1, owner, generation,
      inputs: clone(inputs), signal, completed: false, completion,
    };
    this.requests.push(request);
    this.trace.push({ kind: 'request', at: this.clock.now, id: request.id,
      owner, generation, inputs: clone(inputs) });
    signal.addEventListener('abort', () => {
      this.trace.push({ kind: 'abort-observed-but-ignored', at: this.clock.now, id: request.id });
    }, { once: true });
    return request;
  }

  respond(id, value, code = null) {
    const request = this.requests.find(item => item.id === id);
    if (!request || request.completed) throw new Error(`Invalid completion: ${id}`);
    request.completed = true;
    this.trace.push({ kind: 'transport-completion', at: this.clock.now, id, code });
    if (code) request.completion.reject(probeError(code));
    else request.completion.resolve(clone(value));
  }

  outstanding() { return this.requests.filter(request => !request.completed); }
}
