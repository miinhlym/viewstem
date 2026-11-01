// Private application protocol model, not the Viewstem core or SDK.
import { Registry as UIRegistry, UIProbe, evaluate } from '../t3-ui/ui-probe.mjs';
import { compileSchema } from '../t1-values/schema-runtime.mjs';
import { StateProbe } from '../t3-state/state-probe.mjs';
import { ProbeHost } from '../t2-query-races/query-probe.mjs';
import { FakeClock, deferred } from '../t2-query-races/harness.mjs';
import { mergeOwned } from '../t2-url-races/url-probe.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const copy = value => structuredClone(value);
const key = (kind, id) => JSON.stringify([kind, id]);
const fail = code => { throw Object.assign(Error(code), { code }); };
export const adapters = { Text: { tag: 'span', text: 'text' }, Row: { layout: 'row' }, Button: { tag: 'button' } };

// Traverse reference positions, not ordinary data objects containing *Ref keys.
function references(spec, kind, result = []) {
  const pair = (value, field, target, inline) => {
    if (own(value, field)) result.push([target, value[field]]);
    if (inline && own(value, inline)) references(value[inline], target, result);
  };
  for (const contract of [...Object.values(spec.ports ?? {}), ...Object.values(spec.states ?? {}), ...Object.values(spec.events ?? {}), ...(spec.output ? [spec.output] : [])]) {
    if (contract.typeRef) result.push(['Type', contract.typeRef]);
    if (contract.schema !== undefined) compileSchema(contract.schema);
    if (contract.kind === 'Derived') pair(contract, 'variableRef', 'Variable', 'variable');
  }
  for (const use of Object.values(spec.queries ?? {})) {
    if (own(use, 'queryRef') === own(use, 'query')) fail('INVALID_DEFINITION');
    pair(use, 'queryRef', 'Query', 'query');
  }
  const visitNode = node => {
    pair(node, 'componentRef', 'Component', 'component');
    for (const content of Object.values(node.slots ?? {})) if (Array.isArray(content)) content.forEach(visitNode);
    for (const handler of Object.values(node.on ?? {})) pair(handler, 'actionRef', 'Action', 'action');
  };
  if (spec.render) visitNode(spec.render);
  if (kind === 'Query') for (const source of spec.sources ?? []) {
    pair(source, 'queryRef', 'Query', 'query'); pair(source, 'datasourceRef', 'Datasource', 'datasource');
  }
  // Only explicit declarative steps are traversed. No code-action child protocol.
  const steps = list => { for (const step of list ?? []) {
    if (['Query', 'Action', 'Variable'].includes(step.kind)) pair(step, `${step.kind.toLowerCase()}Ref`, step.kind, 'spec');
    steps(step.then); steps(step.else);
  } };
  if (kind === 'Action') steps(spec.steps);
  return result;
}

export class ApplicationRegistry {
  constructor(resources = [], implementations = new Map()) {
    this.definitions = new Map(); this.implementations = new Map(implementations);
    if (resources.length) this.register(resources);
  }
  get(kind, id) { return this.definitions.get(key(kind, id)) ?? fail('REFERENCE_NOT_FOUND'); }
  list() { return [...this.definitions.values()].map(copy); }
  fork() { const registry = new ApplicationRegistry(); registry.definitions = new Map(this.list().map(definition => [key(definition.kind, definition.id), definition])); registry.implementations = new Map(this.implementations); return registry; }
  validate() {
    for (const definition of this.definitions.values()) for (const [kind, id] of references(definition.spec, definition.kind)) this.get(kind, id);
    try { this.uiRegistry = new UIRegistry(this.list(), adapters); }
    catch { fail('INVALID_DEFINITION'); }
  }
  register(resources) {
    const candidate = this.fork();
    for (const original of resources) {
      const definition = copy(original), address = key(definition.kind, definition.id);
      if (candidate.definitions.has(address)) fail('INVALID_DEFINITION');
      candidate.definitions.set(address, definition);
    }
    candidate.validate(); this.definitions = candidate.definitions; this.uiRegistry = candidate.uiRegistry;
  }
  registerCode(definition, implementation) {
    if (!['Action', 'Component'].includes(definition.kind) || typeof implementation !== 'function') fail('INVALID_DEFINITION');
    this.register([definition]); this.implementations.set(key(definition.kind, definition.id), implementation);
  }
  edit(kind, id, spec) {
    this.get(kind, id); const candidate = this.fork();
    candidate.definitions.set(key(kind, id), { ...candidate.get(kind, id), spec: copy(spec) }); candidate.validate();
    this.definitions = candidate.definitions; this.uiRegistry = candidate.uiRegistry;
  }
  export(kind, id) { return copy(this.get(kind, id)); }
}

