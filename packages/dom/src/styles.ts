import { scopedPropertyName, styleOwnerAttribute, styleScopePrefix } from './styles-owner.js';

export interface StyleScope {
  mark<E extends Element>(element: E): E;
  /** Resolve a local CSS custom property for inline styles. Public properties keep their original names. */
  localProperty(name: `--${string}`): string;
  createElement<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, options?: ElementCreationOptions): HTMLElementTagNameMap[K];
  createElement<K extends keyof HTMLElementDeprecatedTagNameMap>(document: Document, tag: K, options?: ElementCreationOptions): HTMLElementDeprecatedTagNameMap[K];
  createElement(document: Document, tag: string, options?: ElementCreationOptions): HTMLElement;
  createElementNS<K extends keyof SVGElementTagNameMap>(document: Document, namespace: 'http://www.w3.org/2000/svg', tag: K): SVGElementTagNameMap[K];
  createElementNS(document: Document, namespace: 'http://www.w3.org/2000/svg', tag: string): SVGElement;
  createElementNS<K extends keyof MathMLElementTagNameMap>(document: Document, namespace: 'http://www.w3.org/1998/Math/MathML', tag: K): MathMLElementTagNameMap[K];
  createElementNS(document: Document, namespace: 'http://www.w3.org/1998/Math/MathML', tag: string): MathMLElement;
  createElementNS<K extends keyof HTMLElementTagNameMap>(document: Document, namespace: 'http://www.w3.org/1999/xhtml', tag: K): HTMLElementTagNameMap[K];
  createElementNS(document: Document, namespace: 'http://www.w3.org/1999/xhtml', tag: string): HTMLElement;
  createElementNS(document: Document, namespace: string | null, tag: string): Element;
}

/** Mark elements owned by the author of the matching scoped stylesheet. */
export function createStyleScope(id: string): StyleScope {
  const prefix = styleScopePrefix(id);

  function localProperty(name: `--${string}`): string {
    if (typeof name !== 'string' || !name.startsWith('--') || name.length < 3) {
      throw new TypeError('Expected a CSS custom property name beginning with "--".');
    }
    return scopedPropertyName(prefix, name);
  }

  function mark<E extends Element>(element: E): E {
    const owner = element.getAttribute(styleOwnerAttribute);
    if (owner === null) element.setAttribute(styleOwnerAttribute, id);
    else if (owner !== id) throw new TypeError(`Element is already marked by style scope "${owner}".`);
    return element;
  }

  // The DOM's return type depends on its tag and namespace, which are forwarded unchanged.
  const createElement = ((document: Document, tag: string, options?: ElementCreationOptions) =>
    mark(document.createElement(tag, options))) as StyleScope['createElement'];
  const createElementNS = ((document: Document, namespace: string | null, tag: string) =>
    mark(document.createElementNS(namespace, tag))) as StyleScope['createElementNS'];

  return { mark, localProperty, createElement, createElementNS };
}
