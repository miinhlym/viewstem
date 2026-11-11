<script lang="ts">
	import { cn, type WithElementRef } from "../utils.js";
	import type { Snippet } from "svelte";
	import type { HTMLButtonAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		type = "button",
		child,
		...restProps
	}: WithElementRef<HTMLButtonAttributes> & {
		child?: Snippet<[{ props: Record<string, unknown> }]>;
	} = $props();

	const mergedProps = $derived({
		class: cn("absolute inset-0 z-10 outline-none [[data-slot=attachment-actions]>&]:static [[data-slot=attachment-actions]>&]:h-6 [[data-slot=attachment-actions]>&]:shrink-0 [[data-slot=attachment-actions]>&]:rounded-md [[data-slot=attachment-actions]>&]:px-2 [[data-slot=attachment-actions]>&]:whitespace-nowrap [[data-slot=attachment-actions]>&]:hover:bg-muted [[data-slot=attachment-actions]>&]:focus-visible:bg-muted", className),
		"data-slot": "attachment-trigger",
		"data-viewstem-shadcn": "",
		...restProps,
	});
</script>

{#if child}
	{@render child({ props: mergedProps })}
{:else}
	<button bind:this={ref} {type} {...mergedProps}>
		{@render mergedProps.children?.()}
	</button>
{/if}
