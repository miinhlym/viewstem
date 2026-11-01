// Shared expression syntax. Returned data is never reinterpreted as a template.
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fail = code => { throw { code }; };
export const isRecord = value => value !== null && typeof value === 'object'
  && [null, Object.prototype].includes(Object.getPrototypeOf(value));

export function pointerKeys(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || /~(?:[^01]|$)/.test(path)) fail('INVALID_EXPRESSION');
  return path.split('/').slice(1).map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function expressionKind(value, functions = []) {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  const reserved = keys.filter(key => key.startsWith('@') && !key.startsWith('@@'));
  if (!reserved.length) return null;
  if (keys.length === 1 && own(value, '@path')) {
    pointerKeys(value['@path']);
    return 'path';
  }
  if (keys.length === 2 && own(value, '@call') && own(value, 'args')) {
    if (functions.some(definition=>definition.name===value['@call']) && Array.isArray(value.args)) return 'call';
    if (value['@call'] === 'concat' && Array.isArray(value.args)) return 'call';
    if (value['@call'] === 'formatString' && isRecord(value.args)
        && Object.keys(value.args).length === 1 && own(value.args, 'value')) return 'call';
  }
  fail('INVALID_EXPRESSION');
}

export function dataEntries(value) {
  const seen = new Set();
  return Object.entries(value).map(([key, item]) => {
    const decoded = key.startsWith('@@') ? key.slice(1) : key;
    if (seen.has(decoded)) fail('INVALID_EXPRESSION');
    seen.add(decoded);
    return [decoded, item];
  });
}

export function formatParts(template) {
  if (typeof template !== 'string') fail('TYPE_MISMATCH');
  const parts = []; let text = '';
  for (let i = 0; i < template.length;) {
    if (template.startsWith('$$', i)) { text += '$'; i += 2; }
    else if (template.startsWith('${', i)) {
      const end = template.indexOf('}', i + 2);
      if (end < 0) fail('INVALID_EXPRESSION');
      const path = template.slice(i + 2, end); pointerKeys(path);
      parts.push({ text }, { path }); text = ''; i = end + 1;
    } else text += template[i++];
  }
  parts.push({ text }); return parts;
}

export function validateTemplate(value, active = new WeakSet(), functions = []) {
  if (!Array.isArray(value) && !isRecord(value)) return;
  if (active.has(value)) fail('INVALID_DEFINITION');
  active.add(value);
  try {
    const kind = expressionKind(value, functions);
    if (kind === 'path') return;
    if (kind === 'call') {
      validateTemplate(value.args, active, functions);
      if (value['@call'] === 'formatString' && typeof value.args.value === 'string') formatParts(value.args.value);
    }
    else for (const item of Object.values(value)) validateTemplate(item, active, functions);
  } finally { active.delete(value); }
}
