import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRegistry, createStateStore } from '@viewstem/core';
import { createRuntime } from './fixtures/runtime-operations.mjs';
const string={type:'string'},integer={type:'integer'};
const port=(kind,schema=string)=>({kind,schema,required:true});
function registry(){const r=createRegistry();r.registerComponentContract({kind:'Component',id:'Text',spec:{ports:{text:port('Value')}}});r.registerComponentContract({kind:'Component',id:'Input',spec:{ports:{value:port('Value')},events:{change:{schema:string}}}});r.registerComponentContract({kind:'Component',id:'Row',spec:{slots:{default:{}}}});r.registerComponentContract({kind:'Component',id:'Button',spec:{events:{click:{schema:{type:'object'}}}}});return r;}
const node=(id,componentRef,inputs)=>({id,componentRef,...(inputs?{inputs}: {})});
const p=path=>({'@path':path});
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
test('K29/A14 input → Action → same StateStore → display and boolean observation',async()=>{
 const r=registry();r.registerAction({kind:'Action',id:'confirm',spec:{output:{schema:{type:'boolean'}}}},()=>false);
 r.registerResources([{kind:'Action',id:'set',spec:{ports:{target:port('State'),value:port('Value')},steps:[{kind:'SetState',target:p('/ports/target'),value:p('/ports/value')}]}}]);
 const runtime=createRuntime({registry:r});const {view,initialComplete: initial}=await runtime.createView({view:{states:{title:{kind:'State',schema:string,initial:'one'}},render:{...node('row','Row'),slots:{default:[{...node('input','Input',{value:p('/states/title')}),on:{change:{actionRef:'set',inputs:{target:p('/states/title'),value:p('/event')}}}},node('preview','Text',{text:p('/states/title')}),{...node('confirm','Button'),on:{click:{id:'confirmation',actionRef:'confirm'}}}]}}}});
 assert.deepEqual(await initial,{generation:1,queryErrors:[]});
 const input=view.getSnapshot().roots[0].children[0];await view.emit(input,'change','two');
 assert.equal(view.getState('title').read(),'two');assert.equal(view.getSnapshot().roots[0].children[1].inputs.text,'two');
 await view.emit(view.getSnapshot().roots[0].children[2],'click',{});assert.equal(view.getSnapshot().actions.confirmation.data,false);assert.equal(view.getSnapshot().actions.confirmation.status,'success');runtime.dispose();
});
test('C07/C15 scopes, shared State port, derived CEL and service lifetime',async()=>{
 const r=registry();r.registerResources([{kind:'Component',id:'Panel',spec:{ports:{shared:port('State',integer)},states:{count:{kind:'State',schema:integer,initial:0},twice:{kind:'Derived',schema:integer,variable:{ports:{value:port('Value',integer)},expression:'value * 2'},inputs:{value:p('/ports/shared')}}},render:node('text','Text',{text:'panel'})}}]);
 const store=createStateStore(),scope=store.createScope(),shared=scope.registerState('shared',{schema:integer,initial:2});const runtime=createRuntime({registry:r,stateStore:store});
 const {view,initialComplete: initial}=await runtime.createView({view:{ports:{shared:port('State',integer)},render:{...node('row','Row'),slots:{default:[node('a','Panel',{shared:p('/ports/shared')}),node('b','Panel',{shared:p('/ports/shared')})]}}},inputs:{shared}});await initial;
 const [a,b]=view.getSnapshot().roots[0].children;assert.notEqual(a.instanceId,b.instanceId);assert.equal(view.getState('twice',a.instanceId).read(),4);
 shared.write(3);assert.equal(view.getState('twice',b.instanceId).read(),6);view.dispose();assert.equal(shared.read(),3);scope.dispose();runtime.dispose();
});
test('U05/U08 conditional/repeat identity and cancellation on actual removal',async()=>{
 const r=registry();let release,signal;
 r.registerAction({kind:'Action',id:'wait',spec:{output:{schema:integer}}},context=>{signal=context.signal;return new Promise(resolve=>release=resolve);});
 const runtime=createRuntime({registry:r});const spec={states:{show:{kind:'State',schema:{type:'boolean'},initial:true}},render:{...node('row','Row'),slots:{default:[{...node('button','Button'),when:p('/states/show'),on:{click:{id:'waiting',actionRef:'wait'}}}]}}};
 const {view}=await runtime.createView({view:spec});const pending=view.emit(view.getSnapshot().roots[0].children[0],'click',{});view.getState('show').write(false);assert.equal(signal.aborted,true);await assert.rejects(pending,{code:'CANCELLED'});release(3);await flush();view.getState('show').write(true);assert.equal(view.getSnapshot().actions.waiting.status,'idle');runtime.dispose();
});
test('Q01/K18 query input changes publish current data only, view initial settles',async()=>{
 const r=registry(),requests=[];r.registerResources([{kind:'Query',id:'q',spec:{ports:{id:port('Value',integer)},sources:{main:{datasource:{kind:'Http',baseUrl:'https://example.test'},request:{method:'GET',path:'items'}}},transform:{input:p('/sources/main')}}}]);
 const runtime=createRuntime({registry:r,requestExecutor:(plan,{signal})=>new Promise(resolve=>requests.push({plan,signal,resolve}))});
 const {view,initialComplete: initial}=await runtime.createView({view:{states:{id:{kind:'State',schema:integer,initial:1}},queries:{list:{queryRef:'q',inputs:{id:p('/states/id')}}},render:node('label','Text',{text:p('/queries/list/data')})}});
 await flush();assert.equal(requests.length,1);requests[0].resolve({status:200,headers:{},body:'one'});await initial;await flush();assert.equal(view.getSnapshot().roots[0].inputs.text,'one');view.getState('id').write(2);await flush();assert.equal(requests.length,2);requests[1].resolve({status:200,headers:{},body:'two'});await flush();assert.equal(view.getSnapshot().roots[0].inputs.text,'two');runtime.dispose();
});
