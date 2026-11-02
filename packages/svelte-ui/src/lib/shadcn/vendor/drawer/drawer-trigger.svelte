<script lang="ts">
	import { Drawer as DrawerPrimitive } from "vaul-svelte";

	let { ref = $bindable(null), ...restProps }: DrawerPrimitive.TriggerProps = $props();
</script>

<DrawerPrimitive.Trigger bind:ref data-viewstem-shadcn="" data-slot="drawer-trigger" {...restProps} />
