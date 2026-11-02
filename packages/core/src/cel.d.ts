import type { CelFunction, Schema } from './index.js';
export type { CelFunction, CelValue } from './index.js';

export interface CelLimits { readonly expressionChars: number; readonly inputNodes: number; readonly outputNodes: number; readonly valueBytes: number; readonly depth: number }
export const defaultCelLimits: CelLimits;
export interface CelOptions { readonly inputs?: Readonly<Record<string, Schema>>; readonly output?: Schema; readonly functions?: readonly CelFunction[]; readonly limits?: Partial<CelLimits>; readonly cost?: number }
export function compileCel(expression: string, options?: CelOptions): (bindings?: Readonly<Record<string, unknown>>) => unknown;
export function evaluateCel(expression: string, bindings: Readonly<Record<string, unknown>>, options?: CelOptions): unknown;

export {};
