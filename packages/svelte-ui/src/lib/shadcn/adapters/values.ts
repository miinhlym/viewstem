import { parseDate } from '@internationalized/date';
import type { Definition } from './types.js';
const invalid = (message: string): never => { throw Object.freeze({ code: 'INVALID_DEFINITION', message }); };
export function copy(value: any): any {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}
export function sameInputValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (!Array.isArray(left)) {
    const leftPrototype = Object.getPrototypeOf(left);
    const rightPrototype = Object.getPrototypeOf(right);
    if ((leftPrototype !== Object.prototype && leftPrototype !== null) ||
        (rightPrototype !== Object.prototype && rightPrototype !== null)) return false;
  }
  const entries = Object.entries(left);
  return entries.length === Object.keys(right).length && entries.every(([key, value]) =>
    Object.hasOwn(right, key) && sameInputValue(value, (right as Record<string, unknown>)[key]));
}
export function decode(value: any, codec?: string): any {
  if (value === undefined || (codec && value === null)) return undefined;
  if (codec === 'date') return parseDate(value);
  if (codec === 'dateArray') return value.map((date: string) => parseDate(date));
  if (codec === 'dateOrArray') return Array.isArray(value) ? value.map(date => parseDate(date)) : parseDate(value);
  if (codec === 'dateRange') return { start: value.start ? parseDate(value.start) : undefined, end: value.end ? parseDate(value.end) : undefined };
  return copy(value);
}
export function encode(value: any, codec?: string): any {
  if (value === undefined || value === null) return null;
  if (codec === 'date') return value.toString();
  if (codec === 'dateArray' || codec === 'dateOrArray') return Array.isArray(value) ? value.map(date => date.toString()) : value.toString();
  if (codec === 'dateRange') return { start: value.start?.toString() ?? null, end: value.end?.toString() ?? null };
  return copy(value);
}
export function domPayload(event: any): Record<string, unknown> {
  const output: Record<string, unknown> = { type: String(event?.type ?? '') };
  const target = event?.currentTarget ?? event?.target;
  if (target && typeof target.value === 'string') output.value = target.value;
  if (target && typeof target.checked === 'boolean') output.checked = target.checked;
  for (const key of ['key','code','button','buttons','altKey','ctrlKey','metaKey','shiftKey']) if (['string','boolean','number'].includes(typeof event?.[key])) output[key] = event[key];
  return output;
}
/** PinInput's pinned oninput policy, applied to the final composition value. */
export function committedText(definition: Definition, inputs: Record<string, unknown>, value: string): string | undefined {
  if (definition.id !== 'shadcn.InputOtp.Root') return value;
  const next = value.slice(0, Number(inputs.maxlength));
  if (next.length && typeof inputs.pattern === 'string' && !new RegExp(inputs.pattern).test(next)) return undefined;
  return next;
}
export function validateInputs(definition: Definition, inputs: Record<string, unknown>): void {
  if (['calendar','accordion','select','toggle-group','slider'].includes(definition.family)) {
    const mode = inputs.type;
    if (mode === 'multiple' && inputs.value != null && !Array.isArray(inputs.value)) invalid('Multiple selection requires an array value.');
    if (mode === 'single' && Array.isArray(inputs.value)) invalid('Single selection requires one value.');
  }
  for (const key of ['href','src','action','formaction']) {
    const value = inputs[key];
    if (typeof value === 'string') {
      let protocol: string | undefined;
      try { protocol = new URL(value, 'https://viewstem.invalid/').protocol; } catch { /* Native elements handle malformed non-executable URLs. */ }
      if (protocol === 'javascript:' || protocol === 'vbscript:') invalid('Executable URL schemes are not supported.');
    }
  }
  if (definition.id === 'shadcn.Chart.Container') {
    if (inputs.id !== undefined && (typeof inputs.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(inputs.id))) invalid('Chart id must be a CSS-safe identifier.');
    const config = inputs.config;
    if (config && typeof config === 'object') for (const [key, entry] of Object.entries(config)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) invalid('Chart series keys must be CSS-safe identifiers.');
      const colors = [(entry as { color?: unknown }).color, ...Object.values((entry as { theme?: Record<string, unknown> }).theme ?? {})].filter(value => value !== undefined);
      if (colors.some(value => typeof value !== 'string' || /[<>;{}]/.test(value) || !CSS.supports('color', value))) invalid('Invalid chart color.');
    }
  }
}
const childCallbacks = new WeakMap<Function, WeakMap<Function, Function>>();
function mergeChildCallback(injected: Function, own: Function): Function {
  let matches = childCallbacks.get(injected);
  if (!matches) childCallbacks.set(injected, matches = new WeakMap());
  let merged = matches.get(own);
  if (!merged) {
    merged = (...args: unknown[]) => { injected(...args); if (!(args[0] as any)?.defaultPrevented) own(...args); };
    matches.set(own, merged);
  }
  return merged;
}
export function mergeChild(injected: Record<PropertyKey, unknown> | undefined, props: Record<PropertyKey, unknown>): Record<PropertyKey, unknown> {
  if (!injected) return props;
  const result = { ...injected, ...props };
  for (const key of Reflect.ownKeys(injected)) {
    if (typeof key === 'symbol') result[key] = injected[key];
    else if (key.startsWith('on') && typeof injected[key] === 'function' && typeof props[key] === 'function') {
      result[key] = mergeChildCallback(injected[key], props[key]);
    } else if (key === 'class') result[key] = [injected[key], props[key]].filter(Boolean).join(' ');
  }
  return result;
}
