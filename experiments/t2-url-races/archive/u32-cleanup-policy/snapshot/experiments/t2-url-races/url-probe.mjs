// Independent URL-boundary probe. No production StateStore, renderer, or public SDK.
export const defaults = { maxOwnedBytes: 8192, maxValueBytes: 4096, maxItems: 1000, maxKeys: 128 };
const bytes = value => new TextEncoder().encode(value).length;
const copy = value => structuredClone(value);
export const fail = code => Object.assign(new Error(code), { code });
export const relative = href => { const u = new URL(href); return u.pathname + u.search + u.hash; };

function defer() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function parts(href) {
  const query = new URL(href).search.slice(1);
  return query ? query.split('&').map(raw => {
    const pair = [...new URLSearchParams(raw)][0] ?? ['', ''];
    return { raw, key: pair[0], value: pair[1], encodedValue: raw.includes('=') ? raw.slice(raw.indexOf('=') + 1) : '' };
  }) : [];
}

export function mergeOwned(href, patch) {
  const url = new URL(href);
  const changes = new Map(Object.entries(patch));
  const existing = parts(href);
  for (const [key, value] of changes) {
    const matches = existing.filter(part => part.key === key);
    if ((value === null && matches.length === 0)
      || (value !== null && matches.length === 1 && matches[0].value === value)) changes.delete(key);
  }
  const retained = existing.filter(part => !changes.has(part.key)).map(part => part.raw);
  for (const [key, value] of changes) {
    if (value !== null) retained.push(new URLSearchParams([[key, value]]).toString());
  }
  url.search = retained.join('&');
  return url.href;
}

function checkOutput(href, keys, limits) {
  const owned = parts(href).filter(part => keys.has(part.key));
  if (bytes(owned.map(part => part.raw).join('&')) > limits.maxOwnedBytes
    || owned.some(part => bytes(part.encodedValue) > limits.maxValueBytes)) throw fail('LIMIT_EXCEEDED');
}

export class CommitQueue {
  jobs = [];
  trace = [];
  constructor(endpoint, mutation = {}) { Object.assign(this, { endpoint, mutation }); }

  adapter(keys, limits = defaults) {
    const owned = new Set(keys);
    return {
      read: () => this.endpoint.read(),
      subscribe: listener => this.endpoint.subscribe(listener),
      writeOwned: (patch, { mode = 'replace', isCurrent }) => {
        if (Object.keys(patch).some(key => !owned.has(key))) throw fail('UNOWNED_KEY');
        const completion = defer();
        const job = { id: this.jobs.length + 1, patch: copy(patch), mode, isCurrent,
          keys: owned, limits, base: this.endpoint.read(), currentAtStart: isCurrent(),
          completion, released: false };
        this.jobs.push(job);
        this.trace.push({ kind: 'queued', id: job.id, patch: copy(patch), mode });
        return completion.promise;
      },
    };
  }

  // This is the deliberately delayed transport boundary. Commit itself is synchronous.
  async release(id, { failure = false, prepare } = {}) {
    const job = this.jobs.find(item => item.id === id);
    if (!job || job.released) throw new Error(`Invalid job ${id}`);
    job.released = true;
    const beforePrepare = job.isCurrent();
    if (prepare) await prepare();
    const valid = this.mutation.skipCommitGuard ? true
      : this.mutation.checkOnlyAtStart ? job.currentAtStart
        : this.mutation.checkBeforePreparation ? beforePrepare : job.isCurrent();
    if (!valid) {
      this.trace.push({ kind: 'discarded', id });
      job.completion.resolve({ applied: false });
    } else {
      try {
        if (failure) throw fail('URL_WRITE_FAILED');
        const base = this.mutation.staleUrlSnapshot ? job.base : this.endpoint.read();
        const next = mergeOwned(base, job.patch);
        checkOutput(next, job.keys, job.limits);
        // No await between final validity check, latest-URL merge, and external effect.
        if (next !== this.endpoint.read()) {
          this.endpoint.commit(next, job.mode);
          this.trace.push({ kind: 'committed', id, mode: job.mode, url: relative(next) });
        } else this.trace.push({ kind: 'unchanged', id });
        job.completion.resolve({ applied: true });
      } catch (error) {
        this.trace.push({ kind: 'failed', id, code: error.code ?? error.name });
        job.completion.reject(error);
      }
    }
    // Drain connection completion callbacks; no real-time sleep.
    await Promise.resolve();
    await Promise.resolve();
  }
}

