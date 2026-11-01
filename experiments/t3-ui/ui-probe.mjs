// Independent contract probe; deliberately not the Viewstem core or public SDK.
import { compileSchema } from '../t1-values/schema-runtime.mjs';
import { evaluate, validateExpression, validateInitials, initializeStates } from './value-evaluator.mjs';
import { pointerKeys } from '../t2-http-boundary/value-expressions.mjs';
export { evaluate } from './value-evaluator.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const fail = code => { throw Error(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const tuple = value => JSON.stringify(value);
const expressionShape = validateExpression;
const keyOf = value => {
  if (typeof value === 'string') return ['string', value];
  if (typeof value === 'number' && Number.isFinite(value)) return ['number', Object.is(value, -0) ? 0 : value];
  fail('REPEAT_KEY');
};

export class Registry {
  constructor(resources, adapters = {}) {
    this.resources = new Map();
    this.inlineIds = new WeakMap();
    this.adapters = adapters;
    for (const original of resources) {
      const resource = structuredClone(original), key = tuple([resource.kind, resource.id]);
      if (this.resources.has(key)) fail('DUPLICATE_RESOURCE');
      this.resources.set(key, resource);
    }
    this.validators = new WeakMap();
    this.validated = new Set();
    for (const resource of this.resources.values()) {
      if (resource.kind === 'Component' || resource.kind === 'View') this.validateDefinition(resource.spec, `${resource.kind}:${resource.id}`, resource.kind === 'View');
    }
  }
  get(kind, id) { return this.resources.get(tuple([kind, id])) ?? fail('REFERENCE'); }
  schema(contract) {
    if (own(contract, 'schema') === own(contract, 'typeRef')) fail('SCHEMA_XOR');
    return contract.schema ?? this.get('Type', contract.typeRef).spec.schema;
  }
  validator(contract) {
    if (!this.validators.has(contract)) this.validators.set(contract, compileSchema(this.schema(contract)));
    return this.validators.get(contract);
  }
  target(node, identity) {
    if (own(node, 'componentRef') === own(node, 'component')) fail('COMPONENT_XOR');
    if (own(node, 'component')) {
      if (!object(node.component)) fail('INLINE_COMPONENT');
      this.inlineIds.set(node.component, identity);
      return { spec: node.component, identity };
    }
    return { spec: this.get('Component', node.componentRef).spec, identity: `Component:${node.componentRef}` };
  }
  validateDefinition(spec, identity, view = false, stack = []) {
    if (stack.includes(identity)) fail('COMPONENT_CYCLE');
    if (this.validated.has(identity)) return;
    if (!object(spec)) fail('DEFINITION');
    validateInitials(spec);
    for (const declaration of Object.values(spec.states ?? {})) this.validator(declaration);
    for (const contract of Object.values(spec.events ?? {})) this.validator(contract);
    for (const port of Object.values(spec.ports ?? {})) {
      if (port.kind !== 'Value') fail('PORT_KIND_OUTSIDE_PROBE');
      this.validator(port);
      if (own(port, 'default')) {
        if (port.required) fail('REQUIRED_DEFAULT');
        this.validator(port).accept(port.default);
      }
    }
    if (spec.render) {
      if (Array.isArray(spec.render)) fail('RENDER_ROOT');
      if (spec.render.repeat) fail('REPEAT_ROOT');
      const ids = new Set();
      this.validateNode(spec.render, identity, spec, ids, [], [...stack, identity]);
    } else if (view || !this.adapters[identity.slice('Component:'.length)]) fail('RENDER_REQUIRED');
    this.validated.add(identity);
  }
  validateNode(node, ownerIdentity, ownerSpec, ids, aliases, stack) {
    if (!object(node) || typeof node.id !== 'string' || !node.id) fail('NODE');
    if (ids.has(node.id)) fail('DUPLICATE_NODE');
    ids.add(node.id);
    const { spec, identity } = this.target(node, `${ownerIdentity}/inline:${node.id}`);
    this.validateDefinition(spec, identity, false, stack);
    let innerAliases = aliases;
    if (node.repeat) {
      if (!object(node.repeat) || typeof node.repeat.as !== 'string' || !node.repeat.as || !own(node.repeat, 'items') || !own(node.repeat, 'key')) fail('REPEAT');
      if (aliases.includes(node.repeat.as)) fail('REPEAT_SHADOW');
      innerAliases = [...aliases, node.repeat.as];
      expressionShape(node.repeat.items); expressionShape(node.repeat.key);
    }
    expressionShape(node.when); expressionShape(node.inputs ?? {});
    for (const key of Object.keys(node.inputs ?? {})) if (!own(spec.ports ?? {}, key)) fail('UNKNOWN_INPUT');
    for (const [key, port] of Object.entries(spec.ports ?? {})) if (port.required && !own(node.inputs ?? {}, key)) fail('REQUIRED_INPUT');
    for (const [name, contract] of Object.entries(spec.slots ?? {})) if (contract.required && !own(node.slots ?? {}, name)) fail('REQUIRED_SLOT');
    for (const [name, content] of Object.entries(node.slots ?? {})) {
      if (!own(spec.slots ?? {}, name)) fail('UNKNOWN_SLOT');
      if (Array.isArray(content)) {
        for (const child of content) this.validateNode(child, ownerIdentity, ownerSpec, ids, innerAliases, stack);
      } else {
        if (!object(content) || Object.keys(content).length !== 1 || typeof content['@path'] !== 'string') fail('SLOT_REFERENCE');
        const keys = pointerKeys(content['@path']);
        if (keys.length !== 2 || keys[0] !== 'slots' || !own(ownerSpec.slots ?? {}, keys[1])) fail('SLOT_REFERENCE');
      }
    }
    for (const [event, handler] of Object.entries(node.on ?? {})) {
      if (!own(spec.events ?? {}, event)) fail('UNKNOWN_EVENT');
      const choices = ['actionRef', 'action', 'emit'].filter(key => own(handler, key));
      if (choices.length !== 1) fail('HANDLER_XOR');
      if (handler.emit) {
        if (!own(ownerSpec.events ?? {}, handler.emit)) fail('UNKNOWN_EMIT');
        expressionShape(handler.payload);
      } else {
        if (handler.actionRef) this.get('Action', handler.actionRef);
        expressionShape(handler.inputs ?? {});
      }
    }
  }
  validateView(spec) {
    // Updates use the same immutable definition identity, but fresh declaration validation.
    for (const identity of this.validated) if (identity.startsWith('View:$mount')) this.validated.delete(identity);
    this.validateDefinition(spec, 'View:$mount', true);
  }
}

