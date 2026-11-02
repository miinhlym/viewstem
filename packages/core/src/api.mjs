import { Registry } from './registry.mjs';
import { StateStore } from './state.mjs';
import { Runtime } from './runtime.mjs';
import { fail, error } from './errors.mjs';

// These handles delegate to the existing engine. They contain no execution state
// and never expose an implementation object, including through callbacks/chaining.
const registries = new WeakMap(), stores = new WeakMap(), scopes = new WeakMap(), views = new WeakMap();
const registryHandles = new WeakMap(), storeHandles = new WeakMap(), scopeHandles = new WeakMap(), viewHandles = new WeakMap();
const actionOwners = new WeakMap();
const handle = methods => Object.freeze(Object.assign(Object.create(null), methods));
const unwrap = (map, value) => map.get(value) ?? fail('INVALID_DEFINITION');

function registryHandle(implementation) {
  if (registryHandles.has(implementation)) return registryHandles.get(implementation);
  const result = handle({
    registerResources(resources) { implementation.registerResources(resources); return result; },
    registerComponentContract(contract) { implementation.registerComponentContract(contract); return result; },
    registerComponentContracts(contracts) { implementation.registerComponentContracts(contracts); return result; },
    registerAction(definition, run) { implementation.registerAction(definition, run); return result; },
    updateResource(definition) { implementation.updateResource(definition); return result; },
    get: (kind, id) => implementation.get(kind, id),
    list: filter => implementation.list(filter),
    exportResource: (kind, id) => implementation.exportResource(kind, id),
    isCode: (kind, id) => implementation.isCode(kind, id),
  });
  registries.set(result, implementation); registryHandles.set(implementation, result);
  return result;
}

function stateDeclaration(declaration) {
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)
    || !Object.hasOwn(declaration, 'schema') || Object.keys(declaration).some(key => !['schema', 'initial'].includes(key))) fail('INVALID_DEFINITION');
  // Internal derived/pending-initial policies cannot enter through a public Scope.
  return { schema: declaration.schema, ...(Object.hasOwn(declaration, 'initial') ? { initial: declaration.initial } : {}) };
}
function scopeHandle(implementation) {
  if (scopeHandles.has(implementation)) return scopeHandles.get(implementation);
  const result = handle({
    scopeId: implementation.scopeId,
    registerState: (name, declaration) => implementation.registerState(name, stateDeclaration(declaration)),
    replaceState: (name, declaration) => implementation.replaceState(name, stateDeclaration(declaration)),
    getState: name => implementation.getState(name),
    connectClock: (target, clock) => implementation.connectClock(target, clock),
    removeState: name => implementation.removeState(name),
    dispose: () => implementation.dispose(),
  });
  scopes.set(result, implementation); scopeHandles.set(implementation, result);
  return result;
}
function storeHandle(implementation) {
  if (storeHandles.has(implementation)) return storeHandles.get(implementation);
  const result = handle({
    createScope: () => scopeHandle(implementation.createScope()),
    transaction: run => implementation.transaction(run),
    subscribe: (selector, listener) => implementation.subscribe(selector, listener),
    writeBatch(changes, ...unsupported) {
      if (unsupported.length) fail('INVALID_DEFINITION');
      return implementation.writeBatch(changes);
    },
    registerReaction: (owner, declaration) => implementation.registerReaction(unwrap(scopes, owner), declaration),
    connectUrl: options => implementation.connectUrl(options),
    getDiagnostics: () => implementation.getDiagnostics(),
    dispose: () => implementation.dispose(),
  });
  stores.set(result, implementation); storeHandles.set(implementation, result);
  return result;
}
function viewHandle(implementation) {
  if (viewHandles.has(implementation)) return viewHandles.get(implementation);
  const result = handle({
    update: (spec, options) => implementation.update(spec, options),
    replace: target => implementation.replace(target),
    exportDefinition: () => implementation.exportDefinition(),
    getState: (name, instanceId) => implementation.getState(name, instanceId),
    getQuery: (name, instanceId) => implementation.getQuery(name, instanceId),
    getSnapshot: () => implementation.getSnapshot(),
    subscribe: listener => implementation.subscribe(listener),
    emit: (target, event, payload) => implementation.emit(target, event, payload),
    dispose: () => implementation.dispose(),
  });
  views.set(result, implementation); viewHandles.set(implementation, result);
  return result;
}
function authorization(callback) {
  if (callback === undefined) return undefined;
  if (typeof callback !== 'function') fail('INVALID_DEFINITION');
  return ({ operation, owner, definition }) => {
    if (operation === 'update') return callback({ operation, owner: viewHandle(owner), definition });
    if (!actionOwners.has(owner)) actionOwners.set(owner, handle({}));
    const { native: _implementation, ...contract } = definition;
    return callback({ operation, owner: actionOwners.get(owner), definition: Object.freeze(contract) });
  };
}

export const createRegistry = options => registryHandle(new Registry(options));
export const createStateStore = () => storeHandle(new StateStore());
export function createRuntime({ registry, stateStore, authorize, ...options } = {}) {
  const implementation = new Runtime({
    ...options, registry: unwrap(registries, registry),
    ...(stateStore === undefined ? {} : { stateStore: unwrap(stores, stateStore) }),
    authorize: authorization(authorize),
  });
  return handle({
    registry: registryHandle(implementation.registry),
    stateStore: storeHandle(implementation.stateStore),
    async createView(target) {
      const result = await implementation.createView(target);
      return { view: viewHandle(result.view), initialComplete: result.initialComplete };
    },
    invokeAction({ owner, ...request }) {
      const view = views.get(owner);
      if (!view) return Promise.reject(error('CANCELLED'));
      return implementation.invokeAction({ ...request, owner: view });
    },
    listResources: kind => implementation.listResources(kind),
    exportResource: (kind, id) => implementation.exportResource(kind, id),
    dispose: () => implementation.dispose(),
  });
}
