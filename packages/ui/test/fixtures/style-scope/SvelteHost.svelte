<script>
  import { ViewstemView } from '@viewstem/svelte';

  let { source, resourceSets, onError } = $props();
  let view = $state.raw();

  export function whenRendered() {
    return view.whenRendered();
  }
</script>

<ViewstemView {source} {resourceSets} {onError} bind:this={view} />
