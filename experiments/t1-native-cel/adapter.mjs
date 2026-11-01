// Private typed fixture adapter, not public CEL functions or an SDK/schema compiler.
import { compileSchema, equal } from '../t1-values/schema-runtime.mjs';
import { toCelInteger, fromCelInteger } from '../t1-values/values.mjs';
import { protect, trustedCopies } from '../t3-state/immutable.mjs';

const payloads = new WeakMap(), listOrigins = new WeakMap();
class ProbeSet {}
class ProbeMap {}
class ProbeObject {}
class ProbeDate {}
const opaque = { set: ProbeSet, map: ProbeMap, object: ProbeObject, date: ProbeDate, time: ProbeDate, datetime: ProbeDate };
const typeNames = { set: 'ProbeSet', map: 'ProbeMap', object: 'ProbeObject', date: 'ProbeDate', time: 'ProbeDate', datetime: 'ProbeDate', integer: 'int', number: 'double', string: 'string', boolean: 'bool', null: 'null', array: 'list' };
const fail = code => { throw Object.assign(new Error(code), { code }); };
const own = (object, key) => Object.hasOwn(object, key);
const defaults = { expressionChars: 65536, inputNodes: 20000, outputNodes: 20000, valueBytes: 262144, depth: 64 };

// Inspect raw native payloads, including payloads hidden inside custom CEL types.
// Object undefined properties are omitted by the reused normalizer; other
// unsupported values are rejected here or by the schema admission boundary.
function inspect(value, limits, nodeLimit) {
  let nodes = 0, bytes = 0; const active = new Set();
  function text(value) {
    for (const point of value) {
      const n = point.codePointAt(0); bytes += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4;
      if (bytes > limits.valueBytes) fail('LIMIT_EXCEEDED');
    }
  }
  function visit(input, depth) {
    if (++nodes > nodeLimit || depth > limits.depth) fail('LIMIT_EXCEEDED');
    const item = payloads.has(input) ? payloads.get(input).raw : input;
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') { text(item); return; }
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail('UNSUPPORTED_VALUE'); return; }
    if (typeof item === 'bigint') { if (item < -9223372036854775808n || item > 9223372036854775807n) fail('UNSUPPORTED_VALUE'); return; }
    if (!item || typeof item !== 'object') fail('UNSUPPORTED_VALUE');
    if (active.has(item)) fail('CYCLIC_VALUE');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Set.prototype && prototype !== Map.prototype && prototype !== Object.prototype && prototype !== null) fail('UNSUPPORTED_VALUE');
    active.add(item);
    if (item instanceof Set) for (const child of item) visit(child, depth + 1);
    else if (item instanceof Map) for (const [key, child] of item) { visit(key, depth + 1); visit(child, depth + 1); }
    else {
      if (Array.isArray(item) && item.length > nodeLimit - nodes) fail('LIMIT_EXCEEDED');
      const keys = Array.isArray(item) ? Array.from({ length: item.length }, (_, i) => String(i)) : Object.keys(item);
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !own(descriptor, 'value')) fail('UNSUPPORTED_VALUE');
        if (!Array.isArray(item) && descriptor.value === undefined) continue;
        if (!Array.isArray(item)) text(key);
        visit(descriptor.value, depth + 1);
      }
    }
    active.delete(item);
  }
  visit(value, 0); return { nodes, bytes };
}

