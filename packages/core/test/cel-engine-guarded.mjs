// Host-side admission experiment. Values here are CEL values, not Store input DTOs.
const defaults = Object.freeze({ expressionChars: 65536, inputNodes: 20000, outputNodes: 20000, valueBytes: 262144, depth: 64 });
const failure = code => Object.assign(new Error(code), { code });

export function inspectValue(value, limits, nodeLimit) {
  let nodes = 0, bytes = 0;
  const active = new Set();
  function textBytes(text) {
    if (text.length > limits.valueBytes - bytes) throw failure('LIMIT_EXCEEDED');
    for (const point of text) {
      const code = point.codePointAt(0);
      bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
      if (bytes > limits.valueBytes) throw failure('LIMIT_EXCEEDED');
    }
  }
  function visit(item, depth) {
    if (++nodes > nodeLimit || depth > limits.depth) throw failure('LIMIT_EXCEEDED');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') return textBytes(item);
    if (typeof item === 'number') { if (!Number.isFinite(item)) throw failure('UNSUPPORTED_VALUE'); return; }
    if (typeof item === 'bigint') { if (item < -9223372036854775808n || item > 9223372036854775807n) throw failure('UNSUPPORTED_VALUE'); return; }
    if (!item || typeof item !== 'object') throw failure('UNSUPPORTED_VALUE');
    if (active.has(item)) throw failure('CYCLIC_VALUE');
    const prototype = Object.getPrototypeOf(item);
    if (item instanceof Date) {
      if (prototype !== Date.prototype || !Number.isFinite(item.getTime()) || item.getTime() < -62135596800000 || item.getTime() > 253402300799999) throw failure('UNSUPPORTED_VALUE');
      return;
    }
    if (!Array.isArray(item) && prototype !== Map.prototype && prototype !== Set.prototype && prototype !== Object.prototype && prototype !== null) throw failure('UNSUPPORTED_VALUE');
    active.add(item);
    if (Array.isArray(item)) {
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, i);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw failure('UNSUPPORTED_VALUE');
        visit(descriptor.value, depth + 1);
      }
    } else if (item instanceof Map) {
      for (const [key, child] of item) { visit(key, depth + 1); visit(child, depth + 1); }
    } else if (item instanceof Set) {
      for (const child of item) visit(child, depth + 1);
    } else {
      for (const key of Object.keys(item)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!Object.hasOwn(descriptor, 'value')) throw failure('UNSUPPORTED_VALUE');
        textBytes(key); visit(descriptor.value, depth + 1);
      }
    }
    active.delete(item);
  }
  visit(value, 0);
  return { nodes, bytes };
}

export function createGuarded(Environment, { variables = {}, functions = [], limits: custom = {}, cost = 100000 } = {}) {
  const limits = { ...defaults, ...custom };
  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(defaults, key) || !Number.isSafeInteger(value) || value <= 0) throw failure('INVALID_LIMIT');
  }
  const environment = new Environment({ limits: { maxEvaluationCost: cost, maxAstNodes: 10000, maxDepth: limits.depth } });
  for (const [name, type] of Object.entries(variables)) environment.registerVariable(name, type);
  // Callbacks are trusted pure host extensions; this is not a JS sandbox.
  for (const [signature, handler] of functions) environment.registerFunction(signature, handler);
  return {
    compile(source) {
      if (typeof source !== 'string' || source.length > limits.expressionChars) throw failure('LIMIT_EXCEEDED');
      const parsed = environment.parse(source), checked = parsed.check();
      if (!checked.valid) throw checked.error;
      return bindings => {
        inspectValue(bindings ?? {}, limits, limits.inputNodes);
        const result = parsed(bindings);
        const finish = value => { inspectValue(value, limits, limits.outputNodes); return value; };
        return result instanceof Promise ? result.then(finish) : finish(result);
      };
    },
  };
}
