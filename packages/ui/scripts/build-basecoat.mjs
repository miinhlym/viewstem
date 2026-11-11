import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('basecoat-css/package.json'));
const packageInfo = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
if (packageInfo.version !== '1.1.0') throw new Error('Expected basecoat-css 1.1.0');
const outputDir = fileURLToPath(new URL('../dist/', import.meta.url));
const css = postcss.parse(readFileSync(join(packageRoot, 'dist/basecoat-nova.cdn.css'), 'utf8'));
const marker = '[data-viewstem-ui]';
const scope = `:where(${marker}, ${marker} *)`;
const dark = ':is(.dark, [data-theme="dark"])';

// Scope the subject of each outermost selector. Nested CSS inherits that anchor.
// Root and body defaults belong on the renderer root, not the host document.
css.walkRules((rule) => {
  let ancestor = rule.parent;
  while (ancestor && ancestor.type !== 'rule' && ancestor.type !== 'root') {
    if (ancestor.type === 'atrule' && /keyframes$/i.test(ancestor.name)) return;
    ancestor = ancestor.parent;
  }
  const nested = ancestor?.type === 'rule';
  rule.selector = rule.selector.replaceAll('html.dark', dark);
  if (nested) return;
  if (rule.selector === '.dark') {
    rule.selector = `${marker}:where(${dark}, ${dark} *)`;
    return;
  }
  rule.selector = selectorParser((selectors) => {
    for (const selector of selectors.nodes) {
      selector.walk((node) => {
        if ((node.type === 'pseudo' && (node.value === ':root' || node.value === ':host')) ||
            (node.type === 'tag' && (node.value === 'html' || node.value === 'body'))) {
          node.replaceWith(selectorParser.attribute({ attribute: 'data-viewstem-ui' }));
        }
      });
      const guard = selectorParser().astSync(scope).first.first;
      const pseudoElement = selector.nodes.find((node) => node.type === 'pseudo' && (node.value.startsWith('::') || [':before', ':after'].includes(node.value)));
      if (pseudoElement) {
        guard.spaces.before = pseudoElement.spaces.before;
        pseudoElement.spaces.before = '';
        selector.insertBefore(pseudoElement, guard);
      } else selector.append(guard);
    }
  }).processSync(rule.selector);
});

// Registrations, keyframes and layer names are global even when rules are scoped.
// Namespace them to avoid changing other Tailwind or Basecoat consumers on the page.
const keyframes = new Set();
css.walkAtRules('keyframes', (rule) => {
  keyframes.add(rule.params);
  rule.params = `viewstem-ui-${rule.params}`;
});
css.walkDecls((decl) => {
  if (/^(animation(?:-name)?|--animate-)/.test(decl.prop)) {
    for (const name of keyframes) {
      decl.value = decl.value.replace(new RegExp(`(^|[\\s,])${name}(?=[\\s,]|$)`, 'g'), `$1viewstem-ui-${name}`);
    }
  }
});
css.walkAtRules('layer', (rule) => {
  rule.params = rule.params.replace(/\b(properties|theme|base|components|utilities)\b/g, 'viewstem-ui-$1');
});
const output = css.toString().replaceAll('--tw-', '--viewstem-ui-tw-');
mkdirSync(outputDir, { recursive: true });
const styles = ['styles.css', 'menus.css', 'markup-families.css', 'widget-families.css', 'form-scroll-families.css']
  .map(file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'));
writeFileSync(join(outputDir, 'styles.css'), `/* Basecoat CSS ${packageInfo.version}, Nova; scoped for Viewstem. */\n${output}\n${styles.join('\n')}`);
copyFileSync(join(packageRoot, 'LICENSE.md'), join(outputDir, 'BASECOAT-LICENSE.md'));