// Explicit fixture brand, not a claim that arbitrary StateProbe is a production Store.
const fixtureStores = new WeakSet();
export function createStoreFixture() { const store = new StateProbe(); fixtureStores.add(store); return store; }
export class URLFixture {
  constructor(href = 'https://probe.test/?outside=keep') { this.href = href; this.owners = new Map(); this.cleanupCount = 0; }
  prepare(keys, previous) {
    for (const name of keys) if (this.owners.has(name) && this.owners.get(name) !== previous) fail('OWNER_CONFLICT');
  }
  attach(keys) { const token = { keys: [...keys], alive: true }; keys.forEach(name => this.owners.set(name, token)); return token; }
  detach(token, cleanup) {
    if (!token?.alive) return; token.alive = false;
    const owned = token.keys.filter(name => this.owners.get(name) === token);
    owned.forEach(name => this.owners.delete(name));
    if (cleanup) { ++this.cleanupCount; this.href = mergeOwned(this.href, Object.fromEntries(owned.map(name => [name, null]))); }
  }
}
let nextLifetime = 0;
export class ApplicationProbe {
  constructor({ registry, stateStore, transport, renderer, resolver, url = new URLFixture() } = {}) {
    if (!(registry instanceof ApplicationRegistry)) fail('INVALID_DEFINITION');
    if (stateStore && !fixtureStores.has(stateStore)) fail('STORE_BRAND');
    Object.assign(this, { registry, stateStore: stateStore ?? createStoreFixture(), transport, renderer, resolver, url });
    this.views = new Set(); this.trace = []; this.clock = new FakeClock();
    this.queryTransport = { execute: (inputs, context) => {
      try { return this.transport.execute(inputs, context); }
      catch (error) {
        // A service executor throwing synchronously is still a data failure after commit.
        const completion = deferred(); completion.reject(error);
        return { id: 'synchronous-service-failure', completion };
      }
    }, disposeOwner: owner => this.transport?.disposeOwner?.(owner) };
  }
  async mount(target, options = {}) {
    const view = new ApplicationView(this); const result = await view.apply('replace', target, options); this.views.add(view);
    return { view, ...result };
  }
}

