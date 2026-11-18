<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  let { inputs, provideSlot }: ComponentAdapterProps = $props();
  function connect(element: HTMLElement) { return provideSlot('default', element); }
</script>

<section data-layout>
  {#if inputs.compact}
    <div data-slot="compact" {@attach connect}></div>
  {:else}
    <div data-slot="regular" {@attach connect}></div>
  {/if}
</section>
