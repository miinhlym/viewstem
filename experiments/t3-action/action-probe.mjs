import { compileSchema } from '../t1-values/schema-runtime.mjs';
import { compilePorts, boundedState, boundedQuery, queryFixture } from '../t3-state/ports-probe.mjs';
import { protect, trustedCopies } from '../t3-state/immutable.mjs';
import { createValueEvaluator, pointerKeys, validateTemplate } from '../t2-http-boundary/value-expressions.mjs';
import { safeError } from '../verification/errors.mjs';

// Independent sequence/lifetime model. Functions and Query/Variable hooks are
// trusted fixture adapters, not extra operations in the declaration language.
const own = (o, k) => Object.hasOwn(o, k);
const trustedErrors = new WeakSet();
function failure(code, fields = {}) { const result = Object.freeze({ code, message: code, ...fields }); trustedErrors.add(result); return result; }
function publicError(error) { return error && typeof error === 'object' && trustedErrors.has(error) ? error : safeError(error); }
const die = (code, fields) => { throw failure(code, fields); };
const ready = data => Object.freeze({ status: 'success', running: false, data, error: null });
const idle = () => Object.freeze({ status: 'idle', running: false, data: null, error: null });
const inert = Object.freeze({ status: 'running', running: true, data: null, error: null });
const supported = new Set(['Query', 'Variable', 'Action', 'SetState', 'RefreshQuery', 'If', 'Assert']);
const refs = { Query: 'queryRef', Variable: 'variableRef', Action: 'actionRef' };

