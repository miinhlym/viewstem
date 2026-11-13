import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, createStateStore, mergeOwnedUrl } from '@viewstem/core';
import { createRuntime } from './fixtures/runtime-operations.mjs';
const p=path=>({'@path':path}),number={type:'number'},state=initial=>({kind:'State',schema:number,initial});
const registry=()=>{const r=createRegistry();r.registerComponentContract({kind:'Component',id:'Row',spec:{slots:{default:{}}}});r.registerComponentContract({kind:'Component',id:'Leaf',spec:{ports:{value:{kind:'Value',schema:true}}}});r.registerComponentContract({kind:'Component',id:'Button',spec:{events:{click:{schema:true}}}});return r;};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
test('C13/M05 replacing View reactions on shared targets succeeds with and without URL preflight',async()=>{
 for(const withUrl of [false,true]){
 const store=createStateStore(),scope=store.createScope(),watch=scope.registerState('watch',{schema:number,initial:1}),target=scope.registerState('target',{schema:number,initial:5});
 const r=registry(),runtime=createRuntime({registry:r,stateStore:store});
 const spec={ports:{watch:{kind:'State',schema:number,required:true},target:{kind:'State',schema:number,required:true}},states:{local:state(1)},reactions:[{watch:[p('/ports/watch')],target:p('/ports/target'),value:0}],render:{id:'leaf',componentRef:'Leaf'}};
 let href='https://example.test/?external=1';const adapter={read:()=>href,subscribe:()=>()=>{},writeOwned(patch,{isCurrent}){if(isCurrent())href=mergeOwnedUrl(href,patch);return{applied:true};}};
 const request={view:spec,inputs:{watch,target},...(withUrl?{url:{adapter,bindings:[{state:'local'}]}}:{})};
 const {view}=await runtime.createView(request);await (await view.replace(request)).initialComplete;watch.write(2);assert.equal(target.read(),0);runtime.dispose();store.dispose();
 }
});
test('A11 running notification reentry ignores same connection without starting a second native call',async t=>{
 const r=registry();let starts=0,finish;r.registerAction({kind:'Action',id:'wait',spec:{}},()=>{starts++;return new Promise(resolve=>finish=resolve);});
 const runtime=createRuntime({registry:r});t.after(()=>runtime.dispose());const {view}=await runtime.createView({view:{render:{id:'button',componentRef:'Button',on:{click:{id:'busy',actionRef:'wait'}}}}});
 let duplicate,entered=false;view.subscribe(snapshot=>{if(snapshot.actions.busy.running&&!entered){entered=true;duplicate=view.emit(snapshot.roots[0],'click',null);}});
 const active=view.emit(view.getSnapshot().roots[0],'click',null);assert.equal(starts,1);assert.equal(await duplicate,undefined);finish();await active;
});
test('M01/C13 simultaneous State and reaction configuration uses new definitions and final projection',async t=>{
 const runtime=createRuntime({registry:registry()});t.after(()=>runtime.dispose());const original={states:{watch:state(1),target:state(5)},reactions:[{watch:[p('/states/watch')],target:p('/states/target'),value:0}],render:{id:'leaf',componentRef:'Leaf',inputs:{value:p('/states/target')}}};
 const {view}=await runtime.createView({view:original});const next=structuredClone(original);next.reactions[0].value=9;
 const seen=[];view.subscribe(snapshot=>seen.push(snapshot.states.target.value));await (await view.update(next,{states:{watch:2}})).initialComplete;
 assert.equal(view.getState('target').read(),9);assert.equal(view.getSnapshot().roots[0].inputs.value,9);assert.ok(!seen.includes(0));
 const removed=structuredClone(next);removed.reactions=[];await (await view.update(removed,{states:{watch:3,target:5}})).initialComplete;assert.equal(view.getState('target').read(),5);
 const explicit=structuredClone(next);await (await view.update(explicit,{states:{watch:4,target:7}})).initialComplete;assert.equal(view.getState('target').read(),7);
});
test('C13/M01 simultaneous reaction target exchange across live owners is atomic',async t=>{
 const r=registry(),store=createStateStore(),scope=store.createScope();t.after(()=>store.dispose());const a=scope.registerState('a',{schema:number,initial:1}),b=scope.registerState('b',{schema:number,initial:2}),watch=scope.registerState('watch',{schema:number,initial:0});
 const sp={kind:'State',schema:number,required:true};r.registerResources([{kind:'Component',id:'Reactor',spec:{ports:{watch:sp,target:sp},reactions:[{watch:[p('/ports/watch')],target:p('/ports/target'),value:0}],render:{id:'leaf',componentRef:'Leaf'}}}]);
 const spec={ports:{a:sp,b:sp,watch:sp},render:{id:'row',componentRef:'Row',slots:{default:[{id:'a',componentRef:'Reactor',inputs:{watch:p('/ports/watch'),target:p('/ports/a')}},{id:'b',componentRef:'Reactor',inputs:{watch:p('/ports/watch'),target:p('/ports/b')}}]}}};
 const runtime=createRuntime({registry:r,stateStore:store});t.after(()=>runtime.dispose());const {view}=await runtime.createView({view:spec,inputs:{a,b,watch}});const next=structuredClone(spec);next.render.slots.default[0].inputs.target=p('/ports/b');next.render.slots.default[1].inputs.target=p('/ports/a');await (await view.update(next)).initialComplete;watch.write(1);assert.equal(a.read(),0);assert.equal(b.read(),0);
});
test('M01 final reaction-driven invalid tree rolls back State config and active connection',async t=>{
 const r=registry();let signal,finish;r.registerAction({kind:'Action',id:'wait',spec:{}},context=>{signal=context.signal;return new Promise(resolve=>finish=resolve);});
 const spec={states:{watch:state(1),items:{kind:'State',schema:{type:'array',items:number},initial:[1]}},render:{id:'row',componentRef:'Row',slots:{default:[{id:'button',componentRef:'Button',on:{click:{id:'busy',actionRef:'wait'}}},{id:'item',componentRef:'Leaf',repeat:{items:p('/states/items'),as:'item',key:p('/repeat/item')}}]}}};
 const runtime=createRuntime({registry:r});t.after(()=>runtime.dispose());const {view}=await runtime.createView({view:spec});const active=view.emit(view.getSnapshot().roots[0].children[0],'click',null),old=view.getState('watch'),generation=view.getSnapshot().generation;
 const invalid=structuredClone(spec);invalid.reactions=[{watch:[p('/states/watch')],target:p('/states/items'),value:[1,1]}];
 await assert.rejects(view.update(invalid,{states:{watch:2}}),{code:'INVALID_DEFINITION'});assert.equal(old.read(),1);assert.equal(view.getSnapshot().generation,generation);assert.deepEqual(view.exportDefinition(),spec);assert.equal(signal.aborted,false);finish();await active;await flush();assert.equal(view.getSnapshot().actions.busy.status,'success');
});

