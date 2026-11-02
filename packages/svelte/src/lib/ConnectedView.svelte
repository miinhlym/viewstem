<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { ViewstemViewProps } from './types.js';
  import { Connection } from './connection.js';
  import NodeList from './NodeList.svelte';
  let { renderer, view, onError, fallback }: ViewstemViewProps = $props();
  // The parent keys this component by renderer and View; this connection owns only a subscription.
  const connection = untrack(() => new Connection(renderer, view, diagnostic => onError?.(diagnostic)));
  onDestroy(() => connection.dispose());
  export function whenRendered(): Promise<void> { return connection.whenRendered(); }
</script>

<NodeList nodes={$connection?.roots ?? []} {connection} {fallback} />
