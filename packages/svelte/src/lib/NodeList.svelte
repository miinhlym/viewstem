<script lang="ts">
  import type { NodeSnapshot } from '@viewstem/core';
  import type { RenderFallback } from './types.js';
  import { nodeKey, type Connection } from './connection.js';
  import RenderNode from './RenderNode.svelte';
  let { nodes, connection, fallback }: { nodes: readonly NodeSnapshot[]; connection: Connection; fallback?: RenderFallback } = $props();
</script>

{#each nodes as node (nodeKey(node))}
  <RenderNode {node} {connection} {fallback} />
{/each}
