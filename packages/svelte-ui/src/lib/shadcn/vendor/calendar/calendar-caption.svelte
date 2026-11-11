<script lang="ts">
	import { getContext } from "svelte";
	import { calendarPlaceholderContext } from "../../adapters/types.js";
	import { DateFormatter, getLocalTimeZone, type DateValue } from "@internationalized/date";
	import CalendarMonthSelect from "./calendar-month-select.svelte";
	import CalendarYearSelect from "./calendar-year-select.svelte";
	import type Calendar from "./calendar.svelte";
	import type { ComponentProps } from "svelte";

	let {
		captionLayout,
		months,
		monthFormat,
		years,
		yearFormat,
		month,
		locale,
		placeholder = $bindable(),
		monthIndex = 0,
	}: {
		captionLayout: ComponentProps<typeof Calendar>["captionLayout"];
		months: ComponentProps<typeof CalendarMonthSelect>["months"];
		monthFormat: ComponentProps<typeof CalendarMonthSelect>["monthFormat"];
		years: ComponentProps<typeof CalendarYearSelect>["years"];
		yearFormat: ComponentProps<typeof CalendarYearSelect>["yearFormat"];
		month: DateValue;
		placeholder: DateValue | undefined;
		locale: string;
		monthIndex: number;
	} = $props();

	function formatYear(date: DateValue) {
		const dateObj = date.toDate(getLocalTimeZone());
		if (typeof yearFormat === "function") return yearFormat(dateObj.getFullYear());
		return new DateFormatter(locale, { year: yearFormat }).format(dateObj);
	}

	function formatMonth(date: DateValue) {
		const dateObj = date.toDate(getLocalTimeZone());
		if (typeof monthFormat === "function") return monthFormat(dateObj.getMonth() + 1);
		return new DateFormatter(locale, { month: monthFormat }).format(dateObj);
	}
	const onPlaceholderChange = getContext<((value: DateValue) => void) | undefined>(calendarPlaceholderContext);
</script>

{#snippet MonthSelect()}
	<CalendarMonthSelect
		{months}
		{monthFormat}
		value={month.month}
		onchange={(e) => {
			if (!placeholder) return;
			const v = Number.parseInt(e.currentTarget.value);
			const newPlaceholder = placeholder.set({ month: v });
			const adjusted = newPlaceholder.subtract({ months: monthIndex });
			if (adjusted.compare(placeholder) === 0) return;
			placeholder = adjusted;
			onPlaceholderChange?.(adjusted);
		}}
	/>
{/snippet}

{#snippet YearSelect()}
	<CalendarYearSelect {years} {yearFormat} value={month.year} />
{/snippet}

{#if captionLayout === "dropdown"}
	{@render MonthSelect()}
	{@render YearSelect()}
{:else if captionLayout === "dropdown-months"}
	{@render MonthSelect()}
	{#if placeholder}
		{formatYear(placeholder)}
	{/if}
{:else if captionLayout === "dropdown-years"}
	{#if placeholder}
		{formatMonth(placeholder)}
	{/if}
	{@render YearSelect()}
{:else}
	{formatMonth(month)} {formatYear(month)}
{/if}
