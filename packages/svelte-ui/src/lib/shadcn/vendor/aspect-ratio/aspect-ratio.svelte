<script lang="ts">
	import { AspectRatio as AspectRatioPrimitive } from "bits-ui";

	let { ref = $bindable(null), ...restProps }: AspectRatioPrimitive.RootProps = $props();
</script>

<AspectRatioPrimitive.Root bind:ref data-viewstem-shadcn="" data-slot="aspect-ratio" {...restProps} />