function validate(value, binding, limits) {
  if (value === null && binding.nullable) return null;
  const collection = binding.type.startsWith('array:') || binding.type.startsWith('set:');
  const type = collection ? binding.type.split(':')[1] : binding.type;
  const scalar = item => typeof item === type && (type !== 'number' || Number.isFinite(item));
  if (!collection) {
    if (!scalar(value)) throw fail('TYPE_MISMATCH');
    return Object.is(value, -0) ? 0 : value;
  }
  const isSet = binding.type.startsWith('set:');
  if (!(isSet ? value instanceof Set : Array.isArray(value))) throw fail('TYPE_MISMATCH');
  const items = [...value];
  if (items.length > limits.maxItems) throw fail('LIMIT_EXCEEDED');
  if (!items.every(scalar)) throw fail('TYPE_MISMATCH');
  const normalized = items.map(item => Object.is(item, -0) ? 0 : item);
  return isSet ? new Set(normalized) : normalized;
}

const wire = value => JSON.stringify(value instanceof Set ? [...value] : value);
const sameValue = (left, right) => left instanceof Set && right instanceof Set
  ? left.size === right.size && [...left].every(item => right.has(item))
  : wire(left) === wire(right);

export class UrlProbeHost {
  owners = new Map();
  stores = new Map();
  connections = [];
  replacements = new Set();
  constructor(queue) { this.queue = queue; }

  prepare(storeId, bindings, options = {}, replacing) {
    const limits = { ...defaults, ...options.limits };
    for (const value of Object.values(limits)) {
      if (!Number.isSafeInteger(value) || value <= 0) throw fail('INVALID_DEFINITION');
    }
    if (this.stores.has(storeId) && this.stores.get(storeId) !== replacing) throw fail('DUPLICATE_CONNECTION');
    const normalized = bindings.map(binding => ({ history: 'replace', ...binding, key: binding.key ?? `p.${binding.name}` }));
    const names = new Set(normalized.map(binding => binding.name));
    const keys = new Set(normalized.map(binding => binding.key));
    if (keys.size !== normalized.length || names.size !== normalized.length
      || [...keys].some(key => this.owners.has(key) && this.owners.get(key) !== replacing)) throw fail('DUPLICATE_KEY');
    if (keys.size > limits.maxKeys) throw fail('LIMIT_EXCEEDED');
    for (const binding of normalized) {
      if (!['string', 'number', 'boolean', 'array:string', 'array:number', 'set:string', 'set:number'].includes(binding.type)) {
        throw fail('UNSUPPORTED_BINDING');
      }
      if (!['replace', 'push'].includes(binding.history)) throw fail('INVALID_DEFINITION');
      if (binding.baseline !== undefined) {
        const value = validate(binding.baseline, binding, limits);
        if (!this.queue.mutation.keepUnnormalizedBaseline) binding.baseline = value;
      }
    }
    return { bindings: copy(normalized), keys, limits };
  }

  connect(storeId, bindings, options = {}) {
    const { bindings: normalized, keys, limits } = this.prepare(storeId, bindings, options);
    const connection = new UrlConnection(this, storeId, normalized, limits);
    if (!this.queue.mutation.skipReplacementInvalidation) {
      for (const replacement of this.replacements) {
        if (replacement.stores.has(storeId) || [...keys].some(key => replacement.keys.has(key))) replacement.cancel();
      }
    }
    this.stores.set(storeId, connection);
    for (const key of keys) this.owners.set(key, connection);
    this.connections.push(connection);
    if (options.restore !== false) connection.restore();
    return connection;
  }

  // Explicit replacement fixture: cleanup commits before new initial state is connected.
  replace(old, storeId, bindings, options = {}) {
    if (!old.alive || this.stores.get(old.storeId) !== old) throw fail('CANCELLED');
    const prepared = this.prepare(storeId, bindings, options, old);
    const keys = old.bindings.map(binding => binding.key);
    old.dispose();
    let current = true;
    const transition = {
      stores: new Set([old.storeId, storeId]), keys: new Set([...keys, ...prepared.keys]),
      cancel: () => { current = false; this.replacements.delete(transition); },
    };
    this.replacements.add(transition);
    const adapter = this.queue.adapter(keys);
    const completion = adapter.writeOwned(Object.fromEntries(keys.map(key => [key, null])), {
      mode: 'replace', isCurrent: () => current,
    }).then(({ applied }) => {
      this.replacements.delete(transition);
      if (!current || !applied) throw fail('CANCELLED');
      return this.connect(storeId, prepared.bindings, { limits: prepared.limits, restore: false });
    }, error => {
      this.replacements.delete(transition);
      throw error;
    });
    Object.assign(transition, { jobId: this.queue.jobs.at(-1).id, completion });
    return transition;
  }
}

