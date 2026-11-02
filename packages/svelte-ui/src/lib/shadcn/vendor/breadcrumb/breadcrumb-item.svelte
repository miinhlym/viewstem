<script lang="ts">
	import { cn, type WithElementRef } from "../utils.js";
	import type { HTMLLiAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLLiAttributes> = $props();
</script>

<li
	bind:this={ref}
	data-viewstem-shadcn="" data-slot="breadcrumb-item"
	class={cn("gap-1 inline-flex items-center", className)}
	{...restProps}
>
	{@render children?.()}
</li>
