<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  let { renderSlot }: ComponentAdapterProps = $props();
</script>

<div class="stack">
  {@render renderSlot('default')}
  <div class="footer">{@render renderSlot('footer')}</div>
</div>

<style>
  .stack { display: grid; gap: 1.25rem; }
  .footer { border-top: 1px solid #d8d8d8; padding-top: 1.25rem; }
</style>
