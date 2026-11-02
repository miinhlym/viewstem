<script lang="ts">
	import { Popover as PopoverPrimitive } from "bits-ui";

	let { ref = $bindable(null), ...restProps }: PopoverPrimitive.CloseProps = $props();
</script>

<PopoverPrimitive.Close bind:ref data-viewstem-shadcn="" data-slot="popover-close" {...restProps} />
