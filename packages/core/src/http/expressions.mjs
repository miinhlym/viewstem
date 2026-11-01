import { invokeFunction } from '../expressions.mjs';
import { pointerKeys, expressionKind, dataEntries, isRecord, formatParts } from '../expression-syntax.mjs';
export { pointerKeys, expressionKind, dataEntries, isRecord, validateTemplate } from '../expression-syntax.mjs';
const own = (value, key) => Object.hasOwn(value, key);
const fail = code => { throw { code }; };

export function createValueEvaluator(check, functions = []) {
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
    const kind = expressionKind(value, functions);
    if (kind === 'path') return read(value['@path'], scope);
    if (kind === 'call') {
      const args = await evaluate(value.args, scope);
      if (value['@call'] === 'formatString') return format(args.value, scope);
      if (value['@call'] !== 'concat') return invokeFunction(value['@call'],args,functions);
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
