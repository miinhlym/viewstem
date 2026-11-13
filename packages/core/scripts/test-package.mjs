import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../../',import.meta.url)),pkg=fileURLToPath(new URL('../',import.meta.url));
const directory=await mkdtemp(join(tmpdir(),'viewstem-package-consumer-'));
const execute=(command,args,cwd=directory)=>execFileSync(command,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
try {
 const [packed]=JSON.parse(execute('npm',['pack',pkg,'--pack-destination',directory,'--ignore-scripts','--json'],root));
 const paths=packed.files.map(file=>file.path),chunks=paths.filter(path=>path.startsWith('dist/chunks/'));
 assert.ok(chunks.length>0);assert.ok(chunks.every(path=>/^dist\/chunks\/chunk-[A-Z0-9]+\.js(?:\.map)?$/.test(path)));
 for(const path of chunks.filter(path=>path.endsWith('.js')))assert.ok(chunks.includes(`${path}.map`));
 assert.deepEqual(paths.filter(path=>!chunks.includes(path)).sort(),['LICENSE','README.md','README.ko.md','package.json',...['cel-support.json','cel.d.ts','cel.js','cel.js.map','http.d.ts','http.js','http.js.map','index.d.ts','index.js','index.js.map','renderer.d.ts','renderer.js','renderer.js.map','THIRD-PARTY-NOTICES.txt'].map(name=>`dist/${name}`)].sort());
 await writeFile(join(directory,'package.json'),JSON.stringify({private:true,type:'module'}));
 execute('npm',['install',join(directory,packed.filename),'--ignore-scripts','--no-audit','--no-fund']);
 const installed=join(directory,'node_modules/@viewstem/core');
 assert.equal(JSON.parse(await readFile(join(installed,'package.json'),'utf8')).license,'MIT');
 assert.equal(await readFile(join(installed,'LICENSE'),'utf8'),await readFile(join(root,'LICENSE'),'utf8'));
 assert.ok((await readFile(join(installed,'dist/THIRD-PARTY-NOTICES.txt'),'utf8')).includes(await readFile(join(pkg,'vendor/cel-js/LICENSE'),'utf8')));
 await writeFile(join(directory,'consumer.mjs'),`import assert from 'node:assert/strict';
import {createRegistry,createRuntime,createStateStore} from '@viewstem/core';
import {createHttpExecutor} from '@viewstem/core/http';
import {compileCel} from '@viewstem/core/cel';
import support from '@viewstem/core/cel-support.json' with {type:'json'};
const registry=createRegistry();registry.registerComponentContract({kind:'Component',id:'Leaf',spec:{}});
registry.registerAction({kind:'Action',id:'answer',spec:{output:{schema:{type:'boolean'}}}},()=>false);
const runtime=createRuntime({registry}),view=await runtime.createView({render:{id:'leaf',componentRef:'Leaf'}});await view.whenSettled(view.initial);
assert.equal(await view.invokeAction({actionRef:'answer'}),false);
assert.equal(compileCel('x+1',{inputs:{x:{type:'integer'}}})({x:2}),3);
const store=createStateStore(),scope=store.createScope(),cell=scope.registerState('n',{schema:{type:'integer'},initial:1});assert.equal(store.transaction(()=>{cell.write(2);return cell.read();}),2);
assert.equal(typeof createHttpExecutor(),'function');assert.ok(support);store.dispose();runtime.dispose();console.log('isolated package runtime passed');
`);
 execute(process.execPath,['consumer.mjs']);
 // Run the package-boundary suite from the isolated installation as well: it
 // must resolve only shipped exports, never workspace source or an alias.
 await writeFile(join(directory,'public-api.test.mjs'),await readFile(join(pkg,'test/public-api.test.mjs')));
 await writeFile(join(directory,'owned-lifetime.test.mjs'),await readFile(join(pkg,'test/owned-lifetime.test.mjs')));
 await writeFile(join(directory,'renderer-diagnostics.test.mjs'),await readFile(join(pkg,'test/renderer-diagnostics.test.mjs')));
 const boundaryTests = execute(process.execPath,['--test','public-api.test.mjs','owned-lifetime.test.mjs','renderer-diagnostics.test.mjs']);
 await writeFile(join(directory,'public-api.ts'),await readFile(join(pkg,'test/types/public-api.ts')));
 await writeFile(join(directory,'consumer.ts'),`import {createRegistry,createRuntime,createStateStore,type View} from '@viewstem/core';
import {createHttpExecutor} from '@viewstem/core/http';
import {compileCel} from '@viewstem/core/cel';
const registry=createRegistry();const store=createStateStore();
const cell=store.createScope().registerState('n',{schema:{type:'integer'} as const,initial:1});cell.write(2);
const answer:number=store.transaction(()=>42);
declare const view:View;const node=view.getSnapshot().roots[0];if(node)await view.emit(node,'click',{});
// @ts-expect-error schema-inferred integer rejects strings
cell.write('wrong');
const runtime=createRuntime({registry,stateStore:store,requestExecutor:createHttpExecutor()});runtime.dispose();
`);
 execute(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--lib','ES2022,DOM','consumer.ts','public-api.ts']);
 console.log(JSON.stringify({nodeVersion:process.version,package:packed.name,version:packed.version,files:packed.files.map(file=>file.path),integrity:packed.integrity,bytes:packed.size,unpackedBytes:packed.unpackedSize,license:'MIT; installed text and vendored CEL notice verified',runtime:'passed',publicBoundaryTests:Number(/^# tests (\d+)$/m.exec(boundaryTests)?.[1]),types:'passed'},null,2));
}finally{await rm(directory,{recursive:true,force:true});}
