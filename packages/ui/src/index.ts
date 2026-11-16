import { createRuntime, type Runtime, type RuntimeOptions } from '@viewstem/core';
import { createRendererHost, type Renderer, type RendererErrorListener } from '@viewstem/core/renderer';
import { shadcnContracts } from './shadcn.js';
import { connect } from './dom.js';

export { registerShadcn } from './shadcn.js';
export type { MountedView, RenderAttachment, Renderer, RendererDiagnostic, RendererErrorListener } from '@viewstem/core/renderer';

type RuntimeCreationOptions = Extract<RuntimeOptions, { readonly registry?: never }>;
export type RendererOptions = { readonly onError?: RendererErrorListener } & (
  | ({ readonly runtime: Runtime } & { readonly [K in keyof RuntimeCreationOptions]?: never })
  | (RuntimeCreationOptions & { readonly runtime?: never })
);

/** Create a DOM renderer, borrowing an injected Runtime or owning a new one. */
export function createRenderer(options: RendererOptions = {}): Renderer {
  const { runtime, onError, ...rest } = options;
  if (runtime !== undefined && Object.keys(rest).length) {
    throw { code: 'INVALID_DEFINITION', message: 'Runtime options cannot be combined with an injected Runtime.' };
  }
  const runtimeOptions = rest as RuntimeCreationOptions;
  const instance = runtime ?? createRuntime({
    ...runtimeOptions,
    componentContracts: [...shadcnContracts, ...(runtimeOptions.componentContracts ?? [])],
  });
  return createRendererHost(instance, {
    ownsRuntime: runtime === undefined,
    ...(onError && { onError }),
    validateTarget(target) {
      const element = target as HTMLElement;
      const HTMLElementClass = element?.ownerDocument?.defaultView?.HTMLElement;
      return !!HTMLElementClass && element instanceof HTMLElementClass && element.isConnected;
    },
    connect: (view, target, _options, onRenderError, connection) => connect(view, target, onRenderError, connection),
  });
}
