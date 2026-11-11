import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { componentDemoSlugs } from '../src/examples/component-demos.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'viewstem-component-setup-'));
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
try {
  await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
  await writeFile(join(temporary, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    strict: true, noEmit: true, skipLibCheck: true, target: 'ES2022', module: 'ESNext',
    moduleResolution: 'Bundler', resolveJsonModule: true, allowSyntheticDefaultImports: true,
    types: [], lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  }, include: ['**/*.ts'] }));
  let count = 0;
  for (const renderer of ['ui', 'svelte-ui']) for (const locale of ['en', 'ko']) for (const family of componentDemoSlugs) {
    const html = await readFile(join(root, 'apps/docs/dist', locale === 'ko' ? 'ko' : '', `docs/${renderer}/components`, family, 'index.html'), 'utf8');
    let setup;
    let source;
    function visit(node, insideSetup = false) {
      const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
      insideSetup ||= (attrs.class ?? '').split(' ').includes('setup-code');
      if (node.tagName === 'code' && insideSetup) setup = text(node);
      if (node.tagName === 'script' && 'data-demo-view' in attrs) source = text(node);
      for (const child of node.childNodes ?? []) visit(child, insideSetup);
    }
    visit(parse(html));
    assert.ok(setup && source, `${locale}/${family} missing setup or JSON`);
    const directory = join(temporary, `${renderer}-${locale}-${family}`);
    await mkdir(directory);
    await writeFile(join(directory, 'setup.ts'), setup);
    await writeFile(join(directory, 'view.json'), source);
    count++;
  }
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(temporary, 'tsconfig.json')], { stdio: 'inherit' });
  console.log(`Type-checked ${count} exact rendered setup.ts / view.json pairs.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