export function gridLayout(declarations, expanded, layout = {}) {
  const declared = new Map(declarations.map(node => [node.id, node]));
  const plans = new Map();
  for (const key of Object.keys(layout)) if (!declared.has(key)) fail('GRID_UNKNOWN_ID');
  for (const [id, declaration] of declared) {
    const config = layout[id] ?? {};
    if (!object(config)) fail('GRID_LAYOUT');
    if (Object.keys(config).some(key => !['row', 'column', 'rowSpan', 'columnSpan'].includes(key))) fail('GRID_LAYOUT');
    for (const key of Object.keys(config)) if (!Number.isSafeInteger(config[key]) || config[key] < 1) fail('GRID_INTEGER');
    if (own(config, 'row') !== own(config, 'column')) fail('GRID_PARTIAL');
    const plan = { rowSpan: 1, columnSpan: 12, ...config };
    if (plan.columnSpan > 12 || (plan.column && plan.column + plan.columnSpan - 1 > 12)) fail('GRID_RANGE');
    if (declaration.repeat && plan.row) fail('GRID_REPEAT_FIXED');
    plans.set(id, plan);
  }
  const occupied = new Set(), placements = new Map();
  const cells = box => {
    const output = [];
    for (let row = box.row; row < box.row + box.rowSpan; ++row)
      for (let column = box.column; column < box.column + box.columnSpan; ++column) output.push(`${row}:${column}`);
    return output;
  };
  const reserve = (item, box) => {
    const area = cells(box);
    if (area.some(cell => occupied.has(cell))) fail('GRID_OVERLAP');
    area.forEach(cell => occupied.add(cell)); placements.set(item.address, box);
  };
  for (const item of expanded) {
    const plan = plans.get(item.id) ?? fail('GRID_UNKNOWN_ID');
    if (plan.row) reserve(item, { ...plan });
  }
  let cursor = 0;
  for (const item of expanded) {
    const plan = plans.get(item.id);
    if (plan.row) continue;
    for (;;) {
      const row = Math.floor(cursor / 12) + 1, column = cursor % 12 + 1;
      const box = { ...plan, row, column };
      if (column + plan.columnSpan - 1 <= 12 && cells(box).every(cell => !occupied.has(cell))) {
        reserve(item, box); cursor += plan.columnSpan; break;
      }
      ++cursor;
    }
  }
  return placements;
}

