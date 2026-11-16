<script>
  import { setContext } from 'svelte';
  import { ViewstemView } from '@viewstem/svelte';
  let { renderer, view, onError } = $props();
  let projection;
  setContext('viewstem-test-context', 'from-parent');
  export async function whenRendered() {
    await projection.whenRendered();
  }
  export function whenSettled(application) { return projection.whenSettled(application); }
  export function changeView(next) { view = next; }
  export function changeError(listener) { onError = listener; }
</script>

{#snippet unavailable(node, error)}
  <aside data-fallback={node.id} data-status={node.status} data-error={error?.code ?? ''}>unavailable {node.id}</aside>
{/snippet}

<ViewstemView {renderer} {view} {onError} fallback={unavailable} bind:this={projection} />