export class ActionProbe {
  #definitions = new Map();
  #owners = new WeakMap();
  #query; #variable; #store; #authorize;
  constructor({ store, query = async () => die('REFERENCE_NOT_FOUND'), variable = async () => die('REFERENCE_NOT_FOUND'), authorize = () => true }) {
    this.#store = store; this.#query = query; this.#variable = variable; this.#authorize = authorize;
  }
  register(entries) {
    const next = new Map(this.#definitions);
    for (const [id, definition] of entries) { if (next.has(id)) die('INVALID_DEFINITION'); next.set(id, definition); }
    const active = new Set(), done = new Set();
    const visit = definition => {
      if (active.has(definition)) die('ACTION_RECURSION'); if (done.has(definition)) return;
      active.add(definition);
      if (!definition || typeof definition !== 'object' || own(definition, 'catch') || own(definition, 'finally')) die('INVALID_DEFINITION');
      compilePorts({ resourceKind: 'Action', ports: definition.ports ?? {}, store: this.#store });
      if (definition.output) {
        compileSchema(definition.output.schema);
        if (!definition.native && !own(definition.output, 'value')) die('INVALID_DEFINITION');
        if (!definition.native) validateTemplate(definition.output.value);
      }
      const walk = steps => {
        if (!Array.isArray(steps)) die('INVALID_DEFINITION');
        const ids = new Set();
        for (const step of steps) {
          if (!step || !supported.has(step.kind) || own(step, 'catch') || own(step, 'finally')) die('INVALID_DEFINITION');
          if (own(step, 'id')) { if (typeof step.id !== 'string' || !step.id || ids.has(step.id)) die('INVALID_DEFINITION'); ids.add(step.id); }
          const ref = refs[step.kind];
          if (ref) {
            if (own(step, ref) === own(step, 'spec')) die('INVALID_DEFINITION');
            if (step.kind === 'Action') {
              const child = own(step, ref) ? next.get(step[ref]) : step.spec;
              if (own(step, 'spec') && child && own(child, 'native')) die('INVALID_DEFINITION');
              if (!child) die('REFERENCE_NOT_FOUND'); visit(child);
            }
            validateTemplate(step.inputs ?? {});
          } else if (step.kind === 'If') { if (!own(step, 'condition')) die('INVALID_DEFINITION'); validateTemplate(step.condition); walk(step.then); if (own(step, 'else')) walk(step.else); }
          else if (step.kind === 'Assert') { if (!own(step, 'condition')) die('INVALID_DEFINITION'); validateTemplate(step.condition); if (own(step, 'message')) validateTemplate(step.message); }
          else {
            if (!own(step, 'target')) die('INVALID_DEFINITION'); validateTemplate(step.target);
            if (step.kind === 'SetState') { if (!own(step, 'value')) die('INVALID_DEFINITION'); validateTemplate(step.value); }
          }
        }
      };
      if (definition.native) { if (typeof definition.native !== 'function' || own(definition, 'steps')) die('INVALID_DEFINITION'); }
      else walk(definition.steps);
      active.delete(definition); done.add(definition);
    };
    for (const definition of next.values()) visit(definition);
    // Preserve trusted function capabilities while snapshotting the JSON declaration.
    const clone = value => typeof value === 'function' ? value : Array.isArray(value) ? value.map(clone)
      : value && typeof value === 'object' ? Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]))) : value;
    // Adding an unrelated definition must not change an active definition's
    // identity and thereby erase it from the dynamic recursion stack.
    this.#definitions = new Map([...next].map(([key, value]) => [key, this.#definitions.get(key) ?? clone(value)]));
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
    let definition = actionRef !== undefined ? this.#definitions.get(actionRef) : spec;
    if (!definition) die('REFERENCE_NOT_FOUND');
    if (spec !== undefined) {
      if (own(spec, 'native')) die('INVALID_DEFINITION');
      const temporary = new ActionProbe({ store: this.#store, query: this.#query, variable: this.#variable, authorize: this.#authorize }), key = Symbol('inline-fixture');
      temporary.#definitions = new Map(this.#definitions); temporary.register([[key, spec]]); definition = temporary.#definitions.get(key);
    }
    let alive = true, snapshot = idle(), active = null;
    const connection = Object.freeze({ snapshot: () => snapshot,
      invoke: () => {
        if (!alive || !state.alive) return Promise.reject(failure('CANCELLED'));
        if (active) return Promise.resolve(undefined); // Ignore, without queue or join.
        snapshot = inert;
        const controller = new AbortController(); state.calls.add(controller);
        const call = { controller }; active = call;
        const promise = this.#invoke(definition, inputs, owner, controller, []);
        return promise.then(value => {
          if (alive && active === call) snapshot = ready(value === undefined ? null : value);
          return value;
        }, error => {
          if (alive && active === call) snapshot = Object.freeze({ status: 'error', running: false, data: null, error: publicError(error) });
          throw publicError(error);
        }).finally(() => { state.calls.delete(controller); if (active === call) active = null; });
      },
      dispose: () => { if (!alive) return; alive = false; active?.controller.abort(); state.connections.delete(connection); if (id !== undefined && state.ids.get(id) === connection) state.ids.delete(id); },
    });
    state.connections.add(connection); if (id !== undefined) state.ids.set(id, connection);
    return connection;
  }
  invoke(owner, actionRef, inputs = {}) {
    const state = this.#owners.get(owner), definition = this.#definitions.get(actionRef);
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
          child = this.#definitions.get(request.actionRef);
          if (!child) die('REFERENCE_NOT_FOUND');
        } else {
          // Native implementations are registered separately; inline is declarative.
          if (!request.action || own(request.action, 'native')) die('INVALID_DEFINITION');
          const temporary = new ActionProbe({ store: this.#store, query: this.#query, variable: this.#variable, authorize: this.#authorize });
          const key = Symbol('child-inline-fixture');
          temporary.#definitions = new Map(this.#definitions); temporary.register([[key, request.action]]);
          child = temporary.#definitions.get(key);
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
        const prepared = compilePorts({ resourceKind: 'Action', ports: definition.ports ?? {}, store: this.#store }).prepare(input, { mode: 'explicit' });
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
          bounded[name] = boundedQuery(queryFixture({ snapshot: () => value.snapshot(),
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
      const values = Object.create(null);
      for (const name of Object.keys(definition.ports ?? {})) Object.defineProperty(values, name, { enumerable: true, get() {
        const value = bounded[name]; if (value === undefined) return undefined;
        if (definition.ports[name]?.kind === 'State') return value.read();
        if (definition.ports[name]?.kind === 'Query') return value.snapshot();
        return value;
      } });
      const evaluate = (template, steps) => {
        if (template && typeof template === 'object' && own(template, '@path')) {
          const keys = pointerKeys(template['@path']);
          if (keys[0] === 'steps' && !own(steps, keys[1])) die('REFERENCE_NOT_FOUND');
        }
        return createValueEvaluator(check)(template, { values: { ports: values, steps } });
      };
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
              const child = step.kind === 'Action' ? (own(step, 'actionRef') ? this.#definitions.get(step.actionRef) : step.spec) : null;
              const inputs = Object.create(null);
              for (const [name, template] of Object.entries(step.inputs ?? {})) {
                const kind = child?.ports?.[name]?.kind;
                inputs[name] = kind === 'State' || kind === 'Query' ? target(template, kind) : await evaluate(template, completed);
              }
              if (step.kind === 'Action') output = await awaitCurrent(this.#invoke(child, inputs, owner, controller, [...stack, definition]));
              else {
                const toJSON = value => value instanceof Set ? [...value].map(toJSON) : value instanceof Map ? [...value].map(([k, v]) => [k, toJSON(v)])
                  : Array.isArray(value) ? value.map(toJSON) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJSON(v)])) : value;
                const callbackInputs = step.kind === 'Query' ? toJSON(inputs) : inputs;
                output = await awaitCurrent((step.kind === 'Query' ? this.#query : this.#variable)({ reference: step[refs[step.kind]], spec: step.spec, inputs: callbackInputs, signal }));
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
      try { return protect(compileSchema(definition.output.schema).accept(output, trustedCopies(output))); }
      catch { die('TYPE_MISMATCH', { location: '/output' }); }
    } finally {
      acceptingChildren = false;
      signal.removeEventListener('abort', abortChildren);
      abortChildren();
    }
  }
}
