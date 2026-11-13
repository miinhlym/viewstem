// Shared input validation and generation-bound capabilities.
import { compileSchema, equal } from './schema.mjs';
import { resolveRef } from './schema-profile.mjs';
import { protect, trustedCopies } from './immutable.mjs';
import { safeError, at } from './errors.mjs';

const own = (object, key) => Object.hasOwn(object, key);
const fail = (code, input) => { throw Object.assign(new Error(code), { code, ...(input === undefined ? {} : { input }) }); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const expressions = new WeakMap(), queries = new WeakSet(), stateWrappers = new WeakMap();
const inputError = (error, input) => at(error,{input});
const annotations = new Set('$schema title description default examples readOnly writeOnly deprecated $comment'.split(' '));
const schemaMaps = new Set(['properties']);
const schemaLists = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const schemaSingles = new Set(['not', 'if', 'then', 'else', 'items', 'additionalProperties', 'keys', 'values']);
const order = values => values.sort((a, b) => {
  const left = JSON.stringify(a), right = JSON.stringify(b);
  return left < right ? -1 : left > right ? 1 : 0;
});
function cloneValue(value) {
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Set) return new Set([...value].map(cloneValue));
  if (value instanceof Map) return new Map([...value].map(([key, item]) => [key, cloneValue(item)]));
  if (Array.isArray(value)) return value.map(cloneValue);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
}
function data(value) {
  if (Array.isArray(value)) return value.map(data);
  if (!record(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, data(value[key])]));
}

// Walk schema positions only: a data key named title/$ref inside const/enum is data.
function normalized(root) {
  function walk(schema) {
    if (typeof schema === 'boolean') return schema;
    const output = {};
    for (const key of Object.keys(schema).sort()) {
      if (annotations.has(key) || key === '$defs' || key === '$ref') continue;
      const value = schema[key];
      if (schemaMaps.has(key)) output[key] = Object.fromEntries(Object.keys(value).sort().map(name => [name, walk(value[name])]));
      else if (schemaLists.has(key)) output[key] = value.map(walk);
      else if (schemaSingles.has(key)) output[key] = walk(value);
      else if (key === 'type') output[key] = order((Array.isArray(value) ? value : [value]).map(data));
      else if (['required', 'enum'].includes(key)) output[key] = order(value.map(data));
      else output[key] = data(value);
    }
    if (!own(schema, '$ref')) return output;
    const target = walk(resolveRef(root, schema.$ref));
    if (!Object.keys(output).length) return target;
    if (target === true) return output;
    if (!record(target)) return { '$conjunction': [target, output] };
    const conflicts = Object.keys(output).some(key => own(target, key) && !equal(target[key], output[key]));
    // Disjoint assertions can be expanded without inferring logical equivalence.
    return conflicts ? { '$conjunction': [target, output] } : { ...target, ...output };
  }
  return walk(root);
}

export function sameContract(left, right) {
  compileSchema(left); compileSchema(right);
  return equal(normalized(left), normalized(right));
}
export function expression(readSnapshot) {
  if (typeof readSnapshot !== 'function') fail('INVALID_DEFINITION');
  const token = Object.freeze({}); expressions.set(token, readSnapshot); return token;
}
export const stateValue = handle => expression(() => handle.getSnapshot());
// Only contract inspection unwraps a State. Operations always use the immediate
// parent so nested calls cannot bypass an ancestor's validation/cancellation.
export function stateRoot(handle, store) {
  let current = handle;
  while (stateWrappers.has(current)) {
    const link = stateWrappers.get(current);
    if (link.store && link.store !== store) fail('TYPE_CONTRACT_MISMATCH');
    current = link.base;
  }
  return current;
}
export const isQueryHandle = value => queries.has(value);
export const isWrappedStateHandle = value => stateWrappers.has(value);

export function boundedState(baseHandle, guard) {
  if (!record(baseHandle) || typeof guard !== 'function'
    || ['read', "getSnapshot", 'write', 'reset'].some(method => typeof baseHandle[method] !== 'function')) fail('TYPE_CONTRACT_MISMATCH');
  const wrapper = { address: baseHandle.address, generation: baseHandle.generation };
  for (const method of ['read', "getSnapshot", 'write', 'reset']) wrapper[method] = (...args) => { guard(method); return baseHandle[method](...args); };
  stateWrappers.set(wrapper, { base: baseHandle }); return Object.freeze(wrapper);
}
export function createQueryHandle(delegate = {}) {
  if (!record(delegate)) fail('INVALID_DEFINITION');
  for (const method of ["getSnapshot", 'refresh', 'retry']) if (own(delegate, method) && typeof delegate[method] !== 'function') fail('INVALID_DEFINITION');
  const handle = {};
  for (const method of ["getSnapshot", 'refresh', 'retry']) handle[method] = (...args) => {
    if (typeof delegate[method] !== 'function') fail('INVALID_DEFINITION');
    return delegate[method](...args);
  };
  queries.add(handle); return Object.freeze(handle);
}
export function boundedQuery(baseHandle, guard) {
  if (!queries.has(baseHandle) || typeof guard !== 'function') fail('TYPE_CONTRACT_MISMATCH');
  const wrapper = {};
  for (const method of ["getSnapshot", 'refresh', 'retry']) wrapper[method] = (...args) => { guard(method); return baseHandle[method](...args); };
  queries.add(wrapper); return Object.freeze(wrapper);
}

