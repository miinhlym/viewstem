import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRegistry,createRuntime,createStateStore } from '@viewstem/core';
const p=path=>({'@path':path}),i={type:'integer'},b={type:'boolean'},s={type:'string'};
const value=(schema,required=true)=>({kind:'Value',schema,required}),state=schema=>({kind:'State',schema,required:true});
const set=value=>({kind:'SetState',target:p('/ports/cell'),value});
const assertStep=(condition,message)=>({kind:'Assert',condition,...(message===undefined?{}:{message})});
const wait=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const flush=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
async function fixture(register,options={}){const registry=createRegistry();registry.registerComponentContract({kind:'Component',id:'Empty',spec:{}});register(registry);const runtime=createRuntime({registry,...options});const {view}=await runtime.createView({view:{render:{id:'root',componentRef:'Empty'}}});return{registry,runtime,view,invoke:(actionRef,inputs)=>runtime.invokeAction({owner:view,actionRef,inputs})};}
const native=(registry,id,spec,run)=>registry.registerAction({kind:'Action',id,spec},run);
const decl=(registry,id,spec)=>registry.registerResources([{kind:'Action',id,spec}]);
test('A01 A08 A23 A24: completed State and external effects survive subsequent failure',async()=>{
 let effects=0;const store=createStateStore(),scope=store.createScope(),cell=scope.registerState('cell',{schema:i,initial:0});
 const f=await fixture(r=>{native(r,'effect',{},()=>{effects++;});decl(r,'fail',{ports:{cell:state(i)},steps:[set(1),{kind:'Action',actionRef:'effect'},assertStep(false,'stop'),set(2)]});},{stateStore:store});
 await assert.rejects(f.invoke('fail',{cell}),e=>e.code==='ASSERTION_FAILED'&&e.message==='stop');assert.equal(effects,1);assert.equal(cell.read(),1);f.runtime.dispose();scope.dispose();
});
test('A04 A05 A06 A07 A18: false/null/void raw results and lexical branch scope',async()=>{
 const f=await fixture(r=>{
  native(r,'false',{output:{schema:b}},()=>false);native(r,'void',{},()=>{});native(r,'badVoid',{},()=>1);native(r,'null',{output:{schema:{type:['string','null']}}},()=>null);
  decl(r,'read',{steps:[{id:'result',kind:'Action',actionRef:'false'},{kind:'If',condition:true,then:[assertStep(p('/steps/result'),'false is preserved')]}]});
  decl(r,'declFalse',{steps:[],output:{schema:b,value:false}});decl(r,'implicit',{steps:[{kind:'Action',actionRef:'false'}]});
 });
 assert.equal(await f.invoke('false'),false);assert.equal(await f.invoke('declFalse'),false);assert.equal(await f.invoke('null'),null);assert.equal(await f.invoke('implicit'),undefined);await assert.rejects(f.invoke('badVoid'),{code:'TYPE_MISMATCH'});await assert.rejects(f.invoke('read'),{code:'ASSERTION_FAILED'});
 for(const spec of [{steps:[{kind:'Action',actionRef:'void',id:'v'}],output:{schema:true,value:p('/steps/v')}},{steps:[{kind:'If',condition:true,then:[{id:'inner',kind:'Action',actionRef:'false'}]}],output:{schema:true,value:p('/steps/inner')}}])assert.throws(()=>decl(f.registry,'invalid',spec));f.runtime.dispose();
});
test('A02 A09 A17 A19 K15: input snapshots, strict If, lazy Assert message',async()=>{
 const pending=wait();let captured;const f=await fixture(r=>{
  native(r,'snapshot',{ports:{form:value({type:'object'})},output:{schema:i}},async c=>{captured=c.inputs.form;await pending.promise;return c.inputs.form.n;});
  decl(r,'lazy',{steps:[assertStep(true,p('/ports/unprovided'))],ports:{unprovided:value(s,false)}});
  decl(r,'false',{steps:[assertStep(false)]});decl(r,'bad',{ports:{condition:value(true)},steps:[{kind:'If',condition:p('/ports/condition'),then:[]}]});
 });
 const form={n:1},run=f.invoke('snapshot',{form});form.n=9;pending.resolve();assert.equal(await run,1);assert.equal(captured.n,1);assert.throws(()=>{captured.n=2;});await f.invoke('lazy');await assert.rejects(f.invoke('false'),e=>e.code==='ASSERTION_FAILED'&&e.message==='Assertion failed');await assert.rejects(f.invoke('bad',{condition:1}),{code:'TYPE_MISMATCH'});f.runtime.dispose();
});
test('K05 U35: child recursion, awaited sequential and parallel reuse, independent external calls',async()=>{
 let f,recursive=0;const fReady=wait();
 f=await fixture(r=>{
  native(r,'recur',{},async({invokeAction})=>{recursive++;await Promise.resolve();if(recursive<3)await invokeAction({actionRef:'recur'});});
  native(r,'leaf',{ports:{n:value(i)},output:{schema:i}},({inputs})=>inputs.n);
  native(r,'parent',{output:{schema:i}},async({invokeAction})=>{const a=await invokeAction({actionRef:'leaf',inputs:{n:1}});const [b,c]=await Promise.all([invokeAction({actionRef:'leaf',inputs:{n:2}}),invokeAction({actionRef:'leaf',inputs:{n:3}})]);return a+b+c;});
  native(r,'outside',{ports:{n:value(i)},output:{schema:i}},async({inputs})=>inputs.n?f.invoke('outside',{n:0}):7);
 });
 await assert.rejects(f.invoke('recur'),{code:'ACTION_RECURSION'});assert.equal(recursive,1);assert.equal(await f.invoke('parent'),6);assert.equal(await f.invoke('outside',{n:1}),7);f.runtime.dispose();
});
test('A12 A13 K16 K37: parent cancellation bounds descendants and handles, shared state survives',async()=>{
 const store=createStateStore(),scope=store.createScope(),cell=scope.registerState('shared',{schema:i,initial:0}),pending=wait();let context,childContext,invokeChild;
 const f=await fixture(r=>{
  native(r,'child',{ports:{cell:state(i)}},async c=>{childContext=c;await pending.promise;c.inputs.cell.write(9);});
  native(r,'parent',{ports:{cell:state(i)}},async c=>{context=c;invokeChild=c.invokeAction;c.inputs.cell.write(1);await c.invokeAction({actionRef:'child',inputs:{cell:c.inputs.cell}});});
 },{stateStore:store});
 const run=f.invoke('parent',{cell});const rejected=assert.rejects(run,{code:'CANCELLED'});await flush();f.view.dispose();await rejected;assert.equal(childContext.signal.aborted,true);assert.throws(()=>context.inputs.cell.write(7),{code:'CANCELLED'});await assert.rejects(invokeChild({actionRef:'child',inputs:{cell}}),{code:'CANCELLED'});pending.resolve();await flush();assert.equal(cell.read(),1);cell.write(2);assert.equal(cell.read(),2);f.runtime.dispose();scope.dispose();
});
test('K05/K36: parent completion cancels unawaited children and retained invoker',async()=>{
 const pending=wait();let child,invoke;const f=await fixture(r=>{
  native(r,'child',{},async c=>{child=c;await pending.promise;});
  native(r,'parent',{},c=>{invoke=c.invokeAction;void invoke({actionRef:'child'});});
 });await f.invoke('parent');assert.equal(child.signal.aborted,true);await assert.rejects(invoke({actionRef:'child'}),{code:'CANCELLED'});pending.resolve();await flush();f.runtime.dispose();
});
test('A22 A25 K03 K04: preparation errors identify port and execute zero effects',async()=>{
 let calls=0;const f=await fixture(r=>native(r,'task',{ports:{text:value(s)}},()=>{calls++;}));
 for(const inputs of [{},{text:1}])await assert.rejects(f.invoke('task',inputs),e=>e.input==='text'&&e.location==='/inputs');assert.equal(calls,0);f.runtime.dispose();
});
test('K36: code recovery and finally failure; hostile errors never leak or execute getters',async()=>{
 let getter=0;const hostile=Object.defineProperty({},'code',{get(){getter++;throw Error('secret');}});
 const f=await fixture(r=>{
 native(r,'recover',{output:{schema:b}},()=>{try{throw Error('private');}catch{return false;}});
 native(r,'hostile',{},()=>{throw hostile;});native(r,'finally',{output:{schema:b}},()=>{try{return false;}finally{throw Error('private');}});
 });assert.equal(await f.invoke('recover'),false);await assert.rejects(f.invoke('hostile'),e=>e.code==='INTERNAL_ERROR'&&!JSON.stringify(e).includes('secret'));assert.equal(getter,0);await assert.rejects(f.invoke('finally'),{code:'INTERNAL_ERROR'});f.runtime.dispose();
});
