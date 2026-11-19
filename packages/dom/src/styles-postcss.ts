import {
  type ComponentValue, isFunctionNode, isSimpleBlockNode, isWhiteSpaceOrCommentNode, stringify, walk,
} from '@csstools/css-parser-algorithms';
import {
  isTokenAtKeyword, isTokenColon, isTokenComma, isTokenIdent, isTokenString, mutateIdent, tokenize,
} from '@csstools/css-tokenizer';
import { Rule, type AtRule, type ChildNode, type Declaration, type Plugin, type Root } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { rewriteAnimation, type AnimationForm } from './styles-animation.js';
import { cssIdentifier, parseCssValue, renameCssName, valueToken, variableName } from './styles-css-values.js';
import { styleOwnerAttribute, validateStyleScopeId } from './styles-owner.js';

export interface ScopeUiCssOptions {
  publicProperties?: readonly string[];
}

const pluginName = 'viewstem-scope-ui-css';
const keyframesRule = /^(?:-webkit-|-moz-|-o-)?keyframes$/;
const animationProperty = /^(?:-webkit-|-moz-|-o-)?animation(-name)?$/;
const legacyPseudoElements = new Set([':before', ':after', ':first-letter', ':first-line']);
const crossingPseudos = new Set(['::part', '::slotted', '::v-deep', ':deep', ':global']);

function pseudoName(raw: string): string {
  const colon = raw.startsWith('::') ? '::' : ':';
  const name = raw.slice(colon.length);
  return colon + (name.includes('\\') ? cssIdentifier(name)?.[4].value ?? name : name).toLowerCase();
}

function guardSelector(rule: Rule, id: string): void {
  const guardSyntax = `:where([${styleOwnerAttribute}="${id}"])`;
  rule.selector = selectorParser(selectors => {
    selectors.walkPseudos(pseudo => {
      const name = pseudoName(pseudo.value);
      if (crossingPseudos.has(name) || name.startsWith('::view-transition')) {
        throw rule.error(`"${pseudo.value}" cannot be scoped to the originating UI element.`, { plugin: pluginName });
      }
    });
    for (const selector of selectors.nodes) {
      let pseudoElement: selectorParser.Pseudo | undefined;
      let hasGuard = false;
      for (const node of selector.nodes) {
        if (node.type === 'combinator') {
          pseudoElement = undefined;
          hasGuard = false;
        }
        if (node.type === 'pseudo') {
          hasGuard ||= node.value === ':where' && node.toString().trim() === guardSyntax;
          if (!pseudoElement && (node.value.startsWith('::') || legacyPseudoElements.has(pseudoName(node.value)))) {
            pseudoElement = node;
          }
        }
      }
      // Leave matching guards in place when a published stylesheet is processed again.
      if (hasGuard) continue;
      const guard = selectorParser.pseudo({ value: ':where', nodes: [
        selectorParser.selector({ value: '', nodes: [selectorParser.attribute({
          attribute: styleOwnerAttribute, operator: '=', value: id, quoteMark: '"', raws: { value: `"${id}"` },
        })] }),
      ] });

      if (pseudoElement) {
        guard.rawSpaceBefore = pseudoElement.rawSpaceBefore;
        pseudoElement.rawSpaceBefore = '';
        selector.insertBefore(pseudoElement, guard);
      } else {
        const last = selector.last;
        if (last) {
          guard.rawSpaceAfter = last.rawSpaceAfter;
          last.rawSpaceAfter = '';
        }
        selector.append(guard);
      }
    }
  }).processSync(rule);
}

function ancestorAtRule(node: ChildNode, isMatch: (name: string) => boolean): boolean {
  for (let parent: ChildNode['parent'] | Root['parent'] = node.parent;
       parent && parent.type !== 'document'; parent = parent.parent) {
    if (parent.type === 'atrule' && isMatch((parent as AtRule).name.toLowerCase())) return true;
  }
  return false;
}

