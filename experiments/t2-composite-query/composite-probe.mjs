import { isDeepStrictEqual } from 'node:util';
import { createValueEvaluator, isRecord, validateTemplate, expressionKind, dataEntries } from '../t2-http-boundary/value-expressions.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const escape = key => key.replace(/~/g, '~0').replace(/\//g, '~1');
const fail = (code, location, resource) => {
  const error = { code, message: code, ...(location ? { location } : {}), ...(resource ? { resource } : {}) };
  publicErrors.add(error); throw error;
};
const codes = new Set(['INVALID_DEFINITION', 'REFERENCE_NOT_FOUND', 'INVALID_EXPRESSION', 'TYPE_MISMATCH',
  'INPUT_NOT_READY', 'HTTP_ERROR', 'TIMEOUT', 'CANCELLED', 'EXECUTION_BLOCKED', 'LIMIT_EXCEEDED']);
function clean(error, location, resource) {
  let code = 'HTTP_ERROR', cause;
  try {
    const value = Object.getOwnPropertyDescriptor(error, 'code')?.value;
    if (codes.has(value)) code = value;
    if (publicErrors.has(error)) cause = error;
  } catch { /* Opaque exceptions are never inspected through getters. */ }
  const result = { code, message: code, location, resource, ...(cause ? { cause } : {}) };
  publicErrors.add(result); return result;
}
const publicErrors = new WeakSet();
const object = value => { if (!isRecord(value)) fail('INVALID_DEFINITION'); return value; };
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

export function joinRows(left, right, step) {
  if (!Array.isArray(left) || !Array.isArray(right) || !left.every(isRecord) || !right.every(isRecord)) fail('TYPE_MISMATCH');
  const keys = (rows, side) => rows.map(row => step.on.map(pair => {
    if (!own(row, pair[side])) fail('REFERENCE_NOT_FOUND');
    const key = row[pair[side]];
    if (key !== null && (!['string', 'number', 'boolean'].includes(typeof key) || (typeof key === 'number' && !Number.isFinite(key)))) fail('TYPE_MISMATCH');
    return key;
  }));
  const lk = keys(left, 'left'), rk = keys(right, 'right');
  const matches = (a, b) => a.every((v, i) => v !== null && b[i] !== null && typeof v === typeof b[i] && v === b[i]);
  const result = [], mode = step.mode ?? 'left';
  if (mode === 'right') {
    right.forEach((r, ri) => {
      let found = false;
      left.forEach((l, li) => { if (matches(lk[li], rk[ri])) { result.push({ ...l, ...r }); found = true; } });
      if (!found) result.push({ ...r });
    });
  } else {
    left.forEach((l, li) => {
      let found = false;
      right.forEach((r, ri) => { if (matches(lk[li], rk[ri])) { result.push({ ...l, ...r }); found = true; } });
      if (!found && mode === 'left') result.push({ ...l });
    });
  }
  return result;
}

// Bounded Query-spec experiment: explicit sources/inputs, Concat/Join and reuse.
// This is not the production registry, schema engine, CEL or Action executor.
export class CompositeEngine {
  caches = new Map();
  nextRun = 0;

  constructor({ queries, datasources = {}, executeHttp, trace = [], mutation = {} }) {
    this.queries = structuredClone(queries); this.datasources = structuredClone(datasources);
    Object.assign(this, { executeHttp, trace, mutation });
    object(this.queries); object(this.datasources);
    const visiting = new Set(), visited = new Set();
    const visit = spec => {
      object(spec);
      if (visiting.has(spec)) fail('INVALID_DEFINITION');
      if (visited.has(spec)) return;
      visiting.add(spec); object(spec.sources); object(spec.transform);
      if (!own(spec.transform, 'input')) fail('INVALID_DEFINITION');
      validateTemplate(spec.transform.input);
      const steps = spec.transform.steps === undefined ? [] : spec.transform.steps;
      if (!Array.isArray(steps)) fail('INVALID_DEFINITION');
      for (const step of steps) {
        object(step);
        if (step.kind === 'Concat') {
          if (!Array.isArray(step.with)) fail('INVALID_DEFINITION');
          validateTemplate(step.with);
        } else if (step.kind === 'Join') {
          if (!['left', 'right', 'inner'].includes(step.mode === undefined ? 'left' : step.mode) || !own(step, 'right')
              || !Array.isArray(step.on) || !step.on.length || !step.on.every(pair => isRecord(pair)
                && typeof pair.left === 'string' && typeof pair.right === 'string')) fail('INVALID_DEFINITION');
          validateTemplate(step.right);
        } else fail('INVALID_DEFINITION');
      }
      for (const source of Object.values(spec.sources)) {
        object(source);
        const declarations = ['queryRef', 'query', 'datasourceRef', 'datasource'].filter(key => own(source, key));
        if (declarations.length !== 1) fail('INVALID_DEFINITION');
        if (declarations[0].startsWith('query')) {
          if (own(source, 'request')) fail('INVALID_DEFINITION');
          const inputs = object(source.inputs === undefined ? {} : source.inputs), child = this.query(source);
          validateTemplate(inputs);
          if (!expressionKind(inputs)) {
            const names = new Set(dataEntries(inputs).filter(([, value]) => value !== undefined).map(([name]) => name));
            for (const [name, port] of Object.entries(child.ports ?? {})) {
              if (port.required && !names.has(name)) fail('INVALID_DEFINITION');
            }
          }
          visit(child);
        } else {
          if (own(source, 'inputs')) fail('INVALID_DEFINITION');
          object(source.request); object(this.datasource(source));
        }
      }
      visiting.delete(spec); visited.add(spec);
    };
    // Include unused registered definitions and inline subgraphs.
    for (const spec of Object.values(this.queries)) visit(spec);
  }

