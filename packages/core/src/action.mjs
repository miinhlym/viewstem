import { compileSchema } from './schema.mjs';
import { compilePorts, boundedState, boundedQuery, createQueryHandle } from './ports.mjs';
import { protect, trustedCopies } from './immutable.mjs';
import { evaluate as evaluateValue, pointerKeys, validateTemplate, dataEntries } from './expressions.mjs';
import { safeError, error as failure } from './errors.mjs';

// Sequential execution shares the registry, Store, value evaluator and owner lifetimes.
const own = (o, k) => Object.hasOwn(o, k);
const publicError = safeError;
const die = (code, fields) => { throw failure(code, fields); };
const ready = data => Object.freeze({ status: 'success', running: false, data, error: null });
const idle = () => Object.freeze({ status: 'idle', running: false, data: null, error: null });
const inert = Object.freeze({ status: 'running', running: true, data: null, error: null });
const supported = new Set(['Query', 'Variable', 'Action', 'SetState', 'RefreshQuery', 'If', 'Assert']);
const refs = { Query: 'queryRef', Variable: 'variableRef', Action: 'actionRef' };

export class ActionEngine {
  #cache = new WeakMap();
  #registry; #onChange;
  #owners = new WeakMap();
  #query; #variable; #store; #authorize; #capabilities;
  #native = new WeakMap();
  #resources = new WeakMap();
  constructor({ registry, store, capabilities = {}, query = async () => die('REFERENCE_NOT_FOUND'), variable = async () => die('REFERENCE_NOT_FOUND'), authorize = () => true, onChange = () => {} }) {
    this.#registry = registry; this.#onChange = onChange; this.#store = store; this.#query = query; this.#variable = variable; this.#authorize = authorize;
    this.#capabilities = capabilities;
  }
  definition(reference, spec, registry = this.#registry) {
    if (reference !== undefined) {
      const resource = registry.get('Action', reference);
      let cache = this.#cache.get(registry);
      if (!cache) this.#cache.set(registry, cache = new WeakMap());
      if (!cache.has(resource)) {
        const definition = Object.freeze({ ...resource.spec });
        cache.set(resource, definition);
        this.#resources.set(definition, Object.freeze({ kind: 'Action', id: resource.id }));
        if (registry.isCode('Action', reference)) this.#native.set(definition, {
          implementation: registry.implementation('Action', reference), requirements: registry.actionRequirements(reference), reference,
        });
      }
      return cache.get(resource);
    }
    registry.validateDefinition('Action',spec);return protect(structuredClone(spec));
  }
  owner(isOpen = () => true, signal, onCleanupError) {
    const state = { alive: true, isOpen, signal, onCleanupError, connections: new Set(), ids: new Map(), calls: new Set() }, probe = this;
    const owner = Object.freeze({ dispose() {
      if (!state.alive) return; state.alive = false;
      for (const connection of [...state.connections]) connection.dispose();
      for (const call of state.calls) call.abort();
    }, getSnapshot(id) { const item = state.ids.get(id); if (!item) die('REFERENCE_NOT_FOUND'); return item.getSnapshot(); } });
    probe.#owners.set(owner, state); return owner;
  }
  connect(owner, { id, actionRef, spec, inputs = {}, registry = this.#registry, isOpen = () => true }) {
    const state = this.#owners.get(owner);
    if (!state?.alive) die('CANCELLED');
    if ((actionRef !== undefined) === (spec !== undefined)) die('INVALID_DEFINITION');
    if (id !== undefined && (typeof id !== 'string' || !id || state.ids.has(id))) die('INVALID_DEFINITION');
    const initial = this.definition(actionRef, spec, registry);
    let alive = true, snapshot = idle(), active = null;
    const connection = Object.freeze({ getSnapshot: () => snapshot,
      invoke: (supplied, canStart = () => true, configuration = registry) => {
        if (!alive || !state.alive || !state.isOpen() || !isOpen() || !canStart()) return Promise.reject(failure('CANCELLED'));
        if (active) return Promise.resolve(undefined); // Ignore, without queue or join.
        const definition = configuration === registry ? initial : this.definition(actionRef, spec, configuration);
        const controller = new AbortController(); state.calls.add(controller);
        const call = { controller }; active = call;
        const previous = snapshot;
        let cancelledBeforeStart = false;
        const complete = next => {
          state.calls.delete(controller);
          if (active !== call) return;
          // Publishing the terminal snapshot can synchronously start another call.
          active = null;
          if (!alive || !state.isOpen() || !isOpen()) return;
          snapshot = next;
          this.#onChange();
        };
        const promise = this.#invoke(configuration, definition, supplied ?? inputs, owner, controller.signal, [], isOpen, () => {
          if (canStart()) return true;
          cancelledBeforeStart = true;
          return false;
        }, () => {
          snapshot = inert;
          this.#onChange();
        });
        return promise.then(value => {
          complete(ready(value === undefined ? null : value));
          return value;
        }, cause => {
          const error = publicError(cause);
          complete(cancelledBeforeStart ? previous : Object.freeze({ status: 'error', running: false, data: null, error }));
          throw error;
        });
      },
      dispose: () => { if (!alive) return; alive = false; active?.controller.abort(); state.connections.delete(connection); if (id !== undefined && state.ids.get(id) === connection) state.ids.delete(id); },
    });
    state.connections.add(connection); if (id !== undefined) state.ids.set(id, connection);
    return connection;
  }
  invoke(owner, actionRef, inputs = {}, action, registry = this.#registry, signal) {
    const state = this.#owners.get(owner), definition = this.definition(actionRef, action, registry);
    if (!state?.alive) return Promise.reject(failure('CANCELLED'));
    if (!definition) return Promise.reject(failure('REFERENCE_NOT_FOUND'));
    const controller = new AbortController();
    const callSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    state.calls.add(controller);
    return this.#invoke(registry, definition, inputs, owner, callSignal, []).catch(error => { throw publicError(error); }).finally(() => state.calls.delete(controller));
  }
  async #invoke(registry, definition, supplied, owner, callSignal, stack, connectionOpen = () => true, canStart = () => true, onStart) {
    const state = this.#owners.get(owner);
    const signal = state?.signal ? AbortSignal.any([callSignal, state.signal]) : callSignal;
    const isOpen = () => !signal.aborted && state?.alive && state.isOpen() && connectionOpen();
    const check = () => { if (!isOpen()) die('CANCELLED'); };
    const checkStart = () => { check(); if (!canStart()) die('CANCELLED'); };
    checkStart(); if (stack.includes(definition)) die('ACTION_RECURSION');
    let authorized;
    try { authorized = this.#authorize({ owner, definition, resource: this.#resources.get(definition) ?? null }); }
    catch (cause) { checkStart(); throw cause; }
    checkStart();
    if (authorized !== true) die('EXECUTION_BLOCKED');
    let acceptingChildren = true;
    const childController = new AbortController();
    const abortChildren = () => childController.abort();
    signal.addEventListener('abort', abortChildren, { once: true });
    const invokeAction = request => {
      const promise = (async () => {
        check(); if (!acceptingChildren) die('CANCELLED');
        if (!request || typeof request !== 'object' || Array.isArray(request)
          || Object.keys(request).some(key => !['actionRef', 'action', 'inputs'].includes(key))
          || own(request, 'actionRef') === own(request, 'action')) die('INVALID_DEFINITION');
        let child;
        if (own(request, 'actionRef')) {
          if (typeof request.actionRef !== 'string' || !request.actionRef) die('INVALID_DEFINITION');
          child = this.definition(request.actionRef, undefined, registry);
          if (!child) die('REFERENCE_NOT_FOUND');
        } else {
          child = this.definition(undefined,request.action,registry);
        }
        return this.#invoke(registry, child, own(request, 'inputs') ? request.inputs : {}, owner, childController.signal, [...stack, definition], connectionOpen);
      })().catch(error => { throw publicError(error); });
      // A forgotten await still gets cancelled with its parent; do not turn that
      // cleanup into an unhandled rejection. Awaiting retains the original error.
      void promise.catch(() => {});
      return promise;
    };
    try {
      let ports;
      try {
        const input = typeof supplied === 'function' ? supplied() : supplied;
        const prepared = compilePorts({ resourceKind: 'Action', ports: definition.ports ?? {}, types:registry.types(), store: this.#store }).prepare(input, { mode: 'explicit' });
        ports = prepared.ports;
      } catch (error) {
        const clean = safeError(error); let input;
        try { const value = Object.getOwnPropertyDescriptor(error, 'input')?.value; if (typeof value === 'string') input = value; } catch {}
        throw failure(clean.code, { location: '/inputs', ...(input === undefined ? {} : { input }), cause: clean });
      }
      const bounded = Object.create(null);
      for (const [name, value] of Object.entries(ports)) {
        const kind = definition.ports[name]?.kind;
        if (kind === 'State') bounded[name] = boundedState(value, check);
        else if (kind === 'Query') {
          // Reconnected child handles retain every ancestor guard, and the
          // innermost caller's cancellation must also reach its Query ticket.
          const requestSignal = childSignal => childSignal && childSignal !== signal ? AbortSignal.any([signal, childSignal]) : signal;
          bounded[name] = boundedQuery(createQueryHandle({ getSnapshot: () => value.getSnapshot(),
            refresh: childSignal => value.refresh(requestSignal(childSignal)), retry: childSignal => value.retry(requestSignal(childSignal)) }, value), check);
        }
        else bounded[name] = value;
      }
      Object.freeze(bounded);
      const awaitCurrent = promise => {
        // The callback may synchronously remove its own connection before
        // returning a Promise. Consume late rejection even when check() throws.
        const current = Promise.resolve(promise); void current.catch(() => {});
        check(); let abort;
        const cancelled = new Promise((_, reject) => { abort = () => reject(failure('CANCELLED')); signal.addEventListener('abort', abort, { once: true }); });
        return Promise.race([current, cancelled]).then(value => { check(); return value; }).finally(() => signal.removeEventListener('abort', abort));
      };
      const evaluate = (template, steps) => evaluateValue(template, {
        functions:registry.functions,
        resolve(keys) {
          const [root,name] = keys;
          if (root === 'ports') {
            if(keys.length===1)return {value:Object.fromEntries(Object.entries(bounded).map(([key,value])=>[key,definition.ports[key].kind==='State'?value?.read():definition.ports[key].kind==='Query'?value?.getSnapshot():value])),offset:1};
            if (!own(definition.ports ?? {},name)) die('REFERENCE_NOT_FOUND');
            const value=bounded[name],kind=definition.ports[name].kind;
            return {value:kind === 'State' ? value?.read() : kind === 'Query' ? value?.getSnapshot() : value,offset:2};
          }
          if(root === 'steps') { if(keys.length===1)return {value:steps,offset:1};if(!own(steps,name))die('REFERENCE_NOT_FOUND');return {value:steps[name],offset:2}; }
          die('REFERENCE_NOT_FOUND');
        }
      }, {roots:['ports','steps']});
      const target = (expression, kind) => {
        if (!expression || Object.keys(expression).length !== 1 || !own(expression, '@path')) die('TYPE_MISMATCH');
        const keys = pointerKeys(expression['@path']);
        if (keys.length !== 2 || keys[0] !== 'ports' || definition.ports[keys[1]]?.kind !== kind || !own(bounded, keys[1])) die('REFERENCE_NOT_FOUND');
        return bounded[keys[1]];
      };
      const execute = async (steps, inherited = {}, location = '/steps') => {
        const completed = Object.assign(Object.create(null), inherited);
        for (let index = 0; index < steps.length; index++) {
          check(); const step = steps[index]; let output;
          try {
            if (step.kind === 'If' || step.kind === 'Assert') {
              const condition = await evaluate(step.condition, completed); check();
              if (typeof condition !== 'boolean') die('TYPE_MISMATCH');
              if (step.kind === 'If') await execute(condition ? step.then : step.else ?? [], completed, `${location}/${index}/${condition ? 'then' : 'else'}`);
              else if (!condition) {
                const message = own(step, 'message') ? await evaluate(step.message, completed) : 'Assertion failed';
                if (typeof message !== 'string') die('TYPE_MISMATCH');
                die('ASSERTION_FAILED', { message });
              }
            } else if (step.kind === 'SetState') target(step.target, 'State').write(await evaluate(step.value, completed));
            else if (step.kind === 'RefreshQuery') await awaitCurrent(target(step.target, 'Query').refresh());
            else {
              // Inputs for State/Query child ports preserve the capability itself.
              const child = step.kind === 'Action' ? (own(step, 'actionRef') ? this.definition(step.actionRef, undefined, registry) : step.spec) : null;
              const inputs = Object.create(null);
              const whole=step.inputs&&Object.hasOwn(step.inputs,'@path')||step.inputs&&Object.hasOwn(step.inputs,'@call');
              if(whole)Object.assign(inputs,evaluate(step.inputs,completed));
              for (const [name, template] of dataEntries(whole?{}:step.inputs ?? {})) {
                const kind = child?.ports?.[name]?.kind;
                inputs[name] = kind === 'State' || kind === 'Query' ? target(template, kind) : await evaluate(template, completed);
              }
              check();
              if (step.kind === 'Action') output = await awaitCurrent(this.#invoke(registry, child, inputs, owner, callSignal, [...stack, definition], connectionOpen));
              else {
                output = await awaitCurrent((step.kind === 'Query' ? this.#query : this.#variable)({
                  registry, reference: step[refs[step.kind]], spec: step.spec, inputs, signal, isOpen, onCleanupError: state.onCleanupError,
                }));
              }
            }
            check(); if (output !== undefined && own(step, 'id')) completed[step.id] = protect(compileSchema(true).accept(output, trustedCopies(output)));
          } catch (error) { const clean = publicError(error); throw failure(clean.code, { message: clean.message, location: `${location}/${index}`, cause: clean }); }
        }
        return completed;
      };
      let output;
      checkStart();
      const native = this.#native.get(definition);
      const capabilities = Object.create(null);
      if (native) for (const name of native.requirements) {
        if (!own(this.#capabilities, name) || this.#capabilities[name] === undefined) {
          die('REFERENCE_NOT_FOUND', {
            location: `/capabilities/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`,
            resource: { kind: 'Action', id: native.reference },
          });
        }
        capabilities[name] = this.#capabilities[name];
      }
      onStart?.();
      checkStart();
      if (native) output = await awaitCurrent(native.implementation(Object.freeze({ inputs: bounded, signal, invokeAction, capabilities: Object.freeze(capabilities) })));
      else {
        const steps = await execute(definition.steps);
        check(); if (definition.output) output = await evaluate(definition.output.value, steps);
      }
      check();
      if (!definition.output) { if (native && output !== undefined) die('TYPE_MISMATCH'); return undefined; }
      try { return protect(registry.validator(definition.output).accept(output, trustedCopies(output))); }
      catch { die('TYPE_MISMATCH', { location: '/output' }); }
    } catch (cause) {
      check();
      throw cause;
    } finally {
      acceptingChildren = false;
      signal.removeEventListener('abort', abortChildren);
      abortChildren();
    }
  }
}
