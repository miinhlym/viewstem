import { compileSchema } from './schema.mjs';
import { compilePorts, sameContract } from './ports.mjs';
import { validateTemplate, pointerKeys } from './expressions.mjs';
import { compileCel } from './cel/index.mjs';
import { prepareHeaders } from './http/headers.mjs';
import { fail, safeError } from './errors.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const kinds = new Set(['Datasource', 'Query', 'Variable', 'Action', 'Component', 'View', 'Type']);
const key = (kind, id) => JSON.stringify([kind, id]);
const invalid = () => fail('INVALID_DEFINITION');
const record = value => value !== null && typeof value === 'object' && [null, Object.prototype].includes(Object.getPrototypeOf(value));
const object = value => { if (!record(value)) invalid(); return value; };
const name = value => { if (typeof value !== 'string' || !value) invalid(); return value; };
const fields = (value, allowed) => { object(value); if (Object.keys(value).some(item => !allowed.includes(item))) invalid(); };
const map = (value = {}) => object(value);
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
// Definitions are JSON declarations. Reject accessors, functions, native values,
// sparse arrays and cycles before copying or inspecting expression syntax.
function json(value, active = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!Array.isArray(value) && !record(value)) invalid();
  if (active.has(value)) invalid();
  active.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [property, descriptor] of Object.entries(descriptors)) {
    if (Array.isArray(value) && property === 'length') continue;
    if (!own(descriptor, 'value') || !descriptor.enumerable) invalid();
    json(descriptor.value, active);
  }
  if (Array.isArray(value)) for (let index = 0; index < value.length; index++) if (!own(value, index)) invalid();
  if (Object.getOwnPropertySymbols(value).length) invalid();
  active.delete(value);
}
const copy = value => { json(value); return structuredClone(value); };
const syntax = value => validateTemplate(value);
const optional = (value, field, fallback = {}) => own(value, field) ? value[field] : fallback;
const hasExpression = value => dynamic(value) || (Array.isArray(value) ? value.some(hasExpression) : record(value) && Object.values(value).some(hasExpression));
const literal = value => Array.isArray(value) ? value.map(literal) : record(value) ? Object.fromEntries(decodedEntries(value).map(([key, item]) => [key, literal(item)])) : value;
function paths(value, output = []) {
  if (Array.isArray(value)) { value.forEach(item => paths(item, output)); return output; }
  if (!record(value)) return output;
  if (own(value, '@path')) { output.push(pointerKeys(value['@path'])); return output; }
  if (own(value, '@call')) {
    paths(value.args, output);
    if (value['@call'] === 'formatString' && typeof value.args?.value === 'string') {
      const template = value.args.value;
      for (let index = 0; index < template.length;) {
        if (template.startsWith('$$', index)) { index += 2; continue; }
        if (template.startsWith('${', index)) {
          const end = template.indexOf('}', index + 2);
          if (end < 0) fail('INVALID_EXPRESSION');
          output.push(pointerKeys(template.slice(index + 2, end))); index = end + 1;
        } else index++;
      }
    }
    return output;
  }
  for (const item of Object.values(value)) paths(item, output);
  return output;
}
const decodedEntries = value => Object.entries(value).map(([key, item]) => [key.startsWith('@@') ? key.slice(1) : key, item]);
const dynamic = value => record(value) && (own(value, '@path') || own(value, '@call'));
function expression(value, roots, declarations, functions = []) {
  validateTemplate(value,new WeakSet(),functions);
  for (const parts of paths(value)) {
    if (!roots.includes(parts[0])) fail('REFERENCE_NOT_FOUND');
    const names = declarations?.[parts[0]];
    if (names && parts.length >= 2 && !own(names, parts[1])) fail('REFERENCE_NOT_FOUND');
  }
}
function acyclic(graph) {
  const active = new Set(), done = new Set();
  const visit = id => { if (active.has(id)) invalid(); if (done.has(id)) return; active.add(id); for (const dependency of graph.get(id) ?? []) visit(dependency); active.delete(id); done.add(id); };
  for (const id of graph.keys()) visit(id);
}

