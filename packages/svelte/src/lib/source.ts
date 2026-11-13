import { failure } from './connection.js';

/** Copy a JSON definition, including Svelte's reactive properties. */
export function snapshotSource(value: unknown, active = new Set<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if ((!array && prototype !== Object.prototype && prototype !== null) || active.has(value)) {
    throw failure('INVALID_DEFINITION', 'ViewstemView source must be a JSON definition.');
  }
  active.add(value);
  const entries = Object.getOwnPropertyDescriptors(value);
  const copy = array ? new Array(value.length) : {};
  for (const key of Reflect.ownKeys(entries)) {
    if (array && key === 'length') continue;
    const descriptor = Reflect.get(entries, key) as PropertyDescriptor;
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw failure('INVALID_DEFINITION', 'ViewstemView source must be a JSON definition.');
    }
    Object.defineProperty(copy, key, {
      value: snapshotSource(descriptor.value, active), enumerable: true, writable: true, configurable: true,
    });
  }
  active.delete(value);
  return copy;
}
