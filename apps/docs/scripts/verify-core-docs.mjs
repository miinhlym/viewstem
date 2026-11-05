import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inventory } from './core-docs-inventory.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const content = path.join(root, 'apps/docs/src/content/docs');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const expected = {
  'run-view.mjs': ['Hello','Updated'],
  'state-url.mjs': ['', 'archived', 'true'],
  'http-action.mjs': ['0','Project','Hello, Viewstem'],
  'merge-url.mjs': ['https://example.test/?campaign=a%20b&filter=active#list'],
  'http-executor.mjs': ['{ ok: true }'],
  'cel-evaluation.mjs': ['3','5'],
  'grid-layout.mjs': ['{ rowSpan: 1, columnSpan: 6, row: 1, column: 7 }'],
};
const temp = fs.mkdtempSync(path.join(root, 'node_modules/.viewstem-docs-'));
const runs=[];
try {
  for (const locale of ['docs','ko/docs']) {
    const names=[];
    for (const file of walk(path.join(content, locale, 'core'))) {
      const markdown=fs.readFileSync(file,'utf8');
      for (const [,name,code] of markdown.matchAll(/```js title="([^"]+\.mjs)"\n([\s\S]*?)\n```/g)) {
        assert.ok(expected[name], `Add assertions for ${name}`);
        const target=path.join(temp,name);fs.writeFileSync(target,code);
        const output=execFileSync(process.execPath,[target],{encoding:'utf8',timeout:15000});
        assert.deepEqual(output.trimEnd().split('\n'),expected[name],file);
        names.push(name);runs.push({file:path.relative(root,file),example:name,output:output.trimEnd()});
      }
    }
    assert.deepEqual(names.sort(),Object.keys(expected).sort(),`${locale}: example coverage`);
  }
  if(!process.argv.includes('--examples-only')) {
    for(const item of inventory())for(const locale of ['','ko/']) {
      const route=locale+item.route.slice(1);
      const file=path.join(content,route.replace(/\/$/,'.md'));
      assert.ok(fs.existsSync(file)||fs.existsSync(path.join(content,route,'index.md')),`Missing reference for ${item.name}: ${route}`);
    }
  }
  console.log(JSON.stringify({examples:runs.length,publicBindings:inventory().length,runs},null,2));
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