export class UIProbe {
  constructor(registry, { ports = {}, queryStarted = () => {}, action = () => {}, actionSnapshots = () => ({}) } = {}) {
    this.registry = registry; this.ports = ports; this.queryStarted = queryStarted; this.action = action; this.actionSnapshots = actionSnapshots;
    this.instances = new Map(); this.generation = 0; this.viewStates = null;
  }
  apply(view) {
    const registry = this.registry;
    registry.validateView(view);
    const ports = Object.create(null);
    for (const name of Object.keys(this.ports)) if (!own(view.ports ?? {}, name)) fail('UNKNOWN_INPUT');
    for (const [name, declaration] of Object.entries(view.ports ?? {})) {
      if (own(this.ports, name)) ports[name] = registry.validator(declaration).accept(this.ports[name]);
      else if (own(declaration, 'default')) ports[name] = registry.validator(declaration).accept(declaration.default);
      else if (declaration.required) fail('REQUIRED_INPUT');
    }
    const initialize = (spec, ports) => initializeStates(spec, ports, declaration => registry.validator(declaration));
    const states = this.viewStates ?? initialize(view, ports);
    const rootOwner = { key: '$view', states, spec: view, ports };
    const readActions = owner => () => this.actionSnapshots({ ownerKey: owner.key, definition: owner.definition ?? 'View:$mount', spec: owner.spec });
    const rootContext = { states, ports, repeat: {}, slots: {}, owner: rootOwner, readActions: readActions(rootOwner) };
    const next = new Map(), newQueries = [], aliases = new Set();
    const contentToken = (content, context, trail) => Array.isArray(content) ? { nodes: content, context, trail }
      : context.slots[pointerKeys(content['@path'])[1]];
    const expandToken = token => token ? token.nodes.flatMap(node => expand(node, token.context, token.trail)) : [];
    const expand = (node, context, trail, expanded = false) => {
      if (node.repeat && !expanded) {
        const items = evaluate(node.repeat.items, context);
        if (!Array.isArray(items)) fail('REPEAT_ARRAY');
        const seen = new Set();
        // Entire key pass precedes all item when/input/instance work.
        const entries = items.map(item => {
          const itemContext = { ...context, repeat: { ...context.repeat, [node.repeat.as]: item } };
          const key = keyOf(evaluate(node.repeat.key, itemContext)), encoded = tuple(key);
          if (seen.has(encoded)) fail('DUPLICATE_KEY');
          seen.add(encoded); return { itemContext, key };
        });
        return entries.flatMap(({ itemContext, key }) => expand(node, itemContext, [...trail, [node.id, key]], true));
      }
      if (own(node, 'when')) {
        const when = evaluate(node.when, context);
        if (typeof when !== 'boolean') fail('WHEN_BOOLEAN');
        if (!when) return [];
      }
      const { spec, identity } = registry.target(node, `${context.owner.definition ?? 'View:$mount'}/inline:${node.id}`);
      const address = tuple([context.owner.key, node.id, trail]);
      for (const handler of Object.values(node.on ?? {})) if (!handler.emit && own(handler, 'id')) {
        const alias = tuple([context.owner.key, handler.id]);
        if (aliases.has(alias)) fail('DUPLICATE_ACTION_ID');
        aliases.add(alias);
      }
      if (next.has(address)) fail('DUPLICATE_PROJECTION');
      const previous = this.instances.get(address);
      const preserved = previous && previous.definition === identity;
      const adapter = registry.adapters[node.componentRef];
      const inputs = Object.create(null);
      for (const [name, port] of Object.entries(spec.ports ?? {})) {
        if (own(node.inputs ?? {}, name)) inputs[name] = registry.validator(port).accept(evaluate(node.inputs[name], context));
        else if (own(port, 'default')) inputs[name] = registry.validator(port).accept(port.default);
      }
      const instance = { id: node.id, address, definition: identity, generation: preserved ? previous.generation : ++this.generation,
        states: preserved ? previous.states : initialize(spec, inputs), spec, adapter, source: node, authorContext: context, inputs };
      next.set(address, instance);
      if (!preserved) for (const name of Object.keys(spec.queries ?? {})) newQueries.push({ instance, name });
      const slots = Object.fromEntries(Object.entries(spec.slots ?? {}).map(([name]) => [name,
        own(node.slots ?? {}, name) ? contentToken(node.slots[name], context, trail) : { nodes: [], context, trail }]));
      if (spec.render) {
        const owner = { key: tuple([address, instance.generation]), states: instance.states, ports: inputs, spec,
          definition: identity, instance };
        instance.children = expand(spec.render, { owner, states: owner.states, ports: inputs, repeat: {}, slots, readActions: readActions(owner) }, []);
      } else {
        instance.children = Object.values(slots).flatMap(expandToken);
        if (adapter?.layout === 'grid') {
          const token = slots.default;
          instance.placements = gridLayout(token?.nodes ?? [], instance.children, inputs.layout ?? {});
        }
      }
      return [instance];
    };
    const roots = expand(view.render, rootContext, []);
    // No Query start or visible tree update occurs before the complete plan succeeds.
    this.instances = next; this.roots = roots; this.viewStates = states; this.view = view;
    for (const query of newQueries) this.queryStarted(query);
    return roots;
  }
  find(id) { return [...this.instances.values()].filter(instance => instance.id === id); }
  emit(instance, event, payload) {
    const current = this.instances.get(instance.address);
    if (!current || current.generation !== instance.generation) fail('REMOVED_CONNECTION');
    instance = current;
    const contract = instance.spec.events?.[event] ?? fail('UNKNOWN_EVENT');
    const data = this.registry.validator(contract).accept(payload);
    const handler = instance.source.on?.[event];
    if (!handler) return;
    const context = { ...instance.authorContext, event: data };
    if (handler.emit) {
      const receiver = context.owner.instance ?? fail('VIEW_EMIT_OUTSIDE_PROBE');
      return this.emit(receiver, handler.emit, evaluate(handler.payload, context));
    }
    // Event is not implicitly passed to the called action.
    return this.action(handler.actionRef ?? '$inline', evaluate(handler.inputs ?? {}, context), { ownerKey: context.owner.key, id: handler.id, handler });
  }
}