test('M01/U05 intermediate staged when=false does not destroy a finally retained instance',async t=>{
 const r=registry();r.registerResources([{kind:'Component',id:'Counter',spec:{states:{count:state(0)},render:{id:'leaf',componentRef:'Leaf',inputs:{value:p('/states/count')}}}}]);
 const spec={states:{watch:state(1),selected:state(1),show:{kind:'Derived',schema:{type:'boolean'},variable:{ports:{watch:{kind:'Value',schema:number,required:true},selected:{kind:'Value',schema:number,required:true}},expression:'watch == selected'},inputs:{watch:p('/states/watch'),selected:p('/states/selected')}}},reactions:[{watch:[p('/states/watch')],target:p('/states/selected'),value:2}],render:{id:'counter',componentRef:'Counter',when:p('/states/show')}};
 const runtime=createRuntime({registry:r});t.after(()=>runtime.dispose());const {view}=await runtime.createView({view:spec});const before=view.getSnapshot().roots[0],count=view.getState('count',before.instanceId);count.write(9);
 await (await view.update(spec,{states:{watch:2}})).initialComplete;assert.equal(view.getState('show').read(),true);assert.equal(view.getSnapshot().roots[0].instanceId,before.instanceId);assert.equal(view.getState('count',before.instanceId),count);assert.equal(count.read(),9);
});
