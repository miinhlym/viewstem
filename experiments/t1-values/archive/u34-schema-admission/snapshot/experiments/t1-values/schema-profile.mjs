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
  const active = new Set(), done = new Set(), nodes = [];
  function walk(schema) {
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
    if (own(schema, '$ref')) walk(resolveRef(root, schema.$ref));
    for (const key of ['$defs', 'properties']) if (own(schema, key)) {
      if (!record(schema[key])) fail('SCHEMA_MAP');
      for (const child of Object.values(schema[key])) walk(child);
    }
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) if (own(schema, key)) {
      if (!Array.isArray(schema[key]) || !schema[key].length) fail('SCHEMA_LIST');
      for (const child of schema[key]) walk(child);
    }
    for (const key of ['not', 'if', 'then', 'else', 'items', 'additionalProperties', 'keys', 'values']) {
      if (own(schema, key)) walk(schema[key]);
    }
    active.delete(schema); done.add(schema);
  }
  walk(root);
  return nodes;
}
