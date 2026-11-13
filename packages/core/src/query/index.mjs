import { equal } from '../schema.mjs';
import { normalize, encodeBoundary } from '../values.mjs';
import { protect } from '../immutable.mjs';
import { safeError, at, error as publicError } from '../errors.mjs';
import { compilePorts } from '../ports.mjs';
import { createValueEvaluator, isRecord, validateTemplate } from '../http/expressions.mjs';
import { QueryUsage } from './usage.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const escape = key => key.replace(/~/g, '~0').replace(/\//g, '~1');
const fail = code => { throw { code, message: code }; };
const record = value => { if (!isRecord(value)) fail('INVALID_DEFINITION'); return value; };
const objectSpec = definition => definition?.spec ?? definition;
const wrap = (error, location, resource) => at(error, { location, ...(resource ? { resource } : {}) }, 'HTTP_ERROR');

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
  const result = [], mode = step.mode === undefined ? 'left' : step.mode;
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

/** Query definitions are resolved by the registry; usage lifetimes own all reuse. */
export function createQueryEngine({ registry, requestExecutor, requestTimeoutMs = 30_000, functions = registry?.functions ?? [], clock = { now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) } } = {}) {
  if (!registry || typeof registry.get !== 'function' || typeof requestExecutor !== 'function'
      || !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) fail('INVALID_DEFINITION');
  const caches = new Map();
  let nextRequest = 0;
  const get = (kind, id) => {
    const definition = registry.get(kind, id);
    if (!definition) fail('REFERENCE_NOT_FOUND');
    return definition;
  };
  const resolve = use => {
    if (typeof use === 'string') return { definition: get('Query', use), resource: { kind: 'Query', id: use }, location: '/spec' };
    record(use);
    if (own(use, 'queryRef')) return resolve(use.queryRef);
    if (own(use, 'query')) return { definition: use.query, location: '/query' };
    return { definition: use, ...(use.id ? { resource: { kind: 'Query', id: use.id } } : {}), location: use.spec ? '/spec' : '' };
  };
  const prepare = (use, inputs, mode = 'explicit') => {
    const spec = objectSpec(resolve(use).definition);
    return compilePorts({ resourceKind: 'Query', ports: spec.ports ?? {}, types: registry.types?.() ?? {} }).prepare(inputs, { mode });
  };
  // Timeouts belong to each request plan, never to an entire composite execution.
  const executePlan = (plan, signal, isOpen, onCleanupError) => new Promise((resolve, reject) => {
    const controller = new AbortController();
    let done = false, timer;
    const clear = handle => {
      if (handle === undefined) return;
      try { clock.clearTimeout(handle); }
      catch (cause) { onCleanupError?.(safeError(cause)); }
    };
    const finish = (value, error) => {
      if (done) return;
      done = true;
      signal?.removeEventListener('abort', abort);
      controller.abort();
      clear(timer);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(undefined, { code: 'CANCELLED', message: 'CANCELLED' });
    const open = () => !done && !signal?.aborted && isOpen();
    const now = () => typeof clock.now === 'function' ? clock.now() : clock.now;
    let deadline;
    const arm = () => {
      try {
        if (!open()) { abort(); return; }
        const remaining = deadline - now();
        if (!open()) { abort(); return; }
        if (remaining <= 0) finish(undefined, { code: 'TIMEOUT', message: 'TIMEOUT' });
        else {
          const handle = clock.setTimeout(arm, Math.min(remaining, 2_147_483_647));
          if (!open()) { clear(handle); abort(); }
          else timer = handle;
        }
      } catch (cause) { finish(undefined, safeError(cause, 'HTTP_ERROR')); }
    };
    if (!open()) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    try {
      deadline = now() + requestTimeoutMs;
      arm();
      if (!open()) { abort(); return; }
      Promise.resolve(requestExecutor(plan, { signal: controller.signal })).then(
        value => finish(value), error => finish(undefined, safeError(error, 'HTTP_ERROR')),
      );
    } catch (error) { finish(undefined, safeError(error, 'HTTP_ERROR')); }
  });
  async function execute(use, { inputs = {}, preparedInputs, signal: parentSignal, owner, fresh = true, isCurrent = () => true, isOpen = () => true, onCleanupError } = {}) {
    const root = resolve(use), controller = new AbortController();
    const abort = () => controller.abort();
    if (parentSignal?.aborted) abort(); else parentSignal?.addEventListener('abort', abort, { once: true });
    const signal = controller.signal, staged = new Map();
    const committed = owner === undefined ? new Map() : caches.get(owner) ?? new Map();
    const check = () => { if (signal.aborted || !isOpen()) fail('CANCELLED'); };
    const evaluate = createValueEvaluator(check, functions);
    const node = async (definition, originalValues, path, location, resource, cacheable, lineage = []) => {
      check();
      const spec = objectSpec(definition); record(spec); record(spec.sources); record(spec.transform);
      if (lineage.includes(spec)) fail('INVALID_DEFINITION');
      const nextLineage = [...lineage, spec];
      if (lineage.length && isRecord(originalValues)) for (const [name, port] of Object.entries(spec.ports ?? {})) {
        if (port.required && (!own(originalValues, name) || originalValues[name] === undefined))
          throw publicError('INPUT_NOT_READY', { location: `${location}/ports/${escape(name)}`, ...(resource ? { resource } : {}) });
      }
      const prepared = (lineage.length ? undefined : preparedInputs)
        ?? compilePorts({ resourceKind: 'Query', ports: spec.ports ?? {}, types: registry.types?.() ?? {} }).prepare(originalValues, { mode: 'explicit' });
      const values = prepared.ports;
      if (prepared.status !== 'ready') fail('INPUT_NOT_READY');
      const key = JSON.stringify(path), cached = committed.get(key);
      if (cacheable && !fresh && cached && cached.definition === definition && equal(cached.inputs, values)) return cached.value;
      const output = Object.create(null);
      await Promise.all(Object.entries(spec.sources).map(async ([alias, source]) => {
        const sourceLocation = `${location}/sources/${escape(alias)}`;
        try {
          record(source);
          const declarations = ['queryRef', 'query', 'datasourceRef', 'datasource'].filter(key => own(source, key));
          if (declarations.length !== 1) fail('INVALID_DEFINITION');
          if (own(source, 'queryRef') || own(source, 'query')) {
            if (own(source, 'request')) fail('INVALID_DEFINITION');
            const child = own(source, 'queryRef') ? get('Query', source.queryRef) : source.query;
            const nestedInputs = await evaluate(source.inputs === undefined ? {} : source.inputs, { values: { ports: values } });
            record(nestedInputs);
            const referenced = own(source, 'queryRef');
            output[alias] = await node(child, nestedInputs, [...path, alias],
              referenced ? '/spec' : `${sourceLocation}/query${child.spec ? '/spec' : ''}`,
              referenced ? { kind: 'Query', id: source.queryRef } : resource, true, nextLineage);
          } else {
            if (own(source, 'inputs')) fail('INVALID_DEFINITION');
            record(source.request);
            const datasource = objectSpec(own(source, 'datasourceRef') ? get('Datasource', source.datasourceRef) : source.datasource);
            const response = await executePlan({ version: 1, requestId: `viewstem-${++nextRequest}`,
              datasource: normalize(datasource), request: normalize(source.request), inputs: encodeBoundary(values) }, signal, isOpen, onCleanupError);
            check(); output[alias] = normalize(response.body);
          }
        } catch (error) { throw wrap(error, sourceLocation, resource); }
      }));
      check();
      const scope = { values: { ports: values, sources: output } };
      if (!own(spec.transform, 'input')) fail('INVALID_DEFINITION');
      let value;
      try { validateTemplate(spec.transform.input, new WeakSet(), functions); value = await evaluate(spec.transform.input, scope); }
      catch (error) { throw wrap(error, `${location}/transform/input`, resource); }
      const steps = spec.transform.steps === undefined ? [] : spec.transform.steps;
      if (!Array.isArray(steps)) fail('INVALID_DEFINITION');
      for (const [index, step] of steps.entries()) {
        try {
          if (step.kind === 'Concat') {
            if (!Array.isArray(step.with)) fail('INVALID_DEFINITION');
            const extra = await evaluate(step.with, scope);
            if (!Array.isArray(value) || !extra.every(Array.isArray)) fail('TYPE_MISMATCH');
            const joined = value.slice();
            for (const items of extra) for (const item of items) joined.push(item);
            value = joined;
          } else if (step.kind === 'Join') {
            if (!['left', 'right', 'inner'].includes(step.mode === undefined ? 'left' : step.mode)
                || !Array.isArray(step.on) || !step.on.length || !step.on.every(pair => isRecord(pair) && typeof pair.left === 'string' && typeof pair.right === 'string')) fail('INVALID_DEFINITION');
            value = joinRows(value, await evaluate(step.right, scope), step);
          } else fail('INVALID_DEFINITION');
          check();
        } catch (error) { throw wrap(error, `${location}/transform/steps/${index}`, resource); }
      }
      value = protect(normalize(value));
      staged.set(key, { definition, inputs: values, value });
      return value;
    };
    try {
      const value = await node(root.definition, inputs, [root.resource?.id ?? root.definition], root.location, root.resource, false);
      check();
      if (owner !== undefined && isCurrent()) {
        const next = new Map(committed);
        for (const [key, entry] of staged) next.set(key, entry);
        caches.set(owner, next);
      }
      return value;
    } catch (error) { throw safeError(error, 'HTTP_ERROR'); }
    finally { parentSignal?.removeEventListener('abort', abort); controller.abort(); }
  }
  const engine = { execute, prepare, forget: owner => caches.delete(owner),
    createUsage: (use, options = {}) => new QueryUsage(engine, use, options) };
  return engine;
}
