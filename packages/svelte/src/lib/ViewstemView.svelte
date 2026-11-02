<script lang="ts">
  import { tick } from 'svelte';
  import type { ViewstemViewProps } from './types.js';
  import { cancelled } from './connection.js';
  import ConnectedView from './ConnectedView.svelte';
  let { renderer, view, onError, fallback }: ViewstemViewProps = $props();
  let attached: ReturnType<typeof ConnectedView> | undefined = $state.raw();
  export async function whenRendered(): Promise<void> {
    await tick();
    if (!attached) throw cancelled();
    await attached.whenRendered();
  }
</script>

{#key renderer}
  {#key view}
    <ConnectedView {renderer} {view} {onError} {fallback} bind:this={attached} />
  {/key}
{/key}
