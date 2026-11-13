<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { ViewstemViewProps } from './types.js';
  import { createRenderWaiter, notifyDiagnostic, type RendererDiagnostic } from '@viewstem/core/renderer';
  import type { View, ViewApplication } from '@viewstem/core';
  import type { Renderer } from './types.js';
  import { Connection, rendererState } from './connection.js';
  import NodeList from './NodeList.svelte';
  let { renderer, view, onError, fallback, forwardRenderError, isOpen = () => true }: ViewstemViewProps & {
    forwardRenderError?: ((error: unknown, nodeId?: string) => void) | undefined;
    isOpen?: () => boolean;
  } = $props();
  // The parent keys this component by renderer and View; this connection owns only a subscription.
  const { connection, waiter } = untrack(() => {
    const state = rendererState(renderer);
    const open = () => isOpen() && connection.isOpen();
    const deliver = (diagnostic: RendererDiagnostic) => untrack(() => {
      notifyDiagnostic(diagnostic,
        { listener: state.onError, isOpen: () => open() && state.alive },
        { listener: onError, isOpen: open },
      );
    });
    const connection = new Connection(renderer, view, forwardRenderError
      ? diagnostic => forwardRenderError?.(diagnostic.error, diagnostic.nodeId)
      : deliver);
    try {
      const waiter = createRenderWaiter(view, () => connection.whenRendered(), {
        ...(forwardRenderError ? {} : { deliverDiagnostic: deliver }),
        isOpen: open, onClose: () => connection.dispose(),
      });
      return { connection, waiter };
    } catch (cause) {
      connection.dispose();
      throw cause;
    }
  });
  onDestroy(() => { waiter.dispose(); connection.dispose(); });
  let failedProjection: ReturnType<typeof view.getSnapshot> | null;
  let resetBoundary: (() => void) | undefined;
  function handleBoundaryFailure(_error: unknown, reset: () => void) {
    failedProjection = $connection;
    resetBoundary = reset;
    connection.failBoundary();
  }
  $effect(() => {
    const projection = $connection;
    untrack(() => {
      if (resetBoundary && projection && projection !== failedProjection) {
        const reset = resetBoundary;
        resetBoundary = undefined;
        reset();
      }
    });
  });
  export function matches(renderer: Renderer, view: View | undefined) {
    return connection.renderer === renderer && connection.view === view;
  }
  export function whenRendered(): Promise<void> { return waiter.whenRendered(); }
  export function whenSettled(application: ViewApplication) { return waiter.whenSettled(application); }
</script>

{#if forwardRenderError}
  <svelte:boundary onerror={handleBoundaryFailure}>
    <NodeList nodes={$connection?.roots ?? []} {connection} {fallback} />
    {#snippet failed()}{/snippet}
  </svelte:boundary>
{:else}
  <NodeList nodes={$connection?.roots ?? []} {connection} {fallback} />
{/if}
