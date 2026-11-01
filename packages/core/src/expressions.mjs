import { isRecord, expressionKind, dataEntries, pointerKeys, validateTemplate, formatParts } from './expression-syntax.mjs';
import { compileSchema } from './schema.mjs';
import { protect, trustedCopies } from './immutable.mjs';
import { safeError, fail } from './errors.mjs';
export { isRecord, expressionKind, dataEntries, pointerKeys, validateTemplate, formatParts } from './expression-syntax.mjs';
const own = (value, key) => Object.hasOwn(value, key);
export const valueRoots = ['ports', 'states', 'queries', 'repeat', 'actions', 'event', 'steps', 'sources'];
export function pathsIn(template, functions = []) {
  validateTemplate(template, new WeakSet(), functions);
  const paths = [];
  const walk = value => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!isRecord(value)) return;
    const kind = expressionKind(value, functions);
    if (kind === 'path') paths.push(pointerKeys(value['@path']));
    else if (kind === 'call') {
      walk(value.args);
      if (value['@call'] === 'formatString' && typeof value.args.value === 'string')
        for (const part of formatParts(value.args.value)) if (own(part, 'path')) paths.push(pointerKeys(part.path));
    } else for (const [, item] of dataEntries(value)) walk(item);
  };
  walk(template);
  return paths;
}
export function validateExpression(template, roots = valueRoots, functions = []) {
  for (const keys of pathsIn(template, functions)) if (!roots.includes(keys[0])) fail('REFERENCE_NOT_FOUND');
}
export function readSnapshot(snapshot) {
  if (snapshot.status === 'ready') return snapshot.value;
  if (snapshot.status === 'error') throw snapshot.error;
  fail(snapshot.status === 'pending' ? 'VALUE_PENDING' : 'INPUT_NOT_READY');
}
export function evaluate(template, context = {}, { roots = valueRoots, target = false } = {}) {
  const functions=context.functions??[];
  validateExpression(template, roots, functions);
  const read = path => {
    const keys = pointerKeys(path);
    if (!roots.includes(keys[0])) fail('REFERENCE_NOT_FOUND');
    let value, offset;
    if (context.resolve) {
      const resolved = context.resolve(keys, target);
      value = resolved.value; offset = resolved.offset;
    } else {
      if (!own(context, keys[0])) fail('REFERENCE_NOT_FOUND');
      value = context[keys[0]]; offset = 1;
    }
    for (let index = offset; index < keys.length; index++) {
      const key = keys[index];
      if (value === undefined) fail('INPUT_NOT_READY');
      if (Array.isArray(value)) {
        if (!/^(0|[1-9]\d*)$/.test(key) || !Number.isSafeInteger(Number(key)) || Number(key) >= value.length || !own(value, key)) fail('REFERENCE_NOT_FOUND');
      } else if (!isRecord(value)) fail('TYPE_MISMATCH');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) fail(index === 1 && keys[0] !== 'event' ? 'REFERENCE_NOT_FOUND' : 'INPUT_NOT_READY');
      if (!own(descriptor, 'value')) fail('TYPE_MISMATCH');
      value = descriptor.value;
    }
    if (value === undefined) fail('INPUT_NOT_READY');
    return value;
  };
  const walk = value => {
    if (Array.isArray(value)) {
      return Array.from({ length: value.length }, (_, index) => {
        if (!own(value, index) || value[index] === undefined) fail('TYPE_MISMATCH');
        return walk(value[index]);
      });
    }
    if (!isRecord(value)) return value;
    const kind = expressionKind(value,functions);
    if (kind === 'path') return read(value['@path']);
    if (kind === 'call') {
      const args = walk(value.args);
      if (value['@call'] === 'concat') {
        if (!args.every(item => typeof item === 'string')) fail('TYPE_MISMATCH');
        return args.join('');
      }
      if(value['@call']!=='formatString') {
        return invokeFunction(value['@call'],args,functions);
      }
      let result = '';
      for (const part of formatParts(args.value)) {
        if (own(part, 'text')) result += part.text;
        else {
          const item = read(part.path);
          if (item !== null && !['string','number','boolean'].includes(typeof item)) fail('TYPE_MISMATCH');
          if (typeof item === 'number' && !Number.isFinite(item)) fail('TYPE_MISMATCH');
          result += String(item);
        }
      }
      return result;
    }
    const result = Object.create(null);
    for (const [key,item] of dataEntries(value)) if (item !== undefined) result[key] = walk(item);
    return result;
  };
  return walk(template);
}
export function evaluateSnapshot(template, context, options) {
  try { return Object.freeze({status:'ready',value:evaluate(template, context, options)}); }
  catch (caught) {
    const error = safeError(caught);
    return Object.freeze(error.code === 'INPUT_NOT_READY' ? {status:'missing'} : error.code === 'VALUE_PENDING' ? {status:'pending'} : {status:'error',error});
  }
}
export function validateInitials(spec, functions = []) {
  const graph = new Map();
  for (const [name,declaration] of Object.entries(spec.states ?? {})) {
    const expressions = declaration.kind === 'Derived' ? declaration.inputs ?? {} : declaration.initial;
    validateExpression(expressions, ['ports','states','queries'], functions);
    const dependencies = pathsIn(expressions, functions).filter(keys => keys[0] === 'states').map(keys => keys[1]);
    for (const dependency of dependencies) if (!own(spec.states, dependency)) fail('REFERENCE_NOT_FOUND');
    graph.set(name,dependencies);
  }
  const active=new Set(),done=new Set(),order=[];
  const visit=name=>{if(active.has(name))fail('INVALID_DEFINITION');if(done.has(name))return;active.add(name);graph.get(name).forEach(visit);active.delete(name);done.add(name);order.push(name);};
  graph.forEach((_,name)=>visit(name));return order;
}

export function invokeFunction(name,args,functions=[]) {
  const fn=functions.find(fn=>fn.name===name);if(!fn)fail('INVALID_EXPRESSION');
  try {
    const schema={type:'array',...(fn.inputs.length?{prefixItems:fn.inputs}:{}),items:false,minItems:fn.inputs.length,maxItems:fn.inputs.length};
    const accepted=compileSchema(schema).accept(args,trustedCopies(args));
    return protect(compileSchema(fn.output).accept(fn.run(...protect(accepted))));
  } catch(caught) { throw safeError(caught,'TYPE_MISMATCH'); }
}