class ApplicationView {
  constructor(runtime) { this.runtime = runtime; this.operation = 0; this.generation = 0; this.alive = true; this.subscribers = new Set(); this.live = null; }
  async prepare(mode, target, options) {
    const runtime = this.runtime, registry = (options.registry ?? (mode === 'update' ? this.live.registry : runtime.registry)).fork();
    const resolve = async (kind, id) => {
      if (registry.definitions.has(key(kind, id))) return registry.get(kind, id);
      if (!runtime.resolver) fail('REFERENCE_NOT_FOUND');
      runtime.trace.push({ kind: 'resolve', resource: { kind, id } });
      const definition = await runtime.resolver(kind, id);
      if (definition?.kind !== kind || definition?.id !== id) fail('REFERENCE_NOT_FOUND');
      registry.definitions.set(key(kind, id), copy(definition));
      for (const [childKind, childId] of references(definition.spec, kind)) await resolve(childKind, childId);
      return registry.get(kind, id);
    };
    if (own(target, 'viewRef') === own(target, 'view')) fail('INVALID_DEFINITION');
    const spec = copy(target.view ?? (await resolve('View', target.viewRef)).spec);
    for (const [kind, id] of references(spec, 'View')) await resolve(kind, id);
    registry.validate();
    const previous = mode === 'update' ? this.live : null;
    const states = {}, cells = new Map();
    for (const [name, declaration] of Object.entries(spec.states ?? {})) {
      const validator = compileSchema(declaration.schema), old = previous?.cells.get(name);
      // Fixture comparison: only identical contracts are reused. Tests use clear type conflicts.
      if (old && JSON.stringify(old.schema) !== JSON.stringify(declaration.schema)) fail('TYPE_CONTRACT_MISMATCH');
      const value = own(options.states ?? {}, name) ? options.states[name] : old ? old.value : declaration.initial;
      states[name] = validator.accept(value); cells.set(name, old ?? { schema: copy(declaration.schema), validator, value: states[name] });
    }
    for (const name of Object.keys(options.states ?? {})) if (!cells.has(name)) fail('REFERENCE_NOT_FOUND');
    const ports = copy(options.inputs ?? previous?.ports ?? {});
    for (const [name, declaration] of Object.entries(spec.ports ?? {})) {
      if (declaration.kind !== 'Value') fail('PORT_KIND_OUTSIDE_PROBE');
      if (own(ports, name)) ports[name] = compileSchema(declaration.schema).accept(ports[name]);
    }
    const connections = options.connections ?? previous?.connections ?? [];
    for (const connection of connections) {
      const contract = runtime.stateStore.contract(connection.handle);
      if (JSON.stringify(contract.schema) !== JSON.stringify(connection.schema)) fail('TYPE_CONTRACT_MISMATCH');
    }
    const urlKeys = options.urlKeys ?? previous?.urlKeys ?? [];
    runtime.url.prepare(urlKeys, this.live?.urlToken);
    const ui = new UIProbe(registry.uiRegistry, { ports }); ui.viewStates = states;
    if (previous) { ui.instances = new Map([...previous.ui.instances].map(([address, instance]) => [address, { ...instance, states: copy(instance.states) }])); ui.generation = previous.ui.generation; }
    // UIProbe's internal commit is to an isolated candidate. No visible effect yet.
    ui.apply(spec);
    const plans = new Map();
    const queryPlan = (uses, context, owner) => {
      for (const [name, use] of Object.entries(uses ?? {})) {
        const definition = use.query ?? registry.get('Query', use.queryRef).spec, inputs = {}; let ready = true;
        for (const [portName, declaration] of Object.entries(definition.ports ?? {})) {
          const expression = use.inputs?.[portName];
          if (expression === undefined) { if (declaration.required) fail('INVALID_DEFINITION'); continue; }
          try { inputs[portName] = compileSchema(declaration.schema).accept(evaluate(expression, context)); }
          catch (error) {
            if (error.message === 'REFERENCE' && expression?.['@path']?.startsWith('/ports/')) ready = false;
            else fail('TYPE_MISMATCH');
          }
        }
        const gate = own(use, 'executeWhen') ? evaluate(use.executeWhen, context) : true;
        if (typeof gate !== 'boolean') fail('TYPE_MISMATCH');
        if (ready && gate && !runtime.transport) fail('EXECUTOR_REQUIRED');
        const address = JSON.stringify([owner, name]);
        plans.set(address, { address, name, identity: use.queryRef ?? `inline:${owner}:${name}`, inputs, ready, executeWhen: gate });
      }
    };
    queryPlan(spec.queries, { states, ports }, '$view');
    for (const instance of ui.instances.values()) queryPlan(instance.spec.queries, { states: instance.states, ports: instance.inputs }, [instance.address, instance.generation]);
    return { registry, spec, states, cells, ports, ui, plans, connections, urlKeys, previous };
  }
  async apply(mode, target, options = {}) {
    if (!this.alive) fail('CANCELLED');
    const operation = ++this.operation, candidate = await this.prepare(mode, target, options);
    if (options.beforeCommit) await options.beforeCommit();
    if (!this.alive || operation !== this.operation) fail('CANCELLED');
    this.initial?.reject(Object.assign(Error('CANCELLED'), { code: 'CANCELLED' }));
    const old = this.live, lifetime = mode === 'update' ? old.lifetime : ++nextLifetime;
    if (mode !== 'update') {
      old?.queries.forEach(item => item.query.dispose());
      this.runtime.url.detach(old?.urlToken, true);
    }
    const urlToken = mode === 'update' && old ? old.urlToken : this.runtime.url.attach(candidate.urlKeys);
    const queries = new Map(), generation = ++this.generation;
    this.live = { ...candidate, lifetime, urlToken, queries, generation };
    for (const [name, cell] of candidate.cells) cell.value = candidate.states[name];
    const initial = deferred(); initial.promise.catch(() => {}); this.initial = initial;
    this.runtime.trace.push({ kind: 'commit', generation, lifetime });
    this.suppressProjection = true;
    for (const [address, plan] of candidate.plans) {
      const previous = mode === 'update' ? old.queries.get(address) : null;
      if (previous && previous.identity === plan.identity) {
        previous.query.configure(plan); queries.set(address, { ...plan, query: previous.query, host: previous.host });
      } else {
        previous?.query.dispose();
        const trace = { push: entry => {
          this.runtime.trace.push({ ...entry, applicationLifetime: lifetime });
          if (entry.kind === 'snapshot') queueMicrotask(() => { if (this.live?.lifetime === lifetime && this.alive) this.project(); });
        } };
        const host = new ProbeHost(this.runtime.clock, this.runtime.queryTransport, trace);
        const query = host.mount(address, plan); queries.set(address, { ...plan, host, query });
      }
    }
    if (mode === 'update') for (const [address, previous] of old.queries) if (!queries.has(address)) previous.query.dispose();
    this.suppressProjection = false; this.project();
    return { initial: initial.promise };
  }
  snapshot() {
    const live = this.live;
    const serialize = instance => ({ id: instance.id, generation: instance.generation, inputs: copy(instance.inputs), adapter: copy(instance.adapter), children: instance.children.map(serialize) });
    return { generation: live.generation, lifetime: live.lifetime, states: copy(live.ui.viewStates), roots: live.ui.roots.map(serialize),
      queries: Object.fromEntries([...live.queries].map(([address, item]) => [address, { name: item.name, ...copy(item.query.snapshot()) }])) };
  }
  project() {
    if (!this.alive || this.suppressProjection) return;
    const live = this.live, generation = live.generation, version = (this.projectionVersion ?? 0) + 1; this.projectionVersion = version;
    const snapshot = this.snapshot(); this.runtime.trace.push({ kind: 'projection', generation, version });
    for (const listener of this.subscribers) listener(snapshot);
    const settled = [...live.queries.values()].every(item => ['success', 'error', 'waiting'].includes(item.query.snapshot().status));
    const completion = this.runtime.renderer ? this.runtime.renderer(snapshot, { isCurrent: () => this.alive && this.live === live && this.projectionVersion === version }) : undefined;
    Promise.resolve(completion).then(() => {
      if (!this.alive || this.live !== live || this.projectionVersion !== version) return;
      this.runtime.trace.push({ kind: this.runtime.renderer ? 'renderer-ack' : 'core-projection-delivered', generation, version });
      if (settled) this.initial.resolve({ generation, queryErrors: [...live.queries.values()].filter(item => item.query.snapshot().status === 'error')
        .map(item => ({ query: item.name, error: copy(item.query.snapshot().error) })) });
    }, () => { if (this.live === live) this.initial.reject(Object.assign(Error('INTERNAL_ERROR'), { code: 'INTERNAL_ERROR' })); });
  }
  update(spec, options = {}) { return this.apply('update', { view: spec }, options); }
  replace(target, options = {}) { return this.apply('replace', target, options); }
  exportDefinition() { return copy(this.live.spec); }
  state(name) {
    const cell = this.live.cells.get(name) ?? fail('REFERENCE_NOT_FOUND'), lifetime = this.live.lifetime;
    const current = () => { if (!this.alive || this.live.lifetime !== lifetime || this.live.cells.get(name) !== cell) fail('CANCELLED'); };
    return { read: () => { current(); return copy(cell.value); }, write: async value => { current(); return this.update(this.live.spec, { states: { [name]: value } }); } };
  }
  subscribe(listener) { this.subscribers.add(listener); listener(this.snapshot()); return () => this.subscribers.delete(listener); }
  dispose() {
    if (!this.alive) return; this.alive = false; ++this.operation;
    this.initial?.reject(Object.assign(Error('CANCELLED'), { code: 'CANCELLED' }));
    this.live?.queries.forEach(item => item.query.dispose()); this.runtime.url.detach(this.live?.urlToken, false); this.subscribers.clear(); this.runtime.views.delete(this);
  }
}

