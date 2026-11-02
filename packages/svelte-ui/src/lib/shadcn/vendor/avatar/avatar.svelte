<script lang="ts">
	import { setContext } from "svelte";
	import { avatarSourceContext } from "../../adapters/avatar-context.js";
	import { Avatar as AvatarPrimitive } from "bits-ui";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		loadingStatus = $bindable("loading"),
		onLoadingStatusChange,
		size = "default",
		class: className,
		...restProps
	}: AvatarPrimitive.RootProps & {
		size?: "default" | "sm" | "lg";
	} = $props();

	let automaticallyLoaded = false;
	setContext(avatarSourceContext, () => {
		if (automaticallyLoaded) {
			automaticallyLoaded = false;
			loadingStatus = "loading";
			onLoadingStatusChange?.("loading");
		}
	});
	function loadingChanged(status: NonNullable<AvatarPrimitive.RootProps["loadingStatus"]>) {
		automaticallyLoaded = status === "loaded";
		onLoadingStatusChange?.(status);
	}
</script>

<AvatarPrimitive.Root
	bind:ref
	bind:loadingStatus
	onLoadingStatusChange={loadingChanged}
	data-viewstem-shadcn="" data-slot="avatar"
	data-size={size}
	class={cn(
		"size-8 rounded-full after:rounded-full data-[size=lg]:size-10 data-[size=sm]:size-6 group/avatar relative flex shrink-0 select-none after:absolute after:inset-0 after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten",
		className
	)}
	{...restProps}
/>
