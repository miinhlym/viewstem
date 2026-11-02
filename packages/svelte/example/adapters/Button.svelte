<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  let { inputs, node, emit }: ComponentAdapterProps = $props();
</script>

<button type="button" disabled={node.status !== 'ready'} onclick={() => { void emit('click', null); }}>
  {String(inputs.label ?? '준비 중…')}
</button>

<style>
  button { padding: 0.5rem 1rem; font: inherit; cursor: pointer; }
  button:disabled { cursor: default; }
</style>
