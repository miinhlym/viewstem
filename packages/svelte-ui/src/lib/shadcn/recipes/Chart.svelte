<script lang="ts">
	import { scaleBand, scalePoint } from 'd3-scale';
	import { AreaChart, BarChart, LineChart, PieChart } from 'layerchart';
	import * as Chart from '../vendor/chart/index.js';

	type Row = Record<string, unknown>;
	type Series = { id: string; key: string; label?: string; color?: string };

	let {
		kind = 'line',
		data = [],
		x = 'x',
		series = [],
		label = 'Chart',
	}: {
		kind?: 'line' | 'bar' | 'area' | 'pie';
		data?: Row[];
		x?: string;
		series?: Series[];
		label?: string;
	} = $props();

	const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
	const pointScale = scalePoint<string | number>().padding(0.25);
	const bandScale = scaleBand<string | number>().padding(0.25);

	function read(row: Row, key: string) {
		return row && Object.hasOwn(row, key) ? row[key] : undefined;
	}

	function numberValue(row: Row, key: string) {
		const value = read(row, key);
		return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
	}

	function seriesKey(id: string) {
		// LayerChart interprets string accessors as paths. Encode each code point
		// so a Viewstem ID containing punctuation remains a single property.
		return `series_${Array.from(id, (character) => character.codePointAt(0)!.toString(36)).join('_')}`;
	}

	function colorValue(color: string | undefined, index: number) {
		const valid = color && /^(?:#[a-f\d]{3,4}|#[a-f\d]{6}|#[a-f\d]{8}|[a-z]+|var\(--chart-[1-5]\))$/i.test(color);
		return valid ? color : colors[index % colors.length];
	}

	const invalid = $derived.by(() => {
		const ids = new Set<string>();
		for (const item of series) {
			if (!item.id || !item.key || ids.has(item.id)) return true;
			ids.add(item.id);
		}
		if (kind === 'pie' && series.length > 1) return true;

		const categories = new Set<string | number>();
		for (const row of data) {
			const category = read(row, x);
			if (typeof category !== 'string' && !(typeof category === 'number' && Number.isFinite(category))) return true;
			if (categories.has(category)) return true;
			categories.add(category);
			for (const item of series) {
				const value = read(row, item.key);
				if (value === null) continue;
				if (typeof value !== 'number' || !Number.isFinite(value) || (kind === 'pie' && value < 0)) return true;
			}
		}
		return false;
	});

	const category = (row: Row) => read(row, x) as string | number;
	const chartSeries = $derived(series.map((item, index) => ({
		key: seriesKey(item.id),
		label: item.label ?? item.id,
		color: colorValue(item.color, index),
	})));
	const chartData = $derived(data.map((row) => Object.fromEntries([
		['category', category(row)],
		...series.map((item) => [seriesKey(item.id), numberValue(row, item.key)]),
	])));
	// Labels only. The vendor container's generated style should never contain user-supplied CSS.
	const config = $derived(Object.fromEntries(chartSeries.map((item) => [item.key, { label: item.label }])));
	const hasValues = $derived(data.some((row) => series.some((item) => Number.isFinite(numberValue(row, item.key)))));
	const pieData = $derived.by(() => {
		if (kind !== 'pie' || !series[0]) return [];
		const item = series[0];
		return data
			.map((row, index) => ({ category: category(row), value: numberValue(row, item.key), color: colorValue(item.color, index) }))
			.filter((slice): slice is typeof slice & { value: number } => slice.value !== undefined && slice.value > 0);
	});
</script>

{#snippet tooltip()}
	<Chart.Tooltip />
{/snippet}

<figure data-viewstem-shadcn="" aria-label={label}>
	{#if invalid}
		<p role="status">Invalid chart data.</p>
	{:else if !hasValues || (kind === 'pie' && !pieData.length)}
		<p role="status">No chart data.</p>
	{:else}
		<Chart.Container {config}>
			{#if kind === 'line'}
				<LineChart data={chartData} x="category" xScale={pointScale} series={chartSeries} {tooltip} />
			{:else if kind === 'area'}
				<AreaChart data={chartData} x="category" xScale={pointScale} series={chartSeries} {tooltip} />
			{:else if kind === 'bar'}
				<BarChart data={chartData} x="category" xScale={bandScale} series={chartSeries} seriesLayout="group" groupPadding={0.15} {tooltip} />
			{:else}
				<PieChart data={pieData} key="category" value="value" c="category" cRange={pieData.map((slice) => slice.color)} {tooltip} />
			{/if}
		</Chart.Container>
	{/if}
</figure>
