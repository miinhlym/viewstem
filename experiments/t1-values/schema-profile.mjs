// Registration subset guard. This is an experiment, not the public compiler.
export const dialect = 'https://json-schema.org/draft/2020-12/schema';
export const allowed = new Set(('$schema $ref $defs type enum const allOf anyOf oneOf not if then else '
  +'minimum maximum exclusiveMinimum exclusiveMaximum minLength maxLength pattern '
  +'properties required additionalProperties minProperties maxProperties items prefixItems '
  +'minItems maxItems uniqueItems title description default examples readOnly writeOnly deprecated $comment '
  +'x-viewstem-type keys values').split(' '));
const fail = message => { throw Error(message); };
const own = (object, key) => Object.hasOwn(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function assertSchemaLimits(root) {
  const stack = [{ value: root, depth: 0 }], active = new Set();
  let nodes = 0, chars = 0;
  while (stack.length) {
    const { value, depth, exit } = stack.pop();
    if (exit) { active.delete(value); continue; }
    if (++nodes > 20000 || depth > 64) fail('LIMIT_EXCEEDED');
    if (typeof value === 'string') { chars += value.length; if (chars > 262144) fail('LIMIT_EXCEEDED'); continue; }
    if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) continue;
    if (!value || typeof value !== 'object') fail('INVALID_SCHEMA');
    if (active.has(value)) fail('CYCLIC_REF');
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) fail('INVALID_SCHEMA');
    if (Object.getOwnPropertySymbols(value).length) fail('INVALID_SCHEMA');
    active.add(value); stack.push({ value, exit: true });
    if (Array.isArray(value) && value.length > 20000 - nodes) fail('LIMIT_EXCEEDED');
    const keys = Array.isArray(value) ? Array.from({ length: value.length }, (_, i) => String(i)) : Object.keys(value);
    if (keys.length > 20000 - nodes) fail('LIMIT_EXCEEDED');
    for (const key of keys) {
      chars += key.length; if (chars > 262144) fail('LIMIT_EXCEEDED');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value')) fail('INVALID_SCHEMA');
      stack.push({ value: descriptor.value, depth: depth + 1 });
    }
  }
}

export function resolveRef(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) fail('LOCAL_REF_REQUIRED');
  let pointer;
  try { pointer = decodeURIComponent(ref.slice(1)); } catch { fail('REF_ENCODING'); }
  let target = root;
  for (const segment of pointer.slice(1).split('/')) {
    if (/~(?:[^01]|$)/.test(segment)) fail('REF_ESCAPE');
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!target || typeof target !== 'object' || !own(target, key)) fail('MISSING_REF');
    target = target[key];
  }
  return target;
}

export function profileGuard(root) {
  if (typeof root !== 'boolean' && !record(root)) fail('SCHEMA_OBJECT');
  assertSchemaLimits(root);
  const active = new Set(), done = new Set(), nodes = [];
  function walk(schema, depth = 0) {
    if (depth > 64) fail('LIMIT_EXCEEDED');
    if (typeof schema === 'boolean') return;
    if (!record(schema)) fail('SCHEMA_OBJECT');
    if (active.has(schema)) fail('CYCLIC_REF');
    if (done.has(schema)) return;
    active.add(schema); nodes.push(schema);
    for (const key of Object.keys(schema)) if (!allowed.has(key)) fail(`UNSUPPORTED_KEYWORD:${key}`);
    if (own(schema, '$schema') && schema.$schema !== dialect) fail('DIALECT');
    if (typeof schema.pattern === 'string') {
      try { new RegExp(schema.pattern, 'u'); } catch { fail('INVALID_PATTERN'); }
    }
    if (own(schema, 'x-viewstem-type')) {
      const kind = schema['x-viewstem-type'];
      if (!['set', 'map', 'date', 'time', 'datetime'].includes(kind)) fail('NATIVE_KIND');
      if (own(schema, 'type')) fail('NATIVE_WITH_TYPE');
      if (kind === 'set' && !own(schema, 'items')) fail('SET_ITEMS_REQUIRED');
      if (kind === 'map' && (!own(schema, 'keys') || !own(schema, 'values'))) fail('MAP_SCHEMAS_REQUIRED');
    }
    if ((own(schema, 'keys') || own(schema, 'values')) && schema['x-viewstem-type'] !== 'map') fail('MAP_FIELDS_WITHOUT_MAP');
    if (own(schema, '$ref')) walk(resolveRef(root, schema.$ref), depth + 1);
    for (const key of ['$defs', 'properties']) if (own(schema, key)) {
      if (!record(schema[key])) fail('SCHEMA_MAP');
      for (const child of Object.values(schema[key])) walk(child, depth + 1);
    }
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) if (own(schema, key)) {
      if (!Array.isArray(schema[key]) || !schema[key].length) fail('SCHEMA_LIST');
      for (const child of schema[key]) walk(child, depth + 1);
    }
    for (const key of ['not', 'if', 'then', 'else', 'items', 'additionalProperties', 'keys', 'values']) {
      if (own(schema, key)) walk(schema[key], depth + 1);
    }
    active.delete(schema); done.add(schema);
  }
  walk(root);
  return nodes;
}
