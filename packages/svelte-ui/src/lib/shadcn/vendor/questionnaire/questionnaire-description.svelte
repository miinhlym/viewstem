<script lang="ts">
	import { Questionnaire as QuestionnairePrimitive } from "@shadcn-svelte/primitives/questionnaire";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: QuestionnairePrimitive.DescriptionProps = $props();
</script>

<QuestionnairePrimitive.Description
	bind:ref
	data-viewstem-shadcn="" data-slot="questionnaire-description"
	class={cn("text-muted-foreground text-sm text-pretty text-muted-foreground", className)}
	{...restProps}
/>
