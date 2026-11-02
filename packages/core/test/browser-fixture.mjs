// A deliberately small test-only DOM/History adapter; the package has no DOM dependency.
import { createRegistry,createRuntime,createStateStore,mergeOwnedUrl } from '@viewstem/core';
const p=path=>({'@path':path}),integer={type:'integer'},port=(kind,schema=integer)=>({kind,schema,required:true});
export async function startBrowserFixture() {
 const registry=createRegistry();
 registry.registerComponentContract({kind:'Component',id:'Row',spec:{slots:{default:{}}}});
 registry.registerComponentContract({kind:'Component',id:'Input',spec:{ports:{value:port('Value')},events:{change:{schema:integer}}}});
 registry.registerComponentContract({kind:'Component',id:'Text',spec:{ports:{text:port('Value',{type:'string'})}}});
 registry.registerComponentContract({kind:'Component',id:'Button',spec:{events:{click:{schema:{type:'object'}}}}});
 registry.registerResources([
  {kind:'Variable',id:'double',spec:{ports:{n:port('Value')},expression:'n * 2'}},
  {kind:'Action',id:'set',spec:{ports:{cell:port('State'),value:port('Value')},steps:[{kind:'SetState',target:p('/ports/cell'),value:p('/ports/value')}]}},
  {kind:'Query',id:'load',spec:{ports:{n:port('Value')},sources:{response:{datasource:{kind:'Http',baseUrl:location.origin},request:{method:'GET',path:'/api',params:{n:p('/ports/n')}}}},transform:{input:p('/sources/response')}}}
 ]);
 registry.registerAction({kind:'Action',id:'confirm',spec:{output:{schema:{type:'boolean'}}}},()=>false);
 let calls=0;const writes=[];
 const adapter={read:()=>location.href,subscribe(listener){const onPop=()=>listener();addEventListener('popstate',onPop);return()=>removeEventListener('popstate',onPop);},writeOwned(patch,{mode,isCurrent}){if(!isCurrent())return {applied:false};history[mode==='push'?'pushState':'replaceState'](null,'',mergeOwnedUrl(location.href,patch));writes.push({patch,mode});return {applied:true};}};
 const store=createStateStore(),service=store.createScope(),shared=service.registerState('shared',{schema:integer,initial:42});
 const runtime=createRuntime({registry,stateStore:store});
 const spec={states:{count:{kind:'State',schema:integer,initial:1},twice:{kind:'Derived',schema:integer,variableRef:'double',inputs:{n:p('/states/count')}}},queries:{result:{queryRef:'load',inputs:{n:p('/states/count')}}},render:{id:'row',componentRef:'Row',slots:{default:[
  {id:'input',componentRef:'Input',inputs:{value:p('/states/count')},on:{change:{actionRef:'set',inputs:{cell:p('/states/count'),value:p('/event')}}}},
  {id:'result',componentRef:'Text',inputs:{text:p('/queries/result/data/label')}},
  {id:'confirm',componentRef:'Button',on:{click:{id:'confirmed',actionRef:'confirm'}}}
 ]}}};
 const mounted=await runtime.createView({view:spec,url:{adapter,bindings:[{state:'count',history:'push'}]}}),{view}=mounted;
 const paint=snapshot=>{
  const children=snapshot.roots[0]?.children??[];
  document.querySelector('#count').value=children.find(node=>node.id==='input')?.inputs.value??'';
  document.querySelector('#result').textContent=children.find(node=>node.id==='result')?.inputs.text??'pending';
  document.querySelector('#double').textContent=snapshot.states.twice?.value??'pending';
 };
 view.subscribe(paint);
 document.querySelector('#count').addEventListener('input',event=>{calls++;const target=view.getSnapshot().roots[0].children.find(node=>node.id==='input');view.emit(target,'change',Number(event.target.value)).catch(error=>window.errors.push(error));});
 document.querySelector('#confirm').addEventListener('click',()=>{view.emit(view.getSnapshot().roots[0].children.find(node=>node.id==='confirm'),'click',{}).catch(error=>window.errors.push(error));});
 window.errors=[];
 return {runtime,view,store,shared,writes,initialComplete:mounted.initialComplete,get calls(){return calls;},async replace(){const next=structuredClone(spec);next.states.count.initial=7;const result=await view.replace({view:next,url:{adapter,bindings:[{state:'count',history:'push'}]}});await result.initialComplete;},dispose(){runtime.dispose();store.dispose();}};
}
