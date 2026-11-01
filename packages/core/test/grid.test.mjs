import test from 'node:test';
import assert from 'node:assert/strict';
import { gridLayout } from '@viewstem/core';
const node=id=>({id});
const item=(id,address=id)=>({id,address});
test('U08 Grid rejects fixed overlap, partial coordinates, invalid integers and range instead of moving',()=>{
 for(const layout of [{a:{row:1}},{a:{column:1}},{a:{row:0,column:1}},{a:{row:1.5,column:1}},{a:{columnSpan:13}},{a:{row:1,column:2}},{a:{row:1,column:1},b:{row:1,column:1}}])assert.throws(()=>gridLayout([node('a'),node('b')],[item('a'),item('b')],layout),{code:'INVALID_DEFINITION'});
});
test('U09 Grid reserves fixed nodes first and searches whole rectangles forward in expanded order',()=>{
 const result=gridLayout([node('a'),node('fixed'),{id:'repeat',repeat:{}}],[item('a'),item('repeat','r1'),item('repeat','r2'),item('fixed')],{fixed:{row:2,column:3,columnSpan:2},a:{rowSpan:2,columnSpan:3},repeat:{columnSpan:5}});
 assert.deepEqual(result.get('fixed'),{rowSpan:1,columnSpan:2,row:2,column:3});
 assert.deepEqual(result.get('a'),{rowSpan:2,columnSpan:3,row:1,column:5});
 assert.deepEqual(result.get('r1'),{rowSpan:1,columnSpan:5,row:1,column:8});
 assert.deepEqual(result.get('r2'),{rowSpan:1,columnSpan:5,row:2,column:8});
 assert.throws(()=>gridLayout([{id:'repeat',repeat:{}}],[],{repeat:{row:1,column:1}}),{code:'INVALID_DEFINITION'});
});
test('U10 Grid hidden declarations validate layout but consume no space; unknown layout ids reject',()=>{
 const declarations=[node('visible'),{id:'hidden',when:false}],expanded=[item('visible')];
 const result=gridLayout(declarations,expanded,{hidden:{row:1,column:1}});
 assert.equal(result.size,1);assert.equal(result.get('visible').row,1);assert.equal(result.get('visible').column,1);
 assert.throws(()=>gridLayout(declarations,expanded,{absent:{}}),{code:'INVALID_DEFINITION'});
 assert.throws(()=>gridLayout(declarations,expanded,{hidden:{row:1}}),{code:'INVALID_DEFINITION'});
});
