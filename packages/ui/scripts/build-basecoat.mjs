import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { scopeUiCss } from '@viewstem/dom/styles/postcss';
import { styleScope, styleScopeId } from '../dist/style-scope.js';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('basecoat-css/package.json'));
const packageInfo = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
if (packageInfo.version !== '1.1.0') throw new Error('Expected basecoat-css 1.1.0');
const outputDir = fileURLToPath(new URL('../dist/', import.meta.url));
const readCss = path => readFileSync(path, 'utf8');
const css = postcss.parse(readCss(join(packageRoot, 'dist/basecoat-vega.cdn.css')));
const dark = ':is(.dark, [data-theme="dark"])';
const palette = new Set();

css.walkRules(rule => {
  switch (rule.selector) {
    case ':root, :host':
      // Basecoat utilities reference these defaults on each owned element.
      rule.selector = '*';
      return;
    case ':root':
    case '.dark': {
      const light = rule.selector === ':root';
      rule.selector = light ? '*' : `:where(${dark}, ${dark} *)`;
      rule.walkDecls(/^--/, declaration => {
        const name = declaration.prop.slice(2);
        if (name.endsWith('-icon') || name.endsWith('-icon-50')) return;
        palette.add(name);
        declaration.value = `var(--viewstem-${name}, var(${styleScope.localProperty(`--legacy-${name}`)}, ${declaration.value}))`;
      });
      return;
    }
  }
  if (/^(html(?:$|,|:has\()|body$)/.test(rule.selector)) {
    // Viewstem does not set page background, document scrolling or host fonts.
    rule.remove();
    return;
  }
  rule.selector = rule.selector.replaceAll('html.dark', dark);
});

for (const file of ['styles.css', 'menus.css', 'markup-families.css', 'widget-families.css', 'form-scroll-families.css']) {
  css.append(postcss.parse(readCss(new URL('../src/' + file, import.meta.url))));
}

const result = await postcss([scopeUiCss(styleScopeId)]).process(css, { from: undefined });

// The old attribute is an explicit palette boundary. It reads the old token
// names at that boundary and exposes them only under UI-specific names.
const legacyTheme = postcss.rule({ selector: ':where([data-viewstem-ui])' });
for (const name of palette) legacyTheme.append({ prop: styleScope.localProperty(`--legacy-${name}`), value: `var(--${name})` });
result.root.append(legacyTheme);

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'styles.css'), `/* Basecoat CSS ${packageInfo.version}, Vega; scoped for Viewstem. */\n${result.root.toString()}`);
writeFileSync(join(outputDir, 'styles.css.d.ts'), 'export {};\n');
copyFileSync(join(packageRoot, 'LICENSE.md'), join(outputDir, 'BASECOAT-LICENSE.md'));
