<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  import type { counterContract } from './counter-contract.js';

  let { node }: ComponentAdapterProps<typeof counterContract> = $props();
</script>

<output aria-label="Count">
  {#if node.status === 'ready'}
    {node.inputs.count.toFixed(0)}
  {:else}
    {node.inputs.count ?? '—'}
  {/if}
</output>
