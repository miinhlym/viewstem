<script lang="ts">
	import { Questionnaire as QuestionnairePrimitive } from "@shadcn-svelte/primitives/questionnaire";
	import { cn } from "../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: QuestionnairePrimitive.ProgressProps = $props();
</script>

<QuestionnairePrimitive.Progress
	bind:ref
	data-viewstem-shadcn="" data-slot="questionnaire-progress"
	class={cn(
		"text-xs min-h-[1lh] w-fit min-w-[14ch] font-medium text-muted-foreground tabular-nums",
		className
	)}
	{...restProps}
/>