function atRuleName(rule: AtRule): string {
  // PostCSS can place the escaped continuation of an at-rule name in its params.
  const afterName = rule.raws.afterName ?? ' ';
  if (rule.name.includes('\\') || (afterName === '' && rule.params.startsWith('\\'))) {
    const raw = '@' + rule.name + afterName + rule.params;
    const token = tokenize({ css: raw })[0];
    if (isTokenAtKeyword(token)) {
      rule.name = token[4].value;
      const params = raw.slice(token[3] + 1);
      rule.params = params.trimStart();
      rule.raws.afterName = params.slice(0, params.length - rule.params.length);
    }
  }
  return rule.name.toLowerCase();
}

function scopeLayers(rule: AtRule, prefix: string): void {
  if (ancestorAtRule(rule, name => name === 'layer')) return;
  const values = parseCssValue(rule.params);
  let start = true;
  for (const value of values) {
    if (isWhiteSpaceOrCommentNode(value)) continue;
    const token = valueToken(value);
    if (start && isTokenIdent(token) && !token[4].value.startsWith(prefix)) {
      mutateIdent(token, prefix + token[4].value);
    }
    start = isTokenComma(token);
  }
  rule.params = stringify([values]);
}

// Direct declarations in @scope implicitly target the scope root.
function makeScopeSubjectsExplicit(rule: AtRule): void {
  let subject: Rule | undefined;
  for (const node of [...rule.nodes ?? []]) {
    if (node.type !== 'decl') {
      subject = undefined;
      continue;
    }
    if (!subject) {
      subject = new Rule({ selector: ':where(:scope)' });
      if (node.source) subject.source = node.source;
      rule.insertBefore(node, subject);
    }
    subject.append(node);
  }
}

function renamedSymbol(name: string, emitted: string, kind: string, source: ChildNode, names: Map<string, string>): string {
  const previous = names.get(emitted);
  if (previous !== undefined && previous !== name) {
    throw source.error(`Both "${previous}" and "${name}" map to the same ${kind} "${emitted}".`, { plugin: pluginName });
  }
  names.set(emitted, name);
  return emitted;
}

function rewriteVariable(node: ComponentValue, properties: ReadonlyMap<string, string>): void {
  if (!isFunctionNode(node) || node.getName().toLowerCase() !== 'var') return;
  const token = variableName(node);
  const replacement = token && properties.get(token[4].value);
  if (token && replacement && replacement !== token[4].value) mutateIdent(token, replacement);
}

