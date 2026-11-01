import { build } from 'esbuild';
import { mkdir,copyFile,readFile,writeFile } from 'node:fs/promises';
import { prepareCel } from './prepare-cel.mjs';
await prepareCel();
const root=new URL('../',import.meta.url);await mkdir(new URL('dist/',root),{recursive:true});
await build({entryNames:'[name]',outdir:new URL('dist/',root).pathname,bundle:true,format:'esm',platform:'neutral',target:'es2022',packages:'external',entryPoints:{index:new URL('src/index.mjs',root).pathname,http:new URL('src/http/index.mjs',root).pathname},sourcemap:true});
for(const name of ['index','http'])try{await copyFile(new URL(`src/${name}.d.ts`,root),new URL(`dist/${name}.d.ts`,root));}catch(error){if(error.code!=='ENOENT')throw error;}
const license=await readFile(new URL('vendor/cel-js/LICENSE',root),'utf8');await writeFile(new URL('dist/THIRD-PARTY-NOTICES.txt',root),`cel-js 8.0.0 with Viewstem patches\n\n${license}`);

await copyFile(new URL('src/cel/supported-functions.json',root),new URL('dist/cel-support.json',root));
