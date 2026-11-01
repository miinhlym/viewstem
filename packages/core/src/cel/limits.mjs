export const defaultLimits = Object.freeze({ expressionChars: 65536, inputNodes: 20000, outputNodes: 20000, valueBytes: 262144, depth: 64 });
export const fail = code => { throw Object.assign(new Error(code), { code }); };
export function resolveLimits(custom = {}) {
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) fail('INVALID_LIMIT');
  const limits = { ...defaultLimits, ...custom };
  for (const [key, value] of Object.entries(limits)) if (!Object.hasOwn(defaultLimits, key) || !Number.isSafeInteger(value) || value <= 0) fail('INVALID_LIMIT');
  return limits;
}
// Called before schema admission and after evaluation; opaque payloads are unwrapped
// by the private adapter so they cannot evade node, UTF-8 byte, or depth limits.
export function inspect(value, limits, nodeLimit, unwrap = value => value) {
  let nodes = 0, bytes = 0;
  const active = new Set();
  function text(value) {
    if (value.length > limits.valueBytes - bytes) fail('LIMIT_EXCEEDED');
    for (const point of value) {
      const n = point.codePointAt(0); bytes += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4;
      if (bytes > limits.valueBytes) fail('LIMIT_EXCEEDED');
    }
  }
  function visit(value, depth) {
    if (++nodes > nodeLimit || depth > limits.depth) fail('LIMIT_EXCEEDED');
    const item = unwrap(value);
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') return text(item);
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
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('UNSUPPORTED_VALUE');
        if (!Array.isArray(item) && descriptor.value === undefined) continue;
        if (!Array.isArray(item)) text(key);
        visit(descriptor.value, depth + 1);
      }
    }
    active.delete(item);
  }
  visit(value, 0);
  return { nodes, bytes };
}
