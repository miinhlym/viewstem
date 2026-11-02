<script>
  import { getContext } from 'svelte';
  const dispose = getContext('viewstem-dispose-on-init');
  dispose();
</script>

<p data-reentrant>adapter being initialized</p>
