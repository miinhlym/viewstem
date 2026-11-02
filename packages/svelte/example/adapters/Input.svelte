<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  let { inputs, node, emit }: ComponentAdapterProps = $props();
</script>

<label>
  <span>{String(inputs.label ?? '이름')}</span>
  <input
    type="text"
    autocomplete="off"
    value={typeof inputs.value === 'string' ? inputs.value : ''}
    disabled={node.status !== 'ready'}
    oninput={(event) => { void emit('change', event.currentTarget.value); }}
  />
</label>

<style>
  label { display: grid; gap: 0.5rem; }
  span { font-weight: 600; }
  input { box-sizing: border-box; width: 100%; padding: 0.65rem; font: inherit; }
</style>
