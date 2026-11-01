const known = new WeakSet();
const readonly = () => { throw Object.assign(new Error('READ_ONLY'), { code: 'READ_ONLY' }); };

export function trustedCopies(input) {
  const copies = new WeakMap(), visited = new WeakSet();
  function walk(value) {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (known.has(value)) { copies.set(value, value); return; }
    if (value instanceof Set) for (const child of value) walk(child);
    else if (value instanceof Map) for (const [key, child] of value) { walk(key); walk(child); }
    else for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) walk(descriptor.value);
    }
  }
  walk(input);
  return copies;
}

export function protect(value, copies = new WeakMap()) {
  if (!value || typeof value !== 'object' || known.has(value)) return value;
  if (copies.has(value)) return copies.get(value);
  if (value instanceof Set || value instanceof Map) {
    const set = value instanceof Set, target = set ? new Set() : new Map();
    let proxy;
    const methods = new Map();
    proxy = new Proxy(target, {
      set: readonly, defineProperty: readonly, deleteProperty: readonly, setPrototypeOf: readonly,
      get(_target, key) {
        if (['add', 'set', 'delete', 'clear'].includes(key)) return readonly;
        if (key === 'size') return target.size;
        if (key === 'constructor') return set ? Set : Map;
        if (key === Symbol.toStringTag) return set ? 'Set' : 'Map';
        if (key === 'valueOf') return () => proxy;
        if (key === 'toString') return () => `[object ${set ? 'Set' : 'Map'}]`;
        if (key === 'forEach') {
          if (!methods.has(key)) methods.set(key, (callback, receiver) => target.forEach((item, mapKey) => callback.call(receiver, item, mapKey, proxy)));
          return methods.get(key);
        }
        if ([Symbol.iterator, 'keys', 'values', 'entries', 'has', ...(set ? [] : ['get'])].includes(key)) {
          if (!methods.has(key)) methods.set(key, target[key].bind(target));
          return methods.get(key);
        }
        return undefined;
      },
    });
    copies.set(value, proxy); known.add(proxy);
    if (set) for (const item of value) target.add(protect(item, copies));
    else for (const [key, item] of value) target.set(key, protect(item, copies));
    return proxy;
  }
  const output = Array.isArray(value) ? [] : Object.create(null);
  copies.set(value, output);
  for (const key of Object.keys(value)) output[key] = protect(value[key], copies);
  Object.freeze(output); known.add(output);
  return output;
}
