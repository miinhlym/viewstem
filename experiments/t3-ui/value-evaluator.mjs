// Synchronous UI fixture evaluator. Shared syntax helpers do not imply one core engine.
import { pointerKeys, expressionKind, dataEntries, validateTemplate, isRecord } from '../t2-http-boundary/value-expressions.mjs';
import { safeError } from '../verification/errors.mjs';
const own = (value, key) => Object.hasOwn(value, key);
export const uiRoots = ['ports', 'states', 'queries', 'repeat', 'actions', 'event'];
const failure = code => Object.assign(Error(code === 'REFERENCE_NOT_FOUND' ? 'REFERENCE' : code), { code });
const fail = code => { throw failure(code); };
function guarded(run) { try { return run(); } catch (error) { throw failure(safeError(error).code); } }
function parts(template) {
  if (typeof template !== 'string') fail('TYPE_MISMATCH');
  const result = []; let text = '';
  for (let index = 0; index < template.length;) {
    if (template.startsWith('$$', index)) { text += '$'; index += 2; }
    else if (template.startsWith('${', index)) {
      const end = template.indexOf('}', index + 2); if (end < 0) fail('INVALID_EXPRESSION');
      const path = template.slice(index + 2, end); pointerKeys(path); result.push({ text }, { path }); text = ''; index = end + 1;
    } else text += template[index++];
  }
  result.push({ text }); return result;
}
// Collect only syntactic paths. Escaped/native/returned data is never visited as code.
export function pathsIn(template) {
  return guarded(() => {
    validateTemplate(template); const paths = [];
    const walk = value => {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (!isRecord(value)) return;
      const kind = expressionKind(value);
      if (kind === 'path') paths.push(pointerKeys(value['@path']));
      else if (kind === 'call') {
        walk(value.args);
        if (value['@call'] === 'formatString' && typeof value.args.value === 'string')
          for (const part of parts(value.args.value)) if (own(part, 'path')) paths.push(pointerKeys(part.path));
      } else { for (const [, item] of dataEntries(value)) walk(item); }
    };
    walk(template); return paths;
  });
}
export function validateExpression(template, roots = uiRoots) {
  return guarded(() => { for (const keys of pathsIn(template)) if (!roots.includes(keys[0])) fail('REFERENCE_NOT_FOUND'); });
}
function ownValue(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return { exists: false };
  if (!own(descriptor, 'value')) fail('TYPE_MISMATCH');
  return { exists: true, value: descriptor.value };
}
export function evaluate(template, context, { roots = uiRoots } = {}) {
  return guarded(() => {
    validateExpression(template, roots);
    const read = path => {
      const keys = pointerKeys(path), root = keys[0];
      if (!roots.includes(root)) fail('REFERENCE_NOT_FOUND');
      let entry = root === 'actions' && typeof context.readActions === 'function'
        ? { exists: true, value: context.readActions() } : ownValue(context, root);
      if (!entry.exists) fail('REFERENCE_NOT_FOUND');
      let result = entry.value;
      for (let index = 1; index < keys.length; ++index) {
        const key = keys[index];
        // Private synchronous initializer hook resolves dependencies discovered
        // inside a dynamic formatString template as well as syntactic paths.
        if (root === 'states' && index === 1 && typeof context.readState === 'function') {
          result = context.readState(key); continue;
        }
        if (result === undefined) fail('INPUT_NOT_READY');
        if (Array.isArray(result)) {
          if (!/^(0|[1-9]\d*)$/.test(key) || !Number.isSafeInteger(Number(key)) || Number(key) >= result.length) fail('REFERENCE_NOT_FOUND');
        } else if (!isRecord(result)) fail('TYPE_MISMATCH');
        entry = ownValue(result, key);
        if (!entry.exists) {
          if (index === 1 || Array.isArray(result)) fail('REFERENCE_NOT_FOUND');
          fail('INPUT_NOT_READY');
        }
        result = entry.value;
      }
      if (result === undefined) fail('INPUT_NOT_READY');
      return result;
    };
    const walk = value => {
      if (Array.isArray(value)) {
        const result = [];
        for (let index = 0; index < value.length; ++index) {
          if (!own(value, index) || value[index] === undefined) fail('INVALID_DEFINITION');
          result.push(walk(value[index]));
        }
        return result;
      }
      if (!isRecord(value)) return value;
      const kind = expressionKind(value);
      if (kind === 'path') return read(value['@path']);
      if (kind === 'call') {
        const args = walk(value.args);
        if (value['@call'] === 'concat') {
          if (!args.every(item => typeof item === 'string')) fail('TYPE_MISMATCH'); return args.join('');
        }
        let result = '';
        for (const part of parts(args.value)) {
          if (own(part, 'text')) result += part.text;
          else {
            const item = read(part.path);
            if (item !== null && !['string', 'boolean', 'number'].includes(typeof item)) fail('TYPE_MISMATCH');
            if (typeof item === 'number' && !Number.isFinite(item)) fail('TYPE_MISMATCH'); result += String(item);
          }
        }
        return result;
      }
      const result = Object.create(null);
      for (const [key, item] of dataEntries(value)) if (item !== undefined) result[key] = walk(item);
      return result;
    };
    return walk(template);
  });
}

export function validateInitials(spec) {
  const declarations = spec.states ?? {}, names = Object.keys(declarations), graph = new Map();
  for (const [name, declaration] of Object.entries(declarations)) {
    const paths = own(declaration, 'initial') ? pathsIn(declaration.initial) : [];
    if (own(declaration, 'initial')) validateExpression(declaration.initial, ['ports', 'states']);
    const dependencies = paths.filter(keys => keys[0] === 'states').map(keys => keys[1]);
    for (const dependency of dependencies) if (!own(declarations, dependency)) fail('REFERENCE_NOT_FOUND');
    graph.set(name, dependencies);
  }
  const visiting = new Set(), done = new Set(), order = [];
  const visit = name => { if (visiting.has(name)) fail('INVALID_DEFINITION'); if (done.has(name)) return;
    visiting.add(name); graph.get(name).forEach(visit); visiting.delete(name); done.add(name); order.push(name); };
  names.forEach(visit);
  return order;
}
export function initializeStates(spec, ports, validator) {
  const order = validateInitials(spec), declarations = spec.states ?? {}, states = Object.create(null);
  const active = new Set(), done = new Set();
  for (const name of Object.keys(declarations)) states[name] = undefined;
  const readState = name => {
    if (!own(declarations, name)) fail('REFERENCE_NOT_FOUND');
    if (active.has(name)) fail('INVALID_DEFINITION');
    if (done.has(name)) return states[name];
    active.add(name); const declaration = declarations[name];
    states[name] = own(declaration, 'initial')
      ? validator(declaration).accept(evaluate(declaration.initial, { ports, states, readState }, { roots: ['ports', 'states'] })) : undefined;
    active.delete(name); done.add(name); return states[name];
  };
  order.forEach(readState);
  return states;
}
