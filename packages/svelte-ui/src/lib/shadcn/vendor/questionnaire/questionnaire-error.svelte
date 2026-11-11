<script lang="ts">
	import { Questionnaire as QuestionnairePrimitive } from "@shadcn-svelte/primitives/questionnaire";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: QuestionnairePrimitive.ErrorProps = $props();
</script>

<QuestionnairePrimitive.Error
	bind:ref
	data-viewstem-shadcn="" data-slot="questionnaire-error"
	class={cn("text-sm text-destructive", className)}
	{...restProps}
/>
