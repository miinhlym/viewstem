<script lang="ts">
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import { Button, type Props } from "../button/index.js";
	import { cn } from "../utils.js";
	import { getEmblaContext } from "./context.js";
	import type { WithoutChildren } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		variant = "outline",
		size = "icon-sm",
		...restProps
	}: WithoutChildren<Props> = $props();

	const emblaCtx = getEmblaContext("<Carousel.Next/>");
</script>

<Button
	data-viewstem-shadcn="" data-slot="carousel-next"
	{variant}
	{size}
	aria-disabled={!emblaCtx.canScrollNext}
	disabled={!emblaCtx.canScrollNext}
	class={cn(
		"rounded-full absolute touch-manipulation",
		emblaCtx.orientation === "horizontal"
			? "inset-y-0 -end-12 my-auto"
			: "start-1/2 -bottom-12 -translate-x-1/2 rotate-90",
		className
	)}
	bind:ref
	{...restProps}
	onclick={(e) => {
		(restProps.onclick as ((event: typeof e) => void) | null | undefined)?.(e);
		if (e.defaultPrevented) return;
		emblaCtx.scrollNext();
	}}
	onkeydown={(e) => {
		(restProps.onkeydown as ((event: typeof e) => void) | null | undefined)?.(e);
		if (e.defaultPrevented) return;
		emblaCtx.handleKeyDown(e);
	}}
>
	<ChevronRightIcon data-viewstem-shadcn="" class="rtl:-scale-x-100" />
	<span data-viewstem-shadcn="" class="sr-only">Next slide</span>
</Button>
