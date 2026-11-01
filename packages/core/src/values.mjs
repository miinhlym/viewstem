import Ajv2020 from 'ajv/dist/2020.js';
import { Temporal } from '@js-temporal/polyfill';
import { profileGuard } from './schema-profile.mjs';

export const ajv = new Ajv2020({
  strict: false, strictNumbers: true, ownProperties: true,
  coerceTypes: false, useDefaults: false, removeAdditional: false,
});
const fail = (message) => { throw new Error(message); };

export function normalize(value, active = new WeakSet(), copies = new WeakMap()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('NON_FINITE');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') fail('UNSUPPORTED_VALUE');
  if (active.has(value)) fail('CYCLIC_VALUE');
  if (copies.has(value)) return copies.get(value);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && !(value instanceof Set) && !(value instanceof Map)
    && prototype !== Object.prototype && prototype !== null) fail('UNSUPPORTED_OBJECT');
  active.add(value);
  const out = Array.isArray(value) ? [] : value instanceof Set ? new Set()
    : value instanceof Map ? new Map() : Object.create(null);
  copies.set(value, out);
  const recurse = (item) => normalize(item, active, copies);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) fail('ARRAY_HOLE');
      out.push(recurse(value[i]));
    }
  } else if (value instanceof Set) {
    for (const item of value) out.add(recurse(item));
  } else if (value instanceof Map) {
    for (const [key, item] of value) {
      if (!['string', 'number'].includes(typeof key)) fail('MAP_KEY');
      out.set(recurse(key), recurse(item));
    }
  } else {
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(descriptor, 'value')) fail('ACCESSOR_OUTSIDE_PROBE');
      if (descriptor.value !== undefined) out[key] = recurse(descriptor.value);
    }
  }
  active.delete(value);
  return out;
}

export function normalizeDate(value, kind) {
  if (typeof value !== 'string') fail('DATE_STRING_REQUIRED');
  if (kind === 'date') {
    if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) fail('DATE_FORMAT');
    return Temporal.PlainDate.from(value, { overflow: 'reject' }).toString();
  }
  if (kind === 'time') {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(value)) fail('TIME_FORMAT');
    return Temporal.PlainTime.from(value, { overflow: 'reject' }).toString({ fractionalSecondDigits: 3 });
  }
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    || value.endsWith('-00:00')) fail('DATETIME_FORMAT');
  const result = Temporal.Instant.from(value).toString({ fractionalSecondDigits: 3 });
  if (!/^(?!0000)\d{4}-/.test(result)) fail('DATETIME_RANGE');
  return result;
}

export function localInstant(date, time, timeZone) {
  // Intentionally explicit; no ambient/default timezone.
  if (!timeZone || /^[+-]/.test(timeZone)) fail('IANA_TIME_ZONE_REQUIRED');
  const d = Temporal.PlainDate.from(normalizeDate(date, 'date'));
  const t = Temporal.PlainTime.from(normalizeDate(time, 'time'));
  return normalizeDate(d.toPlainDateTime(t).toZonedDateTime(timeZone, { disambiguation: 'reject' })
    .toInstant().toString({ fractionalSecondDigits: 3 }), 'datetime');
}

export function toCelInteger(value) {
  if (!Number.isSafeInteger(value)) fail('SAFE_INTEGER');
  return BigInt(value);
}
export function fromCelInteger(value) {
  if (typeof value !== 'bigint' || value < -9007199254740991n || value > 9007199254740991n) fail('SAFE_INTEGER_RESULT');
  return Number(value);
}


export function encodeBoundary(value) {
  if (value instanceof Set) return [...value].map(encodeBoundary);
  if (value instanceof Map) return [...value].map(([key, item]) => [key, encodeBoundary(item)]);
  if (Array.isArray(value)) return value.map(encodeBoundary);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeBoundary(item)]));
  return value;
}
