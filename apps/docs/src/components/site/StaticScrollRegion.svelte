<script lang="ts">
  import ScrollRegion from './ScrollRegion.svelte';
  let { element, label }: { element: HTMLElement; label: string } = $props();
  function adopt(host: HTMLDivElement) { host.append(element); }
</script>

<!-- Enhance Astro's existing code/table DOM without copying its HTML or listeners. -->
<ScrollRegion orientation="both" class="content-scroll" {label}>
  <div {@attach adopt}></div>
</ScrollRegion>
