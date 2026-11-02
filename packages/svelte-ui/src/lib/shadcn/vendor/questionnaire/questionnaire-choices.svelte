<script lang="ts">
	import { Questionnaire as QuestionnairePrimitive } from "@shadcn-svelte/primitives/questionnaire";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: QuestionnairePrimitive.ChoicesProps = $props();
</script>

<QuestionnairePrimitive.Choices
	bind:ref
	data-viewstem-shadcn="" data-slot="questionnaire-choices"
	class={cn("gap-2 group/questionnaire-choices grid min-w-0", className)}
	{...restProps}
/>