export function compilePorts({ resourceKind, ports = {}, types = {}, store }) {
  const matrix = { Query: ['Value'], Variable: ['Value'], Action: ['Value', 'State', 'Query'], Component: ['Value', 'State', 'Query'], View: ['Value', 'State', 'Query'], Datasource: [], Type: [] };
  if (!own(matrix, resourceKind) || !record(ports) || !record(types)) fail('INVALID_DEFINITION');
  const declarations = new Map();
  for (const [name, port] of Object.entries(ports)) {
    if (!record(port) || !matrix[resourceKind].includes(port.kind)
      || Object.keys(port).some(key => !['kind', 'schema', 'typeRef', 'required', 'default'].includes(key))
      || (own(port, 'required') && typeof port.required !== 'boolean')) fail('INVALID_DEFINITION');
    const typed = port.kind !== 'Query';
    if (typed ? own(port, 'schema') === own(port, 'typeRef') : own(port, 'schema') || own(port, 'typeRef')) fail('INVALID_DEFINITION');
    if (own(port, 'default') && (port.kind !== 'Value' || port.required === true)) fail('INVALID_DEFINITION');
    let schema, validator;
    if (typed) {
      if (own(port, 'typeRef')) {
        if (typeof port.typeRef !== 'string' || !own(types, port.typeRef)) fail('REFERENCE_NOT_FOUND');
        schema = types[port.typeRef];
      } else schema = port.schema;
      validator = compileSchema(schema); schema = structuredClone(schema);
    }
    const declaration = { kind: port.kind, required: port.required === true, schema, validator, hasDefault: own(port, 'default') };
    if (declaration.hasDefault) declaration.defaultValue = accept(validator, port.default);
    declarations.set(name, declaration);
  }
  function accept(validator, value) {
    try { return protect(validator.accept(value, trustedCopies(value))); }
    catch (error) { throw safeError(error, 'TYPE_MISMATCH'); }
  }
  function connectState(port, handle) {
    if (!record(handle) || !record(handle.address) || typeof handle.write !== 'function' || typeof handle.getSnapshot !== 'function') fail('TYPE_CONTRACT_MISMATCH');
    const verify = () => {
      const contract = store?.contract(stateRoot(handle, store)) ?? fail('TYPE_CONTRACT_MISMATCH');
      if (!contract.writable) fail('TYPE_CONTRACT_MISMATCH');
      if (!sameContract(port.schema, contract.schema)) fail('TYPE_CONTRACT_MISMATCH');
    };
    verify();
    const wrapper = Object.freeze({ address: handle.address, generation: handle.generation,
      read: () => handle.read(), getSnapshot: () => handle.getSnapshot(),
      write(value) { verify(); handle.write(accept(port.validator, value)); },
      reset() { verify(); handle.reset(); },
    });
    stateWrappers.set(wrapper, { base: handle, store }); return wrapper;
  }
  return Object.freeze({
    prepare(inputs = {}, { mode = 'explicit' } = {}) {
      if (!record(inputs) || !['explicit', 'automatic'].includes(mode)) fail('INVALID_DEFINITION');
      for (const key of Object.keys(inputs)) if (!declarations.has(key)) fail('INVALID_DEFINITION', key);
      // Structural errors are discovered before any connected expression executes.
      for (const [key, port] of declarations) if (port.required && !own(inputs, key)) fail('INVALID_DEFINITION', key);
      const values = Object.create(null), states = Object.create(null); let waitingKey;
      for (const [key, port] of declarations) {
        try {
        if (!own(inputs, key)) {
          if (port.hasDefault) { values[key] = accept(port.validator, cloneValue(port.defaultValue)); states[key] = Object.freeze({ status: 'ready', value: values[key] }); }
          else states[key] = Object.freeze({ status: 'missing' });
          continue;
        }
        const input = inputs[key];
        if (port.kind === 'State') values[key] = connectState(port, input);
        else if (port.kind === 'Query') { if (!queries.has(input)) fail('TYPE_CONTRACT_MISMATCH'); values[key] = input; }
        else {
          let snapshot;
          try { snapshot = expressions.has(input) ? expressions.get(input)() : { status: 'ready', value: input }; }
          catch (error) { throw safeError(error); }
          if (!record(snapshot) || !['ready', 'missing', 'pending', 'error'].includes(snapshot.status)) fail('INVALID_EXPRESSION');
          if (snapshot.status === 'error') throw safeError(snapshot.error);
          if (snapshot.status !== 'ready') {
            states[key] = Object.freeze({ status: snapshot.status });
            if ((snapshot.status === 'pending' || port.required) && waitingKey === undefined) waitingKey = key;
            continue;
          }
          values[key] = accept(port.validator, snapshot.value);
        }
        states[key] = Object.freeze({ status: 'ready', value: values[key] });
        } catch (error) { throw inputError(error, key); }
      }
      if (waitingKey !== undefined && mode === 'explicit') fail('INPUT_NOT_READY', waitingKey);
      return Object.freeze({ status: waitingKey !== undefined ? 'waiting' : 'ready', ports: Object.freeze(values), states: Object.freeze(states) });
    },
  });
}
