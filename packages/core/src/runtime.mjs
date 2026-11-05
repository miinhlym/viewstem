import { Registry } from './registry.mjs';
import { prepareStateUrl } from './url.mjs';
import { StateStore, createStateStore } from './state.mjs';
import { compilePorts, expression, createQueryHandle, sameContract, stateRoot } from './ports.mjs';
import { compileSchema, equal } from './schema.mjs';
import { protect, trustedCopies } from './immutable.mjs';
import { evaluate, evaluateSnapshot, readSnapshot, pathsIn, validateInitials, pointerKeys, isRecord, expressionKind, dataEntries } from './expressions.mjs';
import { compileCel } from './cel/index.mjs';
import { createQueryEngine } from './query/index.mjs';
import { createHttpExecutor } from './http/index.mjs';
import { ActionEngine } from './action.mjs';
import { fail, error, safeError, at } from './errors.mjs';
const own=(object,key)=>Object.hasOwn(object,key);
const tuple=JSON.stringify;
let nextLifetime=0,nextInstance=0;
const idle=Object.freeze({status:'idle',running:false,data:null,error:null});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>{});return{promise,resolve,reject};};

export function createRuntime(options) { return new Runtime(options); }
export class Runtime {
  constructor({registry,stateStore,requestExecutor,resourceResolver,authorize,functions,requestTimeoutMs,clock}={}) {
    if(!(registry instanceof Registry) || (stateStore!==undefined && !(stateStore instanceof StateStore)))fail('INVALID_DEFINITION');
    Object.assign(this,{registry,stateStore:stateStore??createStateStore(),resourceResolver,authorize,functions,clock});
    this.functions=functions??registry.functions;this.ownsStore=stateStore===undefined;this.views=new Set();this.variables=new WeakMap();this.alive=true;
    this.requestExecutor=requestExecutor??createHttpExecutor({requestTimeoutMs});this.requestTimeoutMs=requestTimeoutMs;
    this.configureExecution();
  }
  configureExecution() {
    const {registry,stateStore,authorize,clock,requestTimeoutMs}=this;
    this.query=createQueryEngine({registry,functions:this.functions,requestExecutor:this.requestExecutor,...(requestTimeoutMs===undefined?{}:{requestTimeoutMs}),clock});
    this.actions=new ActionEngine({registry,store:this.stateStore,authorize:authorize?({owner,definition})=>authorize({operation:'invoke',owner,definition}):undefined,
      query:({reference,spec,inputs,signal})=>this.query.execute(reference??{query:spec},{inputs,signal}),
      variable:({reference,spec,inputs})=>this.variable(reference??spec,inputs),
      onChange:()=>{for(const view of this.views)view.refresh();}});
  }
  execution(registry) {
    const execution=Object.create(this);execution.registry=registry;execution.variables=new WeakMap();execution.configureExecution();return execution;
  }
  variable(use,inputs={}) {
    const spec=typeof use==='string'?this.registry.get('Variable',use).spec:use;
    if(!this.variables.has(spec)) {
      const schemas=Object.fromEntries(Object.entries(spec.ports??{}).map(([name,port])=>[name,this.registry.schema(port)]));
      this.variables.set(spec,compileCel(spec.expression,{inputs:schemas,functions:this.functions}));
    }
    const prepared=compilePorts({resourceKind:'Variable',ports:spec.ports,types:this.registry.types()}).prepare(inputs);
    return this.variables.get(spec)(prepared.ports);
  }
  async resolve(target) {
    if(own(target,'viewRef')===own(target,'view'))fail('INVALID_DEFINITION');
    const queued=[],seen=new Set();
    const resolve=async(kind,id)=>{
      const key=tuple([kind,id]);if(seen.has(key))return;seen.add(key);
      let resource;try{resource=this.registry.get(kind,id);}catch(caught){
        if(!this.resourceResolver)throw caught;
        resource=await this.resourceResolver(kind,id);
        if(resource?.kind!==kind||resource?.id!==id)fail('REFERENCE_NOT_FOUND');queued.push(resource);
      }
      for(const [childKind,childId] of this.registry.references(kind,resource.spec))await resolve(childKind,childId);
    };
    let spec=target.view;
    if(own(target,'viewRef')) {await resolve('View',target.viewRef);spec=(queued.find(r=>r.kind==='View'&&r.id===target.viewRef)??this.registry.get('View',target.viewRef)).spec;}
    else for(const [kind,id] of this.registry.references('View',spec))await resolve(kind,id);
    if(queued.length)this.registry.registerResources(queued);
    this.registry.validateDefinition('View',spec);return structuredClone(spec);
  }
  async createView(target) {
    if(!this.alive)fail('CANCELLED');
    const view=new View(this);this.views.add(view);
    try{return {view,...await view.replace(target)};}catch(caught){view.dispose();throw safeError(caught);}
  }
  invokeAction({owner,actionRef,action,inputs={}}) {
    if(!this.alive || !(owner instanceof View) || !this.views.has(owner) || !owner.alive) return Promise.reject(error('CANCELLED'));
    if((actionRef!==undefined)===(action!==undefined))return Promise.reject(error('INVALID_DEFINITION'));
    try{return owner.runtime.actions.invoke(owner.root.actionOwner,actionRef,inputs,action);}catch(caught){return Promise.reject(safeError(caught));}
  }
  listResources(kind) { return this.registry.list(kind); }
  exportResource(kind,id) { return this.registry.exportResource(kind,id); }
  dispose(){if(!this.alive)return;this.alive=false;for(const view of [...this.views])view.dispose();if(this.ownsStore)this.stateStore.dispose();}
}