class UrlConnection {
  alive = true;
  revision = 0;
  dirty = new Map();
  diagnostics = [];
  stateChanges = 0;
  parseCalls = 0;

  constructor(host, storeId, bindings, limits) {
    Object.assign(this, { host, storeId, bindings, limits });
    this.baseline = Object.fromEntries(bindings.map(binding => [binding.name, copy(binding.baseline)]));
    this.values = copy(this.baseline);
    this.adapter = host.queue.adapter(bindings.map(binding => binding.key), limits);
    this.unsubscribe = this.adapter.subscribe(() => this.restore());
  }

  restore() {
    if (!this.alive) return;
    if (!this.host.queue.mutation.skipRestoreInvalidation) ++this.revision;
    this.dirty.clear();
    const next = copy(this.baseline);
    const all = parts(this.adapter.read());
    const keys = new Set(this.bindings.map(binding => binding.key));
    const owned = all.filter(part => keys.has(part.key));
    const tooLarge = bytes(owned.map(part => part.raw).join('&')) > this.limits.maxOwnedBytes;
    for (const binding of this.bindings) {
      const entries = owned.filter(part => part.key === binding.key);
      if (!entries.length) continue;
      try {
        if (tooLarge || entries.some(part => bytes(part.encodedValue) > this.limits.maxValueBytes)) throw fail('LIMIT_EXCEEDED');
        if (entries.length > 1) throw fail('DUPLICATE_KEY');
        ++this.parseCalls;
        let value = JSON.parse(entries[0].value);
        if (binding.type.startsWith('set:') && Array.isArray(value)) {
          if (value.length > this.limits.maxItems) throw fail('LIMIT_EXCEEDED');
          value = new Set(value);
        }
        next[binding.name] = validate(value, binding, this.limits);
      } catch (error) {
        this.diagnostics.push({ kind: 'restore', key: binding.key, code: error.code ?? 'INVALID_JSON' });
      }
    }
    this.values = next;
  }

  write(changes) {
    if (!this.alive) throw fail('CANCELLED');
    const checked = [];
    for (const [name, value] of Object.entries(changes)) {
      const binding = this.bindings.find(item => item.name === name);
      if (!binding) throw fail('REFERENCE_NOT_FOUND');
      checked.push([binding, validate(value, binding, { ...this.limits, maxItems: Number.MAX_SAFE_INTEGER })]);
    }
    ++this.revision;
    ++this.stateChanges;
    if (this.host.queue.mutation.dropPendingPatch) this.dirty.clear();
    for (const [binding, value] of checked) {
      const changed = !sameValue(this.values[binding.name], value);
      const history = this.dirty.get(binding.key)?.history === 'push'
        || (changed && binding.history === 'push') ? 'push' : 'replace';
      this.values[binding.name] = copy(value);
      this.dirty.set(binding.key, { value: wire(value), history, count: value instanceof Set ? value.size : Array.isArray(value) ? value.length : 0 });
    }
    const revision = this.revision;
    const isCurrent = () => this.alive && this.revision === revision;
    if ([...this.dirty.values()].some(item => item.count > this.limits.maxItems)) {
      this.diagnostics.push({ kind: 'write', code: 'LIMIT_EXCEEDED' });
      return Promise.resolve({ applied: false, code: 'LIMIT_EXCEEDED' });
    }
    const patch = Object.fromEntries([...this.dirty].map(([key, item]) => [key, item.value]));
    const mode = [...this.dirty.values()].some(item => item.history === 'push') ? 'push' : 'replace';
    return this.adapter.writeOwned(patch, { mode, isCurrent }).then(
      result => { if (isCurrent() && result.applied) this.dirty.clear(); return result; },
      error => {
        if (isCurrent()) this.diagnostics.push({ kind: 'write', code: error.code ?? error.name });
        return { applied: false, code: error.code ?? error.name };
      },
    );
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    ++this.revision;
    this.dirty.clear();
    this.unsubscribe();
    this.host.stores.delete(this.storeId);
    for (const binding of this.bindings) {
      if (this.host.owners.get(binding.key) === this) this.host.owners.delete(binding.key);
    }
  }
}
