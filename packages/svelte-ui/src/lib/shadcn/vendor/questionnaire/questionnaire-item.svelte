<script lang="ts">
	import { Questionnaire as QuestionnairePrimitive } from "@shadcn-svelte/primitives/questionnaire";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: QuestionnairePrimitive.ItemProps = $props();
</script>

<QuestionnairePrimitive.Item
	bind:ref
	data-viewstem-shadcn="" data-slot="questionnaire-item"
	class={cn("flex flex-col gap-5 min-w-0 border-0 p-0 outline-none", className)}
	{...restProps}
/>
