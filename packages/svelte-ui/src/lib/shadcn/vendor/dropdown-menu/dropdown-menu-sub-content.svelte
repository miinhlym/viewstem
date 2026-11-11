<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "../utils.js";
	import DropdownMenuPortal from "./dropdown-menu-portal.svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		align = "start",
		alignOffset = -3,
		portalProps,
		...restProps
	}: DropdownMenuPrimitive.SubContentProps & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DropdownMenuPortal>>;
	} = $props();

	$effect(() => {
		const wrapper = ref?.parentElement;
		const win = wrapper?.ownerDocument.defaultView;
		if (!wrapper || !win || restProps.avoidCollisions === false) return;

		const keepInViewport = () => {
			const rect = wrapper.getBoundingClientRect();
			const left = rect.left - (Number.parseFloat(wrapper.style.translate) || 0);
			const maxLeft = Math.max(4, wrapper.ownerDocument.documentElement.clientWidth - rect.width - 4);
			const offset = Math.round(Math.max(4, Math.min(left, maxLeft)) - left);
			const translate = offset ? `${offset}px` : "";
			if (wrapper.style.translate !== translate) wrapper.style.translate = translate;
		};
		const position = new MutationObserver(keepInViewport);
		position.observe(wrapper, { attributes: true, attributeFilter: ["style"] });
		const size = new ResizeObserver(keepInViewport);
		size.observe(wrapper);
		win.addEventListener("resize", keepInViewport);
		keepInViewport();
		return () => {
			position.disconnect();
			size.disconnect();
			win.removeEventListener("resize", keepInViewport);
			wrapper.style.removeProperty("translate");
		};
	});
</script>

<DropdownMenuPortal {...portalProps}>
	<DropdownMenuPrimitive.SubContent
		bind:ref
		data-viewstem-shadcn="" data-slot="dropdown-menu-sub-content"
		{align}
		{alignOffset}
		class={cn(
			"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 bg-popover text-popover-foreground min-w-[96px] rounded-md p-1 shadow-lg ring-1 duration-100 z-50 origin-(--bits-dropdown-menu-content-transform-origin) overflow-hidden",
			className
		)}
		{...restProps}
	/>
</DropdownMenuPortal>
