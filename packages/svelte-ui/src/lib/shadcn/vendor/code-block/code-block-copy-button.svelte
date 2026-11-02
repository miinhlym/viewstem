<script lang="ts">
	import { onDestroy } from "svelte";
	import CheckIcon from "@lucide/svelte/icons/check";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import { Button, type ButtonProps } from "../button/index.js";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		value,
		variant = "ghost",
		size = "icon-xs",
		onclick,
		...restProps
	}: Omit<ButtonProps, "onclick"> & {
		value: string;
		onclick?: (e: MouseEvent) => void;
	} = $props();

	let copied = $state(false);
	let timeout: ReturnType<typeof setTimeout> | undefined;

	function copy() {
		navigator.clipboard
			.writeText(value)
			.then(() => {
				copied = true;
				clearTimeout(timeout);
				timeout = setTimeout(() => (copied = false), 2000);
			})
			.catch(() => {});
	}

	onDestroy(() => clearTimeout(timeout));
</script>

<Button
	bind:ref
	data-viewstem-shadcn="" data-slot="code-block-copy-button"
	data-copied={copied || undefined}
	{variant}
	{size}
	aria-label={copied ? "Copied" : "Copy"}
	class={cn(className)}
	onclick={(e) => {
		onclick?.(e);
		copy();
	}}
	{...restProps}
>
	{#if copied}
		<CheckIcon data-viewstem-shadcn="" />
	{:else}
		<CopyIcon data-viewstem-shadcn="" />
	{/if}
</Button>
<span aria-live="polite" data-viewstem-shadcn="" class="sr-only">{copied ? "Copied" : ""}</span>
