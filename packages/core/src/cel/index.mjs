import { Environment } from '../../vendor/cel-js/lib/index.js';
import { compileSchema, equal } from '../schema.mjs';
import { toCelInteger, fromCelInteger } from '../values.mjs';
import { protect, trustedCopies } from '../immutable.mjs';
import { calendarFunctions } from './calendar.mjs';
import { fail, inspect, resolveLimits, defaultLimits } from './limits.mjs';

const own = (object, key) => Object.hasOwn(object, key);
const payloads = new WeakMap(), origins = new WeakMap();
class NativeSet {}
class NativeMap {}
class DateValue {}
const constructors = { set: NativeSet, map: NativeMap, date: DateValue, time: DateValue, datetime: DateValue };
const typeNames = { set: 'NativeSet', map: 'NativeMap', date: 'DateValue', time: 'DateValue', datetime: 'DateValue', number: 'double', string: 'string', boolean: 'bool', null: 'null', array: 'list', object: 'map' };
const unwrap = value => payloads.get(value)?.raw ?? value;
const child = (plan, kind, key) => kind === 'array' ? (key < (plan?.prefix.length ?? 0) ? plan.prefix[key] : plan?.items) : own(plan?.properties ?? {}, key) ? plan.properties[key] : plan?.additional;
function celType(plan) {
  if (plan?.date) return 'DateValue';
  if (plan?.types.length !== 1) return 'dyn';
  const type = plan.types[0];
  return type === 'number' ? plan.integer ? 'int' : 'double' : typeNames[type] ?? 'dyn';
}
function rawMember(value) {
  if (payloads.has(value)) return payloads.get(value).raw;
  if (origins.has(value)) return origins.get(value);
  if (typeof value === 'bigint') return fromCelInteger(value);
  return value;
}
// Restrict the candidate's larger default namespace to this package's documented
// profile, including unexecuted branches and macros. Walk only syntax arguments.
function assertProfile(ast) {
  function visit(node) {
    if (Array.isArray(node)) { for (const child of node) visit(child); return; }
    if (!node || typeof node !== 'object' || !own(node, 'op')) return;
    if (node.op === 'id' && ['optional', 'cel', 'google', 'bytes', 'uint', 'type', 'int', 'double', 'string', 'bool', 'map', 'list', 'null_type'].includes(node.args)) fail('UNSUPPORTED_CEL_FEATURE');
    if (['call', 'rcall'].includes(node.op) && ['bytes', 'uint', 'type', 'json', 'hex', 'base64', 'at', 'or', 'orValue', 'hasValue', 'value', 'of', 'none', 'ofNonZeroValue'].includes(node.args[0])) fail('UNSUPPORTED_CEL_FEATURE');
    if (node.op === 'value' && node.args !== null && typeof node.args === 'object') fail('UNSUPPORTED_CEL_FEATURE');
    visit(node.args);
  }
  visit(ast);
}

