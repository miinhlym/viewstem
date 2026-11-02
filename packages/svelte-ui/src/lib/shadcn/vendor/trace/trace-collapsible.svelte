<script lang="ts">
	import * as Collapsible from "../collapsible/index.js";
	import { cn } from "../utils.js";
	import type { Collapsible as CollapsiblePrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		open = $bindable(false),
		class: className,
		...restProps
	}: CollapsiblePrimitive.RootProps = $props();
</script>

<Collapsible.Root
	bind:ref
	bind:open
	data-viewstem-shadcn="" data-slot="trace-collapsible"
	class={cn("flex w-full min-w-0 flex-col", className)}
	{...restProps}
/>
