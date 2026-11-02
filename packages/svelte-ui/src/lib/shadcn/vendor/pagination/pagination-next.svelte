<script lang="ts">
	import { Pagination as PaginationPrimitive } from "bits-ui";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import { buttonVariants } from "../button/index.js";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: PaginationPrimitive.NextButtonProps = $props();
</script>

<PaginationPrimitive.NextButton
	bind:ref
	aria-label="Go to next page"
	data-viewstem-shadcn="" class={cn(buttonVariants({ variant: "ghost", size: "default" }), "pr-1.5!", className)}
	{...restProps}
>
	<span data-viewstem-shadcn="" class="hidden sm:block">Next</span>
	<ChevronRightIcon data-viewstem-shadcn="" data-icon="inline-end" class="rtl:-scale-x-100" />
</PaginationPrimitive.NextButton>
