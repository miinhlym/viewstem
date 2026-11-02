import type { Awaitable, HttpExecutionPlan, HttpResponse } from './index.js';
export type { HttpExecutionPlan, HttpResponse, RequestExecutor } from './index.js';

export interface HttpExecutorOptions {
  readonly transport?: typeof fetch; readonly requestTimeoutMs?: number; readonly caller?: unknown;
  readonly clock?: { readonly now: () => number; readonly set: (callback: () => void, milliseconds: number) => unknown; readonly clear: (token: unknown) => void };
  readonly authorize?: (context: { readonly caller: unknown; readonly destination: string }) => Awaitable<boolean>;
  readonly resolveSecret?: (reference: string, context: { readonly caller: unknown; readonly destination: string; readonly signal: AbortSignal }) => Awaitable<string>;
}
export function createHttpExecutor(options?: HttpExecutorOptions): (plan: HttpExecutionPlan, context?: { readonly signal?: AbortSignal }) => Promise<HttpResponse>;

export {};