/** Compile a UI set's assembled CSS for use with createStyleScope(id). */
export function scopeUiCss(id: string, { publicProperties = [] }: ScopeUiCssOptions = {}): Plugin {
  validateStyleScopeId(id);
  const prefix = id + '-';
  const publicNames = new Set(publicProperties.map(property => {
    const name = cssIdentifier(property)?.[4].value;
    if (!name?.startsWith('--') || name.length < 3) {
      throw new TypeError(`"${property}" is not a CSS custom property name.`);
    }
    return name;
  }));

  return {
    postcssPlugin: pluginName,
    Once(root) {
      const properties = new Map<string, string>();
      const propertyOutputs = new Map<string, string>();
      const propertyValues = new Map<string, Declaration[]>();
      const keyframes = new Map<string, string>();
      const keyframesOutputs = new Map<string, string>();

      function declareProperty(name: string, source: ChildNode): string {
        const existing = properties.get(name);
        if (existing) return existing;
        const scopedName = publicNames.has(name) || name.startsWith('--' + prefix) ? name : '--' + prefix + name.slice(2);
        const emitted = renamedSymbol(name, scopedName, 'custom property', source, propertyOutputs);
        properties.set(name, emitted);
        return emitted;
      }

      function addPropertyValue(name: string, declaration: Declaration): void {
        const values = propertyValues.get(name);
        if (values) values.push(declaration);
        else propertyValues.set(name, [declaration]);
      }

      root.walkAtRules(rule => {
        const name = atRuleName(rule);
        if (name === 'import') {
          throw rule.error('Inline @import before applying scopeUiCss.', { plugin: pluginName });
        }
        if (name === 'page' || name === 'view-transition') {
          throw rule.error(`@${name} affects the whole document. Declare it in the host stylesheet.`, { plugin: pluginName });
        }
        if (name === 'layer') scopeLayers(rule, prefix);
        if (name === 'scope') makeScopeSubjectsExplicit(rule);
        if (name === 'property') {
          const token = cssIdentifier(rule.params);
          if (!token?.[4].value.startsWith('--') || token[4].value.length < 3) {
            throw rule.error('Expected a CSS custom property name after @property.', { plugin: pluginName });
          }
          const original = token[4].value;
          const emitted = declareProperty(original, rule);
          if (emitted !== original) {
            mutateIdent(token, emitted);
            rule.params = rule.params.slice(0, token[2]) + token[1] + rule.params.slice(token[3] + 1);
          }
          for (const node of rule.nodes ?? []) {
            if (node.type === 'decl' && node.prop.toLowerCase() === 'initial-value') addPropertyValue(original, node);
          }
        }
        if (keyframesRule.test(name)) {
          const values = parseCssValue(rule.params);
          const token = valueToken(values.find(value => !isWhiteSpaceOrCommentNode(value)));
          if (!isTokenIdent(token) && !isTokenString(token)) {
            throw rule.error('Expected a CSS keyframe name.', { plugin: pluginName });
          }
          const original = token[4].value;
          const scopedName = original.startsWith(prefix) ? original : prefix + original;
          const emitted = renamedSymbol(original, scopedName, 'keyframe name', rule, keyframesOutputs);
          keyframes.set(original, emitted);
          if (original !== emitted) renameCssName(token, emitted);
          rule.params = stringify([values]);
        }
      });

      root.walkRules(rule => {
        if (!ancestorAtRule(rule, name => keyframesRule.test(name))) guardSelector(rule, id);
      });

      const animationValues = new Map<Declaration, Set<AnimationForm>>();
      const animationQueue: [Declaration, AnimationForm][] = [];
      function queueAnimation(declaration: Declaration, form: AnimationForm): void {
        let forms = animationValues.get(declaration);
        if (!forms) animationValues.set(declaration, forms = new Set());
        if (forms.has(form)) return;
        forms.add(form);
        animationQueue.push([declaration, form]);
      }

      root.walkDecls(decl => {
        const token = decl.prop.includes('\\') ? cssIdentifier(decl.prop) : undefined;
        const property = token?.[4].value ?? decl.prop;
        if (property.startsWith('--')) {
          const emitted = declareProperty(property, decl);
          if (emitted !== property) {
            if (token) {
              mutateIdent(token, emitted);
              decl.prop = token[1];
            } else decl.prop = emitted;
          }
          addPropertyValue(property, decl);
        }
        if (keyframes.size) {
          const animation = animationProperty.exec(property.toLowerCase());
          if (animation) queueAnimation(decl, animation[1] ? 'name' : 'shorthand');
        }
      });
      for (const [decl, form] of animationQueue) {
        const values = parseCssValue(decl.value);
        rewriteAnimation(values, form, keyframes, (name, usage) => {
          for (const source of propertyValues.get(name) ?? []) queueAnimation(source, usage);
        });
        decl.value = stringify([values]);
      }

      root.walkDecls(decl => {
        if (!/var\(|\\/i.test(decl.value)) return;
        const values = parseCssValue(decl.value);
        walk(values, ({ node }) => rewriteVariable(node, properties));
        decl.value = stringify([values]);
      });
      root.walkAtRules(rule => {
        const name = rule.name.toLowerCase();
        if (name !== 'container' && name !== 'supports') return;
        if (!rule.params.includes('--') && !rule.params.includes('\\')) return;
        const values = parseCssValue(rule.params);
        walk(values, ({ node }) => {
          rewriteVariable(node, properties);
          const styleQuery = isFunctionNode(node) && node.getName().toLowerCase() === 'style' && name === 'container';
          if (!styleQuery && !(isSimpleBlockNode(node) && name === 'supports')) return;
          const [first, second] = node.value.filter(value => !isWhiteSpaceOrCommentNode(value));
          const token = valueToken(first);
          if (isTokenIdent(token) && (isTokenColon(valueToken(second)) || (styleQuery && !second))) {
            const replacement = properties.get(token[4].value);
            if (replacement && replacement !== token[4].value) mutateIdent(token, replacement);
          }
        });
        rule.params = stringify([values]);
      });
    },
  };
}