// Trusted host fixture grants; listing is independent from invocation permission.
export class HostPolicyFixture {
  #grants = new WeakMap();
  constructor(runtime, publicActions = []) { this.runtime = runtime; this.publicActions = new Set(publicActions); }
  grant(actor, permissions) { this.#grants.set(actor, new Set(permissions)); }
  list() { return [...this.publicActions]; }
  check(actor, permission, owner) {
    if (!this.#grants.get(actor)?.has(permission) || !this.runtime.views.has(owner) || !owner.alive) fail('HOST_DENIED');
  }
  async change(actor, owner, spec, states) { this.check(actor, 'change', owner); return owner.update(spec, { states }); }
  async invoke(actor, owner, actionRef, inputs = {}) {
    this.check(actor, 'invoke', owner); if (!this.publicActions.has(actionRef)) fail('HOST_DENIED');
    const definition = owner.live.registry.get('Action', actionRef), prepared = {};
    for (const [name, declaration] of Object.entries(definition.spec.ports ?? {})) {
      if (declaration.required && !own(inputs, name)) fail('TYPE_MISMATCH');
      if (own(inputs, name)) prepared[name] = compileSchema(declaration.schema).accept(inputs[name]);
    }
    const implementation = owner.live.registry.implementations.get(key('Action', actionRef)) ?? fail('REFERENCE_NOT_FOUND');
    this.runtime.trace.push({ kind: 'action-start', actionRef, generation: owner.live.generation });
    return implementation({ inputs: prepared, signal: new AbortController().signal });
  }
}
