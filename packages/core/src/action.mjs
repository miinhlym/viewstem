import { compileSchema } from './schema.mjs';
import { compilePorts, boundedState, boundedQuery, createQueryHandle } from './ports.mjs';
import { protect, trustedCopies } from './immutable.mjs';
import { evaluate as evaluateValue, pointerKeys, validateTemplate } from './expressions.mjs';
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
  #query; #variable; #store; #authorize;
  constructor({ registry, store, query = async () => die('REFERENCE_NOT_FOUND'), variable = async () => die('REFERENCE_NOT_FOUND'), authorize = () => true, onChange = () => {} }) {
    this.#registry = registry; this.#onChange = onChange; this.#store = store; this.#query = query; this.#variable = variable; this.#authorize = authorize;
  }
  definition(reference, spec) {
    if (reference !== undefined) {
      const resource = this.#registry.get('Action',reference);
      if (!this.#cache.has(resource)) this.#cache.set(resource, Object.freeze({...resource.spec,
        ...(this.#registry.isCode('Action',reference) ? {native:this.#registry.implementation('Action',reference)} : {})}));
      return this.#cache.get(resource);
    }
    this.#registry.validateDefinition('Action',spec);return spec;
  }
  owner() {
    const state = { alive: true, connections: new Set(), ids: new Map(), calls: new Set() }, probe = this;
    const owner = Object.freeze({ dispose() {
      if (!state.alive) return; state.alive = false;
      for (const connection of [...state.connections]) connection.dispose();
      for (const call of state.calls) call.abort();
    }, snapshot(id) { const item = state.ids.get(id); if (!item) die('REFERENCE_NOT_FOUND'); return item.snapshot(); } });
    probe.#owners.set(owner, state); return owner;
  }
  connect(owner, { id, actionRef, spec, inputs = {} }) {
    const state = this.#owners.get(owner);
    if (!state?.alive) die('CANCELLED');
    if ((actionRef !== undefined) === (spec !== undefined)) die('INVALID_DEFINITION');
    if (id !== undefined && (typeof id !== 'string' || !id || state.ids.has(id))) die('INVALID_DEFINITION');
    let definition = actionRef !== undefined ? this.definition(actionRef) : spec;
    if (!definition) die('REFERENCE_NOT_FOUND');
    if (spec !== undefined) definition = this.definition(undefined,spec);
    let alive = true, snapshot = idle(), active = null;
    const connection = Object.freeze({ snapshot: () => snapshot,
      invoke: supplied => {
        if (!alive || !state.alive) return Promise.reject(failure('CANCELLED'));
        if (active) return Promise.resolve(undefined); // Ignore, without queue or join.
        const controller = new AbortController(); state.calls.add(controller);
        const call = { controller }; active = call;
        snapshot = inert; this.#onChange();
        const promise = this.#invoke(definition, supplied ?? inputs, owner, controller, []);
        return promise.then(value => {
          if (alive && active === call) { snapshot = ready(value === undefined ? null : value); this.#onChange(); }
          return value;
        }, error => {
          if (alive && active === call) { snapshot = Object.freeze({ status: 'error', running: false, data: null, error: publicError(error) }); this.#onChange(); }
          throw publicError(error);
        }).finally(() => { state.calls.delete(controller); if (active === call) active = null; });
      },
      dispose: () => { if (!alive) return; alive = false; active?.controller.abort(); state.connections.delete(connection); if (id !== undefined && state.ids.get(id) === connection) state.ids.delete(id); },
    });
    state.connections.add(connection); if (id !== undefined) state.ids.set(id, connection);
    return connection;
  }
  invoke(owner, actionRef, inputs = {}, action) {
    const state = this.#owners.get(owner), definition = this.definition(actionRef, action);
    if (!state?.alive) return Promise.reject(failure('CANCELLED'));
    if (!definition) return Promise.reject(failure('REFERENCE_NOT_FOUND'));
    const controller = new AbortController(); state.calls.add(controller);
    return this.#invoke(definition, inputs, owner, controller, []).catch(error => { throw publicError(error); }).finally(() => state.calls.delete(controller));
  }
  async #invoke(definition, supplied, owner, controller, stack) {
    const state = this.#owners.get(owner), signal = controller.signal;
    const check = () => { if (signal.aborted || !state?.alive) die('CANCELLED'); };
    check(); if (stack.includes(definition)) die('ACTION_RECURSION');
    if (this.#authorize({ owner, definition }) !== true) die('EXECUTION_BLOCKED');
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
          child = this.definition(request.actionRef);
          if (!child) die('REFERENCE_NOT_FOUND');
        } else {
          child = this.definition(undefined,request.action);
        }
        return this.#invoke(child, own(request, 'inputs') ? request.inputs : {}, owner, childController, [...stack, definition]);
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
        const prepared = compilePorts({ resourceKind: 'Action', ports: definition.ports ?? {}, types:this.#registry.types(), store: this.#store }).prepare(input, { mode: 'explicit' });
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
          bounded[name] = boundedQuery(createQueryHandle({ snapshot: () => value.snapshot(),
            refresh: childSignal => value.refresh(requestSignal(childSignal)), retry: childSignal => value.retry(requestSignal(childSignal)) }), check);
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
        functions:this.#registry.functions,
        resolve(keys) {
          const [root,name] = keys;
          if (root === 'ports') {
            if(keys.length===1)return {value:Object.fromEntries(Object.entries(bounded).map(([key,value])=>[key,definition.ports[key].kind==='State'?value?.read():definition.ports[key].kind==='Query'?value?.snapshot():value])),offset:1};
            if (!own(definition.ports ?? {},name)) die('REFERENCE_NOT_FOUND');
            const value=bounded[name],kind=definition.ports[name].kind;
            return {value:kind === 'State' ? value?.read() : kind === 'Query' ? value?.snapshot() : value,offset:2};
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
              const child = step.kind === 'Action' ? (own(step, 'actionRef') ? this.definition(step.actionRef) : step.spec) : null;
              const inputs = Object.create(null);
              const whole=step.inputs&&Object.hasOwn(step.inputs,'@path')||step.inputs&&Object.hasOwn(step.inputs,'@call');
              if(whole)Object.assign(inputs,evaluate(step.inputs,completed));
              for (const [name, template] of Object.entries(whole?{}:step.inputs ?? {})) {
                const kind = child?.ports?.[name]?.kind;
                inputs[name] = kind === 'State' || kind === 'Query' ? target(template, kind) : await evaluate(template, completed);
              }
              if (step.kind === 'Action') output = await awaitCurrent(this.#invoke(child, inputs, owner, controller, [...stack, definition]));
              else {
                output = await awaitCurrent((step.kind === 'Query' ? this.#query : this.#variable)({ reference: step[refs[step.kind]], spec: step.spec, inputs, signal }));
              }
            }
            check(); if (output !== undefined && own(step, 'id')) completed[step.id] = protect(compileSchema(true).accept(output, trustedCopies(output)));
          } catch (error) { const clean = publicError(error); throw failure(clean.code, { message: clean.message, location: `${location}/${index}`, cause: clean }); }
        }
        return completed;
      };
      let output;
      if (definition.native) output = await awaitCurrent(definition.native(Object.freeze({ inputs: bounded, signal, invokeAction })));
      else {
        const steps = await execute(definition.steps);
        check(); if (definition.output) output = await evaluate(definition.output.value, steps);
      }
      check();
      if (!definition.output) { if (definition.native && output !== undefined) die('TYPE_MISMATCH'); return undefined; }
      try { return protect(this.#registry.validator(definition.output).accept(output, trustedCopies(output))); }
      catch { die('TYPE_MISMATCH', { location: '/output' }); }
    } finally {
      acceptingChildren = false;
      signal.removeEventListener('abort', abortChildren);
      abortChildren();
    }
  }
}
