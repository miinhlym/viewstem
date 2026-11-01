// Independent v1 schema experiment. No Store, SDK, or production compiler.
import { ajv, normalize, normalizeDate } from './values.mjs';
import { profileGuard, resolveRef, assertSchemaLimits } from './schema-profile.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const fail = code => { throw Error(code); };
const dates = new Set(['date', 'time', 'datetime']);
const kinds = ['null', 'boolean', 'number', 'string', 'object', 'array', 'set', 'map'];
const kindOf = value => value === null ? 'null' : Array.isArray(value) ? 'array'
  : value instanceof Set ? 'set' : value instanceof Map ? 'map' : typeof value;

export function equal(a, b) {
  if (a === b) return true;
  const kind = kindOf(a);
  if (kind !== kindOf(b)) return false;
  if (kind === 'set') return a.size === b.size && [...a].every(value => b.has(value));
  if (kind === 'map') return a.size === b.size && [...a].every(([key, value]) => b.has(key) && equal(value, b.get(key)));
  if (kind === 'array') return a.length === b.length && a.every((value, i) => equal(value, b[i]));
  if (kind === 'object') return Object.keys(a).length === Object.keys(b).length
    && Object.keys(a).every(key => own(b, key) && equal(a[key], b[key]));
  return false;
}

export function compileSchema(declaration) {
  // Snapshot the schema separately. Annotations remain data, not schemas.
  assertSchemaLimits(declaration);
  const root = structuredClone(declaration);
  for (const node of profileGuard(root)) if (!ajv.validateSchema(node)) fail('INVALID_SCHEMA');
  const product = (a, b) => {
    if (a.length * b.length > 1024) fail('LIMIT_EXCEEDED');
    return a.flatMap(left => b.map(right => [...left, ...right]));
  };
  let planningCost = 0;
  function union(schemas, depth) {
    const output = [];
    for (const schema of schemas) {
      const variants = alternatives(schema, depth);
      if (output.length + variants.length > 1024) fail('LIMIT_EXCEEDED');
      output.push(...variants);
    }
    return output;
  }
  function alternatives(schema, depth = 0) {
    if (++planningCost > 100000 || depth > 64) fail('LIMIT_EXCEEDED');
    if (schema === false) return [];
    if (schema === true) return [[]];
    let variants = [[schema]];
    if (own(schema, '$ref')) variants = product(variants, alternatives(resolveRef(root, schema.$ref), depth + 1));
    for (const child of schema.allOf ?? []) variants = product(variants, alternatives(child, depth + 1));
    for (const key of ['anyOf', 'oneOf']) if (schema[key]) variants = product(variants, union(schema[key], depth + 1));
    if (own(schema, 'if')) variants = product(variants, union([schema.then ?? true, schema.else ?? true], depth + 1));
    return variants;
  }
  function possible(variant) {
    let types = new Set(kinds);
    for (const schema of variant) {
      let declared = kinds;
      if (own(schema, 'type')) declared = (Array.isArray(schema.type) ? schema.type : [schema.type]).map(type => type === 'integer' ? 'number' : type);
      if (schema['x-viewstem-type']) declared = [dates.has(schema['x-viewstem-type']) ? 'string' : schema['x-viewstem-type']];
      types = new Set([...types].filter(type => declared.includes(type)));
      if (schema.not && typeof schema.not === 'object' && Object.keys(schema.not).length === 1 && schema.not.type) {
        const excluded = Array.isArray(schema.not.type) ? schema.not.type : [schema.not.type];
        // Excluding integer does not exclude all numbers.
        types = new Set([...types].filter(type => !excluded.includes(type)));
      }
      if (own(schema, 'const')) types = new Set([...types].filter(type => type === kindOf(schema.const)));
      if (schema.enum) types = new Set([...types].filter(type => schema.enum.some(value => kindOf(value) === type)));
    }
    return types;
  }
  function makePlan(variants) {
    const typed = variants.map(variant => ({ variant, types: possible(variant) })).filter(row => row.types.size);
    const dateKinds = new Set();
    for (const { variant, types } of typed) if (types.has('string')) {
      const declared = new Set(variant.map(schema => schema['x-viewstem-type']).filter(kind => dates.has(kind)));
      if (declared.size > 1) fail('AMBIGUOUS_DATE_NORMALIZATION');
      dateKinds.add([...declared][0] ?? 'string');
    }
    if (dateKinds.size > 1 && [...dateKinds].some(kind => dates.has(kind))) fail('AMBIGUOUS_DATE_NORMALIZATION');
    const date = [...dateKinds].find(kind => dates.has(kind));
    function children(kind, select) {
      const projected = [];
      for (const { variant, types } of typed) {
        if (!types.has(kind)) continue;
        let childVariants = [[]];
        for (const schema of variant) childVariants = product(childVariants, alternatives(select(schema)));
        if (projected.length + childVariants.length > 1024) fail('LIMIT_EXCEEDED');
        projected.push(...childVariants);
      }
      // No structural constraints: stop recursion rather than project true forever.
      return projected.some(variant => variant.length) ? makePlan(projected) : null;
    }
    const objectRows = typed.filter(row => row.types.has('object'));
    const keys = new Set(objectRows.flatMap(row => row.variant.flatMap(schema => Object.keys(schema.properties ?? {}))));
    const properties = Object.create(null);
    for (const key of keys) properties[key] = children('object', schema => own(schema.properties ?? {}, key) ? schema.properties[key] : schema.additionalProperties ?? true);
    const additional = children('object', schema => schema.additionalProperties ?? true);
    let count = 0;
    for (const row of typed) if (row.types.has('array')) for (const schema of row.variant) count = Math.max(count, schema.prefixItems?.length ?? 0);
    const prefix = Array.from({ length: count }, (_, i) => children('array', schema => schema.prefixItems?.[i] ?? schema.items ?? true));
    return { date, properties, additional, prefix, items: children('array', schema => schema.items ?? true),
      setItems: children('set', schema => schema['x-viewstem-type'] === 'set' ? schema.items : true),
      mapKeys: children('map', schema => schema['x-viewstem-type'] === 'map' ? schema.keys : true),
      mapValues: children('map', schema => schema['x-viewstem-type'] === 'map' ? schema.values : true) };
  }
  const plan = makePlan(alternatives(root));
  function apply(value, current) {
    if (!current) return value;
    if (typeof value === 'string' && current.date) return normalizeDate(value, current.date);
    if (Array.isArray(value)) {
      const output = value.map((item, i) => apply(item, i < current.prefix.length ? current.prefix[i] : current.items));
      return output.every((item, i) => item === value[i]) ? value : output;
    }
    if (value instanceof Set) {
      const before = [...value], after = before.map(item => apply(item, current.setItems));
      return after.every((item, i) => item === before[i]) ? value : new Set(after);
    }
    if (value instanceof Map) {
      const output = new Map();
      for (const [key, item] of value) {
        const normalizedKey = apply(key, current.mapKeys);
        if (output.has(normalizedKey)) fail('NORMALIZATION_KEY_COLLISION');
        output.set(normalizedKey, apply(item, current.mapValues));
      }
      return [...output].every(([key, item]) => value.has(key) && value.get(key) === item) && output.size === value.size ? value : output;
    }
    if (kindOf(value) === 'object') {
      const output = Object.create(null);
      for (const key of Object.keys(value)) output[key] = apply(value[key], own(current.properties, key) ? current.properties[key] : current.additional);
      return Object.keys(output).every(key => output[key] === value[key]) ? value : output;
    }
    return value;
  }
  function valid(value, schema) {
    if (typeof schema === 'boolean') return schema;
    const kind = kindOf(value), native = schema['x-viewstem-type'];
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some(type => type === 'integer' ? Number.isSafeInteger(value) : type === kind)) return false;
    }
    if (native) {
      if (dates.has(native)) { try { normalizeDate(value, native); } catch { return false; } }
      else if (kind !== native) return false;
    }
    if (own(schema, 'const') && !equal(value, schema.const)) return false;
    if (schema.enum && !schema.enum.some(item => equal(value, item))) return false;
    if (kind === 'number') {
      if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)
        || value <= (schema.exclusiveMinimum ?? -Infinity) || value >= (schema.exclusiveMaximum ?? Infinity)) return false;
    }
    if (kind === 'string') {
      const length = [...value].length;
      if (length < (schema.minLength ?? 0) || length > (schema.maxLength ?? Infinity)) return false;
      if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) return false;
    }
    if (kind === 'object') {
      const keys = Object.keys(value);
      if (keys.length < (schema.minProperties ?? 0) || keys.length > (schema.maxProperties ?? Infinity)) return false;
      if (schema.required?.some(key => !own(value, key))) return false;
      for (const key of keys) if (!valid(value[key], own(schema.properties ?? {}, key) ? schema.properties[key] : schema.additionalProperties ?? true)) return false;
    }
    if (kind === 'array' || kind === 'set' || kind === 'map') {
      const size = kind === 'array' ? value.length : value.size;
      if (size < (schema.minItems ?? 0) || size > (schema.maxItems ?? Infinity)) return false;
      if (kind === 'array') {
        if (value.some((item, i) => !valid(item, schema.prefixItems?.[i] ?? schema.items ?? true))) return false;
        if (schema.uniqueItems && value.some((item, i) => value.slice(0, i).some(previous => equal(item, previous)))) return false;
      }
      if (native === 'set' && [...value].some(item => !valid(item, schema.items))) return false;
      if (native === 'map' && [...value].some(([key, item]) => !valid(key, schema.keys) || !valid(item, schema.values))) return false;
    }
    if (schema.$ref && !valid(value, resolveRef(root, schema.$ref))) return false;
    if (schema.allOf?.some(child => !valid(value, child))) return false;
    if (schema.anyOf && !schema.anyOf.some(child => valid(value, child))) return false;
    if (schema.oneOf && schema.oneOf.filter(child => valid(value, child)).length !== 1) return false;
    if (own(schema, 'not') && valid(value, schema.not)) return false;
    if (own(schema, 'if') && !valid(value, valid(value, schema.if) ? schema.then ?? true : schema.else ?? true)) return false;
    return true;
  }
  return {
    accept(input, trustedCopies = new WeakMap()) {
      const value = apply(normalize(input, new WeakSet(), trustedCopies), plan);
      if (!valid(value, root)) fail('SCHEMA');
      return value;
    },
  };
}
