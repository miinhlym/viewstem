<script lang="ts">
	import { Questionnaire as QuestionnairePrimitive } from "@shadcn-svelte/primitives/questionnaire";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: QuestionnairePrimitive.TitleProps = $props();
</script>

<QuestionnairePrimitive.Title
	bind:ref
	data-viewstem-shadcn="" data-slot="questionnaire-title"
	class={cn("text-base leading-snug font-medium [&:not(:has(~[data-slot=questionnaire-description]))]:mb-4 text-pretty", className)}
	{...restProps}
/>