function codec(schema) {
  const validator = compileSchema(schema); // Full existing registration/admission guard first.
  const make = schema => {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) fail('SCHEMA_OUTSIDE_TYPED_FIXTURE');
    if (['$ref', '$defs', 'allOf', 'oneOf', 'if', 'not', 'prefixItems'].some(key => own(schema, key))) fail('SCHEMA_OUTSIDE_TYPED_FIXTURE');
    if (schema.anyOf) {
      if (schema.anyOf.length !== 2 || schema.anyOf.filter(child => child.type === 'null').length !== 1) fail('SCHEMA_OUTSIDE_TYPED_FIXTURE');
      return { kind: 'nullable', inner: make(schema.anyOf.find(child => child.type !== 'null')) };
    }
    const kind = schema['x-viewstem-type'] ?? schema.type;
    if (!own(typeNames, kind)) fail('SCHEMA_OUTSIDE_TYPED_FIXTURE');
    const result = { kind };
    if (kind === 'object') {
      if (schema.additionalProperties !== false) fail('SCHEMA_OUTSIDE_TYPED_FIXTURE');
      result.properties = Object.fromEntries(Object.entries(schema.properties ?? {}).map(([name, child]) => [name, make(child)]));
    }
    if (kind === 'array' || kind === 'set') result.items = make(schema.items);
    if (kind === 'map') {
      // Native Map keys use public JS string/number identity, never CEL maps.
      const keys = schema.keys?.type, allowed = Array.isArray(keys) ? keys : [keys];
      if (!allowed.length || allowed.some(kind => !['string', 'number', 'integer'].includes(kind))) fail('SCHEMA_OUTSIDE_TYPED_FIXTURE');
      result.values = make(schema.values);
    }
    return result;
  };
  return { ...make(schema), validator };
}
const celType = value => value.kind === 'nullable' ? 'dyn' : typeNames[value.kind];
const rawKey = value => typeof value === 'bigint' ? fromCelInteger(value) : value;
function rawMember(value) {
  if (payloads.has(value)) return payloads.get(value).raw;
  if (listOrigins.has(value)) return listOrigins.get(value);
  // A fresh CEL list has its own identity and cannot be a stored Set member.
  if (Array.isArray(value)) return value;
  if (value === null || ['string', 'boolean', 'number', 'bigint'].includes(typeof value)) return rawKey(value);
  fail('UNSUPPORTED_VALUE');
}

