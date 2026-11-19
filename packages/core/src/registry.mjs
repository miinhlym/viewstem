import { compileSchema, equal } from './schema.mjs';
import { compilePorts, sameContract } from './ports.mjs';
import { validateTemplate, pointerKeys, formatParts } from './expressions.mjs';
import { compileCel } from './cel/index.mjs';
import { prepareHeaders } from './http/headers.mjs';
import { fail, safeError } from './errors.mjs';
import { record, object, name, fields, json, copy, freeze } from './definition.mjs';
import { assertResourceSet, codeActionEntry, orderedResourceSets, replacementEntry } from './resource-set.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const kinds = new Set(['Datasource', 'Query', 'Variable', 'Action', 'Component', 'View', 'Type']);
const key = (kind, id) => JSON.stringify([kind, id]);
const invalid = () => fail('INVALID_DEFINITION');
const noRequirements = Object.freeze([]);
const map = (value = {}) => object(value);
const syntax = value => validateTemplate(value);
const optional = (value, field, fallback = {}) => own(value, field) ? value[field] : fallback;
const hasExpression = value => dynamic(value) || (Array.isArray(value) ? value.some(hasExpression) : record(value) && Object.values(value).some(hasExpression));
const literal = value => Array.isArray(value) ? value.map(literal) : record(value) ? Object.fromEntries(decodedEntries(value).map(([key, item]) => [key, literal(item)])) : value;
const pointerToken = name => name.replaceAll('~', '~0').replaceAll('/', '~1');
const documentRoot = { location: '' };
const resourceRoot = (kind, id) => ({ location: '/spec', resource: { kind, id } });
const nestedAt = (origin, ...keys) => ({
  ...origin, location: origin.location + keys.map(key => '/' + pointerToken(String(key))).join(''),
});

export function missingReference(kind, id, origin) {
  fail('REFERENCE_NOT_FOUND', {
    ...origin, message: typeof id === 'string' ? `Unknown ${kind} ${JSON.stringify(id)}.` : `Unknown ${kind} reference.`,
  });
}

export function actionDeclarations(spec) {
  const declarations = new Map();
  const walk = node => {
    if (!record(node)) return;
    for (const handler of Object.values(node.on ?? {})) {
      if (record(handler) && typeof handler.id === 'string') declarations.set(handler.id, handler);
    }
    for (const content of Object.values(node.slots ?? {})) if (Array.isArray(content)) content.forEach(walk);
  };
  walk(spec.render);
  return declarations;
}

function* contracts(spec, origin) {
  for (const field of ['ports', 'states', 'events']) {
    for (const [name, port] of Object.entries(spec[field] ?? {})) {
      yield [port, nestedAt(origin, field, name)];
    }
  }
  if (own(spec, 'output')) yield [spec.output, nestedAt(origin, 'output')];
}

// Handlers can observe the order of keys in the input record and its defaults.
function sameDefault(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
    || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left), rightKeys = Object.keys(right);
  return keys.length === rightKeys.length
    && keys.every((key, index) => key === rightKeys[index] && sameDefault(left[key], right[key]));
}

function paths(value, origin = documentRoot, output = []) {
  if (Array.isArray(value)) { value.forEach((item, index) => paths(item, nestedAt(origin, index), output)); return output; }
  if (!record(value)) return output;
  if (own(value, '@path')) {
    output.push({ parts: pointerKeys(value['@path']), origin: nestedAt(origin, '@path') });
    return output;
  }
  if (own(value, '@call')) {
    paths(value.args, nestedAt(origin, 'args'), output);
    if (value['@call'] === 'formatString' && typeof value.args?.value === 'string') {
      const templateAt = nestedAt(origin, 'args', 'value');
      for (const part of formatParts(value.args.value)) {
        if (own(part, 'path')) output.push({ parts: pointerKeys(part.path), origin: templateAt });
      }
    }
    return output;
  }
  for (const [name, item] of Object.entries(value)) paths(item, nestedAt(origin, name), output);
  return output;
}
const decodeKey = key => key.startsWith('@@') ? key.slice(1) : key;
const decodedEntries = value => Object.entries(value).map(([key, item]) => [decodeKey(key), item]);
const dynamic = value => record(value) && (own(value, '@path') || own(value, '@call'));
function expression(value, roots, declarations, functions, origin) {
  validateTemplate(value, new WeakSet(), functions);
  checkPathNames(value, roots, declarations, origin);
}
function checkPathNames(value, roots, declarations, origin) {
  const kinds = { states: 'State', queries: 'Query', ports: 'port', repeat: 'repeat alias', actions: 'Action connection', steps: 'step', sources: 'source' };
  for (const { parts: [root, name], origin: referenceAt } of paths(value, origin)) {
    if (!roots.includes(root)) missingReference('path root', root, referenceAt);
    const names = declarations?.[root];
    if (names && name !== undefined && !own(names, name)) missingReference(kinds[root] ?? root, name, referenceAt);
  }
}
function acyclic(graph) {
  const active = new Set(), done = new Set();
  const visit = id => { if (active.has(id)) invalid(); if (done.has(id)) return; active.add(id); for (const dependency of graph.get(id) ?? []) visit(dependency); active.delete(id); done.add(id); };
  for (const id of graph.keys()) visit(id);
}

function definitionKey(definition, codeKind) {
  fields(definition, ['kind', 'id', 'name', 'spec']);
  if (!kinds.has(definition.kind) || !own(definition, 'spec')) invalid();
  if (codeKind !== undefined && definition.kind !== codeKind) invalid();
  name(definition.id);
  object(definition.spec);
  if (own(definition, 'name') && typeof definition.name !== 'string') invalid();
  return key(definition.kind, definition.id);
}

