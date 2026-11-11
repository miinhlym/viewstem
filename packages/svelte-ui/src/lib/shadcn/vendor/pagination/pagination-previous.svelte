<script lang="ts">
	import { Pagination as PaginationPrimitive } from "bits-ui";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import { buttonVariants } from "../button/index.js";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: PaginationPrimitive.PrevButtonProps = $props();
</script>

<PaginationPrimitive.PrevButton
	bind:ref
	aria-label="Go to previous page"
	data-viewstem-shadcn="" class={cn(
		buttonVariants({ variant: "ghost", size: "default" }),
		"pl-2!",
		className
	)}
	{...restProps}
>
	<ChevronLeftIcon data-viewstem-shadcn="" data-icon="inline-start" class="rtl:-scale-x-100" />
	<span data-viewstem-shadcn="" class="hidden sm:block">Previous</span>
</PaginationPrimitive.PrevButton>