export class View {
  constructor(host,execution=host.execution(host.registry.fork())) {
    const runtime=execution;this.host=host;this.runtime=runtime;this.alive=true;this.operation=0;this.application=0;this.generation=0;this.instances=new Map();this.owners=new Map();this.connections=new Map();this.listeners=new Set();this.diagnostics=[];this.planning=false;this.queued=false;
    this.unsubscribe=runtime.stateStore.observe(()=>this.refresh());
  }
  context(owner,extra={}) {
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
        let connection=[...(this.planConnections??this.connections).values()].find(item=>item.owner.id===owner.id&&item.handler.id===name);
        if(!connection&&this.planning){
          const previous=[...this.connections.values()].find(item=>item.owner.id===owner.id&&item.handler.id===name);
          const declared=this.actionDeclarations(owner.spec).get(name);
          if(previous&&equal(previous.handler,declared))connection=previous;
        }
        if(connection)value=connection.connection.getSnapshot();
        else if(this.planning&&this.actionNames(owner.spec).has(name))value=idle;
        else fail('REFERENCE_NOT_FOUND');
      } else if(root==='repeat') {if(!own(extra.repeat??{},name))fail('REFERENCE_NOT_FOUND');value=extra.repeat[name];}
      else if(root==='event') {if(!own(extra,'event'))fail('REFERENCE_NOT_FOUND');return {value:extra.event,offset:1};}
      else fail('REFERENCE_NOT_FOUND');
      return {value,offset:2};
    };return {functions:this.runtime.functions,resolve};
  }
  actionDeclarations(spec) {const declarations=new Map();const walk=node=>{for(const handler of Object.values(node.on??{}))if(handler.id)declarations.set(handler.id,handler);for(const content of Object.values(node.slots??{}))if(Array.isArray(content))content.forEach(walk);};if(spec.render)walk(spec.render);return declarations;}
  actionNames(spec) {const names=new Set();const walk=node=>{for(const h of Object.values(node.on??{}))if(h.id)names.add(h.id);for(const content of Object.values(node.slots??{}))if(Array.isArray(content))content.forEach(walk);};if(spec.render)walk(spec.render);return names;}
  prepareInputs(spec,templates,context,mode='automatic',literal=false,kind='Component') {
    const inputs=Object.create(null);
    if(literal)Object.assign(inputs,templates??{});
    else if(isRecord(templates??{})&&!expressionKind(templates??{},this.runtime.registry.functions)) {
      for(const [name,value] of dataEntries(templates??{})) {
        const port=spec.ports?.[name];
        if(port?.kind==='State'||port?.kind==='Query')inputs[name]=evaluate(value,context,{target:true});
        else inputs[name]=expression(()=>evaluateSnapshot(value,context));
      }
    } else Object.assign(inputs,evaluate(templates,context));
    return compilePorts({resourceKind:kind,ports:spec.ports,types:this.runtime.registry.types(),store:this.runtime.stateStore}).prepare(inputs,{mode});
  }
  makeOwner(spec,ports,id,previous,created) {
    const store=this.runtime.stateStore,registry=this.runtime.registry;
    const owner={id,spec,ports,scope:previous?.scope??store.createScope(),actionOwner:previous?.actionOwner??this.runtime.actions.owner(),states:new Map(previous?.states),computations:new Map(),queries:new Map(),reactions:previous?.reactions??[],slots:previous?.slots??{},instance:null};
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
      if(!item.handle)item.handle=createQueryHandle({getSnapshot:()=>item.usage?.getSnapshot()??{status:'waiting',data:undefined,error:null,dataInputs:undefined,stale:false,waitingReason:'INPUT_NOT_READY'},refresh:signal=>item.usage?item.usage.refresh(signal):Promise.reject(error('INPUT_NOT_READY')),retry:signal=>item.usage?item.usage.retry(signal):Promise.reject(error('INVALID_RETRY_STATE'))});
      // Preserve the object referenced by the handle; owner/use are assigned after commit.
      owner.queries.set(name,old?.identity===identity?old:item);
    }
    for(const name of validateInitials(spec,this.runtime.registry.functions)) {
      const declaration=spec.states[name],handle=owner.states.get(name),context=this.context(owner);
      if(declaration.kind==='Derived') {
        const paths=pathsIn(declaration.inputs??{},this.runtime.registry.functions);
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
            const inputs=this.prepareInputs(variable,declaration.inputs??{},context,'automatic',false,'Variable');
            if(inputs.status==='waiting')return {status:'pending'};
            return {status:'ready',value:this.runtime.variable(variable,inputs.ports)};
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
  build(spec,inputs,replace=false,stateWrites) {
    const runtime=this.runtime,registry=runtime.registry,store=runtime.stateStore,application=this.application,operation=this.operation;
    const created=[],newConnections=[],next=new Map(),owners=new Map(),connections=new Map(),aliases=new Set();
    const oldOwners=this.owners;let oldInstances=replace?new Map():this.instances,availableConnections=replace?new Map():this.connections;
    this.planConnections=connections;
    let root,roots;
    try {
      store.transaction(()=>{
        const prepared=this.prepareInputs(spec,inputs,{},'automatic',true,'View');
        root=this.makeOwner(spec,prepared.ports,replace?`view:${++nextLifetime}`:this.root?.id??`view:${++nextLifetime}`,replace?null:this.root,created);owners.set(root.id,root);
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
          const context=this.context(author,extra);
          if(node.repeat&&!repeated) {
            const snapshot=evaluateSnapshot(node.repeat.items,context);if(snapshot.status!=='ready')return [{id:node.id,status:snapshot.status,error:snapshot.error,children:[],inputs:{}}];
            if(!Array.isArray(snapshot.value))fail('TYPE_MISMATCH');const seen=new Set();
            const entries=snapshot.value.map(item=>{
              const childExtra={...extra,repeat:{...extra.repeat,[node.repeat.as]:item}},value=evaluate(node.repeat.key,this.context(author,childExtra));
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
            const connection=prior&&equal(prior.handler,handler)?prior.connection:runtime.actions.connect(author.actionOwner,{actionRef:handler.actionRef,spec:handler.action});
            if(connection!==prior?.connection)newConnections.push(connection);
            connections.set(key,{connection,handler,owner:author});
          }
          let preparation,status='ready',inputError;
          try{preparation=this.prepareInputs(childSpec,node.inputs??{},context);if(preparation.status==='waiting')status='pending';}
          catch(caught){status='error';inputError=safeError(caught);preparation={ports:{}};}
          const instance={id:node.id,address,generation,definition:identity,source:node,spec:childSpec,author,extra,inputs:preparation.ports,status,error:inputError,children:[],slots:{},owner:null};
          next.set(address,instance);
          // Missing inputs wait independently; the surrounding screen remains usable.
          if(status!=='ready'){if(preserved&&old.owner)retainSuspended(old,instance);return [instance];}
          const owner=this.makeOwner(childSpec,preparation.ports,tuple([address,generation]),preserved?old.owner:null,created);owners.set(owner.id,owner);owner.instance=instance;instance.owner=owner;
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
              watch:reaction.watch.map(value=>stateRoot(evaluate(value,this.context(owner),{target:true}),store)),
              target:stateRoot(evaluate(reaction.target,this.context(owner),{target:true}),store),value:reaction.value
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
      });
    } catch(caught){for(const connection of newConnections)connection.dispose();for(const owner of created)owner.actionOwner.dispose();throw caught;}
    if(!this.alive||application!==this.application||operation!==this.operation) {
      for(const connection of newConnections)connection.dispose();
      for(const owner of created){owner.actionOwner.dispose();owner.scope.dispose();}
      fail('CANCELLED');
    }
    const retainedConnections=new Set([...connections.values()].map(entry=>entry.connection));
    for(const connection of newConnections)if(!retainedConnections.has(connection))connection.dispose();
    for(const [key,entry] of this.connections)if(connections.get(key)?.connection!==entry.connection)entry.connection.dispose();
    for(const [id,owner] of oldOwners)if(!owners.has(id)){owner.actionOwner.dispose();for(const item of owner.queries.values())item.usage?.dispose();}
    for(const owner of owners.values()) {
      const old=oldOwners.get(owner.id);
      for(const [name,item] of old?.queries??[])if(owner.queries.get(name)!==item)item.usage?.dispose();
      for(const [name,item] of owner.queries){item.owner=owner;item.use=owner.spec.queries[name];}
    }
    this.root=root;this.roots=roots;this.instances=next;this.owners=owners;this.connections=connections;this.planConnections=null;
  }
  configureQueries() {
    const application=this.application,operation=this.operation;
    const current=()=>this.alive&&application===this.application&&operation===this.operation;
    for(const owner of this.owners.values())for(const [name,item] of owner.queries) {
      if(!current())return;
      const use=item.use,spec=use.query??this.runtime.registry.get('Query',use.queryRef).spec,context=this.context(owner);
      let inputs={},ready=true,executeWhen=true,autoRefreshWhen=true,inputError;
      try {
        const prepared=this.prepareInputs(spec,use.inputs??{},context,'automatic',false,'Query');inputs=prepared.ports;ready=!owner.suspended&&prepared.status==='ready'&&(!this.url||this.url.isReady());
        for(const key of ['executeWhen','autoRefreshWhen'])if(own(use,key)) {
          const value=evaluate(use[key],context);if(typeof value!=='boolean')fail('TYPE_MISMATCH');if(key==='executeWhen')executeWhen=value;else autoRefreshWhen=value;
        }
      }catch(caught){inputError=safeError(caught);ready=false;}
      const settings={...owner.queryDefaults,...use,inputs,ready,executeWhen,autoRefreshWhen,inputError,owner:item};
      if(!item.usage)item.usage=this.runtime.query.createUsage(use,{...settings,onChange:()=>this.schedule(),clock:this.runtime.clock});
      else item.usage.update(settings);
      if(!current()){item.usage.dispose();return;}
    }
  }
  refresh() {
    if(!this.alive||!this.root)return;
    // A subscriber can commit State while project() is publishing this plan.
    // Preserve that invalidation without recursively rebuilding or delivering
    // a newer snapshot to listeners still receiving the current one.
    if(this.planning){this.schedule();return;}
    this.planning=true;
    try{this.build(this.spec,this.inputs);this.configureQueries();this.project();}catch(caught){this.planConnections=null;this.diagnostics.push(safeError(caught));this.project();}finally{this.planning=false;}
  }
  schedule(){if(this.queued||!this.alive)return;this.queued=true;queueMicrotask(()=>{this.queued=false;this.refresh();});}
  project() {
    if(!this.alive)return;
    const application=this.application,snapshot=this.getSnapshot();for(const listener of this.listeners){if(!this.alive||application!==this.application)return;try{listener(snapshot);}catch(caught){this.diagnostics.push(safeError(caught));}}
    if(!this.alive||application!==this.application)return;
    if(this.initial && !this.queued && [...this.owners.values()].every(owner=>[...owner.queries.values()].every(item=>item.usage?.getSnapshot().status!=='running'))) {
      const queryErrors=[];for(const owner of this.owners.values())for(const [query,item] of owner.queries)if(item.usage?.getSnapshot().status==='error')queryErrors.push({instanceId:owner.id,query,error:item.usage.getSnapshot().error});
      this.initial.resolve({generation:this.generation,queryErrors});
    }
  }
  async apply(spec,inputs,replace,stateWrites,urlOptions,restoreUrl=true,execution=this.runtime) {
    if(!this.alive)fail('CANCELLED');
    const previousExecution=this.runtime;this.runtime=execution;
    const application=++this.application,operation=this.operation;
    const check=()=>{if(!this.alive||application!==this.application||operation!==this.operation)fail('CANCELLED');};
    this.planning=true;
    try{
      this.runtime.registry.validateDefinition('View',spec);
      const prepared=this.prepareInputs(spec,inputs,{},'automatic',true,'View');
      inputs=Object.freeze(Object.fromEntries(Object.keys(inputs).map(name=>[name,spec.ports[name].kind==='Value'?prepared.ports[name]:inputs[name]])));
      this.build(spec,inputs,replace,stateWrites);check();
      if(urlOptions) {
        this.url=this.runtime.stateStore.connectUrl({...urlOptions,restore:restoreUrl,bindings:urlOptions.bindings.map(({state,...binding})=>({...binding,target:this.getState(state)})),onError:diagnostic=>this.diagnostics.push(diagnostic)});
        this.url.ready.then(()=>this.schedule());
        check();this.build(spec,inputs);check();
      }
      this.spec=spec;this.inputs=inputs;this.generation++;this.initial?.reject(error('CANCELLED'));this.initial=deferred();this.configureQueries();check();this.project();check();}
    catch(caught){if(application===this.application)this.runtime=previousExecution;this.planConnections=null;throw safeError(caught);}finally{this.planning=false;}
    this.schedule();return {initialComplete:this.initial.promise};
  }
  async update(spec,{inputs=this.inputs,states}={}) {
    const next=structuredClone(spec);this.runtime.registry.validateDefinition('View',next);
    // Validate every explicit State value before any structural reconciliation.
    if(this.runtime.authorize && this.runtime.authorize({operation:'update',owner:this,definition:next})!==true)fail('EXECUTION_BLOCKED');
    if(states)for(const [name,value] of Object.entries(states)){const declaration=next.states?.[name];if(!declaration||declaration.kind!=='State')fail('REFERENCE_NOT_FOUND');try{this.runtime.registry.validator(declaration).accept(value);}catch(caught){throw safeError(caught,'TYPE_MISMATCH');}}
    return this.apply(next,inputs,false,states);
  }
  async replace(target) {
    const operation=++this.operation,spec=await this.host.resolve(target);
    if(this.root&&this.host.authorize&&this.host.authorize({operation:'update',owner:this,definition:spec})!==true)fail('EXECUTION_BLOCKED');
    const execution=this.host.execution(this.host.registry.fork());
    if(!this.alive||operation!==this.operation)fail('CANCELLED');
    const urlOptions=target.url;
    if(this.url||urlOptions) {
      // Prepare on the same Store transaction machinery, then discard the plan.
      // No requests or URL writes occur during this validation pass.
      const candidate=new View(this.host,execution);candidate.planning=true;
      try {this.runtime.stateStore.preview(()=>{
        for(const owner of this.owners.values())for(const stop of owner.reactions)stop();
        candidate.build(spec,target.inputs??{},true);
        if(urlOptions) {
          if(this.runtime.stateStore.urlConnection && this.runtime.stateStore.urlConnection!==this.url)fail('INVALID_DEFINITION');
          prepareStateUrl(this.runtime.stateStore,{...urlOptions,bindings:urlOptions.bindings?.map(({state,...binding})=>({...binding,target:candidate.getState(state)}))},this.url);
        }
      });}finally{candidate.dispose();}
    }
    const replacing=!!this.root;
    if(this.url) {const old=this.url;await old.removeOwned();if(!this.alive||operation!==this.operation)fail('CANCELLED');old.dispose();this.url=null;}
    if(!this.alive||operation!==this.operation)fail('CANCELLED');
    return this.apply(spec,target.inputs??{},true,undefined,urlOptions,!replacing,execution);
  }
  exportDefinition(){return structuredClone(this.spec);}
  getState(name,instanceId){const owner=instanceId?this.owners.get(instanceId):this.root;return owner?.states.get(name)??fail('REFERENCE_NOT_FOUND');}
  getQuery(name,instanceId){const owner=instanceId?this.owners.get(instanceId):this.root;return owner?.queries.get(name)?.handle??fail('REFERENCE_NOT_FOUND');}
  getSnapshot() {
    const serialize=instance=>Object.freeze({id:instance.id,instanceId:instance.owner?.id,address:instance.address,generation:instance.generation,componentRef:instance.source?.componentRef,status:instance.status,error:instance.error??null,inputs:instance.inputs,children:Object.freeze(instance.children.map(serialize)),slots:Object.freeze(Object.fromEntries(Object.entries(instance.slots??{}).map(([name,nodes])=>[name,Object.freeze(nodes.map(serialize))])))});
    const states=Object.create(null),queries=Object.create(null),actions=Object.create(null);
    for(const [name,handle] of this.root?.states??[])states[name]=handle.getSnapshot();
    for(const [name,item] of this.root?.queries??[])queries[name]=item.handle.getSnapshot();
    for(const entry of this.connections.values())if(entry.owner.id===this.root?.id&&entry.handler.id)actions[entry.handler.id]=entry.connection.getSnapshot();
    return Object.freeze({generation:this.generation,lifetime:this.root?.id,roots:Object.freeze((this.roots??[]).map(serialize)),states:Object.freeze(states),queries:Object.freeze(queries),actions:Object.freeze(actions),errors:Object.freeze([...this.diagnostics])});
  }
  subscribe(listener){this.listeners.add(listener);listener(this.getSnapshot());return()=>this.listeners.delete(listener);}
  emit(target,event,payload) {
    try {
      if(!this.alive)fail('CANCELLED');
      const instance=typeof target==='string'?this.instances.get(target)??[...this.instances.values()].find(item=>item.owner?.id===target):this.instances.get(target.address);
      if(!instance || (typeof target!=='string' && target.generation!==instance.generation))fail('CANCELLED');
      const contract=instance.spec.events?.[event];if(!contract)fail('REFERENCE_NOT_FOUND');let data;try{data=protect(this.runtime.registry.validator(contract).accept(payload));}catch(caught){throw safeError(caught,'TYPE_MISMATCH');}
      const handler=instance.source.on?.[event];if(!handler)return Promise.resolve();
      const context=this.context(instance.author,{...instance.extra,event:data});
      if(handler.emit){const receiver=instance.author.instance;if(!receiver)fail('REFERENCE_NOT_FOUND');return this.emit(receiver,handler.emit,evaluate(handler.payload,context));}
      const key=tuple([instance.address,instance.generation,event]),connection=this.connections.get(key)?.connection;if(!connection)fail('CANCELLED');
      const spec=handler.action??this.runtime.registry.get('Action',handler.actionRef).spec;
      return connection.invoke(()=>this.prepareInputs(spec,handler.inputs??{},context,'explicit',false,'Action').ports);
    }catch(caught){return Promise.reject(safeError(caught));}
  }
  dispose(){if(!this.alive)return;this.alive=false;++this.operation;this.initial?.reject(error('CANCELLED'));this.unsubscribe();this.url?.dispose();for(const entry of this.connections.values())entry.connection.dispose();for(const owner of this.owners.values()){owner.actionOwner.dispose();for(const item of owner.queries.values())item.usage?.dispose();owner.scope.dispose();}this.listeners.clear();this.host.views.delete(this);}
}
