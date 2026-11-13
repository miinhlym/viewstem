<script>
  import { setContext, untrack } from 'svelte';
  import { ViewstemView } from '@viewstem/svelte';

  let { renderer, initialSource, inputs, onError } = $props();
  let source = $state(untrack(() => structuredClone(initialSource)));
  let key = $state(0);
  let visible = $state(true);
  let projection = $state.raw();
  setContext('viewstem-test-context', 'from-parent');
  export function changeSource(next) { source = next; }
  export function remount() { key += 1; }
  export function hide() { visible = false; }
  export function whenRendered() { return projection.whenRendered(); }
</script>

{#if visible}
  {#key key}
    <ViewstemView {renderer} {source} {inputs} {onError} pending={loading} prepareError={failed} bind:this={projection} />
  {/key}
{/if}

{#snippet loading()}
  <p data-loading>loading</p>
{/snippet}

{#snippet failed(error)}
  <p data-prepare-error>{error.code}</p>
{/snippet}
