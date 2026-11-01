// Proof of selected boundary rules, NOT a StateStore or a full schema adapter.
import Ajv2020 from 'ajv/dist/2020.js';
import { Temporal } from '@js-temporal/polyfill';

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

// Deliberately limited to direct schemas and their properties/items, plus
// nullable native types. Compound/local-ref normalization is NOT implemented.
export function acceptDirect(input, schema) {
  const value = normalize(input);
  return prepare(value, schema);
}
function prepare(value, schema) {
  if (schema === true) return value;
  if (schema === false) fail('SCHEMA');
  if (schema.anyOf) {
    if (schema.anyOf.length !== 2 || !schema.anyOf.some((x) => x.type === 'null')) fail('COMPOSITION_OUTSIDE_PROBE');
    return value === null ? null : prepare(value, schema.anyOf.find((x) => x.type !== 'null'));
  }
  if (['allOf', 'oneOf', 'if', 'not', '$ref'].some((x) => x in schema)) fail('COMPOSITION_OUTSIDE_PROBE');
  const native = schema['x-viewstem-type'];
  if (native === 'set' || native === 'map') {
    if (native === 'set' ? !(value instanceof Set) : !(value instanceof Map)) fail('NATIVE_TYPE');
    if (value.size < (schema.minItems ?? 0) || value.size > (schema.maxItems ?? Infinity)) fail('NATIVE_SIZE');
    if (native === 'set') return new Set([...value].map((x) => prepare(x, schema.items)));
    return new Map([...value].map(([k, v]) => [prepare(k, schema.keys), prepare(v, schema.values)]));
  }
  if (['date', 'time', 'datetime'].includes(native)) {
    const canonical = normalizeDate(value, native);
    if (!ajv.validate(schema, canonical)) fail('SCHEMA');
    return canonical;
  }
  if (schema.type === 'integer' && !Number.isSafeInteger(value)) fail('SAFE_INTEGER');
  if (schema.type === 'object' && value && Object.getPrototypeOf(value) === null) {
    for (const key of Object.keys(value)) {
      const child = schema.properties?.[key] ?? schema.additionalProperties;
      if (typeof child === 'object') value[key] = prepare(value[key], child);
    }
  }
  if (schema.type === 'array' && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const child = schema.prefixItems?.[i] ?? schema.items;
      if (typeof child === 'object') value[i] = prepare(value[i], child);
    }
  }
  // A parent JSON-schema validator must not silently skip native descendants.
  if (JSON.stringify(schema).includes('x-viewstem-type')) fail('NESTED_NATIVE_OUTSIDE_PROBE');
  if (!ajv.validate(schema, value)) fail('SCHEMA');
  return value;
}

export function toCelInteger(value) {
  if (!Number.isSafeInteger(value)) fail('SAFE_INTEGER');
  return BigInt(value);
}
export function fromCelInteger(value) {
  if (typeof value !== 'bigint' || value < -9007199254740991n || value > 9007199254740991n) fail('SAFE_INTEGER_RESULT');
  return Number(value);
}

// Prototype opaque wrappers: preserve Set identity and numeric Map keys rather
// than pretending they are CEL lists/standard CEL maps. Names are experimental.
export class SetView { constructor(value) { this.value = value; } }
export class MapView { constructor(value) { this.value = value; } }
