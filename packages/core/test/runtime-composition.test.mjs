import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '@viewstem/core';
import { createRuntime } from './fixtures/runtime-operations.mjs';
const p=path=>({'@path':path}),integer={type:'integer'},value={kind:'Value',schema:integer,required:true};
const base=()=>{const r=createRegistry();r.registerComponentContract({kind:'Component',id:'Row',spec:{slots:{default:{}}}});r.registerComponentContract({kind:'Component',id:'Label',spec:{ports:{n:value}}});return r;};
test('K01 ref and inline Component Query Derived use the same declared inputs and never capture surrounding values',async t=>{
 const registry=base();const variable={ports:{n:value},expression:'n * 2'},query={ports:{n:value},sources:{},transform:{input:p('/ports/n')}},component={ports:{n:value},states:{d:{kind:'Derived',schema:integer,variableRef:'double',inputs:{n:p('/ports/n')}}},render:{id:'label',componentRef:'Label',inputs:{n:p('/states/d')}}};
 registry.registerResources([{kind:'Variable',id:'double',spec:variable},{kind:'Query',id:'q',spec:query},{kind:'Component',id:'Panel',spec:component}]);
 const inline=structuredClone(component);delete inline.states.d.variableRef;inline.states.d.variable=variable;
 const runtime=createRuntime({registry});t.after(()=>runtime.dispose());
 const {view,initialComplete: initial}=await runtime.createView({view:{ports:{n:{kind:'Value',schema:integer}},states:{n:{kind:'State',schema:integer,initial:4}},queries:{ref:{queryRef:'q',inputs:{n:p('/states/n')}},inline:{query,inputs:{n:p('/states/n')}},unconnected:{queryRef:'q',inputs:{n:p('/ports/n')}}},render:{id:'row',componentRef:'Row',slots:{default:[{id:'ref',componentRef:'Panel',inputs:{n:p('/states/n')}},{id:'inline',component:inline,inputs:{n:p('/states/n')}},{id:'unconnected',componentRef:'Panel',inputs:{n:p('/ports/n')}}]}}}});await initial;
 const [a,b,c]=view.getSnapshot().roots[0].children;assert.equal(a.children[0].inputs.n,8);assert.equal(b.children[0].inputs.n,8);assert.equal(c.status,'pending');assert.equal(view.getQuery('ref').getSnapshot().data,4);assert.equal(view.getQuery('inline').getSnapshot().data,4);assert.equal(view.getQuery('unconnected').getSnapshot().status,'waiting');
 for(const render of [{id:'bad',componentRef:'Panel',component:inline},{id:'bad'}])await assert.rejects(view.update({render}),{code:'INVALID_DEFINITION'});
 assert.throws(()=>registry.registerResources([{kind:'View',id:'bad',spec:{states:{bad:{kind:'Derived',schema:integer,variableRef:'double',variable,inputs:{n:1}}},render:{id:'row',componentRef:'Row'}}}]),{code:'INVALID_DEFINITION'});
 assert.throws(()=>registry.registerResources([{kind:'Query',id:'bad',spec:{sources:{bad:{queryRef:'q',query}},transform:{input:1}}}]),{code:'INVALID_DEFINITION'});
});
test('K21 repeat computes every key before item when and does not evaluate hidden inputs or start hidden Query',async t=>{
 const registry=base();registry.registerResources([{kind:'Component',id:'Fetcher',spec:{ports:{n:value},queries:{load:{query:{sources:{http:{datasource:{kind:'Http',baseUrl:'https://example.test'},request:{method:'GET',path:'data'}}},transform:{input:p('/sources/http')}}}},render:{id:'label',componentRef:'Label',inputs:{n:p('/ports/n')}}}}]);
 let requests=0;const runtime=createRuntime({registry,requestExecutor:async()=>{requests++;return{status:200,headers:{},body:1};}});t.after(()=>runtime.dispose());
 const repeated={id:'row',componentRef:'Fetcher',repeat:{items:[{id:1,show:false},{id:2,show:true,n:5}],as:'row',key:p('/repeat/row/id')},when:p('/repeat/row/show'),inputs:{n:p('/repeat/row/n')}};
 const wrap=child=>({id:'container',componentRef:'Row',slots:{default:[child]}});
 const {view,initialComplete: initial}=await runtime.createView({view:{render:wrap(repeated)}});await initial;assert.equal(view.getSnapshot().roots[0].children.length,1);assert.equal(view.getSnapshot().roots[0].children[0].inputs.n,5);assert.equal(requests,1);
 const duplicate=structuredClone(repeated);duplicate.repeat.items=[{id:1,show:false},{id:1,show:false}];await assert.rejects(view.update({render:wrap(duplicate)}),{code:'INVALID_DEFINITION'});assert.equal(requests,1);
 const child={id:'child',componentRef:'Label',repeat:{items:[1],as:'row',key:p('/repeat/row')},inputs:{n:1}};
 const nested={id:'root',componentRef:'Row',repeat:{items:[1],as:'row',key:p('/repeat/row')},slots:{default:[child]}};
 await assert.rejects(view.update({render:wrap(nested)}),{code:'INVALID_DEFINITION'});
 const siblings={id:'root',componentRef:'Row',slots:{default:[child,{...structuredClone(child),id:'sibling'}]}};await (await view.update({render:siblings})).initialComplete;assert.equal(view.getSnapshot().roots[0].children.length,2);
});
test('V02/K07 whole declared context paths are data and are not reevaluated',async t=>{
 const registry=base();registry.registerComponentContract({kind:'Component',id:'Object',spec:{ports:{value:{kind:'Value',schema:{type:'object'},required:true}}}});
 registry.registerResources([{kind:'Action',id:'copy',spec:{ports:{n:value},steps:[],output:{schema:{type:'object'},value:p('/ports')}}},{kind:'Action',id:'forward',spec:{ports:{n:value},steps:[{kind:'Action',id:'copied',actionRef:'copy',inputs:p('/ports')}],output:{schema:{type:'object'},value:p('/steps/copied')}}}]);
 const runtime=createRuntime({registry});t.after(()=>runtime.dispose());const {view}=await runtime.createView({view:{ports:{n:value},render:{id:'object',componentRef:'Object',inputs:{value:p('/ports')}}},inputs:{n:7}});
 assert.equal(view.getSnapshot().roots[0].inputs.value.n,7);assert.equal((await runtime.invokeAction({owner:view,actionRef:'forward',inputs:{n:8}})).n,8);
});

test('U03 renderer snapshot preserves named slot boundaries and multiple authored nodes',async t=>{
 const registry=base();registry.registerComponentContract({kind:'Component',id:'Layout',spec:{slots:{header:{},body:{}}}});
 const runtime=createRuntime({registry});t.after(()=>runtime.dispose());const {view}=await runtime.createView({view:{render:{id:'layout',componentRef:'Layout',slots:{header:[{id:'a',componentRef:'Label',inputs:{n:1}},{id:'b',componentRef:'Label',inputs:{n:2}}],body:[{id:'c',componentRef:'Label',inputs:{n:3}}]}}}});
 const root=view.getSnapshot().roots[0];assert.deepEqual(root.slots.header.map(node=>node.id),['a','b']);assert.deepEqual(root.slots.body.map(node=>node.id),['c']);assert.deepEqual(root.children.map(node=>node.id),['a','b','c']);assert.ok(Object.isFrozen(root.slots.header));
});
