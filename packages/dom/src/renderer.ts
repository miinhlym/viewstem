import type { NodeSnapshot, PublicError, Runtime } from '@viewstem/core';
import { createRendererHost, type Renderer, type RendererErrorListener } from '@viewstem/core/renderer';
import type { ComponentConnector } from './connector.js';
import { connectBrowser } from './connection.js';
import { domConnector } from './dom-connector.js';

export interface DisplayFallbackContext {
  readonly parent: HTMLElement;
  readonly anchor: Node;
  readonly node: NodeSnapshot;
  readonly error: PublicError | null;
}
export interface MountedDisplayFallback {
  update?(context: DisplayFallbackContext): void;
  whenRendered?(): void | Promise<void>;
  dispose(): void | Promise<void>;
}
export interface BrowserDisplayOptions {
  readonly hostContext?: unknown;
  /** Insert before the anchor. Return a handle to update in place or clean up resources outside the DOM range. */
  readonly fallback?: (context: DisplayFallbackContext) => void | MountedDisplayFallback;
}
export type BrowserRenderer = Renderer<BrowserDisplayOptions, HTMLElement>;
export interface RendererOptions {
  readonly runtime: Runtime;
  readonly connectors?: readonly ComponentConnector[];
  readonly onError?: RendererErrorListener;
}

export function createRenderer({ runtime, connectors = [], onError, ...unexpected }: RendererOptions): BrowserRenderer {
  if (Object.keys(unexpected).length) throw { code: 'INVALID_DEFINITION', message: 'Pass Runtime options to createRuntime.' } satisfies PublicError;
  const implementations = new Map<string, ComponentConnector>();
  for (const connector of [domConnector, ...connectors]) {
    if (typeof connector?.id !== 'string' || !connector.id || typeof connector.accepts !== 'function'
      || typeof connector.mount !== 'function' || implementations.has(connector.id)) {
      throw { code: 'INVALID_DEFINITION', message: 'Each connector must have a distinct ID and a mount implementation.' } satisfies PublicError;
    }
    implementations.set(connector.id, connector);
  }
  return createRendererHost<BrowserDisplayOptions, HTMLElement>(runtime, {
    ownsRuntime: false,
    ...(onError ? { onError } : {}),
    validateTarget(target: HTMLElement) {
      const type = target?.ownerDocument?.defaultView?.HTMLElement;
      return Boolean(type && target instanceof type && target.isConnected);
    },
    connect: (view, target, options, onRenderError, host) => connectBrowser(view, target, implementations, options, host, onRenderError),
  });
}
