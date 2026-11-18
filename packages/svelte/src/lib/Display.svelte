<script lang="ts">
  import { getAllContexts, untrack } from 'svelte';
  import type { View, ViewApplication } from '@viewstem/core';
  import type { Renderer, RenderAttachment, RenderFallback, RendererErrorListener } from './types.js';
  import { cancelled } from './lifecycle.js';
  import { attachComponentView } from './renderer.js';

  let { renderer, view, onError, fallback, isOpen, onAttach }: {
    renderer: Renderer; view: View;
    onError: RendererErrorListener | undefined;
    fallback: RenderFallback | undefined;
    isOpen: () => boolean;
    onAttach?: (display: RenderAttachment) => void;
  } = $props();
  const context = getAllContexts();
  let active: { renderer: Renderer; view: View; display: RenderAttachment } | undefined;
  let resolve: () => void;
  const prepared = new Promise<void>(done => { resolve = done; });
  let failure: { cause: unknown } | undefined;

  function connect(target: HTMLDivElement) {
    try {
      active = untrack(() => {
        if (!isOpen()) throw cancelled();
        const display = attachComponentView(renderer, view, target, {
          context,
          onError: diagnostic => { if (isOpen()) onError?.(diagnostic); },
          ...(fallback ? { fallback } : {}),
        }, isOpen);
        onAttach?.(display);
        return { renderer, view, display };
      });
    } catch (cause) { failure = { cause }; }
    resolve();
    return () => {
      const display = active?.display;
      active = undefined;
      void display?.detach().catch(() => {});
    };
  }

  export function matches(owner: Renderer, targetView: View | undefined) {
    return active?.renderer === owner && active.view === targetView;
  }

  async function attached(): Promise<RenderAttachment> {
    await prepared;
    if (failure) throw failure.cause;
    if (!active || !isOpen()) throw cancelled();
    return active.display;
  }

  export async function whenRendered() { return (await attached()).whenRendered(); }
  export async function whenSettled(application: ViewApplication) { return (await attached()).whenSettled(application); }
</script>

<div style="display: contents" {@attach connect}></div>
