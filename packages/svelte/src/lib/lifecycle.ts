import { createRenderError } from '@viewstem/core/renderer';
import type { PublicError, Runtime } from '@viewstem/core';
import type { BrowserRenderer } from '@viewstem/dom';
import type { Renderer, RendererErrorListener } from './types.js';

export const failure = (code: string, message: string): PublicError => Object.freeze({ code, message });
export const cancelled = () => failure('CANCELLED', 'The renderer attachment is disposed.');
export function transformError(_cause: unknown): PublicError { return createRenderError(false); }

export interface RendererState {
  alive: boolean;
  runtime: Runtime;
  ownsRuntime: boolean;
  browser: BrowserRenderer;
  ownedCleanups: Set<() => Promise<void>>;
  onError?: RendererErrorListener;
}
export const rendererStates = new WeakMap<Renderer, RendererState>();
