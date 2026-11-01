// Independent HTTP fixture evaluator, not the core's reactive value/handle engine.
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fail = code => { throw { code }; };
export const isRecord = value => value !== null && typeof value === 'object'
  && [null, Object.prototype].includes(Object.getPrototypeOf(value));

export function pointerKeys(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || /~(?:[^01]|$)/.test(path)) fail('INVALID_EXPRESSION');
  return path.split('/').slice(1).map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function expressionKind(value) {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  const reserved = keys.filter(key => key.startsWith('@') && !key.startsWith('@@'));
  if (!reserved.length) return null;
  if (keys.length === 1 && own(value, '@path')) {
    pointerKeys(value['@path']);
    return 'path';
  }
  if (keys.length === 2 && own(value, '@call') && own(value, 'args')) {
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

function formatParts(template) {
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

export function validateTemplate(value, active = new WeakSet()) {
  if (!Array.isArray(value) && !isRecord(value)) return;
  if (active.has(value)) fail('INVALID_DEFINITION');
  active.add(value);
  try {
    const kind = expressionKind(value);
    if (kind === 'path') return;
    if (kind === 'call') {
      validateTemplate(value.args, active);
      if (value['@call'] === 'formatString' && typeof value.args.value === 'string') formatParts(value.args.value);
    }
    else for (const item of Object.values(value)) validateTemplate(item, active);
  } finally { active.delete(value); }
}

export function createValueEvaluator(check) {
  async function read(path, scope) {
    check();
    const keys = pointerKeys(path);
    if (keys[0] === 'secrets') {
      if (!scope.readSecret || keys.length !== 2) fail('REFERENCE_NOT_FOUND');
      const value = await scope.readSecret(keys[1]);
      check();
      if (value === undefined) fail('INPUT_NOT_READY');
      return value;
    }
    if (!own(scope.values, keys[0])) fail('REFERENCE_NOT_FOUND');
    let result = scope.values[keys[0]];
    for (let i = 1; i < keys.length; i++) {
      const key = keys[i];
      if (result === undefined) fail('INPUT_NOT_READY');
      if (Array.isArray(result)) {
        if (!/^(0|[1-9]\d*)$/.test(key) || !Number.isSafeInteger(Number(key))
            || Number(key) >= result.length || !own(result, key)) fail('REFERENCE_NOT_FOUND');
      } else {
        if (!isRecord(result)) fail('TYPE_MISMATCH');
        if (!own(result, key)) {
          if (i === 1 && keys[0] === 'ports') fail('REFERENCE_NOT_FOUND');
          fail('INPUT_NOT_READY');
        }
      }
      result = result[key];
    }
    if (result === undefined) fail('INPUT_NOT_READY');
    return result;
  }

  async function format(template, scope) {
    let result = '';
    for (const part of formatParts(template)) {
      if (own(part, 'text')) result += part.text;
      else {
        const value = await read(part.path, scope);
        if (value !== null && !['string', 'boolean', 'number'].includes(typeof value)) fail('TYPE_MISMATCH');
        if (typeof value === 'number' && !Number.isFinite(value)) fail('TYPE_MISMATCH');
        result += String(value);
      }
    }
    return result;
  }

  async function evaluate(value, scope) {
    check();
    if (Array.isArray(value)) {
      const result = [];
      for (let i = 0; i < value.length; i++) {
        if (!own(value, i) || value[i] === undefined) fail('INVALID_DEFINITION');
        result.push(await evaluate(value[i], scope));
      }
      return result;
    }
    // Native collection data is never an expression syntax tree.
    if (!isRecord(value)) return value;
    const kind = expressionKind(value);
    if (kind === 'path') return read(value['@path'], scope);
    if (kind === 'call') {
      const args = await evaluate(value.args, scope);
      if (value['@call'] === 'formatString') return format(args.value, scope);
      if (!args.every(item => typeof item === 'string')) fail('TYPE_MISMATCH');
      return args.join('');
    }
    const result = Object.create(null);
    for (const [key, item] of dataEntries(value)) {
      if (item !== undefined) result[key] = await evaluate(item, scope);
    }
    return result;
  }
  return evaluate;
}