  query(source) {
    if (own(source, 'query')) return source.query;
    if (typeof source.queryRef !== 'string' || !own(this.queries, source.queryRef)) fail('REFERENCE_NOT_FOUND');
    return this.queries[source.queryRef];
  }

  datasource(source) {
    if (own(source, 'datasource')) return source.datasource;
    if (typeof source.datasourceRef !== 'string' || !own(this.datasources, source.datasourceRef)) fail('REFERENCE_NOT_FOUND');
    return this.datasources[source.datasourceRef];
  }

  async execute(id, originalInputs, { owner, signal, reuse = false, isCurrent = () => true } = {}) {
    if (!own(this.queries, id)) fail('REFERENCE_NOT_FOUND');
    const parentSignal = signal, controller = new AbortController();
    const abort = () => controller.abort();
    if (parentSignal?.aborted) abort();
    else parentSignal?.addEventListener('abort', abort, { once: true });
    signal = controller.signal;
    const inputs = structuredClone(originalInputs), staged = new Map(), runId = ++this.nextRun;
    const committed = owner === undefined ? new Map() : this.caches.get(owner) ?? new Map();
    const check = () => { if (signal?.aborted) fail('CANCELLED'); };
    const evaluate = createValueEvaluator(check);
    const node = async (spec, values, path, location, resource, cacheable) => {
      check(); object(values);
      // Object.prototype and null-prototype records have the same value contract.
      values = structuredClone(values);
      for (const [name, port] of Object.entries(spec.ports ?? {})) {
        if (port.required && (!own(values, name) || values[name] === undefined)) fail('INPUT_NOT_READY', `${location}/ports/${escape(name)}`, resource);
      }
      const key = JSON.stringify(path), cached = committed.get(key);
      if (cacheable && reuse && cached && (this.mutation.ignoreCacheInputs || isDeepStrictEqual(cached.inputs, values))) {
        this.trace.push({ kind: 'reuse', runId, key }); return structuredClone(cached.value);
      }
      const output = Object.create(null), entries = Object.entries(spec.sources);
      // Every sibling starts from parent ports only; source map order is not a dependency.
      await Promise.all(entries.map(async ([alias, source]) => {
        const sourceLocation = `${location}/sources/${escape(alias)}`;
        try {
          if (own(source, 'queryRef') || own(source, 'query')) {
            const nestedInputs = await evaluate(source.inputs ?? {}, { values: { ports: values } });
            const referenced = own(source, 'queryRef');
            output[alias] = await node(this.query(source), nestedInputs, [...path, alias],
              referenced ? '/spec' : `${sourceLocation}/query`,
              referenced ? { kind: 'Query', id: source.queryRef } : resource, true);
          } else {
            const response = await this.executeHttp({ version: 1, requestId: `fixture-${runId}-${key}-${alias}`,
              datasource: this.datasource(source), request: source.request, inputs: values }, { signal, sourceLocation, runId });
            check(); output[alias] = response.body;
          }
        } catch (error) { throw clean(error, sourceLocation, resource); }
      }));
      check();
      const scope = { values: { ports: values, sources: output } };
      let value;
      try { value = await evaluate(spec.transform.input, scope); }
      catch (error) { throw clean(error, `${location}/transform/input`, resource); }
      for (const [index, step] of (spec.transform.steps ?? []).entries()) {
        try {
          if (step.kind === 'Concat') {
            const extra = await evaluate(step.with, scope);
            if (!Array.isArray(value) || !extra.every(Array.isArray)) fail('TYPE_MISMATCH');
            // Number of arrays is data size, not a JS function argument count.
            const joined = value.slice();
            for (const items of extra) for (const item of items) joined.push(item);
            value = joined;
          } else value = joinRows(value, await evaluate(step.right, scope), step);
          check();
        } catch (error) { throw clean(error, `${location}/transform/steps/${index}`, resource); }
      }
      const entry = { inputs: structuredClone(values), value: structuredClone(value) };
      staged.set(key, entry);
      if (this.mutation.cachePartial && owner !== undefined) {
        const early = this.caches.get(owner) ?? new Map(); early.set(key, entry); this.caches.set(owner, early);
      }
      return value;
    };
    try {
      const value = await node(this.queries[id], inputs, [id], '/spec', { kind: 'Query', id }, false);
      check();
      if (owner !== undefined && (this.mutation.commitObsolete || isCurrent())) {
        const next = new Map(committed);
        for (const [key, entry] of staged) next.set(key, entry);
        this.caches.set(owner, next); this.trace.push({ kind: 'cache-commit', runId, keys: [...staged.keys()] });
      }
      return freeze(structuredClone(value));
    } finally { parentSignal?.removeEventListener('abort', abort); controller.abort(); }
  }

  forget(owner) { this.caches.delete(owner); }
}

export function compositeTransport(engine, id, current) {
  const requests = [];
  return {
    requests,
    disposeOwner: owner => { if (!engine.mutation.skipOwnerCleanup) engine.forget(owner); },
    execute(inputs, metadata) {
      const request = { id: requests.length + 1, inputs: structuredClone(inputs), ...metadata };
      requests.push(request);
      request.completion = { promise: engine.execute(id, inputs, {
        owner: metadata.owner, signal: metadata.signal, reuse: engine.mutation.ignoreFresh || metadata.fresh !== true,
        isCurrent: () => current(metadata.owner, metadata.generation),
      }) };
      return request;
    },
  };
}
