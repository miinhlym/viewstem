<script lang="ts">
	import { DateFormatter, parseDate, type DateValue } from '@internationalized/date';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { Button } from '../vendor/button/index.js';
	import { Calendar } from '../vendor/calendar/index.js';
	import * as Popover from '../vendor/popover/index.js';
	import { RangeCalendar } from '../vendor/range-calendar/index.js';

	type Range = { start: string | null; end: string | null };

	let {
		value = null,
		range,
		mode,
		locale = 'en-US',
		min,
		max,
		disabled = false,
		placeholder = 'Pick a date',
		onValueChange,
		onRangeChange,
	}: {
		value?: string | null;
		range?: Range;
		mode?: 'single' | 'range';
		locale?: string;
		min?: string;
		max?: string;
		disabled?: boolean;
		placeholder?: string;
		onValueChange?: (value: string | null) => void;
		onRangeChange?: (value: Range) => void;
	} = $props();

	let open = $state(false);
	const isRange = $derived(mode === 'range' || (mode === undefined && range !== undefined));
	const selected = $derived(dateOnly(value));
	const selectedRange = $derived.by(() => {
		const start = dateOnly(range?.start);
		const end = dateOnly(range?.end);
		return { start, end: start && end && start.compare(end) <= 0 ? end : undefined };
	});
	const minValue = $derived(dateOnly(min));
	const maxValue = $derived(dateOnly(max));
	const effectiveLocale = $derived.by(() => {
		try {
			return Intl.DateTimeFormat.supportedLocalesOf(locale)[0] ?? 'en-US';
		} catch {
			return 'en-US';
		}
	});
	const formatter = $derived(new DateFormatter(effectiveLocale, { dateStyle: 'long', timeZone: 'UTC' }));
	const label = $derived(
		isRange
			? [selectedRange.start, selectedRange.end].filter((date) => date !== undefined)
				.map(formatDate).join(' – ')
			: selected ? formatDate(selected) : ''
	);

	function dateOnly(iso: string | null | undefined) {
		if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
		try {
			const date = parseDate(iso);
			return date.toString() === iso ? date : undefined;
		} catch {
			return undefined;
		}
	}

	function formatDate(date: DateValue) {
		return formatter.format(date.toDate('UTC'));
	}

	function chooseDate(date: DateValue | undefined) {
		onValueChange?.(date?.toString() ?? null);
		open = false;
	}

	function chooseRange(dates: { start: DateValue | undefined; end: DateValue | undefined }) {
		onRangeChange?.({ start: dates.start?.toString() ?? null, end: dates.end?.toString() ?? null });
		if (dates.start && dates.end) open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				data-empty={!label}
				class={[
					'justify-between text-start font-normal data-[empty=true]:text-muted-foreground',
					isRange ? 'min-w-[212px]' : 'w-[212px]',
				]}
				{disabled}
			>
				<span class="truncate">{label || placeholder}</span>
				<ChevronDownIcon data-icon="inline-end" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="start" class="w-auto p-0">
		{#if isRange}
			<RangeCalendar value={selectedRange} locale={effectiveLocale} {minValue} {maxValue} {disabled} onValueChange={chooseRange} />
		{:else}
			<Calendar type="single" value={selected} locale={effectiveLocale} {minValue} {maxValue} {disabled} onValueChange={chooseDate} />
		{/if}
	</Popover.Content>
</Popover.Root>
