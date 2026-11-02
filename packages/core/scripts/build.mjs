import { build } from 'esbuild';
import { mkdtemp,copyFile,readFile,writeFile,rename,rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prepareCel } from './prepare-cel.mjs';
await prepareCel();
const root=new URL('../',import.meta.url),temporary=await mkdtemp(new URL('.core-build-',root));
const output=name=>`${temporary}/${name}`;
try {
  // Complete every required artifact before replacing the generated distribution.
  for(const name of ['index','http','cel'])await copyFile(new URL(`src/${name}.d.ts`,root),output(`${name}.d.ts`));
  // Shared value/capability modules must have one identity across entrypoints.
  // Independently bundling root/CEL would duplicate their private WeakMaps.
  await build({entryNames:'[name]',chunkNames:'chunks/[name]-[hash]',splitting:true,outdir:temporary,bundle:true,format:'esm',platform:'neutral',target:'es2022',packages:'external',entryPoints:Object.fromEntries(['index','http','cel'].map(name=>[name,fileURLToPath(new URL(`src/${name}.mjs`,root))])),sourcemap:true});
  const license=await readFile(new URL('vendor/cel-js/LICENSE',root),'utf8');
  await writeFile(output('THIRD-PARTY-NOTICES.txt'),`cel-js 8.0.0 with Viewstem patches\n\n${license}`);
  await copyFile(new URL('src/cel/supported-functions.json',root),output('cel-support.json'));
  await rm(new URL('dist/',root),{recursive:true,force:true});
  await rename(temporary,new URL('dist/',root));
} finally { await rm(temporary,{recursive:true,force:true}); }
