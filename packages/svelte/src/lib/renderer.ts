import { mount, tick, unmount } from 'svelte';
import { createRuntime, type ComponentBinding, type ComponentContract } from '@viewstem/core';
import { createRenderError, notifyDiagnostic } from '@viewstem/core/renderer';
import type { View } from '@viewstem/core';
import { createRenderer as createBrowserRenderer, type BrowserDisplayOptions, type ComponentConnector } from '@viewstem/dom';
import ComponentMount from './ComponentMount.svelte';
import FallbackMount from './FallbackMount.svelte';
import { cancelled, failure, rendererStates, transformError } from './lifecycle.js';
import type { ComponentAdapter, RenderOptions, Renderer, RendererOptions } from './types.js';

export const SVELTE_CONNECTOR_ID = 'svelte';
export function svelteComponent<const C extends ComponentContract>(
  contract: C, implementation: ComponentAdapter<NoInfer<C>>,
): ComponentBinding<ComponentAdapter<C>> {
  if (typeof implementation !== 'function') throw failure('INVALID_DEFINITION', 'A Svelte binding requires a Svelte component.');
  return { contract, connectorId: SVELTE_CONNECTOR_ID, implementation };
}

export const svelteConnector: ComponentConnector = Object.freeze<ComponentConnector>({
  id: SVELTE_CONNECTOR_ID,
  renderUnready: true,
  accepts: value => typeof value === 'function',
  mount(implementation, context) {
    let failed: ReturnType<typeof createRenderError> | undefined;
    const mounted = mount(ComponentMount, {
      target: context.parent, anchor: context.anchor, transformError,
      ...(context.hostContext instanceof Map ? { context: context.hostContext } : {}),
      props: {
        adapter: implementation as ComponentAdapter, initial: context.node, provideSlot: context.provideSlot,
        emit(event, payload) { const result = context.emit(event, payload); void result.catch(() => {}); return result; },
        report() {
          failed = createRenderError(false, {
            ...(context.node.componentRef === undefined ? {} : { componentId: context.node.componentRef }),
            ...(context.node.instanceId === undefined ? {} : { instanceId: context.node.instanceId }),
          });
          context.invalidate();
        },
      },
    });
    return {
      update: node => mounted.update(node),
      setPending: pending => mounted.setPending(pending),
      async whenRendered(signal) {
        await tick();
        if (signal.aborted) throw cancelled();
        if (failed) throw failed;
      },
      dispose: () => unmount(mounted),
    };
  },
});

function browserOptions({ context, fallback, onError }: RenderOptions = {}): BrowserDisplayOptions & Pick<RenderOptions, 'onError'> {
  return {
    hostContext: context,
    ...(onError ? { onError } : {}),
    ...(fallback ? { fallback: ({ parent, anchor, node, error }) => {
      let failed = false;
      const instance = mount(FallbackMount, {
        target: parent, anchor, transformError, ...(context ? { context } : {}), props: { node, error, fallback, report() { failed = true; } },
      });
      return {
        update(next) { instance.update(next.node, next.error); },
        async whenRendered() { await tick(); if (failed) throw createRenderError(false); },
        dispose: () => unmount(instance),
      };
    } } : {}),
  };
}

export function attachComponentView(renderer: Renderer, view: View, target: HTMLElement, options: RenderOptions, isOpen: () => boolean) {
  const state = rendererStates.get(renderer);
  if (!state?.alive) throw cancelled();
  const browser = createBrowserRenderer({ runtime: state.runtime, connectors: state.connectors });
  return browser.attach(view, target, browserOptions({ ...options, onError: diagnostic => notifyDiagnostic(diagnostic,
    { listener: state.onError, isOpen: () => state.alive && isOpen() }, { listener: options.onError, isOpen },
  ) }));
}

export function createRenderer({ runtime: injected, onError, connectors = [], ...runtimeOptions }: RendererOptions = {}): Renderer {
  if (injected && Object.keys(runtimeOptions).length) throw failure('INVALID_DEFINITION', 'Runtime injection and Runtime options are mutually exclusive.');
  const runtime = injected ?? createRuntime(runtimeOptions as Parameters<typeof createRuntime>[0]);
  const browserConnectors = [svelteConnector, ...connectors];
  const browser = createBrowserRenderer({ runtime, connectors: browserConnectors, ...(onError ? { onError } : {}) });
  const state = { alive: true, runtime, connectors: browserConnectors, ownedViews: new Set<() => Promise<void>>(), ...(onError ? { onError } : {}) };
  let cleanup: Promise<void> | undefined;
  const renderer: Renderer = {
    runtime,
    mount({ context, fallback, onError, ...options }) {
      if (!state.alive) throw cancelled();
      return browser.mount({ ...options, ...browserOptions({ ...(context ? { context } : {}), ...(fallback ? { fallback } : {}), ...(onError ? { onError } : {}) }) });
    },
    attach(view, target, options) {
      if (!state.alive) throw cancelled();
      return browser.attach(view, target, browserOptions(options));
    },
    dispose() {
      if (cleanup) return cleanup;
      state.alive = false;
      let resolve!: () => void;
      let reject!: (reason: unknown) => void;
      cleanup = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
      if (!injected) runtime.dispose();
      const work = [browser.dispose(), ...[...state.ownedViews].map(close => close())];
      void Promise.allSettled(work).then(results => {
        const failed = results.find(result => result.status === 'rejected');
        if (failed) reject(failed.reason); else resolve();
      });
      return cleanup;
    },
  };
  rendererStates.set(renderer, state);
  return renderer;
}
