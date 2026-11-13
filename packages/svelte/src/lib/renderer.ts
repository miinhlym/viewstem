import { mount, unmount } from 'svelte';
import { createRuntime } from '@viewstem/core';
import { createRendererHost } from '@viewstem/core/renderer';
import ConnectedView from './ConnectedView.svelte';
import { failure, rendererStates, transformError, type RendererState } from './connection.js';
import type { ComponentAdapter, RenderOptions, Renderer, RendererOptions } from './types.js';

export function createRenderer({ runtime: injectedRuntime, onError, components = [], ...runtimeOptions }: RendererOptions = {}): Renderer {
  if (injectedRuntime && (components.length || Object.keys(runtimeOptions).length)) throw failure('INVALID_DEFINITION', 'Runtime injection and Runtime creation options are mutually exclusive.');
  const adapters = new Map<string, ComponentAdapter>();
  for (const { contract, component } of components) {
    if (contract?.kind !== 'Component' || !contract.id || typeof component !== 'function' || adapters.has(contract.id)) throw failure('INVALID_DEFINITION', 'Each registration requires a distinct Component contract and Svelte implementation.');
    adapters.set(contract.id, component);
  }
  if (runtimeOptions.registry && components.length) throw failure('INVALID_DEFINITION', 'Component contracts cannot be supplied with an injected Registry.');
  const runtime = injectedRuntime ?? (runtimeOptions.registry
    ? createRuntime(runtimeOptions as Parameters<typeof createRuntime>[0])
    : createRuntime({ ...runtimeOptions, registry: undefined, componentContracts: [...(runtimeOptions.componentContracts ?? []), ...components.map(entry => entry.contract)] }));
  const state: RendererState = { alive: true, adapters, connections: new Set(), ownedViews: new Set(), onError };
  const host = createRendererHost<RenderOptions>(runtime, {
    ownsRuntime: !injectedRuntime, onError,
    async disposeOwned() {
      const results = await Promise.allSettled([...state.ownedViews].map(stop => stop()));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    },
    validateTarget(target: HTMLElement) {
      const constructor = target?.ownerDocument?.defaultView?.HTMLElement;
      return !!constructor && target instanceof constructor && target.isConnected;
    },
    connect(view, target, options, onRenderError, connection) {
      const instance = mount(ConnectedView, { target, context: options.context, transformError, props: {
        view, renderer, forwardRenderError: onRenderError, fallback: options.fallback,
        isOpen: connection.isOpen, emitFromHost: connection.emit,
      } });
      return { whenRendered: () => instance.whenRendered(), dispose: () => unmount(instance) };
    },
  });
  const renderer: Renderer = {
    ...host,
    bindComponent(id, component) {
      if (!state.alive || !runtime.registry.isCode('Component', id) || typeof component !== 'function' || state.adapters.has(id)) throw failure('INVALID_DEFINITION', 'Bind one Svelte implementation for an existing code Component.');
      state.adapters.set(id, component);
    },
    dispose() {
      state.alive = false;
      return host.dispose();
    },
  };
  rendererStates.set(renderer, state);
  return renderer;
}
