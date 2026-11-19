import {
  type ComponentValue, type FunctionNode, isTokenNode, isWhiteSpaceOrCommentNode, parseListOfComponentValues,
} from '@csstools/css-parser-algorithms';
import { type TokenIdent, type TokenString, isTokenIdent, mutateIdent, tokenize } from '@csstools/css-tokenizer';

export function parseCssValue(css: string): ComponentValue[] {
  return parseListOfComponentValues(tokenize({ css }));
}

export function valueToken(node: ComponentValue | undefined) {
  return isTokenNode(node) ? node.value : undefined;
}

export function cssIdentifier(css: string) {
  const values = parseCssValue(css).filter(node => !isWhiteSpaceOrCommentNode(node));
  const token = valueToken(values[0]);
  return values.length === 1 && isTokenIdent(token) ? token : undefined;
}

export function variableName(node: FunctionNode) {
  const first = valueToken(node.value.find(item => !isWhiteSpaceOrCommentNode(item)));
  return isTokenIdent(first) ? first : undefined;
}

export function renameCssName(token: TokenIdent | TokenString, name: string): void {
  if (isTokenIdent(token)) {
    mutateIdent(token, name);
  } else {
    const prefix = name.slice(0, name.length - token[4].value.length);
    token[1] = token[1][0] + prefix + token[1].slice(1);
    token[4].value = name;
  }
}
