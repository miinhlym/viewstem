<script lang="ts">
  import { ViewstemView } from '@viewstem/svelte';
  import type { ViewstemViewProps } from '@viewstem/svelte';
  let { renderer, view, onError }: ViewstemViewProps = $props();
  let projection: ReturnType<typeof ViewstemView> | undefined = $state.raw();
  export async function whenRendered(): Promise<void> {
    await projection?.whenRendered();
  }
</script>

{#snippet fallback(node: import('@viewstem/svelte').NodeSnapshot, error: import('@viewstem/svelte').PublicError | null)}
  <p data-node={node.id}>{node.status}: {error?.code ?? ''}</p>
{/snippet}

<ViewstemView {renderer} {view} {onError} {fallback} bind:this={projection} />
