<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  let { inputs, node }: ComponentAdapterProps = $props();
</script>

<p aria-live="polite">{node.status === 'ready' ? String(inputs.text) : '준비 중…'}</p>

<style>
  p { margin: 0; font-size: 1.25rem; line-height: 1.5; overflow-wrap: anywhere; }
</style>