/** Compile a pure, synchronous CEL evaluator. Schemas are registered immediately. */
export function compileCel(expression, { inputs = {}, output, functions = [], limits: custom = {}, cost = 100000 } = {}) {
  const limits = resolveLimits(custom);
  if (!Number.isSafeInteger(cost) || cost <= 0) fail('INVALID_LIMIT');
  if (typeof expression !== 'string' || expression.length > limits.expressionChars) fail('LIMIT_EXCEEDED');
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs) || !Array.isArray(functions)) fail('INVALID_DEFINITION');
  const codecs = Object.fromEntries(Object.entries(inputs).map(([name, schema]) => [name, compileSchema(schema)]));
  const resultCodec = compileSchema(output === undefined ? true : output);
  const environment = new Environment({ homogeneousAggregateLiterals: false, enableOptionalTypes: false, limits: { maxEvaluationCost: cost, maxAstNodes: 10000, maxDepth: limits.depth } });
  for (const [name, constructor] of Object.entries({ NativeSet, NativeMap, DateValue })) environment.registerType(name, constructor);
  for (const [name, codec] of Object.entries(codecs)) environment.registerVariable(name, celType(codec.plan));
  // Stack-local session swapping permits a trusted callback to evaluate another
  // compiled expression without corrupting its caller's identity bookkeeping.
  let session;
  const payload = (value, kind) => {
    const result = payloads.get(value);
    if (!result || (kind && result.kind !== kind)) fail('TYPE_MISMATCH');
    return result;
  };
  const register = (signature, handler) => environment.registerFunction(signature, function (...args) {
    try {
      // The engine charges opaque arguments as size 1. Charge their real graph
      // before native collection comparison or any trusted host callback.
      for (const arg of args) if (payloads.has(arg)) this.charge(inspect(arg, limits, limits.inputNodes, unwrap).nodes);
      return handler(...args);
    } catch (error) {
      if (error.code === 'LIMIT_EXCEEDED') session.fatal = error;
      throw error;
    }
  }, { async: false });
  for (const [name, kind] of [['NativeSet', 'set'], ['NativeMap', 'map'], ['DateValue', undefined]]) {
    environment.registerOperator(`${name} == ${name}: bool`, (a, b, _ast, evaluator) => {
      for (const value of [a, b]) {
        try { evaluator.charge(inspect(value, limits, limits.inputNodes, unwrap).nodes); }
        catch (error) { if (error.code === 'LIMIT_EXCEEDED') session.fatal = error; throw error; }
      }
      const left = payload(a, kind), right = payload(b, kind);
      return left.kind === right.kind && equal(left.raw, right.raw);
    });
  }
  register('setSize(NativeSet): int', value => BigInt(payload(value, 'set').raw.size));
  register('setHas(NativeSet, dyn): bool', (set, item) => payload(set, 'set').raw.has(rawMember(item)));
  register('setSame(NativeSet, NativeSet): bool', (a, b) => equal(payload(a, 'set').raw, payload(b, 'set').raw));
  register('mapSize(NativeMap): int', value => BigInt(payload(value, 'map').raw.size));
  register('mapSame(NativeMap, NativeMap): bool', (a, b) => equal(payload(a, 'map').raw, payload(b, 'map').raw));
  for (const keyType of ['int', 'double', 'string']) {
    register(`mapHas(NativeMap, ${keyType}): bool`, (map, key) => payload(map, 'map').raw.has(rawMember(key)));
    register(`mapGet(NativeMap, ${keyType}): dyn`, (map, key) => {
      const { raw, plan } = payload(map, 'map'), nativeKey = rawMember(key);
      if (!raw.has(nativeKey)) fail('REFERENCE_NOT_FOUND');
      return session.encode(plan?.mapValues, raw.get(nativeKey));
    });
  }
  register('dateText(DateValue): string', value => payload(value).raw);
  register('dateKind(DateValue): string', value => payload(value).kind);
  for (const [signature, handler] of calendarFunctions) register(signature, handler);
  const names = new Set();
  for (const definition of functions) {
    if (!definition || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(definition.name) || names.has(definition.name) || !Array.isArray(definition.inputs) || typeof definition.run !== 'function' || !own(definition, 'output')) fail('INVALID_DEFINITION');
    names.add(definition.name);
    const args = definition.inputs.map(schema => compileSchema(schema)), result = compileSchema(definition.output), run = definition.run;
    register(`${definition.name}(${args.map(codec => celType(codec.plan)).join(', ')}): ${celType(result.plan)}`, (...encoded) => {
      try {
        const native = encoded.map((value, i) => session.accept(args[i], session.decode(args[i].plan, value), limits.inputNodes));
        const raw = run(...native);
        if (raw && typeof raw.then === 'function') { Promise.resolve(raw).catch(() => {}); fail('ASYNC_CEL_FUNCTION'); }
        return session.encode(result.plan, session.accept(result, raw, limits.outputNodes));
      } catch (error) { session.fatal = error; throw error; }
    });
  }
  const parsed = environment.parse(expression);
  assertProfile(parsed.ast);
  const checked = parsed.check();
  if (!checked.valid) throw checked.error;

  function newSession() {
    const wrappers = new WeakMap();
    function encode(plan, raw) {
      if (typeof raw === 'number') return plan?.integer ? toCelInteger(raw) : raw;
      if (raw === null) return null;
      const kind = typeof raw === 'string' && plan?.date ? plan.date : raw instanceof Set ? 'set' : raw instanceof Map ? 'map' : undefined;
      if (kind) {
        if (raw && typeof raw === 'object' && wrappers.get(raw)?.has(plan)) return wrappers.get(raw).get(plan);
        const wrapper = Object.freeze(new constructors[kind]());
        payloads.set(wrapper, { raw, plan, kind });
        if (raw && typeof raw === 'object') { if (!wrappers.has(raw)) wrappers.set(raw, new Map()); wrappers.get(raw).set(plan, wrapper); }
        return wrapper;
      }
      if (Array.isArray(raw)) {
        const list = Object.freeze(raw.map((item, i) => encode(child(plan, 'array', i), item)));
        origins.set(list, raw); return list;
      }
      if (raw && typeof raw === 'object') {
        const object = Object.create(null);
        for (const [key, item] of Object.entries(raw)) object[key] = encode(child(plan, 'object', key), item);
        Object.freeze(object); origins.set(object, raw); return object;
      }
      return raw;
    }
    function accept(codec, raw, nodeLimit) {
      inspect(raw, limits, nodeLimit);
      const accepted = protect(codec.accept(raw, trustedCopies(raw)));
      inspect(accepted, limits, nodeLimit);
      return accepted;
    }
    function decode(plan, value) {
      if (payloads.has(value)) return payloads.get(value).raw;
      if (typeof value === 'bigint') {
        if (plan?.numeric === 'number') fail('TYPE_MISMATCH');
        return fromCelInteger(value);
      }
      if (typeof value === 'number') {
        if (plan?.integer) fail('TYPE_MISMATCH');
        return value;
      }
      if (Array.isArray(value)) {
        const decoded = value.map((item, i) => decode(child(plan, 'array', i), item)), origin = origins.get(value);
        return origin && decoded.every((item, i) => item === origin[i]) ? origin : decoded;
      }
      if (value && typeof value === 'object') {
        // CEL map literals restore JSON objects only for string keys. Native Map
        // values enter/leave through their opaque wrapper, preserving key identity.
        const object = Object.create(null);
        for (const [key, item] of value instanceof Map ? value : Object.entries(value)) {
          if (typeof key !== 'string') fail('TYPE_MISMATCH');
          object[key] = decode(child(plan, 'object', key), item);
        }
        const origin = origins.get(value);
        return origin && Object.keys(object).every(key => object[key] === origin[key]) ? origin : object;
      }
      return value;
    }
    return { encode, accept, decode, fatal: undefined };
  }
  return bindings => {
    bindings ??= {};
    if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings) || Object.keys(bindings).some(name => !own(codecs, name)) || Object.keys(codecs).some(name => !own(bindings, name))) fail('INVALID_DEFINITION');
    inspect(bindings, limits, limits.inputNodes);
    const previous = session; session = newSession();
    try {
      const encoded = Object.create(null);
      for (const [name, codec] of Object.entries(codecs)) encoded[name] = session.encode(codec.plan, session.accept(codec, bindings[name], limits.inputNodes));
      const result = parsed(encoded);
      if (session.fatal) throw session.fatal;
      if (result && typeof result.then === 'function') fail('ASYNC_CEL_FUNCTION');
      inspect(result, limits, limits.outputNodes, unwrap);
      const accepted = session.accept(resultCodec, session.decode(resultCodec.plan, result), limits.outputNodes);
      return accepted;
    } finally { session = previous; }
  };
}
export function evaluateCel(expression, bindings, options = {}) { return compileCel(expression, options)(bindings); }
export { defaultLimits as defaultCelLimits };
