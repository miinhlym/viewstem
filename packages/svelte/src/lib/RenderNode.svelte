<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { NodeSnapshot, PublicError } from '@viewstem/core';
  import type { RenderFallback } from './types.js';
  import type { Connection } from './connection.js';
  import NodeList from './NodeList.svelte';
  let { node, connection, fallback }: { node: NodeSnapshot; connection: Connection; fallback?: RenderFallback } = $props();
  let renderError = $state.raw<PublicError | null>(null);
  let failedNode: NodeSnapshot | undefined;
  let retry: (() => void) | undefined;

  function handleFailure(error: unknown, reset: () => void) {
    failedNode = node;
    retry = reset;
    renderError = connection.renderFailure(node, error);
  }
  $effect(() => {
    const next = node;
    untrack(() => {
      // A boundary reset is an imperative Svelte lifecycle operation, not derived data.
      // Retry only after a new core projection, never in response to our own error state.
      if (retry && next !== failedNode) {
        const reset = retry;
        retry = undefined;
        renderError = null;
        connection.clearRenderFailure(next);
        reset();
      }
    });
  });
  onDestroy(() => connection.clearRenderFailure(node));
</script>

{#snippet renderSlot(name: string)}
  <NodeList nodes={node.slots[name] ?? []} {connection} {fallback} />
{/snippet}

<svelte:boundary onerror={handleFailure}>
  {#if node.address === undefined}
    {@render fallback?.(node, node.error)}
  {:else}
    {@const ComponentAdapter = connection.adapter(node)}
    {#if ComponentAdapter}
      <ComponentAdapter inputs={node.inputs} {node} emit={(event, payload) => connection.emit(node, event, payload)} {renderSlot} />
    {:else if node.status === 'ready'}
      <NodeList nodes={node.children} {connection} {fallback} />
    {:else}
      {@render fallback?.(node, node.error)}
    {/if}
  {/if}
  {#snippet failed()}
    {@render fallback?.(node, renderError)}
  {/snippet}
</svelte:boundary>
