<script lang="ts">
  import type { ComponentMountContext } from '@viewstem/dom';
  let { name, provideSlot }: { name: string; provideSlot: ComponentMountContext['provideSlot'] } = $props();
</script>

<div style="display: contents" {@attach element => provideSlot(name, element)}></div>
