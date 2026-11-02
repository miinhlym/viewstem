<script lang="ts">
	import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
	import { Button } from "../button/index.js";
	import { cn } from "../utils.js";
	import { useSidebar } from "./context.svelte.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		onclick,
		...restProps
	}: ComponentProps<typeof Button> & {
		onclick?: (e: MouseEvent) => void;
	} = $props();

	const sidebar = useSidebar();
</script>

<Button
	bind:ref
	data-sidebar="trigger"
	data-viewstem-shadcn="" data-slot="sidebar-trigger"
	variant="ghost"
	size="icon-sm"
	class={cn(className)}
	type="button"
	onclick={(e) => {
		onclick?.(e);
		sidebar.toggle();
	}}
	{...restProps}
>
	<PanelLeftIcon data-viewstem-shadcn="" class="rtl:-scale-x-100" />
	<span data-viewstem-shadcn="" class="sr-only">Toggle Sidebar</span>
</Button>
