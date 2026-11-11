import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const walk=async path=>(await Promise.all((await readdir(path,{withFileTypes:true})).map(entry=>entry.isDirectory()?walk(join(path,entry.name)):join(path,entry.name)))).flat();
const manifest=JSON.parse(await readFile(join(root,'upstream/site-ui-manifest.json')));
const hash=body=>createHash('sha256').update(body).digest('hex');
for(const [name,expected] of Object.entries(manifest.files))assert.equal(hash(await readFile(join(root,'src/components/ui',name))),expected,name);
assert.equal(hash(await readFile(join(root,'src/lib/utils.ts'))),manifest.utilsSha256);
const sourceFiles=await walk(join(root,'src'));
assert.equal(sourceFiles.filter(name=>/\.[jt]sx$/.test(name)).length,0,'No JSX sources remain');
const reactImport=/(?:from\s*|import\s*\(|import\s*)["'](?:react(?:-dom)?(?:\/[^"']*)?|@astrojs\/react|radix-ui|lucide-react|react-resizable-panels)["']/;
for(const name of sourceFiles.filter(name=>/\.(?:[cm]?[jt]s|svelte|astro)$/.test(name)))assert.ok(!reactImport.test(await readFile(name,'utf8')),name);
const lock=JSON.parse(await readFile(join(root,'../../package-lock.json')));
const reactPackage=/(?:^|\/)node_modules\/(?:react|react-dom|@astrojs\/react|@types\/react(?:-dom)?|@radix-ui\/react-[^/]+|radix-ui|lucide-react|react-resizable-panels|shadcn)$/;
const sitePackage=JSON.parse(await readFile(join(root,'package.json')));
const siteDependencies=[...Object.keys(sitePackage.dependencies),...Object.keys(sitePackage.devDependencies)];
const siteReactDependencies=siteDependencies.filter(name=>reactPackage.test(`node_modules/${name}`));
assert.deepEqual(siteReactDependencies,[],'The site has no React dependencies');
const uiTestDependencies=new Set(['node_modules/react','node_modules/react-dom']);
const unexpectedReactPackages=Object.entries(lock.packages).filter(([name,entry])=>
  reactPackage.test(name) && !(uiTestDependencies.has(name) && entry.dev === true)
).map(([name])=>name);
assert.deepEqual(unexpectedReactPackages,[],'Only the UI consumer fixtures may bring in React test dependencies');
let islands=0;
for(const name of (await walk(join(root,'dist'))).filter(name=>name.endsWith('.html'))){
  const html=await readFile(name,'utf8');const renderers=[...html.matchAll(/renderer-url="([^"]+)"/g)];
  assert.ok(renderers.every(([,value])=>value.includes('client.svelte')),`Only the Svelte renderer may hydrate islands: ${name}`);islands+=renderers.length;
}
console.log(JSON.stringify({componentFamilies:manifest.components.length,originalSourceFiles:Object.keys(manifest.files).length,jsxFiles:0,reactDependencies:0,svelteIslands:islands,failures:[]},null,2));
