import { fail } from './errors.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const invalid = () => fail('INVALID_DEFINITION');
export const record = value => value !== null && typeof value === 'object' && [null, Object.prototype].includes(Object.getPrototypeOf(value));
export const object = value => { if (!record(value)) invalid(); return value; };
export const name = value => { if (typeof value !== 'string' || !value) invalid(); return value; };
export const fields = (value, allowed) => { object(value); if (Object.keys(value).some(item => !allowed.includes(item))) invalid(); };
export const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };

// Definitions are JSON declarations. Reject accessors, functions, native values,
// sparse arrays and cycles before copying or inspecting expression syntax.
export function json(value, active = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!Array.isArray(value) && !record(value)) invalid();
  if (active.has(value)) invalid();
  active.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [property, descriptor] of Object.entries(descriptors)) {
    if (Array.isArray(value) && property === 'length') continue;
    if (!own(descriptor, 'value') || !descriptor.enumerable) invalid();
    json(descriptor.value, active);
  }
  if (Array.isArray(value)) for (let index = 0; index < value.length; index++) if (!own(value, index)) invalid();
  if (Object.getOwnPropertySymbols(value).length) invalid();
  active.delete(value);
}

export function copy(value) {
  json(value);
  return structuredClone(value);
}