export function createTypedAdapter(Environment, { inputs, output, limits: custom = {}, cost = 100000, producers = [] }) {
  const limits = { ...defaults, ...custom };
  for (const [key, value] of Object.entries(limits)) if (!own(defaults, key) || !Number.isSafeInteger(value) || value <= 0) fail('INVALID_LIMIT');
  const inputCodecs = Object.fromEntries(Object.entries(inputs).map(([name, schema]) => [name, codec(schema)])), resultCodec = codec(output);
  const environment = new Environment({ homogeneousAggregateLiterals: false, limits: { maxEvaluationCost: cost, maxAstNodes: 10000, maxDepth: limits.depth } });
  for (const [name, constructor] of Object.entries({ ProbeSet, ProbeMap, ProbeObject, ProbeDate })) environment.registerType(name, constructor);
  for (const [name, current] of Object.entries(inputCodecs)) environment.registerVariable(name, celType(current));
  let session;
  const get = (value, kind) => { const payload = payloads.get(value); if (!payload || (kind && payload.codec.kind !== kind)) fail('TYPE_MISMATCH'); return payload; };
  const register = (signature, handler) => environment.registerFunction(signature, handler);
  register('probeSetSize(ProbeSet): int', value => BigInt(get(value, 'set').raw.size));
  register('probeSetHas(ProbeSet, dyn): bool', (set, item) => get(set, 'set').raw.has(rawMember(item)));
  register('probeSetSame(ProbeSet, ProbeSet): bool', (a, b) => equal(get(a, 'set').raw, get(b, 'set').raw));
  register('probeMapSame(ProbeMap, ProbeMap): bool', (a, b) => equal(get(a, 'map').raw, get(b, 'map').raw));
  for (const keyType of ['int', 'double', 'string']) {
    register(`probeMapHas(ProbeMap, ${keyType}): bool`, (map, key) => get(map, 'map').raw.has(rawKey(key)));
    register(`probeMapGet(ProbeMap, ${keyType}): dyn`, (map, key) => {
      const { raw, codec } = get(map, 'map'), nativeKey = rawKey(key);
      if (!raw.has(nativeKey)) fail('REFERENCE_NOT_FOUND');
      return session.encode(codec.values, raw.get(nativeKey));
    });
  }
  register('probeField(ProbeObject, string): dyn', (object, key) => {
    const { raw, codec } = get(object, 'object');
    if (!own(raw, key) || !own(codec.properties, key)) fail('REFERENCE_NOT_FOUND');
    return session.encode(codec.properties[key], raw[key]);
  });
  register('probeDateText(ProbeDate): string', value => get(value).raw);
  register('probeDateKind(ProbeDate): string', value => get(value).codec.kind);
  const production = producers.map(({ name, schema, run }) => {
    if (!/^probe[A-Z][A-Za-z0-9]*$/.test(name) || typeof run !== 'function') fail('INVALID_DEFINITION');
    return { name, codec: codec(schema), run };
  });
  for (const producer of production) register(`${producer.name}(): ${celType(producer.codec)}`, () => session.admit(producer.codec, producer.run(), limits.outputNodes));

  function newSession() {
    const wrappers = new WeakMap();
    function encode(current, raw) {
      if (current.kind === 'nullable') return raw === null ? null : encode(current.inner, raw);
      if (current.kind === 'integer') return toCelInteger(raw);
      if (current.kind === 'array') {
        const list = Object.freeze(raw.map(item => encode(current.items, item)));
        listOrigins.set(list, raw); return list;
      }
      if (opaque[current.kind]) {
        // A protected object may appear both in a Set and as a separate input.
        // Wrappers retain that same stored identity; no raw .value field exists.
        if (raw && typeof raw === 'object' && wrappers.get(raw)?.has(current)) return wrappers.get(raw).get(current);
        const wrapper = Object.freeze(new opaque[current.kind]()); payloads.set(wrapper, { raw, codec: current });
        if (raw && typeof raw === 'object') { if (!wrappers.has(raw)) wrappers.set(raw, new Map()); wrappers.get(raw).set(current, wrapper); }
        return wrapper;
      }
      return raw;
    }
    function admit(current, raw, nodeLimit) {
      inspect(raw, limits, nodeLimit);
      const accepted = protect(current.validator.accept(raw, trustedCopies(raw)));
      inspect(accepted, limits, nodeLimit);
      return encode(current, accepted);
    }
    return { encode, admit };
  }
  function decode(current, value) {
    if (current.kind === 'nullable') return value === null ? null : decode(current.inner, value);
    if (current.kind === 'integer') return fromCelInteger(value);
    if (current.kind === 'number') { if (typeof value !== 'number' || !Number.isFinite(value)) fail('TYPE_MISMATCH'); return value; }
    if (payloads.has(value)) return payloads.get(value).raw;
    if (current.kind === 'array') {
      if (!Array.isArray(value)) fail('TYPE_MISMATCH');
      const decoded = value.map(item => decode(current.items, item)), origin = listOrigins.get(value);
      return origin && decoded.length === origin.length && decoded.every((item, index) => item === origin[index]) ? origin : decoded;
    }
    if (current.kind === 'object' && value && typeof value === 'object') {
      const result = Object.create(null);
      for (const [key, child] of value instanceof Map ? value : Object.entries(value)) {
        if (typeof key !== 'string' || !own(current.properties, key)) fail('TYPE_MISMATCH');
        result[key] = decode(current.properties[key], child);
      }
      return result;
    }
    return value;
  }
  return Object.freeze({
    compile(source) {
      if (typeof source !== 'string' || source.length > limits.expressionChars) fail('LIMIT_EXCEEDED');
      const parsed = environment.parse(source), checked = parsed.check();
      if (!checked.valid) throw checked.error;
      return bindings => {
        if (!bindings || typeof bindings !== 'object' || Object.keys(bindings).some(name => !own(inputCodecs, name)) || Object.keys(inputCodecs).some(name => !own(bindings, name))) fail('INVALID_DEFINITION');
        inspect(bindings, limits, limits.inputNodes); session = newSession();
        try {
          const encoded = Object.fromEntries(Object.entries(inputCodecs).map(([name, current]) => [name, session.admit(current, bindings[name], limits.inputNodes)]));
          const result = parsed(encoded);
          if (result instanceof Promise) fail('ASYNC_OUTSIDE_TYPED_FIXTURE');
          inspect(result, limits, limits.outputNodes); // Inspect hidden custom-type payloads too.
          const native = decode(resultCodec, result), accepted = protect(resultCodec.validator.accept(native, trustedCopies(native)));
          inspect(accepted, limits, limits.outputNodes); return accepted;
        } finally { session = undefined; }
      };
    },
  });
}