export class Registry {
  #definitions = new Map();
  #implementations = new Map();
  #code = new Set();
  #functions = Object.freeze([]);
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
    if (!Array.isArray(resources)) invalid();
    if (resources.length) this.registerResources(resources);
  }
  get functions() { return this.#functions; }
  get(kind, id) { return this.#definitions.get(key(kind, id)) ?? fail('REFERENCE_NOT_FOUND'); }
  list(filter) {
    const matches = definition => filter === undefined || (typeof filter === 'string' ? definition.kind === filter
      : typeof filter === 'function' ? filter(definition) : Object.entries(object(filter)).every(([field, value]) => definition[field] === value));
    return [...this.#definitions.values()].filter(matches).map(definition => copy(definition));
  }
  export(kind, id) { return copy(this.get(kind, id)); }
  fork() { const next = new Registry(); next.#definitions = new Map(this.#definitions); next.#implementations = new Map(this.#implementations); next.#code = new Set(this.#code); next.#functions = this.#functions; return next; }
  types() { return Object.fromEntries([...this.#definitions.values()].filter(value => value.kind === 'Type').map(value => [value.id, value.spec.schema])); }
  implementation(kind, id) { return this.#implementations.get(key(kind, id)); }
  isCode(kind, id) { return this.#code.has(key(kind, id)); }
  schema(contract) {
    object(contract);
    if (own(contract, 'schema') === own(contract, 'typeRef')) invalid();
    return own(contract, 'schema') ? contract.schema : this.get('Type', name(contract.typeRef)).spec.schema;
  }
  validator(contract) { return compileSchema(this.schema(contract)); }
  registerResources(resources) { return this.#register(resources); }
  registerAction(definition, implementation) {
    if (definition?.kind !== 'Action' || typeof implementation !== 'function') invalid();
    return this.#register([definition], ['Action', definition.id, implementation]);
  }
  registerComponent(contract) {
    if (contract?.kind !== 'Component') invalid();
    return this.#register([contract], ['Component', contract.id]);
  }
  #register(resources, code) {
    if (!Array.isArray(resources)) invalid();
    const candidate = this.fork();
    for (const resource of resources) {
      const definition = copy(resource);
      fields(definition, ['kind', 'id', 'name', 'spec']);
      if (!kinds.has(definition.kind) || !own(definition, 'spec')) invalid();
      name(definition.id); object(definition.spec);
      if (own(definition, 'name') && typeof definition.name !== 'string') invalid();
      const address = key(definition.kind, definition.id);
      if (candidate.#definitions.has(address)) invalid();
      candidate.#definitions.set(address, freeze(definition));
    }
    if (code) { const address = key(code[0], code[1]); candidate.#code.add(address); if (code[2]) candidate.#implementations.set(address, code[2]); }
    try { candidate.#validateAll(); } catch (error) { throw safeError(error, 'INVALID_DEFINITION'); }
    this.#definitions = candidate.#definitions; this.#code = candidate.#code; this.#implementations = candidate.#implementations;
    return this;
  }
  updateResource(resource) {
    const definition = copy(resource);
    fields(definition, ['kind', 'id', 'name', 'spec']);
    if (!kinds.has(definition.kind) || !own(definition, 'spec')) invalid();
    name(definition.id); object(definition.spec);
    if (own(definition, 'name') && typeof definition.name !== 'string') invalid();
    this.get(definition.kind, definition.id);
    const candidate = this.fork();
    candidate.#definitions.set(key(definition.kind, definition.id), freeze(definition));
    try { candidate.#validateAll(); } catch (error) { throw safeError(error, 'INVALID_DEFINITION'); }
    this.#definitions = candidate.#definitions;
    return this;
  }
  #validateAll() {
    const context = { active: new Set(), done: new Set() };
    for (const definition of this.#definitions.values()) this.#validate(definition.kind, definition.spec, context, this.isCode(definition.kind, definition.id));
  }
  validateDefinition(kind, spec) {
    if (!kinds.has(kind)) invalid(); json(spec);
    try { this.#validate(kind, spec, { active: new Set(), done: new Set() }, false); } catch (error) { throw safeError(error, 'INVALID_DEFINITION'); }
    return spec;
  }
  target(node, identity) {
    object(node);
    if (own(node, 'componentRef') === own(node, 'component')) invalid();
    if (own(node, 'component')) return { spec: object(node.component), identity };
    return { spec: this.get('Component', name(node.componentRef)).spec, identity: `Component:${node.componentRef}` };
  }
  #pair(container, kind, reference, inline, context) {
    if (own(container, reference) === own(container, inline)) invalid();
    if (own(container, inline)) {
      this.#validate(kind, object(container[inline]), context, false); return container[inline];
    }
    const id = name(container[reference]), definition = this.get(kind, id);
    this.#validate(kind, definition.spec, context, this.isCode(kind, id)); return definition.spec;
  }
  #expression(value,roots,declarations){return expression(value,roots,declarations,this.#functions);}
  #contract(contract, allowed = []) { fields(contract, ['schema', 'typeRef', ...allowed]); this.validator(contract); }
  #inputs(inputs, target, roots, declarations, checkNames = true) {
    object(inputs); this.#expression(inputs, roots, checkNames ? declarations : undefined);
    if (!dynamic(inputs)) {
      const supplied = Object.fromEntries(decodedEntries(inputs));
      for (const input of Object.keys(supplied)) if (!own(target.ports ?? {}, input)) invalid();
      for (const [input, port] of Object.entries(target.ports ?? {})) {
        if (port.required && !own(supplied, input)) invalid();
        if (port.kind === 'Value' && own(supplied, input) && !hasExpression(supplied[input])) this.validator(port).accept(literal(supplied[input]));
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
  #validate(kind, spec, context, code) {
    object(spec);
    if (context.active.has(spec)) invalid();
    if (context.done.has(spec)) return;
    context.active.add(spec);
    const allowed = {
      Type: ['schema'], Variable: ['ports', 'expression'], Datasource: ['kind', 'baseUrl', 'headers', 'params', 'secrets', 'auth'],
      Query: ['ports', 'sources', 'transform'], Action: ['ports', 'steps', 'output'],
      Component: ['ports', 'states', 'queries', 'queryDefaults', 'reactions', 'slots', 'events', 'render'],
      View: ['ports', 'states', 'queries', 'queryDefaults', 'reactions', 'render'],
    };
    fields(spec, allowed[kind] ?? []);
    compilePorts({ resourceKind: kind, ports: optional(spec, 'ports'), types: this.types() });
    if (kind === 'Type') { if (!own(spec, 'schema')) invalid(); compileSchema(spec.schema); }
    else if (kind === 'Variable') {
      if (typeof spec.expression !== 'string' || !spec.expression) invalid();
      const inputs = Object.fromEntries(Object.entries(optional(spec, 'ports')).map(([port, contract]) => [port, this.schema(contract)]));
      compileCel(spec.expression, { inputs, functions: this.#functions });
    } else if (kind === 'Datasource') this.#datasource(spec);
    else if (kind === 'Query') this.#query(spec, context);
    else if (kind === 'Action') this.#action(spec, context, code);
    else this.#ui(kind, spec, context, code);
    context.active.delete(spec); context.done.add(spec);
  }
  #request(request, roots, allowWhole = false, declarations) {
    object(request);
    if (allowWhole && dynamic(request)) { this.#expression(request, roots, declarations); return; }
    fields(request, ['baseUrl', 'method', 'path', 'headers', 'params', 'body']);
    if (!own(request, 'method') || !own(request, 'path')) invalid();
    for (const value of Object.values(request)) this.#expression(value, roots, declarations);
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
  #datasource(spec) {
    if (spec.kind !== 'Http' || !own(spec, 'baseUrl')) invalid();
    for (const field of ['baseUrl', 'headers', 'params']) if (own(spec, field)) this.#expression(spec[field], ['ports', 'secrets', 'auth'], { secrets: map(spec.secrets), auth: spec.auth ? { token: true } : {} });
    if (!dynamic(spec.baseUrl) && typeof spec.baseUrl !== 'string') invalid();
    this.#httpMaps(spec);
    for (const secret of Object.values(map(spec.secrets))) name(secret);
    if (own(spec, 'auth')) {
      fields(spec.auth, ['kind', 'request', 'token']);
      if (spec.auth.kind !== 'Login' || !own(spec.auth, 'token')) invalid();
      this.#request(spec.auth.request, ['ports', 'secrets'], true, { secrets: map(spec.secrets) });
      this.#expression(spec.auth.token, ['response']);
    }
  }
  #query(spec, context) {
    object(spec.sources); fields(spec.transform, ['input', 'steps']);
    if (!own(spec.transform, 'input')) invalid();
    const declarations = { ports: optional(spec, 'ports'), sources: spec.sources };
    for (const source of Object.values(spec.sources)) {
      object(source);
      const query = own(source, 'queryRef') || own(source, 'query');
      fields(source, query ? ['queryRef', 'query', 'inputs'] : ['datasourceRef', 'datasource', 'request']);
      const target = this.#pair(source, query ? 'Query' : 'Datasource', query ? 'queryRef' : 'datasourceRef', query ? 'query' : 'datasource', context);
      if (query) this.#inputs(optional(source, 'inputs'), target, ['ports'], { ports: optional(spec, 'ports') });
      else this.#request(source.request, ['ports', 'secrets', 'auth'], false, { ports: optional(spec, 'ports'), secrets: map(target.secrets), auth: target.auth ? { token: true } : {} });
    }
    this.#expression(spec.transform.input, ['ports', 'sources'], declarations);
    const steps = own(spec.transform, 'steps') ? spec.transform.steps : [];
    if (!Array.isArray(steps)) invalid();
    for (const step of steps) {
      object(step);
      if (step.kind === 'Concat') {
        fields(step, ['kind', 'with']); if (!Array.isArray(step.with)) invalid(); this.#expression(step.with, ['ports', 'sources'], declarations);
      } else if (step.kind === 'Join') {
        fields(step, ['kind', 'right', 'mode', 'on']);
        if (!own(step, 'right') || !['left', 'right', 'inner'].includes(own(step, 'mode') ? step.mode : 'left') || !Array.isArray(step.on) || !step.on.length) invalid();
        for (const pair of step.on) { fields(pair, ['left', 'right']); if (typeof pair.left !== 'string' || typeof pair.right !== 'string') invalid(); }
        this.#expression(step.right, ['ports', 'sources'], declarations);
      } else invalid();
    }
  }
  #action(spec, context, code) {
    if (code ? own(spec, 'steps') : !Array.isArray(spec.steps)) invalid();
    if (own(spec, 'output')) {
      this.#contract(spec.output, ['value']);
      if (own(spec.output, 'value') === code) invalid();
    }
    const ports = optional(spec, 'ports');
    const target = (value, kind) => {
      fields(value, ['@path']); if (!own(value, '@path')) invalid();
      const parts = pointerKeys(value['@path']);
      if (parts.length !== 2 || parts[0] !== 'ports' || ports[parts[1]]?.kind !== kind) invalid();
    };
    const walk = (steps, inherited = {}) => {
      if (!Array.isArray(steps)) invalid();
      const ids = new Set(), completed = { ...inherited };
      for (const step of steps) {
        object(step);
        if (own(step, 'id')) { name(step.id); if (ids.has(step.id)) invalid(); ids.add(step.id); }
        const declarations = { ports, steps: completed };
        if (['Action', 'Query', 'Variable'].includes(step.kind)) {
          const reference = `${step.kind.toLowerCase()}Ref`;
          fields(step, ['id', 'kind', reference, 'spec', 'inputs']);
          const child = this.#pair(step, step.kind, reference, 'spec', context);
          this.#inputs(optional(step, 'inputs'), child, ['ports', 'steps'], declarations);
          for (const [input, value] of decodedEntries(optional(step, 'inputs'))) {
            const kind = child.ports?.[input]?.kind;
            if (kind === 'State' || kind === 'Query') target(value, kind);
          }
          if (own(step, 'id') && (step.kind !== 'Action' || own(child, 'output'))) completed[step.id] = true;
        } else if (step.kind === 'If') {
          fields(step, ['id', 'kind', 'condition', 'then', 'else']); if (!own(step, 'condition')) invalid();
          this.#expression(step.condition, ['ports', 'steps'], declarations); if (!hasExpression(step.condition) && typeof step.condition !== 'boolean') invalid(); walk(step.then, completed); if (own(step, 'else')) walk(step.else, completed);
        } else if (step.kind === 'Assert') {
          fields(step, ['id', 'kind', 'condition', 'message']); if (!own(step, 'condition')) invalid();
          this.#expression(step.condition, ['ports', 'steps'], declarations); if (!hasExpression(step.condition) && typeof step.condition !== 'boolean') invalid(); if (own(step, 'message')) this.#expression(step.message, ['ports', 'steps'], declarations);
        } else if (step.kind === 'SetState') {
          fields(step, ['id', 'kind', 'target', 'value']); if (!own(step, 'value')) invalid(); target(step.target, 'State'); this.#expression(step.value, ['ports', 'steps'], declarations);
        } else if (step.kind === 'RefreshQuery') { fields(step, ['id', 'kind', 'target']); target(step.target, 'Query'); }
        else invalid();
      }
      return completed;
    };
    const completed = code ? {} : walk(spec.steps);
    if (spec.output && !code) { this.#expression(spec.output.value, ['ports', 'steps'], { ports, steps: completed }); if (!hasExpression(spec.output.value)) this.validator(spec.output).accept(literal(spec.output.value)); }
  }
  #ui(kind, spec, context, code) {
    const ports = optional(spec, 'ports'), states = map(spec.states), queries = map(spec.queries), events = map(spec.events), slots = map(spec.slots);
    if (kind === 'View' && (own(spec, 'events') || own(spec, 'slots'))) invalid();
    const declarations = { ports, states, queries };
    const roots = ['ports', 'states', 'queries', 'repeat', 'actions', 'event'];
    const dependencies = new Map();
    for (const [state, declaration] of Object.entries(states)) {
      object(declaration);
      if (declaration.kind === 'State') {
        this.#contract(declaration, ['kind', 'initial']);
        if (own(declaration, 'initial')) {
          this.#expression(declaration.initial, ['ports', 'states'], { ports, states });
          if (!hasExpression(declaration.initial)) this.validator(declaration).accept(literal(declaration.initial));
        }
      } else if (declaration.kind === 'Derived') {
        this.#contract(declaration, ['kind', 'variableRef', 'variable', 'inputs']);
        const child = this.#pair(declaration, 'Variable', 'variableRef', 'variable', context);
        this.#inputs(optional(declaration, 'inputs'), child, ['ports', 'states'], { ports, states });
      } else invalid();
      dependencies.set(`states:${state}`, paths(declaration.kind === 'Derived' ? declaration.inputs : declaration.initial)
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
    for (const use of Object.values(queries)) {
      fields(use, ['queryRef', 'query', 'inputs', 'refresh', 'intervalMs', 'executeWhen', 'autoRefreshWhen']); settings(use);
      const child = this.#pair(use, 'Query', 'queryRef', 'query', context);
      this.#inputs(optional(use, 'inputs'), child, ['ports', 'states', 'queries'], declarations, false);
      for (const gate of ['executeWhen', 'autoRefreshWhen']) if (own(use, gate)) { this.#expression(use[gate], ['ports', 'states', 'queries']); if (!hasExpression(use[gate]) && typeof use[gate] !== 'boolean') invalid(); }
    }
    const stateTarget = (value, writable) => {
      fields(value, ['@path']); if (!own(value, '@path')) invalid(); const parts = pointerKeys(value['@path']);
      if (parts.length !== 2 || !['states', 'ports'].includes(parts[0])) invalid();
      const contract = parts[0] === 'states' ? states[parts[1]] : ports[parts[1]];
      if (!contract || (writable ? contract.kind !== 'State' : !['State', 'Derived'].includes(contract.kind))) invalid();
      return { address: `${parts[0]}:${parts[1]}`, contract };
    };
    const reactions = optional(spec, 'reactions', []); if (!Array.isArray(reactions)) invalid();
    const targets = new Set();
    for (const reaction of reactions) {
      fields(reaction, ['watch', 'target', 'value']);
      if (!Array.isArray(reaction.watch) || !reaction.watch.length || !own(reaction, 'value')) invalid();
      const target = stateTarget(reaction.target, true);
      if (targets.has(target.address)) invalid(); targets.add(target.address);
      this.validator(target.contract).accept(reaction.value);
      dependencies.set(target.address, [...dependencies.get(target.address) ?? [], ...reaction.watch.map(value => stateTarget(value, false).address)]);
    }
    acyclic(dependencies);
    if (code) { if (own(spec, 'render') || own(spec, 'states') || own(spec, 'queries') || own(spec, 'reactions') || own(spec, 'queryDefaults')) invalid(); return; }
    if (!own(spec, 'render') || Array.isArray(spec.render) || own(object(spec.render), 'repeat')) invalid();
    const ids = new Set();
    const node = (value, aliases = []) => {
      fields(value, ['id', 'componentRef', 'component', 'inputs', 'slots', 'on', 'when', 'repeat']);
      name(value.id); if (ids.has(value.id)) invalid(); ids.add(value.id);
      const child = this.#pair(value, 'Component', 'componentRef', 'component', context);
      let nested = aliases;
      if (own(value, 'repeat')) {
        fields(value.repeat, ['items', 'as', 'key']); name(value.repeat.as);
        if (!own(value.repeat, 'items') || !own(value.repeat, 'key') || aliases.includes(value.repeat.as)) invalid();
        this.#expression(value.repeat.items, roots);
        nested = [...aliases, value.repeat.as];
        this.#expression(value.repeat.key, roots);
      }
      const local = { ...declarations, repeat: Object.fromEntries(nested.map(alias => [alias, true])) };
      if (own(value, 'when')) { this.#expression(value.when, roots); if (!hasExpression(value.when) && typeof value.when !== 'boolean') invalid(); }
      this.#inputs(optional(value, 'inputs'), child, roots, local, false);
      const contents = map(value.slots);
      for (const [slot, contract] of Object.entries(child.slots ?? {})) if (contract.required && !own(contents, slot)) invalid();
      for (const [slot, content] of Object.entries(contents)) {
        if (!own(child.slots ?? {}, slot)) invalid();
        if (Array.isArray(content)) content.forEach(item => node(item, nested));
        else {
          fields(content, ['@path']); if (!own(content, '@path')) invalid(); const parts = pointerKeys(content['@path']);
          if (parts.length !== 2 || parts[0] !== 'slots' || !own(slots, parts[1])) invalid();
        }
      }
      for (const [event, handler] of Object.entries(map(value.on))) {
        if (!own(child.events ?? {}, event)) invalid(); object(handler);
        const choices = ['actionRef', 'action', 'emit'].filter(field => own(handler, field)); if (choices.length !== 1) invalid();
        if (own(handler, 'emit')) {
          fields(handler, ['emit', 'payload']); if (!own(events, name(handler.emit)) || !own(handler, 'payload')) invalid(); this.#expression(handler.payload, roots);
        } else {
          fields(handler, ['id', 'actionRef', 'action', 'inputs']); if (own(handler, 'id')) name(handler.id);
          const action = this.#pair(handler, 'Action', 'actionRef', 'action', context); this.#inputs(optional(handler, 'inputs'), action, roots, local, false);
        }
      }
    };
    node(spec.render);
  }
  references(kind, spec) {
    const output = [];
    const pair = (value, reference, target, inline) => { if (own(value, reference)) output.push([target, value[reference]]); if (own(value, inline)) walk(target, value[inline]); };
    const walk = (resourceKind, value) => {
      if (!record(value)) return;
      for (const contract of [...Object.values(value.ports ?? {}), ...Object.values(value.states ?? {}), ...Object.values(value.events ?? {}), ...(value.output ? [value.output] : [])]) {
        if (own(contract, 'typeRef')) output.push(['Type', contract.typeRef]);
        if (contract.kind === 'Derived') pair(contract, 'variableRef', 'Variable', 'variable');
      }
      for (const use of Object.values(value.queries ?? {})) pair(use, 'queryRef', 'Query', 'query');
      const node = item => {
        pair(item, 'componentRef', 'Component', 'component');
        for (const content of Object.values(item.slots ?? {})) if (Array.isArray(content)) content.forEach(node);
        for (const handler of Object.values(item.on ?? {})) pair(handler, 'actionRef', 'Action', 'action');
      };
      if (value.render) node(value.render);
      if (resourceKind === 'Query') for (const source of Object.values(value.sources ?? {})) { pair(source, 'queryRef', 'Query', 'query'); pair(source, 'datasourceRef', 'Datasource', 'datasource'); }
      const steps = list => { for (const step of list ?? []) { if (['Query', 'Action', 'Variable'].includes(step.kind)) pair(step, `${step.kind.toLowerCase()}Ref`, step.kind, 'spec'); if (step.then) steps(step.then); if (step.else) steps(step.else); } };
      if (resourceKind === 'Action') steps(value.steps);
    };
    walk(kind, spec); return output;
  }
}
export const createRegistry = options => new Registry(options);
