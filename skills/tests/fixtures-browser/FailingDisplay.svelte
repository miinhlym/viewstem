<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  let { inputs }: ComponentAdapterProps = $props();
  function display(value: unknown): string {
    if (value === 'bad') throw new Error('adapter failure');
    return String(value);
  }
</script>
<p>{display(inputs.value)}</p>
