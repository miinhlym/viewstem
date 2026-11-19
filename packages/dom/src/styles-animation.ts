import { type ComponentValue, isFunctionNode } from '@csstools/css-parser-algorithms';
import { isTokenComma, isTokenIdent, isTokenNumber, isTokenString } from '@csstools/css-tokenizer';
import { renameCssName, valueToken, variableName } from './styles-css-values.js';

export type AnimationForm = 'name' | 'shorthand';

// A keyword in the shorthand fills its usual slot before it can denote a keyframe name.
const keywordSlots = new Map([
  ['linear', 'easing'], ['ease', 'easing'], ['ease-in', 'easing'], ['ease-out', 'easing'],
  ['ease-in-out', 'easing'], ['step-start', 'easing'], ['step-end', 'easing'],
  ['infinite', 'iteration'],
  ['normal', 'direction'], ['reverse', 'direction'], ['alternate', 'direction'], ['alternate-reverse', 'direction'],
  ['none', 'fill'], ['forwards', 'fill'], ['backwards', 'fill'], ['both', 'fill'],
  ['running', 'play-state'], ['paused', 'play-state'],
  ['auto', 'duration'],
]);
const easingFunctions = new Set(['linear', 'cubic-bezier', 'steps']);
const globalKeywords = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer']);

export function rewriteAnimation(
  values: ComponentValue[],
  form: AnimationForm,
  keyframes: ReadonlyMap<string, string>,
  useVariable: (name: string, form: AnimationForm) => void,
  usedSlots = new Set<string>(),
): void {
  for (const node of values) {
    if (isFunctionNode(node)) {
      const name = node.getName().toLowerCase();
      if (form === 'shorthand' && easingFunctions.has(name)) usedSlots.add('easing');
      if (name === 'var') {
        const variable = variableName(node);
        if (variable) useVariable(variable[4].value, form);
        const comma = node.value.findIndex(item => isTokenComma(valueToken(item)));
        if (comma !== -1) rewriteAnimation(node.value.slice(comma + 1), form, keyframes, useVariable, new Set(usedSlots));
      }
      continue;
    }
    const token = valueToken(node);
    if (isTokenComma(token)) usedSlots.clear();
    if (isTokenNumber(token) && form === 'shorthand') usedSlots.add('iteration');
    if (isTokenIdent(token)) {
      const keyword = token[4].value.toLowerCase();
      const slot = form === 'shorthand' ? keywordSlots.get(keyword) : undefined;
      if (slot && !usedSlots.has(slot)) {
        usedSlots.add(slot);
        continue;
      }
      if (keyword === 'none' || globalKeywords.has(keyword)) continue;
    }
    if (!isTokenIdent(token) && !isTokenString(token)) continue;
    const replacement = keyframes.get(token[4].value);
    if (replacement) renameCssName(token, replacement);
  }
}
