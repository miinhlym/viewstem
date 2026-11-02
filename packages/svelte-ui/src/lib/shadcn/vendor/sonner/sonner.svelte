<script lang="ts">
	import { mode } from "mode-watcher";
	import { Toaster as SonnerPrimitive, type ToasterProps as SonnerProps } from "../sonner-runtime/index.js";
	import Loader2Icon from "@lucide/svelte/icons/loader-2";
	import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
	import OctagonXIcon from "@lucide/svelte/icons/octagon-x";
	import InfoIcon from "@lucide/svelte/icons/info";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	let { ...restProps }: SonnerProps = $props();
</script>

<SonnerPrimitive
	theme={mode.current}
	data-viewstem-shadcn="" class="toaster group"
	style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
	toastOptions={{
		classes: {
			toast: "rounded-2xl",
		},
	}}
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon data-viewstem-shadcn="" class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon data-viewstem-shadcn="" class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon data-viewstem-shadcn="" class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon data-viewstem-shadcn="" class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon data-viewstem-shadcn="" class="size-4" />
	{/snippet}
</SonnerPrimitive>
