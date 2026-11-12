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
  for (const locale of ['en', 'ko']) for (const family of componentDemoSlugs) {
    const html = await readFile(join(root, 'apps/docs/dist', locale === 'ko' ? 'ko' : '', 'docs/ui/components', family, 'index.html'), 'utf8');
    const attrs = node => Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
    function* examples(node) {
      if ('data-component-demo' in attrs(node)) yield node;
      else for (const child of node.childNodes ?? []) yield* examples(child);
    }
    const rendered = [...examples(parse(html))];
    assert.ok(rendered.length, `${locale}/${family} missing example`);
    for (const example of rendered) {
      let setup;
      let source;
      let setupTabs = 0;
      let setupInTab = false;
      function visit(node, insideSetup = false, insideSetupTab = false) {
        const attributes = attrs(node);
        const classes = (attributes.class ?? '').split(' ');
        insideSetup ||= classes.includes('setup-code');
        insideSetupTab ||= classes.includes('workbench-setup');
        if (attributes['data-demo-tab'] === 'setup') setupTabs++;
        if (node.tagName === 'code' && insideSetup) {
          setup = text(node);
          setupInTab = insideSetupTab;
        }
        if (node.tagName === 'script' && 'data-demo-view' in attributes) source = text(node);
        for (const child of node.childNodes ?? []) visit(child, insideSetup, insideSetupTab);
      }
      visit(example);
      const anchor = attrs(example)['aria-labelledby'];
      assert.ok(setup && source, `${locale}/${family}#${anchor} missing setup or JSON`);
      const isVariant = 'data-demo-lazy' in attrs(example);
      assert.equal(setupTabs, isVariant ? 1 : 0, anchor);
      assert.equal(setupInTab, isVariant, anchor);
      const directory = join(temporary, `${locale}-${family}-${anchor}`);
      await mkdir(directory);
      await writeFile(join(directory, 'setup.ts'), setup);
      await writeFile(join(directory, 'view.json'), source);
      count++;
    }
  }
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(temporary, 'tsconfig.json')], { stdio: 'inherit' });
  console.log(`Type-checked ${count} exact rendered setup.ts / view.json pairs.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