export function mountDOM(probe, container) {
  const document = container.ownerDocument;
  const render = instance => {
    const adapter = instance.adapter;
    const element = document.createElement(adapter?.tag ?? 'section');
    element.dataset.node = instance.id;
    element.dataset.generation = String(instance.generation);
    if (adapter?.layout === 'row') { element.style.display = 'flex'; element.style.flexDirection = 'row'; }
    if (adapter?.layout === 'column') { element.style.display = 'flex'; element.style.flexDirection = 'column'; }
    if (adapter?.layout === 'grid') {
      element.style.display = 'grid'; element.style.gridTemplateColumns = 'repeat(12, 40px)'; element.style.gridAutoRows = '30px';
    }
    if (adapter?.text) element.textContent = String(instance.inputs[adapter.text] ?? '');
    if (adapter?.domEvent) element.addEventListener(adapter.domEvent, event => {
      // Native Event stays inside the adapter; only declared data crosses the boundary.
      probe.emit(instance, adapter.event, adapter.payload === 'value' ? { value: event.target.value } : {});
    });
    for (const child of instance.children) {
      const childElement = render(child), box = instance.placements?.get(child.address);
      if (box) {
        childElement.style.gridRow = `${box.row} / span ${box.rowSpan}`;
        childElement.style.gridColumn = `${box.column} / span ${box.columnSpan}`;
      }
      element.append(childElement);
    }
    return element;
  };
  container.replaceChildren(...probe.roots.map(render));
}
