<script lang="ts">
	import { Questionnaire as QuestionnairePrimitive } from "@shadcn-svelte/primitives/questionnaire";
	import { cn } from "../utils.js";

	let {
		class: className,
		item = $bindable(undefined),
		ref = $bindable(null),
		...restProps
	}: QuestionnairePrimitive.RootProps = $props();
</script>

<QuestionnairePrimitive.Root
	bind:item
	bind:ref
	data-viewstem-shadcn="" data-slot="questionnaire"
	class={cn("gap-6 flex w-full min-w-0 flex-col", className)}
	{...restProps}
/>
