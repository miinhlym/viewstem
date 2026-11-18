import { Registry } from './registry.mjs';
import { prepareUrlConnection } from './url.mjs';
import { StateStore, createStateStore } from './state.mjs';
import { compilePorts, expression, createQueryHandle, sameContract, stateRoot } from './ports.mjs';
import { compileSchema, equal } from './schema.mjs';
import { protect, trustedCopies } from './immutable.mjs';
import { evaluate, evaluateSnapshot, readSnapshot, pathsIn, validateInitials, pointerKeys, isRecord, expressionKind, dataEntries } from './expressions.mjs';
import { compileCel } from './cel/index.mjs';
import { createQueryEngine } from './query/index.mjs';
import { createHttpExecutor } from './http/index.mjs';
import { ActionEngine } from './action.mjs';
import { fail, error, safeError } from './errors.mjs';
import { createDiagnostic } from './diagnostics.mjs';
const own=(object,key)=>Object.hasOwn(object,key);
const tuple=JSON.stringify;
let nextLifetime=0,nextInstance=0;
const idle=Object.freeze({status:'idle',running:false,data:null,error:null});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  promise.catch(() => {});
  return { promise, resolve, reject };
};

function abortable(value, signal) {
  return new Promise((resolve, reject) => {
    const finish = (callback, result) => {
      signal.removeEventListener('abort', abort);
      callback(result);
    };
    const abort = () => finish(reject, error('CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    Promise.resolve(value).then(result => finish(resolve, result), cause => finish(reject, cause));
  });
}
const applications = new WeakMap();
const retryRegistry = Symbol('retry Registry');

export class Runtime {
  constructor({registry,stateStore,requestExecutor,resourceResolver,authorize,functions,hostCapabilities = {},requestTimeoutMs,clock,urlCleanupTimeoutMs=30000}={}) {
    if(!(registry instanceof Registry) || (stateStore!==undefined && !(stateStore instanceof StateStore)))fail('INVALID_DEFINITION');
    if (!Number.isSafeInteger(urlCleanupTimeoutMs) || urlCleanupTimeoutMs <= 0) fail('INVALID_DEFINITION');
    if (!isRecord(hostCapabilities)) fail('INVALID_DEFINITION');
    Object.assign(this,{registry,stateStore:stateStore??createStateStore(),resourceResolver,authorize,functions,clock,urlCleanupTimeoutMs});
    this.functions=(functions??registry.functions).map(definition => ({ ...definition,
      run: (...args) => this.stateStore.runPureCallback(() => definition.run(...args)),
    }));this.ownsStore=stateStore===undefined;this.views=new Set();this.variables=new WeakMap();this.alive=true;
    this.requestExecutor=requestExecutor??createHttpExecutor({requestTimeoutMs});this.requestTimeoutMs=requestTimeoutMs;
    this.capabilities = Object.freeze(Object.fromEntries(Object.entries(hostCapabilities)));
    this.configureExecution();
    this.actionOwner = this.actions.owner(() => this.alive);
  }
  preparing = false;
  prepare(run) {
    const previous = this.preparing;
    this.preparing = true;
    try { return run(); }
    finally { this.preparing = previous; }
  }
  authorizeUpdate(owner, definition) {
    if (this.authorize && this.prepare(() => this.authorize({ operation: 'update', owner, definition: structuredClone(definition) })) !== true) fail('EXECUTION_BLOCKED');
  }
  configureExecution() {
    const {registry,stateStore,authorize,clock,requestTimeoutMs}=this;
    this.query=createQueryEngine({registry,functions:this.functions,requestExecutor:this.requestExecutor,...(requestTimeoutMs===undefined?{}:{requestTimeoutMs}),clock});
    this.actions=new ActionEngine({registry,store:stateStore,capabilities:this.capabilities,authorize:authorize?context=>authorize({operation:'invoke',...context}):undefined,
      query:({registry,reference,spec,inputs,signal,isOpen,onCleanupError})=>this.query.execute(reference??{query:spec},{registry,inputs,signal,isOpen,onCleanupError}),
      variable:({registry,reference,spec,inputs})=>this.variable(reference??spec,inputs,registry),
      onChange:()=>{for(const view of this.views)view.refresh();}});
  }
  execution(registry) {
    const execution=Object.create(this);execution.registry=registry;return execution;
  }
  variable(use,inputs={},registry=this.registry) {
    const spec=typeof use==='string'?registry.get('Variable',use).spec:use;
    let variables = this.variables.get(registry);
    if (!variables) this.variables.set(registry, variables = new WeakMap());
    if(!variables.has(spec)) {
      const schemas=Object.fromEntries(Object.entries(spec.ports??{}).map(([name,port])=>[name,registry.schema(port)]));
      variables.set(spec,compileCel(spec.expression,{inputs:schemas,functions:this.functions}));
    }
    const prepared=compilePorts({resourceKind:'Variable',ports:spec.ports,types:registry.types()}).prepare(inputs);
    return variables.get(spec)(prepared.ports);
  }
  async resolve(target, signal, fetched) {
    const check = () => { if (signal.aborted) fail('CANCELLED'); };
    for (;;) {
      check();
      const revision = this.registry.revision;
      const candidate = this.registry.fork();
      const seen = new Set();
      const needed = [];
      for (const [key, definition] of fetched) {
        const [kind, id] = JSON.parse(key);
        const existing = candidate.list({ kind, id })[0];
        if (existing && (candidate.isCode(kind, id) || !equal(existing, definition))) fail('INVALID_DEFINITION');
      }
      const visit = async (kind, id) => {
        check();
        const key = tuple([kind, id]);
        if (seen.has(key)) return;
        seen.add(key);
        let definition;
        try { definition = candidate.get(kind, id); }
        catch (caught) {
          if (!this.resourceResolver) throw caught;
          if (!fetched.has(key)) {
            const result = await abortable(this.prepare(() => this.resourceResolver(kind, id, { signal })), signal);
            check();
            if (result?.kind !== kind || result?.id !== id) fail('REFERENCE_NOT_FOUND');
            fetched.set(key, structuredClone(result));
          }
          definition = fetched.get(key);
          needed.push(definition);
        }
        for (const [childKind, childId] of candidate.references(kind, definition.spec)) await visit(childKind, childId);
        return definition;
      };
      const spec = target.viewRef !== undefined
        ? (await visit('View', target.viewRef)).spec : target.view;
      if (target.viewRef === undefined) {
        for (const [kind, id] of candidate.references('View', spec)) await visit(kind, id);
      }
      check();
      if (revision !== this.registry.revision) continue;
      if (needed.length) candidate.registerResources(needed);
      candidate.validateDefinition('View', spec);
      return { spec, candidate, revision, additions: needed };
    }
  }
  async createView(target, signal, beforeCommit, owner) {
    if (!this.alive) fail('CANCELLED');
    const view = new View(this, undefined, owner);
    this.views.add(view);
    const close = () => view.dispose();
    view.disposeOnAbort = close;
    try {
      owner?.signal.addEventListener('abort', close, { once: true });
      owner?.onCreate?.(close);
      if (!view.alive) fail('CANCELLED');
      await view.replace(target, signal, beforeCommit);
      if (!view.alive) fail('CANCELLED');
      return view;
    } catch (caught) {
      await view.dispose().catch(() => {});
      throw safeError(caught);
    }
  }
  invokeAction({owner,actionRef,action,inputs={},signal}) {
    if (this.preparing) return Promise.reject(error('EXECUTION_BLOCKED'));
    if (!this.alive || (owner && (!(owner instanceof View) || !this.views.has(owner) || !owner.alive || !owner.root))) return Promise.reject(error('CANCELLED'));
    if ((actionRef===undefined)===(action===undefined)) return Promise.reject(error('INVALID_DEFINITION'));
    const registry = owner ? owner.runtime.registry : this.registry.fork();
    try { return this.actions.invoke(owner?.root.actionOwner ?? this.actionOwner, actionRef, inputs, action, registry, signal); }
    catch (caught) { return Promise.reject(safeError(caught)); }
  }
  dispose() {
    if (this.disposal) return this.disposal.promise;
    this.alive = false;
    const completion = this.disposal = deferred();
    this.actionOwner.dispose();
    const views = [...this.views].map(view => view.dispose());
    if (this.ownsStore) {
      const release = () => this.stateStore.dispose();
      // Preserve synchronous cleanup on the ordinary path.
      if (!this.stateStore.isBusy) {
        try { release(); } catch (cause) { views.push(Promise.reject(safeError(cause))); }
      } else views.push(Promise.resolve().then(release));
    }
    finishCleanup(views, completion);
    return completion.promise;
  }
}

function finishCleanup(tasks, completion) {
  void Promise.allSettled(tasks).then(results => {
    const failed = results.find(result => result.status === 'rejected');
    if (failed) completion.reject(failed.reason);
    else completion.resolve();
  });
}

export class View {
  constructor(host,execution=host.execution(host.registry.fork()),owner) {
    const runtime=execution;this.host=host;this.runtime=runtime;this.owner=owner;this.generation=0;this.instances=new Map();this.owners=new Map();this.connections=new Map();this.listeners=new Set();this.diagnostics=[];this.planning=false;this.queued=false;
    this.lifetime = new AbortController();
    this.queryUses = new Set();
    this.renderWaiters = new Set();
    this.closeListeners = new Set();
    this.diagnosticListeners = new Set();
    this.nodeDiagnostics = new Map();
    this.publishedNodeDiagnostics = new WeakSet();
    this.requested = 0;
    this.published = 0;
    this.projectionWaiters = new Set();
    this.renderListeners = new Set();
    this.unsubscribe = runtime.stateStore.observe(() => this.refresh());
  }
  get alive() { return !this.disposal && this.host.alive && !this.owner?.signal.aborted && (this.owner?.isOpen?.() ?? true); }
  prepareApplication() {
    const token = Object.freeze(Object.create(null));
    const report = deferred();
    return { ...report, view: this, token, generation: this.generation + 1 };
  }
  publishApplication(record) {
    const previous = this.initial, waiters = [...this.renderWaiters];
    const { token } = record;
    applications.set(token, record);
    this.initial = record;
    this.firstApplication ??= token;
    return () => {
      const cancelled = error('CANCELLED');
      for (const cancel of waiters) cancel(cancelled);
      previous?.reject(cancelled);
    };
  }
  applicationRecord(token) {
    const record = applications.get(token);
    if (record?.view !== this) fail('INVALID_DEFINITION');
    return record;
  }
  whenSettled(token) {
    try { return this.applicationRecord(token).promise; }
    catch (cause) { return Promise.reject(cause); }
  }
  onClose(listener) {
    if (!this.alive) fail('CANCELLED');
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }
  onDiagnostic(listener) {
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  }
  newDiagnostic(phase, cause, nodeId) {
    return createDiagnostic(phase, cause, { application: this.initial?.token, nodeId });
  }
  diagnostic(phase, cause, nodeId) {
    if (!this.alive) return;
    const value = this.newDiagnostic(phase, cause, nodeId);
    if (value.error.code === 'CANCELLED') return;
    if (phase === 'url') (this.urlDiagnostics ??= []).push(value);
    this.publishDiagnostic(value);
  }
  publishDiagnostic(value, listeners = [...this.diagnosticListeners]) {
    for (const listener of listeners) {
      if (!this.alive) break;
      if (this.diagnosticListeners.has(listener)) {
        try { listener(value); } catch {}
      }
    }
  }
  *activeDiagnostics() {
    yield* this.nodeDiagnostics.values();
    for (const item of this.queryUses) if (item.diagnostic) yield item.diagnostic;
    yield* this.urlDiagnostics ?? [];
  }
  queryChanged(item, snapshot, failedRun) {
    this.schedule();
    if (!this.alive || !this.queryUses.has(item)) return;
    const failure = snapshot.error;
    if (snapshot.status !== 'error' || !failure || failure.code === 'CANCELLED') {
      item.diagnostic = undefined;
      return;
    }
    if (!failedRun && item.diagnostic && equal(item.diagnostic.error, failure)) return;
    const diagnostic = item.diagnostic = this.newDiagnostic('query', failure);
    const listeners = [...this.diagnosticListeners];
    // Let the usage settle tickets and start pending work before calling observers.
    queueMicrotask(() => {
      if (this.queryUses.has(item)) this.publishDiagnostic(diagnostic, listeners);
    });
  }
  projection() {
    return { generation: this.generation, requested: this.requested, published: this.published };
  }
  subscribeRenderProjection(listener) {
    this.renderListeners.add(listener);
    if (this.renderProjection) listener(this.renderProjection);
    return () => this.renderListeners.delete(listener);
  }
  async whenProjected(generation, sequence) {
    if (!this.alive || generation !== this.generation) fail('CANCELLED');
    if (this.published >= sequence) return;
    const waiter = { generation, sequence, ...deferred() };
    this.projectionWaiters.add(waiter);
    return waiter.promise;
  }
  flushProjectionWaiters() {
    for (const waiter of this.projectionWaiters) {
      if (!this.alive || waiter.generation !== this.generation) waiter.reject(error('CANCELLED'));
      else if (this.published >= waiter.sequence) waiter.resolve();
      else continue;
      this.projectionWaiters.delete(waiter);
    }
  }
  context(owner,extra={},plan) {
    const resolve=(keys,target)=>{
      const [root,name]=keys;let value;
      if(keys.length===1&&root!=='event'){
        const names=root==='states'?[...owner.states.keys()]:root==='ports'?Object.keys(owner.spec.ports??{}):root==='queries'?[...owner.queries.keys()]:root==='actions'?[...this.actionNames(owner.spec)]:root==='repeat'?Object.keys(extra.repeat??{}):null;
        if(!names)fail('REFERENCE_NOT_FOUND');return {value:Object.fromEntries(names.map(name=>[name,resolve([root,name],target).value])),offset:1};
      }
      if(root==='states') {
        const handle=owner.states.get(name);if(!handle)fail('REFERENCE_NOT_FOUND');
        value=target?handle:readSnapshot(handle.getSnapshot());
      } else if(root==='ports') {
        if(!own(owner.spec.ports??{},name))fail('REFERENCE_NOT_FOUND');
        value=owner.ports[name];
        if(!target){const kind=owner.spec.ports[name].kind;if(kind==='State')value=value?readSnapshot(value.getSnapshot()):undefined;else if(kind==='Query')value=value?.getSnapshot();}
      } else if(root==='queries') {
        const item=owner.queries.get(name);if(!item)fail('REFERENCE_NOT_FOUND');value=target?item.handle:item.usage?.getSnapshot()??{status:'waiting',data:undefined,error:null,dataInputs:undefined,stale:false,waitingReason:'INPUT_NOT_READY'};
      } else if(root==='actions') {
        let connection=[...(plan?.connections??this.connections).values()].find(item=>item.owner.id===owner.id&&item.handler.id===name);
        if(!connection&&plan?.connections){
          const previous=[...this.connections.values()].find(item=>item.owner.id===owner.id&&item.handler.id===name);
          const declared=this.actionDeclarations(owner.spec).get(name);
          if(previous&&equal(previous.handler,declared))connection=previous;
        }
        if(connection)value=connection.connection.getSnapshot();
        else if(plan?.connections&&this.actionNames(owner.spec).has(name))value=idle;
        else fail('REFERENCE_NOT_FOUND');
      } else if(root==='repeat') {if(!own(extra.repeat??{},name))fail('REFERENCE_NOT_FOUND');value=extra.repeat[name];}
      else if(root==='event') {if(!own(extra,'event'))fail('REFERENCE_NOT_FOUND');return {value:extra.event,offset:1};}
      else fail('REFERENCE_NOT_FOUND');
      return {value,offset:2};
    };return {functions:this.runtime.functions,resolve};
  }
  actionDeclarations(spec) {const declarations=new Map();const walk=node=>{for(const handler of Object.values(node.on??{}))if(handler.id)declarations.set(handler.id,handler);for(const content of Object.values(node.slots??{}))if(Array.isArray(content))content.forEach(walk);};if(spec.render)walk(spec.render);return declarations;}
  actionNames(spec) {const names=new Set();const walk=node=>{for(const h of Object.values(node.on??{}))if(h.id)names.add(h.id);for(const content of Object.values(node.slots??{}))if(Array.isArray(content))content.forEach(walk);};if(spec.render)walk(spec.render);return names;}
  bindInputs(spec, templates, context, literal = false, registry = this.runtime.registry) {
    const inputs=Object.create(null);
    if(literal)Object.assign(inputs,templates??{});
    else if(isRecord(templates??{})&&!expressionKind(templates??{},registry.functions)) {
      for(const [name,value] of dataEntries(templates??{})) {
        const port=spec.ports?.[name];
        if(port?.kind==='State'||port?.kind==='Query')inputs[name]=evaluate(value,context,{target:true});
        else inputs[name]=expression(()=>evaluateSnapshot(value,context));
      }
    } else Object.assign(inputs,evaluate(templates,context));
    return inputs;
  }
  prepareInputs(spec, templates, context, mode = 'automatic', literal = false, kind = 'Component', runtime = this.runtime) {
    const inputs = this.bindInputs(spec, templates, context, literal, runtime.registry);
    return compilePorts({resourceKind:kind,ports:spec.ports,types:runtime.registry.types(),store:runtime.stateStore}).prepare(inputs,{mode});
  }
  makeOwner(spec,ports,id,previous,created,runtime,plan) {
    const { stateStore: store, registry } = runtime;
    const actionOwner = previous?.actionOwner ?? runtime.actions.owner(
      () => this.alive && this.owners.has(id), this.lifetime.signal,
      cause => this.diagnostics.push(safeError(cause)),
    );
    const owner={id,spec,ports,scope:previous?.scope??store.createScope(),actionOwner,states:new Map(previous?.states),computations:new Map(),queries:new Map(),reactions:previous?.reactions??[],slots:previous?.slots??{},instance:null};
    if(!previous)created.push(owner);
    for(const [name,declaration] of Object.entries(spec.states??{})) {
      const schema=registry.schema(declaration),existing=owner.states.get(name);
      if(existing) {if(previous.spec.states?.[name]?.kind!==declaration.kind||!sameContract(store.contract(existing).schema,schema))fail('TYPE_CONTRACT_MISMATCH');}
      else owner.states.set(name,owner.scope.registerState(name,{schema}));
    }
    for(const [name,handle] of owner.states)if(!own(spec.states??{},name)){owner.scope.removeState(name);owner.states.delete(name);}
    for(const [name,use] of Object.entries(spec.queries??{})) {
      const old=previous?.queries.get(name),identity=use.queryRef?`Query:${use.queryRef}`:tuple(use.query);
      const item=old?.identity===identity?{...old,use,owner}: {use,owner,identity,usage:null,handle:null};
      if(!item.handle)item.handle=createQueryHandle({
        getSnapshot:()=>item.usage?.getSnapshot()??{status:'waiting',data:undefined,error:null,dataInputs:undefined,stale:false,waitingReason:'INPUT_NOT_READY'},
        refresh:signal=>this.requestQuery(item,'refresh',signal),retry:signal=>this.requestQuery(item,'retry',signal),
      });
      // Preserve the object referenced by the handle; owner/use are assigned after commit.
      owner.queries.set(name,old?.identity===identity?old:item);
    }
    for(const name of validateInitials(spec,registry.functions)) {
      const declaration=spec.states[name],handle=owner.states.get(name),context=this.context(owner, {}, plan);
      if(declaration.kind==='Derived') {
        const paths=pathsIn(declaration.inputs??{},registry.functions);
        const portNames=new Set(paths.filter(keys=>keys[0]==='ports').flatMap(keys=>keys.length===1?Object.keys(spec.ports??{}):[keys[1]]));
        const dependencies=[...paths.filter(keys=>keys[0]==='states').map(keys=>owner.states.get(keys[1])),
          ...[...portNames].filter(name=>spec.ports?.[name]?.kind==='State').map(name=>ports[name])].filter(Boolean).map(handle=>stateRoot(handle,store));
        const variable=declaration.variable??registry.get('Variable',declaration.variableRef).spec;
        const values=[...portNames].map(name=>{
          try{
            // Track capability validity, not State data already propagated by
            // the Store. A new wrapper may guard the same cell with a new owner.
            if(spec.ports?.[name]?.kind==='State'){ports[name]?.getSnapshot();return [name,true];}
            return [name,spec.ports?.[name]?.kind==='Query'?ports[name]?.getSnapshot():ports[name]];
          }
          catch(caught){return [name,{status:'error',error:safeError(caught)}];}
        });
        const prior=previous?.computations?.get(name);
        // Reuse only the explicit State/port connections tracked here. Other
        // context roots must keep their existing conservative refresh behavior.
        const tracked=paths.every(keys=>keys[0]==='ports'||keys[0]==='states'&&keys.length>1);
        const unchanged=tracked&&prior&&equal(prior.declaration,declaration)&&equal(prior.variable,variable)&&equal(prior.values,values)
          &&dependencies.length===prior.dependencies.length&&dependencies.every((handle,index)=>handle===prior.dependencies[index]);
        owner.computations.set(name,{declaration,variable,values,dependencies});
        store.computed(handle,dependencies,()=>{
          try {
            const inputs=this.prepareInputs(variable,declaration.inputs??{},context,'automatic',false,'Variable',runtime);
            if(inputs.status==='waiting')return {status:'pending'};
            return {status:'ready',value:runtime.variable(variable,inputs.ports)};
          }catch(caught){return {status:'error',error:safeError(caught)};}
        },{recompute:!unchanged});
      } else if(own(declaration,'initial')) {
        let snapshot=evaluateSnapshot(declaration.initial,context,{roots:['states','ports','queries']});
        if(snapshot.status==='missing')snapshot={status:'pending'};
        store.initialize(handle,snapshot);
      }
    }
    return owner;
  }
  build(spec,inputs,replace=false,stateWrites,commit,runtime=this.runtime) {
    const { registry, stateStore: store } = runtime;
    const created=[],newConnections=[],next=new Map(),owners=new Map(),connections=new Map(),aliases=new Set();
    const oldOwners=this.owners;let oldInstances=replace?new Map():this.instances,availableConnections=replace?new Map():this.connections;
    const plan = { connections };
    let root,roots;
    const prepare = run => commit ? this.host.prepare(run) : run();
    try {
      store.transaction(()=>prepare(()=>{
        const prepared=this.prepareInputs(spec,inputs,{},'automatic',true,'View',runtime);
        root=this.makeOwner(spec,prepared.ports,replace?`view:${++nextLifetime}`:this.root?.id??`view:${++nextLifetime}`,replace?null:this.root,created,runtime,plan);owners.set(root.id,root);
        const settleWrites=stateWrites?store.stageBatch(Object.entries(stateWrites).map(([name,value])=>[root.states.get(name),value])):null;
        const retainSuspended=(old,instance=old)=>{
          const owner=old.owner?{...old.owner,suspended:true,instance}:null;
          if(owner){instance.owner=owner;owners.set(owner.id,owner);}
          instance.retainedChildren=old.retainedChildren??old.children;
          for(const child of instance.retainedChildren) {
            const retained={...child};next.set(child.address,retained);retainSuspended(child,retained);
          }
          for(const [key,entry] of availableConnections) {
            if(!key.startsWith(tuple([old.address,old.generation]).slice(0,-1)+',' )||connections.has(key))continue;
            if(entry.handler.id){const alias=tuple([entry.owner.id,entry.handler.id]);if(aliases.has(alias))fail('INVALID_DEFINITION');aliases.add(alias);}
            connections.set(key,entry);
          }
        };
        const contentToken=(content,owner,extra,trail)=>Array.isArray(content)?{nodes:content,owner,extra,trail}:owner.slots[pointerKeys(content['@path'])[1]];
        const expandToken=token=>token?token.nodes.flatMap(node=>expand(node,token.owner,token.extra,token.trail)):[];
        const expand=(node,author,extra={},trail=[],repeated=false)=>{
          const context=this.context(author,extra,plan);
          if(node.repeat&&!repeated) {
            const snapshot=evaluateSnapshot(node.repeat.items,context);if(snapshot.status!=='ready')return [{id:node.id,status:snapshot.status,error:snapshot.error,children:[],inputs:{}}];
            if(!Array.isArray(snapshot.value))fail('TYPE_MISMATCH');const seen=new Set();
            const entries=snapshot.value.map(item=>{
              const childExtra={...extra,repeat:{...extra.repeat,[node.repeat.as]:item}},value=evaluate(node.repeat.key,this.context(author,childExtra,plan));
              if(typeof value!=='string'&&!(typeof value==='number'&&Number.isFinite(value)))fail('TYPE_MISMATCH');
              const key=tuple([typeof value,Object.is(value,-0)?0:value]);if(seen.has(key))fail('INVALID_DEFINITION');seen.add(key);return {childExtra,key};
            });
            return entries.flatMap(({childExtra,key})=>expand(node,author,childExtra,[...trail,[node.id,key]],true));
          }
          if(own(node,'when')) {
            const snapshot=evaluateSnapshot(node.when,context);if(snapshot.status!=='ready')return [{id:node.id,status:snapshot.status,error:snapshot.error,children:[],inputs:{}}];
            if(typeof snapshot.value!=='boolean')fail('TYPE_MISMATCH');if(!snapshot.value)return [];
          }
          const {spec:childSpec,identity}=registry.target(node,`${author.id}/inline:${node.id}`),address=tuple([author.id,node.id,trail]);
          if(next.has(address))fail('INVALID_DEFINITION');
          const old=oldInstances.get(address),preserved=old?.definition===identity;
          const generation=preserved?old.generation:++nextInstance;
          for(const [event,handler] of Object.entries(node.on??{}))if(!handler.emit) {
            if(handler.id){const alias=tuple([author.id,handler.id]);if(aliases.has(alias))fail('INVALID_DEFINITION');aliases.add(alias);}
            const key=tuple([address,generation,event]),prior=availableConnections.get(key);
            const connection=prior&&equal(prior.handler,handler)?prior.connection:runtime.actions.connect(author.actionOwner,{
              actionRef:handler.actionRef,spec:handler.action,registry,
              isOpen: () => this.connections.get(key)?.connection === connection,
            });
            if(connection!==prior?.connection)newConnections.push(connection);
            connections.set(key,{connection,handler,owner:author});
          }
          let preparation,status='ready',inputError;
          try{preparation=this.prepareInputs(childSpec,node.inputs??{},context,'automatic',false,'Component',runtime);if(preparation.status==='waiting')status='pending';}
          catch(caught){status='error';inputError=safeError(caught);preparation={ports:{}};}
          const instance={id:node.id,address,generation,definition:identity,source:node,spec:childSpec,author,extra,inputs:preparation.ports,status,error:inputError,children:[],slots:{},owner:null};
          next.set(address,instance);
          // Missing inputs wait independently; the surrounding screen remains usable.
          if(status!=='ready'){if(preserved&&old.owner)retainSuspended(old,instance);return [instance];}
          const owner=this.makeOwner(childSpec,preparation.ports,tuple([address,generation]),preserved?old.owner:null,created,runtime,plan);owners.set(owner.id,owner);owner.instance=instance;instance.owner=owner;
          owner.queryDefaults={...author.queryDefaults,...childSpec.queryDefaults};
          owner.slots=Object.fromEntries(Object.keys(childSpec.slots??{}).map(name=>[name,own(node.slots??{},name)?contentToken(node.slots[name],author,extra,trail):{nodes:[],owner:author,extra,trail}]));
          if(childSpec.render)instance.children=expand(childSpec.render,owner,{},[]);
          else {
            for(const [name,token] of Object.entries(owner.slots))instance.slots[name]=expandToken(token);
            instance.children=Object.values(instance.slots).flat();
          }
          return [instance];
        };
        root.queryDefaults=spec.queryDefaults??{};roots=expand(spec.render,root);
        const reconcileReactions=previousOwners=>{
          const changed=[];
          for(const [id,owner] of previousOwners)if(!owners.has(id))for(const stop of owner.reactions)stop();
          for(const owner of owners.values()) {
            const definitions=owner.suspended?[]:(owner.spec.reactions??[]).map(reaction=>({
              watch:reaction.watch.map(value=>stateRoot(evaluate(value,this.context(owner,{},plan),{target:true}),store)),
              target:stateRoot(evaluate(reaction.target,this.context(owner,{},plan),{target:true}),store),value:reaction.value
            }));
            const previous=previousOwners.get(owner.id)?.reactionDefinitions??[];
            const unchanged=definitions.length===previous.length&&definitions.every((item,index)=>item.target===previous[index].target&&item.watch.length===previous[index].watch.length&&item.watch.every((handle,i)=>handle===previous[index].watch[i])&&equal(item.value,previous[index].value));
            owner.reactionDefinitions=definitions;
            if(!unchanged){for(const stop of owner.reactions)stop();owner.reactions=[];changed.push(owner);}
          }
          // Remove every changed target first; exchanging two legal targets is atomic.
          for(const owner of changed)for(const definition of owner.reactionDefinitions)owner.reactions.push(store.registerReaction(owner.scope,definition));
        };
        reconcileReactions(oldOwners);
        if(settleWrites) {
          settleWrites();
          // State and reaction values are now final. Reconcile their dependent tree
          // before committing observers, requests or cancellation of old connections.
          const stagedOwners=new Map(owners);oldInstances=new Map([...oldInstances,...next]);availableConnections=new Map([...availableConnections,...connections]);
          next.clear();owners.clear();connections.clear();aliases.clear();owners.set(root.id,root);
          roots=expand(spec.render,root);reconcileReactions(stagedOwners);
        }
        for(const owner of new Set([...oldOwners.values(),...created]))if(!owners.has(owner.id))owner.scope.dispose();
      }), () => {
        if (!this.alive) fail('CANCELLED');
        const afterCommit = commit?.({ root, roots, owners, instances: next });
        const oldConnections = this.connections;
        this.root = root;
        this.roots = roots;
        this.instances = next;
        this.owners = owners;
        this.connections = connections;
        this.queryUses = new Set([...owners.values()].flatMap(owner => [...owner.queries.values()]));
        plan.connections = null;
        return () => {
          const retained = new Set([...connections.values()].map(entry => entry.connection));
          const cleanup = run => { try { run(); } catch (cause) { this.diagnostics.push(safeError(cause)); } };
          for (const connection of newConnections) if (!retained.has(connection)) cleanup(() => connection.dispose());
          for (const [key, entry] of oldConnections) if (connections.get(key)?.connection !== entry.connection) cleanup(() => entry.connection.dispose());
          for (const [id, owner] of oldOwners) if (!owners.has(id)) {
            cleanup(() => owner.actionOwner.dispose());
            for (const item of owner.queries.values()) cleanup(() => item.usage?.dispose());
          }
          for (const owner of owners.values()) {
            const old = oldOwners.get(owner.id);
            for (const [name, item] of old?.queries ?? []) if (owner.queries.get(name) !== item) cleanup(() => item.usage?.dispose());
            for (const [name, item] of owner.queries) {
              item.owner = owner;
              item.use = owner.spec.queries[name];
            }
          }
          afterCommit?.();
        };
      });
    } catch (caught) {
      plan.connections = null;
      for (const connection of newConnections) connection.dispose();
      for (const owner of created) owner.actionOwner.dispose();
      throw caught;
    }
  }
  async requestQuery(item, kind, signal) {
    // A Store observer can see the new application before its usages are configured.
    if (!this.alive || !this.queryUses.has(item)) fail('CANCELLED');
    if (this.committing) await this.committing.promise;
    if (!this.alive || !this.queryUses.has(item)) fail('CANCELLED');
    if (!item.usage) fail(kind === 'retry' ? 'INVALID_RETRY_STATE' : 'INPUT_NOT_READY');
    return item.usage[kind](signal);
  }
  configureQueries() {
    const generation = this.generation;
    const current = () => this.alive && generation === this.generation;
    for(const owner of this.owners.values())for(const [name,item] of owner.queries) {
      if(!current())return;
      const use=item.use,spec=use.query??this.runtime.registry.get('Query',use.queryRef).spec,context=this.context(owner);
      let preparedInputs,ready=true,executeWhen=true,autoRefreshWhen=true,inputError;
      try {
        preparedInputs=this.prepareInputs(spec,use.inputs??{},context,'automatic',false,'Query');
        ready=!owner.suspended&&preparedInputs.status==='ready'&&!this.urlTransition&&(!this.url||this.url.isReady());
        for(const key of ['executeWhen','autoRefreshWhen'])if(own(use,key)) {
          const value=evaluate(use[key],context);if(typeof value!=='boolean')fail('TYPE_MISMATCH');if(key==='executeWhen')executeWhen=value;else autoRefreshWhen=value;
        }
      }catch(caught){inputError=safeError(caught);ready=false;}
      if(!current())return;
      const settings={...owner.queryDefaults,...use,use,registry:this.runtime.registry,inputs:preparedInputs?.ports??{},preparedInputs,ready,executeWhen,autoRefreshWhen,inputError,owner:item};
      if(!item.usage){
        item.usage=this.runtime.query.createUsage(use,{
          ...settings,onChange:(snapshot, failedRun)=>this.queryChanged(item, snapshot, failedRun),clock:this.runtime.clock,
          onCleanupError:cause=>this.diagnostics.push(safeError(cause)),
          onPollingError:cause=>{
            this.diagnostics.push(cause);
            this.diagnostic('query', cause);
          },
          isOpen:()=>this.alive && this.queryUses.has(item),ownerSignal:this.lifetime.signal,
          start:false,
        });
        item.usage.start();
      }
      else item.usage.update(settings);
    }
  }
  refresh() {
    if(!this.alive||!this.root)return;
    this.requested++;
    // A subscriber can commit State while project() is publishing this plan.
    // Preserve that invalidation without recursively rebuilding or delivering
    // a newer snapshot to listeners still receiving the current one.
    if(this.planning){this.schedule();return;}
    this.planning=true;
    try{this.build(this.spec,this.inputs);this.configureQueries();this.project();}catch(caught){this.diagnostics.push(safeError(caught));this.project();}finally{this.planning=false;}
  }
  schedule(){if(!this.alive)return;this.requested++;if(this.queued)return;this.queued=true;queueMicrotask(()=>{this.queued=false;this.refresh();});}
  project() {
    if(!this.alive)return;
    const generation = this.generation, snapshot = this.getSnapshot();
    this.updateNodeDiagnostics(snapshot);
    const diagnosticListeners = [...this.diagnosticListeners];
    const registry = this.runtime.registry;
    this.published = this.requested;
    const projection = this.renderProjection = Object.freeze({
      generation, sequence: this.published, snapshot,
      componentBinding: id => registry.componentBinding(id),
      isCodeComponent: id => registry.isCode('Component', id),
    });
    for (const listener of this.renderListeners) {
      if (!this.alive || generation !== this.generation) return;
      try { listener(projection); } catch (cause) { this.diagnostics.push(safeError(cause)); }
    }
    for(const listener of this.listeners){if(!this.alive||generation!==this.generation)return;try{listener(snapshot);}catch(caught){this.diagnostics.push(safeError(caught));}}
    if(!this.alive||generation!==this.generation)return;
    this.flushProjectionWaiters();
    for (const diagnostic of this.nodeDiagnostics.values()) {
      if (this.publishedNodeDiagnostics.has(diagnostic)) continue;
      this.publishedNodeDiagnostics.add(diagnostic);
      this.publishDiagnostic(diagnostic, diagnosticListeners);
    }
    if(this.initial && !this.initial.settled && !this.urlTransition && !this.queued && [...this.owners.values()].every(owner=>[...owner.queries.values()].every(item=>item.usage?.getSnapshot().status!=='running'))) {
      const queryErrors=[];for(const owner of this.owners.values())for(const [query,item] of owner.queries)if(item.usage?.getSnapshot().status==='error')queryErrors.push(Object.freeze({instanceId:owner.id,query,error:item.usage.getSnapshot().error}));
      this.initial.settled = true;
      this.initial.sequence = this.published;
      this.initial.resolve(Object.freeze({generation:this.generation,queryErrors:Object.freeze(queryErrors)}));
    }
  }
  updateNodeDiagnostics(snapshot) {
    const next = new Map();
    const visit = (nodes, parent) => {
      for (const [index, node] of nodes.entries()) {
        const key = node.address ? tuple([node.address, node.generation]) : tuple([parent, node.id, index]);
        if (node.error && node.error.code !== 'CANCELLED') {
          const prior = this.nodeDiagnostics.get(key);
          const diagnostic = prior && equal(prior.error, node.error)
            ? prior : this.newDiagnostic('node', node.error, node.id);
          next.set(key, diagnostic);
        }
        if (Object.keys(node.slots).length) {
          for (const children of Object.values(node.slots)) visit(children, key);
        } else visit(node.children, key);
      }
    };
    visit(snapshot.roots);
    this.nodeDiagnostics = next;
  }
  prepareUrlTransition(target, root, previous, replacing) {
    const store = this.runtime.stateStore;
    if (store.urlConnection && store.urlConnection !== previous) fail('INVALID_DEFINITION');
    const url = target.url;
    if (url && !Array.isArray(url.bindings)) fail('INVALID_DEFINITION');
    const bindings = url?.bindings.map(({ state, ...binding }) =>
      ({ ...binding, state, target: root.states.get(state) ?? fail('REFERENCE_NOT_FOUND') }));
    const options = url && {
      ...url, bindings, restore: !replacing,
      onError: diagnostic => {
        if (diagnostic.kind === 'connect' && this.url === connection) {
          this.url = null;
          this.urlBindings = undefined;
          this.schedule();
        }
        this.reportUrl(diagnostic);
      },
    };
    const connection = prepareUrlConnection(store, options, { previous: previous ?? null, isOpen: () => this.alive, viewOwned: true });
    return { connection, bindings };
  }
  async apply(spec, inputs, replace, stateWrites, target, execution, resolved, job) {
    const check = () => {
      if (!this.host.prepare(() => this.alive) || job.cancelled || job.signal?.aborted) fail('CANCELLED');
      if (resolved && this.host.registry.revision !== resolved.revision) throw retryRegistry;
    };
    const oldUrl = this.url;
    const replacing = this.root !== undefined;
    const registryCandidate = resolved?.additions?.length ? resolved.candidate : null;
    let application, urlConnection;
    const committing = this.committing = deferred();
    const committedSnapshot = this.root ? this.getSnapshot() : undefined;
    this.planning = true;
    try {
      check();
      const prepared = execution.registry.validateDefinition('View', spec);
      const { ports } = this.prepareInputs(prepared, inputs, {}, 'automatic', true, 'View', execution);
      inputs = Object.freeze(Object.fromEntries(Object.keys(inputs).map(name =>
        [name, spec.ports[name].kind === 'Value' ? ports[name] : inputs[name]])));
      if (stateWrites) for (const [name, value] of Object.entries(stateWrites)) {
        const declaration = spec.states?.[name];
        if (!declaration || declaration.kind !== 'State') fail('REFERENCE_NOT_FOUND');
        try { execution.registry.validator(declaration).accept(value); }
        catch (caught) { throw safeError(caught, 'TYPE_MISMATCH'); }
      }
      this.stagingSnapshot = committedSnapshot;
      this.build(spec, inputs, replace, stateWrites, ({ root, instances }) => {
        let urlBindings;
        const applicationCandidate = this.host.prepare(() => {
          for (const instance of instances.values()) {
            const id = instance.source?.componentRef;
            if (instance.status === 'ready' && !instance.owner?.suspended && id && execution.registry.isCode('Component', id)
              && !execution.registry.componentBinding(id)) {
              fail('REFERENCE_NOT_FOUND', { resource: { kind: 'Component', id } });
            }
          }
          if (replace && (target.url || oldUrl)) {
            const transition = this.prepareUrlTransition(target, root, oldUrl, replacing);
            urlConnection = transition.connection;
            urlBindings = transition.bindings;
          } else if (oldUrl && this.urlBindings?.some(binding => root.states.get(binding.state) !== binding.target)) {
            fail('INVALID_DEFINITION');
          }
          const record = this.prepareApplication();
          job.beforeCommit?.();
          return record;
        });
        check();
        const reservation = urlConnection?.validateReservation();
        job.phase = 'commit';
        if (urlConnection) urlConnection.installReservation(reservation);
        if (registryCandidate) this.host.registry.commitCandidate(registryCandidate);
        this.runtime = execution;
        this.stagingSnapshot = undefined;
        this.spec = spec;
        this.inputs = inputs;
        this.generation++;
        this.urlDiagnostics = [];
        this.requested++;
        application = applicationCandidate.token;
        if (urlConnection) {
          this.url = null;
          this.urlTransition = urlConnection;
          this.urlBindings = urlBindings;
        }
        return this.publishApplication(applicationCandidate);
      }, execution);
    } catch (caught) {
      if (job.phase === 'prepare') urlConnection?.dispose();
      committing.resolve();
      this.committing = undefined;
      throw caught === retryRegistry ? caught : safeError(caught);
    } finally {
      this.stagingSnapshot = undefined;
      this.planning = false;
    }
    try {
      if (urlConnection) oldUrl?.dispose();
      if (this.alive) {
        if (urlConnection) void this.finishUrl(urlConnection, oldUrl);
        this.refreshAfterCommit();
      }
    } finally {
      this.committing = undefined;
      committing.resolve();
    }
    return application;
  }
  refreshAfterCommit() {
    if (!this.alive) return;
    this.planning = true;
    try { this.configureQueries(); this.project(); }
    finally { this.planning = false; }
    this.schedule();
  }
  async finishUrl(connection, previous) {
    try {
      if (previous) {
        const outcome = await connection.cleanupPrevious(this.host.urlCleanupTimeoutMs, this.host.clock);
        if (outcome && this.alive) this.reportUrl(outcome, 'replace-cleanup');
      }
      if (!this.alive || this.urlTransition !== connection) return;
      if (!connection.start()) {
        if (this.alive) void this.dispose();
        return;
      }
      if (this.urlBindings) this.url = connection;
    } catch (caught) {
      connection.dispose();
      if (this.alive) this.reportUrl(caught, 'connect');
      this.url = null;
      this.urlBindings = undefined;
    } finally {
      if (this.urlTransition === connection) this.urlTransition = null;
      if (this.alive) {
        this.schedule();
        this.runNext();
      }
    }
  }
  reportUrl(cause, kind) {
    const failure = kind ? error(safeError(cause).code, { kind }) : cause;
    this.diagnostics.push(failure);
    this.diagnostic('url', failure);
  }
  enqueue(run, signal, beforeCommit) {
    if (!this.alive || signal?.aborted) return Promise.reject(error('CANCELLED'));
    const job = { ...deferred(), run, signal, beforeCommit, phase: 'prepare', controller: new AbortController(), cancelled: false };
    const cancel = () => {
      if (job.phase !== 'prepare' || job.cancelled) return;
      job.cancelled = true;
      job.reject(error('CANCELLED'));
      job.release();
      if (this.runtime.stateStore.isRunningPureCallback) queueMicrotask(() => job.controller.abort());
      else job.controller.abort();
    };
    job.cancel = cancel;
    job.release = () => signal?.removeEventListener('abort', cancel);
    signal?.addEventListener('abort', cancel, { once: true });
    const previous = this.nextJob;
    this.nextJob = job;
    if (this.running?.phase === 'prepare') this.running.cancel();
    previous?.cancel();
    this.runNext();
    return job.promise;
  }
  runNext() {
    if (this.running || this.urlTransition || !this.alive || !this.nextJob) return;
    const job = this.nextJob;
    this.nextJob = null;
    this.running = job;
    queueMicrotask(async () => {
      try {
        if (!this.alive || job.cancelled) fail('CANCELLED');
        job.resolve(await job.run(job));
      } catch (caught) {
        job.reject(safeError(caught));
      } finally {
        job.release();
        this.running = null;
        this.runNext();
      }
    });
  }
  update(spec, { inputs, states } = {}) {
    const next = spec === undefined ? undefined : structuredClone(spec);
    return this.enqueue(job => {
      const definition = next ?? this.spec;
      this.runtime.registry.validateDefinition('View', definition);
      this.host.authorizeUpdate(this, definition);
      return this.apply(definition, inputs ?? this.inputs, false, states, {}, this.runtime, null, job);
    });
  }
  replace(target, signal, beforeCommit) {
    const fetched = new Map();
    return this.enqueue(job => this.retryApplication(job, async () => {
      const resolved = await this.host.resolve(target, job.controller.signal, fetched);
      if (resolved.revision !== this.host.registry.revision) throw retryRegistry;
      if (this.root) this.host.authorizeUpdate(this, resolved.spec);
      return this.apply(resolved.spec, target.inputs ?? {}, true, undefined, target, this.host.execution(resolved.candidate), resolved, job);
    }), signal, beforeCommit);
  }
  applyResourceSets({ setIds, definition, inputs, states, signal }, beforeCommit) {
    return this.enqueue(job => this.retryApplication(job, () => {
      const revision = this.host.registry.revision;
      const candidate = this.runtime.registry.includeResourceSets(this.host.registry, setIds);
      const spec = definition ?? this.spec;
      candidate.validateDefinition('View', spec);
      this.host.authorizeUpdate(this, spec);
      return this.apply(spec, inputs ?? this.inputs, false, states, {}, this.host.execution(candidate), { revision }, job);
    }), signal, beforeCommit);
  }
  async retryApplication(job, run) {
    for (;;) {
      if (!this.alive || job.cancelled || job.signal?.aborted) fail('CANCELLED');
      try { return await run(); }
      catch (caught) { if (caught !== retryRegistry) throw caught; }
      // A cancelled prepare must finish rollback before any next attempt.
      await Promise.resolve();
    }
  }
  exportDefinition(){return structuredClone(this.spec);}
  getState(name,instanceId){const owner=instanceId?this.owners.get(instanceId):this.root;return owner?.states.get(name)??fail('REFERENCE_NOT_FOUND');}
  getQuery(name,instanceId){const owner=instanceId?this.owners.get(instanceId):this.root;return owner?.queries.get(name)?.handle??fail('REFERENCE_NOT_FOUND');}
  getSnapshot() {
    if (this.stagingSnapshot) return this.stagingSnapshot;
    const serialize = instance => {
      const entries = Object.entries(instance.slots ?? {});
      const slots = Object.freeze(Object.fromEntries(entries.map(([name, nodes]) =>
        [name, Object.freeze(nodes.map(serialize))])));
      // Code Components expose the same slot children in two forms.
      const children = entries.length ? Object.values(slots).flat() : instance.children.map(serialize);
      return Object.freeze({
        id: instance.id, instanceId: instance.owner?.id, address: instance.address,
        generation: instance.generation, componentRef: instance.source?.componentRef,
        status: instance.status, error: instance.error ?? null, inputs: instance.inputs,
        children: Object.freeze(children), slots,
      });
    };
    const states=Object.create(null),queries=Object.create(null),actions=Object.create(null);
    for(const [name,handle] of this.root?.states??[])states[name]=handle.getSnapshot();
    for(const [name,item] of this.root?.queries??[])queries[name]=item.handle.getSnapshot();
    for(const entry of this.connections.values())if(entry.owner.id===this.root?.id&&entry.handler.id)actions[entry.handler.id]=entry.connection.getSnapshot();
    return Object.freeze({generation:this.generation,lifetime:this.root?.id,roots:Object.freeze((this.roots??[]).map(serialize)),states:Object.freeze(states),queries:Object.freeze(queries),actions:Object.freeze(actions),errors:Object.freeze([...this.diagnostics])});
  }
  subscribe(listener){this.listeners.add(listener);listener(this.getSnapshot());return()=>this.listeners.delete(listener);}
  emit(target,event,payload,canStart=()=>true) {
    if (this.host.preparing) return Promise.reject(error('EXECUTION_BLOCKED'));
    try {
      if(!this.alive || !canStart())fail('CANCELLED');
      const instance=typeof target==='string'?this.instances.get(target)??[...this.instances.values()].find(item=>item.owner?.id===target):this.instances.get(target.address);
      if(!instance || (typeof target!=='string' && target.generation!==instance.generation))fail('CANCELLED');
      if (instance.status !== 'ready' || instance.owner?.suspended) fail('INPUT_NOT_READY');
      const current = () => {
        const latest = this.instances.get(instance.address);
        return this.alive && latest?.generation === instance.generation && latest.status === 'ready' && !latest.owner?.suspended && canStart();
      };
      if (!current()) fail('CANCELLED');
      const contract=instance.spec.events?.[event];if(!contract)fail('REFERENCE_NOT_FOUND');let data;try{data=protect(this.runtime.registry.validator(contract).accept(payload));}catch(caught){throw safeError(caught,'TYPE_MISMATCH');}
      const handler=instance.source.on?.[event];if(!handler)return Promise.resolve();
      const context=this.context(instance.author,{...instance.extra,event:data});
      if(handler.emit){const receiver=instance.author.instance;if(!receiver)fail('REFERENCE_NOT_FOUND');return this.emit(receiver,handler.emit,evaluate(handler.payload,context),current);}
      const key=tuple([instance.address,instance.generation,event]),connection=this.connections.get(key)?.connection;if(!connection)fail('CANCELLED');
      const spec=handler.action??this.runtime.registry.get('Action',handler.actionRef).spec;
      const registry = this.runtime.registry;
      return connection.invoke(() => this.bindInputs(spec, handler.inputs ?? {}, context, false, registry), current, registry)
        .catch(caught => { if (this.alive && caught.code !== 'CANCELLED') this.diagnostic('action', caught, instance.id); throw caught; });
    } catch (caught) {
      const failure = safeError(caught);
      if (this.alive && failure.code !== 'CANCELLED') this.diagnostic('action', failure,
        typeof target === 'string' ? target : target?.id);
      return Promise.reject(failure);
    }
  }
  dispose() {
    if (this.disposal) return this.disposal.promise;
    const completion = this.disposal = deferred();
    const store = this.runtime.stateStore;
    this.initial?.reject(error('CANCELLED'));
    this.flushProjectionWaiters();
    for (const cancel of this.renderWaiters) cancel(error('CANCELLED'));
    this.renderWaiters.clear();
    this.listeners.clear();
    this.renderListeners.clear();
    this.diagnosticListeners.clear();
    let failure;
    const cleanup = run => { try { run(); } catch (cause) { failure ??= safeError(cause); } };
    const cancel = () => {
      this.lifetime.abort();
      this.running?.cancel();
      this.nextJob?.cancel();
      this.nextJob = null;
      this.unsubscribe();
      this.owner?.signal.removeEventListener('abort', this.disposeOnAbort);
      cleanup(() => this.urlTransition?.dispose());
      cleanup(() => this.url?.dispose());
      for (const listener of this.closeListeners) try { listener(); } catch {}
      this.closeListeners.clear();
    };
    const release = () => {
      for (const entry of this.connections.values()) cleanup(() => entry.connection.dispose());
      for (const owner of this.owners.values()) {
        cleanup(() => owner.actionOwner.dispose());
        for (const item of owner.queries.values()) cleanup(() => item.usage?.dispose());
        cleanup(() => owner.scope.dispose());
      }
      this.host.views.delete(this);
      if (failure) completion.reject(failure);
      else completion.resolve();
    };
    if (store.isRunningPureCallback) queueMicrotask(cancel);
    else cancel();
    if (this.planning || store.isBusy) queueMicrotask(release);
    else release();
    return completion.promise;
  }
}
