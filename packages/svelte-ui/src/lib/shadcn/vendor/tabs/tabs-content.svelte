<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.ContentProps = $props();
</script>

<TabsPrimitive.Content
	bind:ref
	data-viewstem-shadcn="" data-slot="tabs-content"
	class={cn("text-sm flex-1 outline-none", className)}
	{...restProps}
/>
