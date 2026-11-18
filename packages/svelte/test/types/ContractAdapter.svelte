<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  import type { countContract } from './contract.js';

  let { node }: ComponentAdapterProps<typeof countContract> = $props();
  let local = $state(0);
</script>

<output data-typed-count data-status={node.status}>
  {#if node.status === 'ready'}
    {node.inputs.count.toFixed(0)}
  {:else}
    {node.inputs.count ?? 'waiting'}
  {/if}
</output>
<button type="button" data-typed-local onclick={() => local += 1}>local {local}</button>
