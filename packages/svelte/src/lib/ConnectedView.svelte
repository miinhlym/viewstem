<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { ViewstemViewProps } from './types.js';
  import { createRenderWaiter } from '@viewstem/core/renderer';
  import type { View, ViewApplication } from '@viewstem/core';
  import type { Renderer } from './types.js';
  import { Connection, rendererState } from './connection.js';
  import NodeList from './NodeList.svelte';
  let { renderer, view, onError, fallback, diagnostics = true }: ViewstemViewProps & { diagnostics?: boolean } = $props();
  // The parent keys this component by renderer and View; this connection owns only a subscription.
  const { connection, waiter } = untrack(() => {
    const state = rendererState(renderer);
    const listener = () => onError ?? state.onError;
    const connection = new Connection(renderer, view, diagnostic => listener()?.(diagnostic));
    try {
      const waiter = createRenderWaiter(view, () => connection.whenRendered(), {
        getErrorListener: diagnostics ? listener : undefined, onClose: () => connection.dispose(),
      });
      return { connection, waiter };
    } catch (cause) {
      connection.dispose();
      throw cause;
    }
  });
  onDestroy(() => { waiter.dispose(); connection.dispose(); });
  export function matches(renderer: Renderer, view: View | undefined) {
    return connection.renderer === renderer && connection.view === view;
  }
  export function whenRendered(): Promise<void> { return waiter.whenRendered(); }
  export function whenSettled(application: ViewApplication) { return waiter.whenSettled(application); }
</script>

<NodeList nodes={$connection?.roots ?? []} {connection} {fallback} />
