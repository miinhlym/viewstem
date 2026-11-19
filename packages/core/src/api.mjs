import { Registry } from './registry.mjs';
import { StateStore, isStateHandle } from './state.mjs';
import { Runtime } from './runtime.mjs';
import { isWrappedStateHandle, isQueryHandle } from './ports.mjs';
import { protect, trustedCopies } from './immutable.mjs';
import { normalize } from './values.mjs';
import { fail, safeError } from './errors.mjs';

// These handles delegate to the existing engine. They contain no execution state
// and never expose an implementation object, including through callbacks/chaining.
const registries = new WeakMap(), stores = new WeakMap(), scopes = new WeakMap(), views = new WeakMap();
const registryHandles = new WeakMap(), storeHandles = new WeakMap(), scopeHandles = new WeakMap(), viewHandles = new WeakMap();
const actionOwners = new WeakMap(), runtimes = new WeakMap();
const urlHandles = new WeakMap();
const handle = methods => Object.freeze(Object.assign(Object.create(null), methods));
const unwrap = (map, value) => map.get(value) ?? fail('INVALID_DEFINITION');

function registryHandle(implementation) {
  if (registryHandles.has(implementation)) return registryHandles.get(implementation);
  const result = handle({
    registerResources(resources) { implementation.registerResources(resources); return result; },
    registerResourceSet(set) { implementation.registerResourceSet(set); return result; },
    registerComponentContract(contract) { implementation.registerComponentContract(contract); return result; },
    registerComponentContracts(contracts) { implementation.registerComponentContracts(contracts); return result; },
    registerAction(...args) { implementation.registerAction(...args); return result; },
    updateResource(definition) { implementation.updateResource(definition); return result; },
    replaceResource(entry) { implementation.replaceResource(entry); return result; },
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
    connectUrl(options) {
      const connection = implementation.connectUrl(options);
      if (!urlHandles.has(connection)) urlHandles.set(connection, handle({
        ready: connection.ready, isReady: connection.isReady, restore: connection.restore,
        getDiagnostics: connection.getDiagnostics, removeOwned: connection.removeOwned, dispose: connection.dispose,
      }));
      return urlHandles.get(connection);
    },
    getDiagnostics: () => implementation.getDiagnostics(),
    dispose: () => implementation.dispose(),
  });
  stores.set(result, implementation); storeHandles.set(implementation, result);
  return result;
}
function viewHandle(implementation) {
  if (viewHandles.has(implementation)) return viewHandles.get(implementation);
  const result = Object.freeze(Object.defineProperty(Object.assign(Object.create(null), {
    setInputs: (inputs = {}, options) => updateView(implementation, undefined, options, inputs),
    updateDefinition: (spec, options) => updateView(implementation, spec, options),
    async applyResourceSets({ setIds, definition, inputs, states, signal } = {}) {
      try {
        if (!Array.isArray(setIds) || !setIds.length) fail('INVALID_DEFINITION');
        const ids = Array.from(setIds);
        if (ids.some(id => typeof id !== 'string' || !id)) fail('INVALID_DEFINITION');
        if (definition === null) fail('INVALID_DEFINITION');
        return await implementation.applyResourceSets({
          setIds: ids, definition: structuredClone(definition), signal,
          inputs: inputs === undefined ? undefined : copyInputs(inputs),
          states: states === undefined ? undefined : copyInputs(states),
        });
      } catch (cause) { throw safeError(cause, 'INVALID_DEFINITION'); }
    },
    async replace(source, options) {
      try { return await implementation.replace(viewTarget(source, options), options?.signal); }
      catch (cause) { throw safeError(cause, 'INVALID_DEFINITION'); }
    },
    whenSettled: application => implementation.whenSettled(application),
    async invokeAction(request) {
      return implementation.host.invokeAction({ ...actionRequest(request), owner: implementation });
    },
    exportDefinition: () => implementation.exportDefinition(),
    getState: (name, instanceId) => implementation.getState(name, instanceId),
    getQuery: (name, instanceId) => implementation.getQuery(name, instanceId),
    getSnapshot: () => implementation.getSnapshot(),
    subscribe: listener => implementation.subscribe(listener),
    emit: (target, event, payload) => implementation.emit(target, event, payload),
    dispose: () => implementation.dispose(),
  }), 'initial', { enumerable: true, get: () => implementation.firstApplication }));
  views.set(result, implementation); viewHandles.set(implementation, result);
  return result;
}
function authorization(callback) {
  if (callback === undefined) return undefined;
  if (typeof callback !== 'function') fail('INVALID_DEFINITION');
  return ({ operation, owner, definition, resource }) => {
    if (operation === 'update') return callback({ operation, owner: viewHandle(owner), definition });
    if (!actionOwners.has(owner)) actionOwners.set(owner, handle({}));
    return callback(Object.freeze({ operation, owner: actionOwners.get(owner), definition, resource }));
  };
}

const readAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
function checkSignal(signal) {
  if (signal === undefined) return;
  let aborted;
  try { aborted = readAborted.call(signal); }
  catch { fail('INVALID_DEFINITION', { location: '/signal' }); }
  if (aborted) fail('CANCELLED');
}
function actionRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || Object.keys(request).some(key => !['actionRef', 'action', 'inputs', 'signal'].includes(key))) fail('INVALID_DEFINITION');
  const { actionRef, action, inputs, signal } = request;
  checkSignal(signal);
  return { actionRef, action, inputs, signal };
}

export const createRegistry = options => registryHandle(new Registry(options));
export const createStateStore = () => storeHandle(new StateStore());
function copyInputs(inputs = {}) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) fail('INVALID_DEFINITION');
  return Object.fromEntries(Object.entries(inputs).map(([key, value]) => [
    key, isStateHandle(value) || isWrappedStateHandle(value) || isQueryHandle(value) || value === undefined ? value : protect(normalize(value, new WeakSet(), trustedCopies(value))),
  ]));
}

async function updateView(view, spec, options, replacementInputs) {
  try {
    const signal = options?.signal;
    checkSignal(signal);
    const inputs = replacementInputs === undefined ? options?.inputs : replacementInputs;
    const states = replacementInputs === undefined ? options?.states : undefined;
    return await view.update(spec, {
      inputs: inputs === undefined ? undefined : copyInputs(inputs),
      states: states === undefined ? undefined : copyInputs(states),
      signal,
    });
  } catch (cause) { throw safeError(cause, 'INVALID_DEFINITION'); }
}

function viewTarget(source, options) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) fail('INVALID_DEFINITION');
  const reference = Object.hasOwn(source, 'ref');
  const definition = Object.hasOwn(source, 'render');
  if (reference === definition || (reference && (typeof source.ref !== 'string' || Object.keys(source).length !== 1))) fail('INVALID_DEFINITION');
  const url = options?.url;
  return {
    ...(reference ? { viewRef: source.ref } : { view: structuredClone(source) }),
    inputs: copyInputs(options?.inputs),
    ...(url ? { url: { adapter: url.adapter, bindings: structuredClone(url.bindings), limits: structuredClone(url.limits) } } : {}),
  };
}

async function createView(runtime, source, options) {
  try {
    const view = await unwrap(runtimes, runtime).createView(viewTarget(source, options), options?.signal);
    return viewHandle(view);
  } catch (cause) { throw safeError(cause, 'INVALID_DEFINITION'); }
}

export function prepareOwnedView(runtime, source, options, beforeCommit) {
  try {
    const factory = typeof runtime === 'function' ? runtime : undefined;
    const implementation = factory === undefined ? unwrap(runtimes, runtime) : undefined;
    const target = viewTarget(source, options);
    return async (signal, owner = {}) => {
      let engine;
      try { engine = implementation ?? unwrap(runtimes, factory()); }
      catch (cause) { throw safeError(cause, 'INVALID_DEFINITION'); }
      return viewHandle(await engine.createView(target, signal, beforeCommit, { ...owner, signal }));
    };
  } catch (cause) { throw safeError(cause, 'INVALID_DEFINITION'); }
}

export function rendererView(view) { return unwrap(views, view); }
export function disposeRendererRuntime(runtime) { return unwrap(runtimes, runtime).dispose(); }
export function runtimeOwnsView(runtime, view) {
  const host = runtimes.get(runtime);
  return host !== undefined && views.get(view)?.host === host;
}

export function createRuntime({ registry, resources, componentContracts, functions, stateStore, authorize, ...options } = {}) {
  if (registry !== undefined && [resources, componentContracts, functions].some(value => value !== undefined)) fail('INVALID_DEFINITION');
  const implementation = new Runtime({
    ...options, registry: registry === undefined ? new Registry({ resources, componentContracts, functions }) : unwrap(registries, registry),
    ...(stateStore === undefined ? {} : { stateStore: unwrap(stores, stateStore) }),
    authorize: authorization(authorize),
  });
  const result = handle({
    registry: registryHandle(implementation.registry),
    stateStore: storeHandle(implementation.stateStore),
    createView: (source, options) => createView(result, source, options),
    async invokeAction(request) {
      return implementation.invokeAction(actionRequest(request));
    },
    dispose: () => implementation.dispose(),
  });
  runtimes.set(result, implementation);
  return result;
}
