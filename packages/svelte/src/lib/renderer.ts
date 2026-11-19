import { mount, tick, unmount } from 'svelte';
import { createRuntime, type ComponentBinding, type ComponentContract } from '@viewstem/core';
import { createDiagnostic, createRenderError, notifyDiagnostic, runtimeOwnsView } from '@viewstem/core/renderer';
import type { View } from '@viewstem/core';
import { createRenderer as createBrowserRenderer, type BrowserDisplayOptions, type ComponentConnector } from '@viewstem/dom';
import ComponentMount from './ComponentMount.svelte';
import FallbackMount from './FallbackMount.svelte';
import { cancelled, failure, rendererStates, transformError } from './lifecycle.js';
import type { ComponentAdapter, RendererDiagnostic, RendererErrorListener, RenderAttachment, RenderOptions, Renderer, RendererOptions } from './types.js';

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

export function reportComponentDiagnostic(renderer: Renderer | undefined, diagnostic: RendererDiagnostic, onError: RendererErrorListener | undefined, isOpen: () => boolean) {
  const state = renderer && rendererStates.get(renderer);
  const disposing = diagnostic.phase === 'dispose';
  notifyDiagnostic(diagnostic,
    { listener: state?.onError, isOpen: () => !!state?.alive && (disposing || isOpen()) },
    { listener: onError, isOpen: () => disposing || isOpen() },
  );
}

type ComponentDisplayOptions = Omit<RenderOptions, 'onError'> & {
  getErrorListener: () => RendererErrorListener | undefined;
  isOpen: () => boolean;
  trackCleanup: boolean;
};
export function attachComponentView(renderer: Renderer, view: View, target: HTMLElement,
  { getErrorListener, isOpen, trackCleanup, ...options }: ComponentDisplayOptions): RenderAttachment {
  const state = rendererStates.get(renderer);
  if (!state?.alive) throw cancelled();
  const browser = createBrowserRenderer({ runtime: state.runtime, connectors: state.connectors });
  let reportedDisposal = false;
  const attachment = browser.attach(view, target, browserOptions({ ...options, onError: report }));
  function report(diagnostic: RendererDiagnostic) {
    if (diagnostic.phase === 'dispose') {
      if (reportedDisposal) return;
      reportedDisposal = true;
    }
    reportComponentDiagnostic(renderer, diagnostic, getErrorListener(), isOpen);
  }
  let cleanup: Promise<void> | undefined;
  function detach() {
    return cleanup ??= attachment.detach().catch(cause => {
      report(createDiagnostic('dispose', cause));
      throw cause;
    }).finally(() => { state?.ownedCleanups.delete(detach); });
  }
  if (trackCleanup && state.alive && state.ownsRuntime && runtimeOwnsView(state.runtime, view)) {
    state.ownedCleanups.add(detach);
  }
  return { ...attachment, detach };
}

export function createRenderer({ runtime: injected, onError, connectors = [], ...runtimeOptions }: RendererOptions = {}): Renderer {
  if (injected && Object.keys(runtimeOptions).length) throw failure('INVALID_DEFINITION', 'Runtime injection and Runtime options are mutually exclusive.');
  const runtime = injected ?? createRuntime(runtimeOptions as Parameters<typeof createRuntime>[0]);
  const browserConnectors = [svelteConnector, ...connectors];
  const browser = createBrowserRenderer({ runtime, connectors: browserConnectors, ...(onError ? { onError } : {}) });
  const state = { alive: true, runtime, ownsRuntime: !injected, connectors: browserConnectors, ownedCleanups: new Set<() => Promise<void>>(), ...(onError ? { onError } : {}) };
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
      const ownedCleanups = [...state.ownedCleanups];
      const runtimeCleanup = state.ownsRuntime ? runtime.dispose() : undefined;
      const work = [runtimeCleanup, browser.dispose(), ...ownedCleanups.map(close => close())];
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
