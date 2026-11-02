<script lang="ts">
	import { tick } from 'svelte';
	import { Button } from '../vendor/button/index.js';
	import * as Command from '../vendor/command/index.js';
	import * as Popover from '../vendor/popover/index.js';

	type Option = { value: string; label: string; disabled?: boolean };

	let {
		options = [],
		value = '',
		disabled = false,
		placeholder = 'Select an option',
		searchPlaceholder = 'Search options…',
		emptyText = 'No options found.',
		onValueChange,
	}: {
		options?: Option[];
		value?: string;
		disabled?: boolean;
		placeholder?: string;
		searchPlaceholder?: string;
		emptyText?: string;
		onValueChange?: (value: string) => void;
	} = $props();

	let open = $state(false);
	let trigger = $state<HTMLButtonElement | null>(null);
	const choices = $derived.by(() => {
		const byValue = new Map<string, Option>();
		for (const option of options) {
			if (option.value && !byValue.has(option.value)) byValue.set(option.value, option);
		}
		return [...byValue.values()];
	});
	const label = $derived(choices.find((option) => option.value === value)?.label ?? placeholder);

	async function select(next: string) {
		onValueChange?.(next);
		open = false;
		await tick();
		trigger?.focus();
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger bind:ref={trigger}>
		{#snippet child({ props })}
			<Button
				{...props}
				data-viewstem-shadcn=""
				variant="outline"
				role="combobox"
				aria-label={label}
				aria-expanded={open}
				{disabled}
			>
				{label}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="start" class="p-0">
		<Command.Root>
			<Command.Input placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
			<Command.List>
				<Command.Empty>{emptyText}</Command.Empty>
				<Command.Group>
					{#each choices as option (option.value)}
						<Command.Item
							value={option.value}
							keywords={[option.label]}
							data-checked={value === option.value}
							disabled={disabled || option.disabled}
							onSelect={() => select(option.value)}
						>
							{option.label}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