export class Registry {
  #definitions = new Map();
  #implementations = new Map();
  #actionRequirements = new Map();
  #componentBindings = new Map();
  #sets = new Map();
  #code = new Set();
  #functions = Object.freeze([]);
  revision = 0;
  constructor(options = {}) {
    const functions = Array.isArray(options) ? [] : options?.functions ?? [];
    if (!Array.isArray(functions)) invalid();
    this.#functions = Object.freeze(functions.map(definition => {
      fields(definition, ['name', 'inputs', 'output', 'run']);
      if (!Array.isArray(definition.inputs) || typeof definition.run !== 'function') invalid();
      return Object.freeze({ name: definition.name, inputs: freeze(copy(definition.inputs)), output: freeze(copy(definition.output)), run: definition.run });
    }));
    if (this.#functions.length) { try { compileCel('true', { functions: this.#functions }); } catch (error) { throw safeError(error, 'INVALID_DEFINITION'); } }
    const resources = Array.isArray(options) ? options : options?.resources ?? [];
    const contracts = Array.isArray(options) ? [] : options?.componentContracts ?? [];
    if (!Array.isArray(resources) || !Array.isArray(contracts)) invalid();
    if (resources.length || contracts.length) this.#register(resources, contracts);
  }
  get functions() { return this.#functions; }
  get(kind, id) { return this.#definitions.get(key(kind, id)) ?? fail('REFERENCE_NOT_FOUND'); }
  list(filter) {
    const matches = definition => filter === undefined || (typeof filter === 'string' ? definition.kind === filter
      : typeof filter === 'function' ? filter(definition) : Object.entries(object(filter)).every(([field, value]) => definition[field] === value));
    return [...this.#definitions.values()].filter(matches).map(definition => copy(definition));
  }
  exportResource(kind, id) { return copy(this.get(kind, id)); }
  fork() {
    const next = new Registry();
    next.#definitions = new Map(this.#definitions);
    next.#implementations = new Map(this.#implementations);
    next.#actionRequirements = new Map(this.#actionRequirements);
    next.#componentBindings = new Map(this.#componentBindings);
    next.#sets = new Map(this.#sets);
    next.#code = new Set(this.#code);
    next.#functions = this.#functions;
    return next;
  }
  types() { return Object.fromEntries([...this.#definitions.values()].filter(value => value.kind === 'Type').map(value => [value.id, value.spec.schema])); }
  implementation(kind, id) { return this.#implementations.get(key(kind, id)); }
  actionRequirements(id) { return this.#actionRequirements.get(key('Action', id)) ?? noRequirements; }
  componentBinding(id) { return this.#componentBindings.get(key('Component', id)); }
  includeResourceSets(source, ids) {
    const candidate = this.fork();
    const seen = new Set();
    const add = id => {
      if (seen.has(id)) return;
      seen.add(id);
      const set = source.#sets.get(id) ?? fail('REFERENCE_NOT_FOUND', { message: `Unknown resource set ${id}.` });
      for (const dependency of set.dependencies) add(dependency);
      for (const address of set.keys) {
        const definition = source.#definitions.get(address);
        const current = candidate.#definitions.get(address);
        const implementation = source.#implementations.get(address);
        const binding = source.#componentBindings.get(address);
        const requirements = source.#actionRequirements.get(address) ?? noRequirements;
        if (current) {
          const priorBinding = candidate.#componentBindings.get(address);
          if (!equal(current, definition) || candidate.#code.has(address) !== source.#code.has(address)
            || candidate.#implementations.get(address) !== implementation || Boolean(priorBinding) !== Boolean(binding)
            || priorBinding?.connectorId !== binding?.connectorId || priorBinding?.implementation !== binding?.implementation
            || !equal(candidate.#actionRequirements.get(address) ?? noRequirements, requirements)) {
            fail('INVALID_DEFINITION', { resource: { kind: definition.kind, id: definition.id } });
          }
          continue;
        }
        candidate.#definitions.set(address, definition);
        if (source.#code.has(address)) candidate.#code.add(address);
        if (implementation) candidate.#implementations.set(address, implementation);
        if (requirements.length) candidate.#actionRequirements.set(address, requirements);
        if (binding) candidate.#componentBindings.set(address, binding);
      }
      candidate.#sets.set(id, set);
    };
    for (const id of ids) add(id);
    candidate.#validateAll();
    return candidate;
  }
  isCode(kind, id) { return this.#code.has(key(kind, id)); }
  schema(contract) {
    object(contract);
    if (own(contract, 'schema') === own(contract, 'typeRef')) invalid();
    return own(contract, 'schema') ? contract.schema : this.get('Type', name(contract.typeRef)).spec.schema;
  }
  validator(contract) { return compileSchema(this.schema(contract)); }
  registerResources(resources) { return this.#register(resources); }
  registerAction(entry, implementation) {
    const action = codeActionEntry(arguments.length === 1 ? entry : { definition: entry, implementation });
    const candidate = this.fork();
    candidate.#insertAction(action);
    return this.#publish(candidate);
  }
  registerComponentContract(contract) {
    return this.registerComponentContracts([contract]);
  }
  registerComponentContracts(contracts) {
    return this.#register([], contracts);
  }
  #register(resources, contracts = []) {
    if (!Array.isArray(resources)) invalid();
    if (!Array.isArray(contracts)) invalid();
    const definitions = [...Array.from(resources, definition => [freeze(copy(definition)), undefined]),
      ...Array.from(contracts, definition => [freeze(copy(definition)), 'Component'])];
    const candidate = this.fork();
    for (const [definition, codeKind] of definitions) {
      candidate.#insert(definition, codeKind);
    }
    return this.#publish(candidate);
  }
  #insert(definition, codeKind) {
    const address = definitionKey(definition, codeKind);
    if (this.#definitions.has(address)) invalid();
    this.#definitions.set(address, definition);
    if (codeKind !== undefined) this.#code.add(address);
    return address;
  }
  #insertAction(action) {
    const address = this.#insert(action.definition, 'Action');
    this.#implementations.set(address, action.implementation);
    this.#actionRequirements.set(address, action.requires);
    return address;
  }
  registerResourceSet(root) {
    const sets = orderedResourceSets(assertResourceSet(root));
    const candidate = this.fork();
    for (const set of sets) {
      const existing = candidate.#sets.get(set.id);
      if (existing?.declaration === set) continue;
      if (existing) fail('INVALID_DEFINITION', {
        message: `Resource set ${set.id} is already declared (${existing.declaration.version}, ${set.version}).`,
      });
      const keys = set.resources.map(definition => candidate.#insert(definition));
      for (const action of set.actions) keys.push(candidate.#insertAction(action));
      for (const binding of set.components) {
        const address = candidate.#insert(binding.contract, 'Component');
        candidate.#componentBindings.set(address, binding);
        keys.push(address);
      }
      candidate.#sets.set(set.id, { declaration: set, dependencies: set.dependencies.map(dependency => dependency.id), keys });
    }
    return candidate.#sets.size === this.#sets.size ? this : this.#publish(candidate);
  }
  #publish(candidate, definition, replacesComponent = false) {
    try { candidate.#validateAll(); } catch (error) { throw safeError(error, 'INVALID_DEFINITION'); }
    if (definition) this.#checkUpdatedContracts(candidate, definition, replacesComponent);
    this.commitCandidate(candidate);
    return this;
  }
  updateResource(resource) {
    const definition = freeze(copy(resource));
    const address = definitionKey(definition);
    this.get(definition.kind, definition.id);
    const candidate = this.fork();
    candidate.#definitions.set(address, definition);
    const binding = this.#componentBindings.get(address);
    if (binding) candidate.#componentBindings.set(address, Object.freeze({ ...binding, contract: definition }));
    return this.#publish(candidate, definition);
  }
  replaceResource(entry) {
    const { definition, codeKind, action, component } = replacementEntry(entry);
    const address = definitionKey(definition, codeKind);
    this.get(definition.kind, definition.id);
    if (this.#code.has(address) !== (codeKind !== undefined)) invalid();
    const candidate = this.fork();
    candidate.#definitions.set(address, definition);
    if (action) {
      candidate.#implementations.set(address, action.implementation);
      candidate.#actionRequirements.set(address, action.requires);
    }
    if (component) candidate.#componentBindings.set(address, component);
    return this.#publish(candidate, definition, component !== undefined);
  }
  #checkUpdatedContracts(candidate, definition, replacesComponent) {
    if (definition.kind === 'Action' && this.isCode('Action', definition.id)) {
      this.#checkActionContract(candidate, definition.id);
    } else if (definition.kind === 'Component' && !replacesComponent && this.componentBinding(definition.id)) {
      this.#checkComponentContract(candidate, definition.id);
    } else if (definition.kind === 'Type') {
      for (const resource of this.#definitions.values()) {
        if (!['Action', 'Component'].includes(resource.kind) || !this.isCode(resource.kind, resource.id)) continue;
        if (![...contracts(resource.spec, documentRoot)].some(([contract]) => contract.typeRef === definition.id)) continue;
        if (resource.kind === 'Action') this.#checkActionContract(candidate, resource.id);
        else if (this.componentBinding(resource.id)) this.#checkComponentContract(candidate, resource.id);
      }
    }
  }
  #checkComponentContract(candidate, id) {
    const before = this.get('Component', id).spec;
    const after = candidate.get('Component', id).spec;
    const sameSchema = (left, right) => equal(this.schema(left), candidate.schema(right));
    for (const field of ['ports', 'slots', 'events']) {
      const previous = before[field] ?? {};
      const next = after[field] ?? {};
      for (const name of new Set([...Object.keys(previous), ...Object.keys(next)])) {
        const left = previous[name], right = next[name];
        if (own(previous, name) && own(next, name)) {
          if (field === 'slots' && (left.required === true) === (right.required === true)) continue;
          if (field === 'events' && sameSchema(left, right)) continue;
          if (field === 'ports' && left.kind === right.kind
            && (left.required === true) === (right.required === true)
            && sameDefault(left.default, right.default)
            && (left.kind === 'Query' || sameSchema(left, right))) continue;
        }
        fail('TYPE_CONTRACT_MISMATCH', {
          message: 'Changing a code Component contract requires replacing its binding explicitly.',
          resource: { kind: 'Component', id },
          location: `/${field}/${pointerToken(name)}`,
        });
      }
    }
  }
  #checkActionContract(candidate, id) {
    const before = this.get('Action', id).spec;
    const after = candidate.get('Action', id).spec;
    const oldPorts = before.ports ?? {}, newPorts = after.ports ?? {};
    const oldNames = Object.keys(oldPorts), newNames = Object.keys(newPorts);
    const mismatch = (location, input) => fail('TYPE_CONTRACT_MISMATCH', {
      message: 'A registered code Action must keep its inputs, output and required host capabilities.',
      resource: { kind: 'Action', id },
      location,
      ...(input === undefined ? {} : { input }),
    });
    // Compare resolved schema structure without rewriting local refs or dropping keywords.
    const sameSchema = (left, right) => equal(this.schema(left), candidate.schema(right));
    for (const name of oldNames) {
      const left = oldPorts[name], right = newPorts[name];
      if (!own(newPorts, name) || left.kind !== right.kind
        || (left.required === true) !== (right.required === true)
        || !sameDefault(left.default, right.default)
        || (left.kind !== 'Query' && !sameSchema(left, right))) {
        mismatch('/ports/' + pointerToken(name), name);
      }
    }
    for (const name of newNames) {
      if (!own(oldPorts, name)) mismatch('/ports/' + pointerToken(name), name);
    }
    if (oldNames.some((name, index) => name !== newNames[index])) mismatch('/ports');
    if (Boolean(before.output) !== Boolean(after.output)
      || (before.output && !sameSchema(before.output, after.output))) mismatch('/output');
    if (!equal(this.actionRequirements(id), candidate.actionRequirements(id))) mismatch('/requires');
  }
  commitCandidate(candidate) {
    this.#definitions = candidate.#definitions;
    this.#code = candidate.#code;
    this.#implementations = candidate.#implementations;
    this.#actionRequirements = candidate.#actionRequirements;
    this.#componentBindings = candidate.#componentBindings;
    this.#sets = candidate.#sets;
    this.revision++;
  }
  #validateAll() {
    const context = { active: new Set(), done: new WeakMap() };
    for (const { kind, id, spec } of this.#definitions.values()) {
      this.#validate(kind, spec, context, this.isCode(kind, id), resourceRoot(kind, id));
    }
  }
  validateDefinition(kind, spec, resourceId) {
    if (!kinds.has(kind)) invalid(); json(spec);
    try {
      this.#validate(kind, spec, { active: new Set(), done: new WeakMap() }, false,
        resourceId === undefined ? documentRoot : resourceRoot(kind, resourceId));
    } catch (error) { throw safeError(error, 'INVALID_DEFINITION'); }
    return spec;
  }
  target(node, identity) {
    object(node);
    if (own(node, 'componentRef') === own(node, 'component')) invalid();
    if (own(node, 'component')) return { spec: object(node.component), identity };
    return { spec: this.get('Component', name(node.componentRef)).spec, identity: `Component:${node.componentRef}` };
  }
  #pair(container, kind, reference, inline, context, origin) {
    if (own(container, reference) === own(container, inline)) invalid();
    if (own(container, inline)) {
      this.#validate(kind, object(container[inline]), context, false, nestedAt(origin, inline)); return container[inline];
    }
    const id = name(container[reference]);
    const definition = this.#definitions.get(key(kind, id)) ?? missingReference(kind, id, nestedAt(origin, reference));
    this.#validate(kind, definition.spec, context, this.isCode(kind, id), resourceRoot(kind, id)); return definition.spec;
  }
  #expression(value, roots, declarations, origin) { return expression(value, roots, declarations, this.#functions, origin); }
  #contract(contract, allowed = []) { fields(contract, ['schema', 'typeRef', ...allowed]); this.validator(contract); }
  #inputs(inputs, target, roots, declarations, origin, resource) {
    object(inputs);
    if (dynamic(inputs)) this.#expression(inputs, roots, declarations, origin);
    else {
      validateTemplate(inputs, new WeakSet(), this.#functions);
      const authoredKeys = new Map(Object.keys(inputs).map(key => [decodeKey(key), key]));
      for (const [input, key] of authoredKeys) {
        checkPathNames(inputs[key], roots, declarations, { ...nestedAt(origin, key), input });
      }
      const supplied = Object.fromEntries(decodedEntries(inputs));
      for (const input of authoredKeys.keys()) if (!own(target.ports ?? {}, input)) {
        fail('INVALID_DEFINITION', {
          ...nestedAt(origin, authoredKeys.get(input)), input, ...(resource && !origin.resource && { resource }),
          message: `Unknown input ${JSON.stringify(input)}.`,
        });
      }
      for (const [input, port] of Object.entries(target.ports ?? {})) {
        if (port.required && !own(supplied, input)) {
          fail('INVALID_DEFINITION', {
            ...origin, input, ...(resource && !origin.resource && { resource }),
            message: `Required input ${JSON.stringify(input)} is missing.`,
          });
        }
        if (port.kind === 'Value' && own(supplied, input) && !hasExpression(supplied[input])) {
          const validator = this.validator(port);
          try { validator.accept(literal(supplied[input])); }
          catch {
            fail('INVALID_DEFINITION', {
              ...nestedAt(origin, authoredKeys.get(input)), input, ...(resource && !origin.resource && { resource }),
              message: 'The literal input does not match its port schema.',
            });
          }
        }
        if (['State', 'Query'].includes(port.kind) && own(supplied, input)) {
          const value = supplied[input]; fields(value, ['@path']); if (!own(value, '@path')) invalid();
          const parts = pointerKeys(value['@path']);
          if (parts.length !== 2) invalid();
          const source = declarations?.[parts[0]]?.[parts[1]];
          const valid = port.kind === 'State' ? ['states', 'ports'].includes(parts[0]) && source?.kind === 'State'
            : (parts[0] === 'queries' && source) || (parts[0] === 'ports' && source?.kind === 'Query');
          if (!valid) invalid();
          if (port.kind === 'State' && !sameContract(this.schema(port), this.schema(source))) fail('TYPE_CONTRACT_MISMATCH');
        }
      }
    }
  }
  #validate(kind, spec, context, code, origin) {
    object(spec);
    if (context.active.has(spec)) invalid();
    const validation = key(kind, code);
    if (context.done.get(spec)?.has(validation)) return;
    context.active.add(spec);
    const allowed = {
      Type: ['schema'], Variable: ['ports', 'expression'], Datasource: ['kind', 'baseUrl', 'headers', 'params', 'secrets', 'auth'],
      Query: ['ports', 'sources', 'transform'], Action: ['ports', 'steps', 'output'],
      Component: ['ports', 'states', 'queries', 'queryDefaults', 'reactions', 'slots', 'events', 'render'],
      View: ['ports', 'states', 'queries', 'queryDefaults', 'reactions', 'render'],
    };
    fields(spec, allowed[kind] ?? []);
    for (const [contract, contractAt] of contracts(spec, origin)) {
      if (record(contract) && !own(contract, 'schema') && typeof contract.typeRef === 'string' && !this.#definitions.has(key('Type', contract.typeRef))) {
        missingReference('Type', contract.typeRef, nestedAt(contractAt, 'typeRef'));
      }
    }
    compilePorts({ resourceKind: kind, ports: optional(spec, 'ports'), types: this.types() });
    if (kind === 'Type') { if (!own(spec, 'schema')) invalid(); compileSchema(spec.schema); }
    else if (kind === 'Variable') {
      if (typeof spec.expression !== 'string' || !spec.expression) invalid();
      const inputs = Object.fromEntries(Object.entries(optional(spec, 'ports')).map(([port, contract]) => [port, this.schema(contract)]));
      compileCel(spec.expression, { inputs, functions: this.#functions });
    } else if (kind === 'Datasource') this.#datasource(spec, origin);
    else if (kind === 'Query') this.#query(spec, context, origin);
    else if (kind === 'Action') this.#action(spec, context, code, origin);
    else this.#ui(kind, spec, context, code, origin);
    context.active.delete(spec);
    if (!context.done.has(spec)) context.done.set(spec, new Set());
    context.done.get(spec).add(validation);
  }
  #request(request, roots, allowWhole, declarations, origin) {
    object(request);
    if (allowWhole && dynamic(request)) { this.#expression(request, roots, declarations, origin); return; }
    fields(request, ['baseUrl', 'method', 'path', 'headers', 'params', 'body']);
    if (!own(request, 'method') || !own(request, 'path')) invalid();
    for (const [field, value] of Object.entries(request)) this.#expression(value, roots, declarations, nestedAt(origin, field));
    if (typeof request.method === 'string' && !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method)) invalid();
    if (!dynamic(request.method) && typeof request.method !== 'string') invalid();
    for (const field of ['path', 'baseUrl']) if (own(request, field) && !dynamic(request[field]) && typeof request[field] !== 'string') invalid();
    if (own(request, 'body') && ['GET', 'HEAD'].includes(request.method)) invalid();
    this.#httpMaps(request);
  }
  #httpMaps(spec) {
    for (const field of ['headers', 'params']) if (own(spec, field)) {
      object(spec[field]);
      if (field === 'headers' && !dynamic(spec[field])) prepareHeaders(Object.fromEntries(decodedEntries(spec[field]).map(([name]) => [name, null])));
    }
  }
  #datasource(spec, origin) {
    if (spec.kind !== 'Http' || !own(spec, 'baseUrl')) invalid();
    const declarations = { secrets: map(spec.secrets), auth: spec.auth ? { token: true } : {} };
    for (const field of ['baseUrl', 'headers', 'params']) if (own(spec, field)) {
      this.#expression(spec[field], ['ports', 'secrets', 'auth'], declarations, nestedAt(origin, field));
    }
    if (!dynamic(spec.baseUrl) && typeof spec.baseUrl !== 'string') invalid();
    this.#httpMaps(spec);
    for (const secret of Object.values(map(spec.secrets))) name(secret);
    if (own(spec, 'auth')) {
      fields(spec.auth, ['kind', 'request', 'token']);
      if (spec.auth.kind !== 'Login' || !own(spec.auth, 'token')) invalid();
      this.#request(spec.auth.request, ['ports', 'secrets'], true, declarations, nestedAt(origin, 'auth', 'request'));
      this.#expression(spec.auth.token, ['response'], undefined, nestedAt(origin, 'auth', 'token'));
    }
  }
  #query(spec, context, origin) {
    object(spec.sources); fields(spec.transform, ['input', 'steps']);
    if (!own(spec.transform, 'input')) invalid();
    const declarations = { ports: optional(spec, 'ports'), sources: spec.sources };
    for (const [sourceName, source] of Object.entries(spec.sources)) {
      object(source);
      const sourceAt = nestedAt(origin, 'sources', sourceName);
      const query = own(source, 'queryRef') || own(source, 'query');
      fields(source, query ? ['queryRef', 'query', 'inputs'] : ['datasourceRef', 'datasource', 'request']);
      const target = this.#pair(source, query ? 'Query' : 'Datasource', query ? 'queryRef' : 'datasourceRef', query ? 'query' : 'datasource', context, sourceAt);
      if (query) this.#inputs(optional(source, 'inputs'), target, ['ports'], { ports: declarations.ports }, nestedAt(sourceAt, 'inputs'));
      else this.#request(source.request, ['ports', 'secrets', 'auth'], false,
        { ports: declarations.ports, secrets: map(target.secrets), auth: target.auth ? { token: true } : {} }, nestedAt(sourceAt, 'request'));
    }
    this.#expression(spec.transform.input, ['ports', 'sources'], declarations, nestedAt(origin, 'transform', 'input'));
    const steps = own(spec.transform, 'steps') ? spec.transform.steps : [];
    if (!Array.isArray(steps)) invalid();
    for (const [index, step] of steps.entries()) {
      object(step);
      const stepAt = nestedAt(origin, 'transform', 'steps', index);
      if (step.kind === 'Concat') {
        fields(step, ['kind', 'with']); if (!Array.isArray(step.with)) invalid();
        this.#expression(step.with, ['ports', 'sources'], declarations, nestedAt(stepAt, 'with'));
      } else if (step.kind === 'Join') {
        fields(step, ['kind', 'right', 'mode', 'on']);
        if (!own(step, 'right') || !['left', 'right', 'inner'].includes(own(step, 'mode') ? step.mode : 'left') || !Array.isArray(step.on) || !step.on.length) invalid();
        for (const pair of step.on) { fields(pair, ['left', 'right']); if (typeof pair.left !== 'string' || typeof pair.right !== 'string') invalid(); }
        this.#expression(step.right, ['ports', 'sources'], declarations, nestedAt(stepAt, 'right'));
      } else invalid();
    }
  }
  #action(spec, context, code, origin) {
    if (code ? own(spec, 'steps') : !Array.isArray(spec.steps)) invalid();
    if (own(spec, 'output')) {
      this.#contract(spec.output, ['value']);
      if (own(spec.output, 'value') === code) invalid();
    }
    const ports = optional(spec, 'ports');
    const target = (value, kind, targetAt) => {
      fields(value, ['@path']); if (!own(value, '@path')) invalid();
      const parts = pointerKeys(value['@path']);
      if (parts.length !== 2 || parts[0] !== 'ports') invalid();
      if (!own(ports, parts[1])) missingReference('port', parts[1], nestedAt(targetAt, '@path'));
      if (ports[parts[1]].kind !== kind) invalid();
    };
    const walk = (steps, stepsAt, inherited = {}) => {
      if (!Array.isArray(steps)) invalid();
      const ids = new Set(), completed = { ...inherited };
      for (const [index, step] of steps.entries()) {
        object(step);
        const stepAt = nestedAt(stepsAt, index);
        if (own(step, 'id')) { name(step.id); if (ids.has(step.id)) invalid(); ids.add(step.id); }
        const declarations = { ports, steps: completed };
        if (['Action', 'Query', 'Variable'].includes(step.kind)) {
          const reference = `${step.kind.toLowerCase()}Ref`;
          fields(step, ['id', 'kind', reference, 'spec', 'inputs']);
          const child = this.#pair(step, step.kind, reference, 'spec', context, stepAt);
          this.#inputs(optional(step, 'inputs'), child, ['ports', 'steps'], declarations, nestedAt(stepAt, 'inputs'));
          for (const [input, value] of decodedEntries(optional(step, 'inputs'))) {
            const kind = child.ports?.[input]?.kind;
            if (kind === 'State' || kind === 'Query') target(value, kind, nestedAt(stepAt, 'inputs', input));
          }
          if (own(step, 'id') && (step.kind !== 'Action' || own(child, 'output'))) completed[step.id] = true;
        } else if (step.kind === 'If') {
          fields(step, ['id', 'kind', 'condition', 'then', 'else']); if (!own(step, 'condition')) invalid();
          this.#expression(step.condition, ['ports', 'steps'], declarations, nestedAt(stepAt, 'condition'));
          if (!hasExpression(step.condition) && typeof step.condition !== 'boolean') invalid();
          walk(step.then, nestedAt(stepAt, 'then'), completed);
          if (own(step, 'else')) walk(step.else, nestedAt(stepAt, 'else'), completed);
        } else if (step.kind === 'Assert') {
          fields(step, ['id', 'kind', 'condition', 'message']); if (!own(step, 'condition')) invalid();
          this.#expression(step.condition, ['ports', 'steps'], declarations, nestedAt(stepAt, 'condition'));
          if (!hasExpression(step.condition) && typeof step.condition !== 'boolean') invalid();
          if (own(step, 'message')) this.#expression(step.message, ['ports', 'steps'], declarations, nestedAt(stepAt, 'message'));
        } else if (step.kind === 'SetState') {
          fields(step, ['id', 'kind', 'target', 'value']); if (!own(step, 'value')) invalid();
          target(step.target, 'State', nestedAt(stepAt, 'target'));
          this.#expression(step.value, ['ports', 'steps'], declarations, nestedAt(stepAt, 'value'));
        } else if (step.kind === 'RefreshQuery') {
          fields(step, ['id', 'kind', 'target']); target(step.target, 'Query', nestedAt(stepAt, 'target'));
        }
        else invalid();
      }
      return completed;
    };
    const completed = code ? {} : walk(spec.steps, nestedAt(origin, 'steps'));
    if (spec.output && !code) {
      this.#expression(spec.output.value, ['ports', 'steps'], { ports, steps: completed }, nestedAt(origin, 'output', 'value'));
      if (!hasExpression(spec.output.value)) this.validator(spec.output).accept(literal(spec.output.value));
    }
  }
  #ui(kind, spec, context, code, origin) {
    const ports = optional(spec, 'ports'), states = map(spec.states), queries = map(spec.queries), events = map(spec.events), slots = map(spec.slots);
    if (kind === 'View' && (own(spec, 'events') || own(spec, 'slots'))) invalid();
    const declarations = { ports, states, queries };
    const roots = ['ports', 'states', 'queries', 'repeat', 'actions'];
    const eventRoots = [...roots, 'event'];
    const dependencies = new Map();
    for (const [state, declaration] of Object.entries(states)) {
      const declarationAt = nestedAt(origin, 'states', state);
      object(declaration);
      if (declaration.kind === 'State') {
        this.#contract(declaration, ['kind', 'initial']);
        if (own(declaration, 'initial')) {
          this.#expression(declaration.initial, ['ports', 'states'], { ports, states }, nestedAt(declarationAt, 'initial'));
          if (!hasExpression(declaration.initial)) this.validator(declaration).accept(literal(declaration.initial));
        }
      } else if (declaration.kind === 'Derived') {
        this.#contract(declaration, ['kind', 'variableRef', 'variable', 'inputs']);
        const child = this.#pair(declaration, 'Variable', 'variableRef', 'variable', context, declarationAt);
        this.#inputs(optional(declaration, 'inputs'), child, ['ports', 'states'], { ports, states }, nestedAt(declarationAt, 'inputs'));
      } else invalid();
      dependencies.set(`states:${state}`, paths(declaration.kind === 'Derived' ? declaration.inputs : declaration.initial).map(({ parts }) => parts)
        .filter(parts => parts[0] === 'states' || (parts[0] === 'ports' && ports[parts[1]]?.kind === 'State')).map(parts => `${parts[0]}:${parts[1]}`));
    }
    for (const contract of Object.values(events)) this.#contract(contract);
    for (const slot of Object.values(slots)) { fields(slot, ['required']); if (own(slot, 'required') && typeof slot.required !== 'boolean') invalid(); }
    const settings = value => {
      object(value);
      if (own(value, 'refresh') && typeof value.refresh !== 'boolean') invalid();
      if (own(value, 'intervalMs') && (!Number.isSafeInteger(value.intervalMs) || value.intervalMs <= 0)) invalid();
    };
    if (own(spec, 'queryDefaults')) { fields(spec.queryDefaults, ['refresh', 'intervalMs']); settings(spec.queryDefaults); }
    for (const [queryName, use] of Object.entries(queries)) {
      const useAt = nestedAt(origin, 'queries', queryName);
      fields(use, ['queryRef', 'query', 'inputs', 'refresh', 'intervalMs', 'executeWhen', 'autoRefreshWhen']); settings(use);
      const child = this.#pair(use, 'Query', 'queryRef', 'query', context, useAt);
      this.#inputs(optional(use, 'inputs'), child, ['ports', 'states', 'queries'], declarations, nestedAt(useAt, 'inputs'));
      for (const gate of ['executeWhen', 'autoRefreshWhen']) if (own(use, gate)) {
        this.#expression(use[gate], ['ports', 'states', 'queries'], declarations, nestedAt(useAt, gate));
        if (!hasExpression(use[gate]) && typeof use[gate] !== 'boolean') invalid();
      }
    }
    const stateTarget = (value, writable, targetAt) => {
      fields(value, ['@path']); if (!own(value, '@path')) invalid(); const parts = pointerKeys(value['@path']);
      if (parts.length !== 2 || !['states', 'ports'].includes(parts[0])) invalid();
      const declarations = parts[0] === 'states' ? states : ports;
      if (!own(declarations, parts[1])) missingReference(parts[0] === 'states' ? 'State' : 'port', parts[1], nestedAt(targetAt, '@path'));
      const contract = declarations[parts[1]];
      if (!contract || (writable ? contract.kind !== 'State' : !['State', 'Derived'].includes(contract.kind))) invalid();
      return { address: `${parts[0]}:${parts[1]}`, contract };
    };
    const reactions = optional(spec, 'reactions', []); if (!Array.isArray(reactions)) invalid();
    const targets = new Set();
    for (const [index, reaction] of reactions.entries()) {
      const reactionAt = nestedAt(origin, 'reactions', index);
      fields(reaction, ['watch', 'target', 'value']);
      if (!Array.isArray(reaction.watch) || !reaction.watch.length || !own(reaction, 'value')) invalid();
      const target = stateTarget(reaction.target, true, nestedAt(reactionAt, 'target'));
      if (targets.has(target.address)) invalid(); targets.add(target.address);
      this.validator(target.contract).accept(reaction.value);
      const watched = reaction.watch.map((value, index) => stateTarget(value, false, nestedAt(reactionAt, 'watch', index)).address);
      dependencies.set(target.address, [...dependencies.get(target.address) ?? [], ...watched]);
    }
    acyclic(dependencies);
    if (code) { if (own(spec, 'render') || own(spec, 'states') || own(spec, 'queries') || own(spec, 'reactions') || own(spec, 'queryDefaults')) invalid(); return; }
    if (!own(spec, 'render') || Array.isArray(spec.render) || own(object(spec.render), 'repeat')) invalid();
    declarations.actions = Object.fromEntries(actionDeclarations(spec));
    const ids = new Set();
    const node = (value, nodeAt, aliases = []) => {
      fields(value, ['id', 'componentRef', 'component', 'inputs', 'slots', 'on', 'when', 'repeat']);
      name(value.id); if (ids.has(value.id)) invalid(); ids.add(value.id);
      const child = this.#pair(value, 'Component', 'componentRef', 'component', context, nodeAt);
      let nested = aliases;
      let local = { ...declarations, repeat: Object.fromEntries(aliases.map(alias => [alias, true])) };
      if (own(value, 'repeat')) {
        fields(value.repeat, ['items', 'as', 'key']); name(value.repeat.as);
        if (!own(value.repeat, 'items') || !own(value.repeat, 'key') || aliases.includes(value.repeat.as)) invalid();
        this.#expression(value.repeat.items, roots, local, nestedAt(nodeAt, 'repeat', 'items'));
        nested = [...aliases, value.repeat.as];
        local = { ...local, repeat: { ...local.repeat, [value.repeat.as]: true } };
        this.#expression(value.repeat.key, roots, local, nestedAt(nodeAt, 'repeat', 'key'));
      }
      if (own(value, 'when')) {
        this.#expression(value.when, roots, local, nestedAt(nodeAt, 'when'));
        if (!hasExpression(value.when) && typeof value.when !== 'boolean') invalid();
      }
      const resource = own(value, 'componentRef') ? { kind: 'Component', id: value.componentRef } : undefined;
      this.#inputs(optional(value, 'inputs'), child, roots, local, nestedAt(nodeAt, 'inputs'), resource);
      const contents = map(value.slots);
      for (const [slot, contract] of Object.entries(child.slots ?? {})) if (contract.required && !own(contents, slot)) invalid();
      for (const [slot, content] of Object.entries(contents)) {
        const slotAt = nestedAt(nodeAt, 'slots', slot);
        if (!own(child.slots ?? {}, slot)) {
          fail('INVALID_DEFINITION', { ...slotAt, message: `Unknown slot ${JSON.stringify(slot)}.` });
        }
        if (Array.isArray(content)) content.forEach((item, index) => node(item, nestedAt(slotAt, index), nested));
        else {
          fields(content, ['@path']); if (!own(content, '@path')) invalid(); const parts = pointerKeys(content['@path']);
          if (parts.length !== 2 || parts[0] !== 'slots') invalid();
          if (!own(slots, parts[1])) missingReference('slot', parts[1], nestedAt(slotAt, '@path'));
        }
      }
      for (const [event, handler] of Object.entries(map(value.on))) {
        const handlerAt = nestedAt(nodeAt, 'on', event);
        if (!own(child.events ?? {}, event)) {
          const component = resource ? `Component ${JSON.stringify(resource.id)}` : 'Inline Component';
          fail('INVALID_DEFINITION', { ...handlerAt, message: `Unknown event ${JSON.stringify(event)} on ${component}.` });
        }
        object(handler);
        const choices = ['actionRef', 'action', 'emit'].filter(field => own(handler, field)); if (choices.length !== 1) invalid();
        if (own(handler, 'emit')) {
          fields(handler, ['emit', 'payload']);
          const forwarded = name(handler.emit);
          if (!own(events, forwarded)) missingReference('event', forwarded, nestedAt(handlerAt, 'emit'));
          if (!own(handler, 'payload')) invalid();
          this.#expression(handler.payload, eventRoots, local, nestedAt(handlerAt, 'payload'));
        } else {
          fields(handler, ['id', 'actionRef', 'action', 'inputs']); if (own(handler, 'id')) name(handler.id);
          const action = this.#pair(handler, 'Action', 'actionRef', 'action', context, handlerAt);
          this.#inputs(optional(handler, 'inputs'), action, eventRoots, local, nestedAt(handlerAt, 'inputs'));
        }
      }
    };
    node(spec.render, nestedAt(origin, 'render'));
  }
  references(kind, spec, resourceId) {
    const output = [];
    const pair = (value, reference, kind, inline, origin) => {
      if (!record(value)) return;
      if (own(value, reference)) output.push({ kind, id: value[reference], ...nestedAt(origin, reference) });
      if (own(value, inline)) walk(kind, value[inline], nestedAt(origin, inline));
    };
    const walk = (resourceKind, value, origin) => {
      if (!record(value)) return;
      for (const [contract, contractAt] of contracts(value, origin)) {
        if (!record(contract)) continue;
        if (own(contract, 'typeRef')) output.push({ kind: 'Type', id: contract.typeRef, ...nestedAt(contractAt, 'typeRef') });
        if (contract.kind === 'Derived') pair(contract, 'variableRef', 'Variable', 'variable', contractAt);
      }
      for (const [name, use] of Object.entries(value.queries ?? {})) {
        pair(use, 'queryRef', 'Query', 'query', nestedAt(origin, 'queries', name));
      }
      const node = (item, nodeAt) => {
        if (!record(item)) return;
        pair(item, 'componentRef', 'Component', 'component', nodeAt);
        for (const [slot, content] of Object.entries(item.slots ?? {})) {
          if (Array.isArray(content)) content.forEach((child, index) => node(child, nestedAt(nodeAt, 'slots', slot, index)));
        }
        for (const [event, handler] of Object.entries(item.on ?? {})) {
          pair(handler, 'actionRef', 'Action', 'action', nestedAt(nodeAt, 'on', event));
        }
      };
      node(value.render, nestedAt(origin, 'render'));
      if (resourceKind === 'Query') for (const [name, source] of Object.entries(value.sources ?? {})) {
        const sourceAt = nestedAt(origin, 'sources', name);
        pair(source, 'queryRef', 'Query', 'query', sourceAt);
        pair(source, 'datasourceRef', 'Datasource', 'datasource', sourceAt);
      }
      const steps = (list, stepsAt) => {
        if (!Array.isArray(list)) return;
        for (const [index, step] of list.entries()) {
          if (!record(step)) continue;
          const stepAt = nestedAt(stepsAt, index);
          if (['Query', 'Action', 'Variable'].includes(step.kind)) pair(step, `${step.kind.toLowerCase()}Ref`, step.kind, 'spec', stepAt);
          steps(step.then, nestedAt(stepAt, 'then'));
          steps(step.else, nestedAt(stepAt, 'else'));
        }
      };
      if (resourceKind === 'Action') steps(value.steps, nestedAt(origin, 'steps'));
    };
    walk(kind, spec, resourceId === undefined ? documentRoot : resourceRoot(kind, resourceId));
    return output;
  }
}
export const createRegistry = options => new Registry(options);
