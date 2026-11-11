<script lang="ts">
	import { getContext } from "svelte";
	import { navigationViewportContext } from "../../adapters/types.js";
	import { NavigationMenu as NavigationMenuPrimitive } from "bits-ui";
	import { cn } from "../utils.js";
	import NavigationMenuViewport from "./navigation-menu-viewport.svelte";

	let {
		ref = $bindable(null),
		class: className,
		viewport = true,
		children,
		...restProps
	}: NavigationMenuPrimitive.RootProps & {
		viewport?: boolean;
	} = $props();

	const hasExplicitViewport = getContext<(() => boolean) | undefined>(navigationViewportContext);
</script>

<NavigationMenuPrimitive.Root
	bind:ref
	data-viewstem-shadcn="" data-slot="navigation-menu"
	data-viewport={viewport}
	class={cn(
		"max-w-max group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	{#if viewport && !hasExplicitViewport?.()}
		<NavigationMenuViewport />
	{/if}
</NavigationMenuPrimitive.Root>
