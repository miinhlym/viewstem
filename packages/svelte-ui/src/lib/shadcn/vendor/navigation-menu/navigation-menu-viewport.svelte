<script lang="ts">
	import { NavigationMenu as NavigationMenuPrimitive } from "bits-ui";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: NavigationMenuPrimitive.ViewportProps = $props();
</script>

<div
	data-viewstem-shadcn="" class={cn(
		"absolute start-0 top-full isolate z-50 flex justify-center"
	)}
>
	<NavigationMenuPrimitive.Viewport
		bind:ref
		data-viewstem-shadcn="" data-slot="navigation-menu-viewport"
		class={cn(
			"bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:zoom-out-90 data-open:zoom-in-90 ring-foreground/10 rounded-lg shadow ring-1 duration-100 origin-top-center relative mt-1.5 grid w-max max-w-[calc(100vw-2rem)] overflow-hidden",
			"[&>[data-slot=navigation-menu-content]]:static [&>[data-slot=navigation-menu-content]]:[grid-area:1/1]",
			className
		)}
		{...restProps}
	/>
</div>
