<script lang="ts">
	import { getContext } from "svelte";
	import { avatarSourceContext } from "../../adapters/avatar-context.js";
	import { Avatar as AvatarPrimitive } from "bits-ui";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: AvatarPrimitive.ImageProps = $props();

	const resetLoadedSource = getContext<(() => void) | undefined>(avatarSourceContext);
	let previous: readonly unknown[] | undefined;
	$effect.pre(() => {
		const next = [restProps.src, restProps.crossorigin];
		if (previous && next.some((value, index) => value !== previous![index])) resetLoadedSource?.();
		previous = next;
	});
</script>

<AvatarPrimitive.Image
	bind:ref
	data-viewstem-shadcn="" data-slot="avatar-image"
	class={cn("rounded-full aspect-square size-full object-cover", className)}
	{...restProps}
/>
