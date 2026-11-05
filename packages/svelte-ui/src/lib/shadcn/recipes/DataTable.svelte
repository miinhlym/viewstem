<script module lang="ts">
	import {
		columnFilteringFeature,
		createFilteredRowModel,
		createPaginatedRowModel,
		createSortedRowModel,
		filterFn_includesString,
		globalFilteringFeature,
		rowPaginationFeature,
		rowSelectionFeature,
		rowSortingFeature,
		sortFn_alphanumeric,
		sortFn_basic,
		tableFeatures,
	} from '@tanstack/svelte-table';

	const features = tableFeatures({
		columnFilteringFeature,
		globalFilteringFeature,
		rowPaginationFeature,
		rowSelectionFeature,
		rowSortingFeature,
		filteredRowModel: createFilteredRowModel(),
		paginatedRowModel: createPaginatedRowModel(),
		sortedRowModel: createSortedRowModel(),
		filterFns: { includesString: filterFn_includesString },
		sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
	});
</script>

<script lang="ts">
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowUpDownIcon from '@lucide/svelte/icons/arrow-up-down';
	import { createTable, functionalUpdate, type ColumnDef, type SortingState } from '@tanstack/svelte-table';
	import { Button } from '../vendor/button/index.js';
	import { Checkbox } from '../vendor/checkbox/index.js';
	import { Input } from '../vendor/input/index.js';
	import { Label } from '../vendor/label/index.js';
	import * as NativeSelect from '../vendor/native-select/index.js';
	import * as Table from '../vendor/table/index.js';

	type Row = Record<string, unknown>;
	type Column = { id: string; accessorKey: string; label: string; sortable?: boolean; filterable?: boolean };

	let {
		data = [],
		columns = [],
		sorting = [],
		pageIndex = 0,
		pageSize = 10,
		filter = '',
		selectedIds = [],
		rowId = 'id',
		labels,
		onSortingChange,
		onPageIndexChange,
		onPageSizeChange,
		onFilterChange,
		onSelectedIdsChange,
	}: {
		data?: Row[];
		columns?: Column[];
		sorting?: SortingState;
		pageIndex?: number;
		pageSize?: number;
		filter?: string;
		selectedIds?: string[];
		rowId?: string;
		labels?: {
			filter?: string;
			select?: string;
			selectRow?: string;
			noRows?: string;
			previous?: string;
			next?: string;
			page?: string;
			rowsPerPage?: string;
		};
		onSortingChange?: (sorting: SortingState) => void;
		onPageIndexChange?: (index: number) => void;
		onPageSizeChange?: (size: number) => void;
		onFilterChange?: (filter: string) => void;
		onSelectedIdsChange?: (ids: string[]) => void;
	} = $props();
	const pageSizeId = $props.id();
	const text = $derived({
		filter: labels?.filter ?? 'Filter rows',
		select: labels?.select ?? 'Select',
		selectRow: labels?.selectRow ?? 'Select row {id}',
		noRows: labels?.noRows ?? 'No rows.',
		previous: labels?.previous ?? 'Previous',
		next: labels?.next ?? 'Next',
		page: labels?.page ?? 'Page {page} of {pages}',
		rowsPerPage: labels?.rowsPerPage ?? 'Rows per page',
	});

	function cellValue(row: Row, key: string) {
		const value = Object.hasOwn(row, key) ? row[key] : undefined;
		return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' ? value : undefined;
	}

	const safeRows = $derived.by(() => {
		const seen = new Set<string>();
		return data.filter((row) => {
			if (!row || !Object.hasOwn(row, rowId)) return false;
			const id = row[rowId];
			if (typeof id !== 'string' || id === '' || seen.has(id)) return false;
			seen.add(id);
			return true;
		});
	});
	const safeColumns = $derived.by(() => {
		const seen = new Set<string>();
		return columns.filter((column) => {
			if (!column.id || column.id in Object.prototype || seen.has(column.id)) return false;
			seen.add(column.id);
			return true;
		});
	});
	const definitions = $derived<ColumnDef<typeof features, Row>[]>(safeColumns.map((column) => ({
		id: column.id,
		header: column.label,
		accessorFn: (row) => cellValue(row, column.accessorKey),
		enableSorting: column.sortable === true,
		enableGlobalFilter: column.filterable === true,
	})));
	const pagination = $derived({ pageIndex, pageSize });
	const rowSelection = $derived(Object.fromEntries(selectedIds.map((id) => [`row:${id}`, true as const])));

	const table = createTable({
		features,
		get data() { return safeRows; },
		get columns() { return definitions; },
		get getRowId() {
			const key = rowId;
			return (row: Row) => `row:${row[key]}`;
		},
		autoResetPageIndex: false,
		enableMultiSort: false,
		globalFilterFn: 'includesString',
		get state() {
			return { sorting, pagination, globalFilter: filter, rowSelection };
		},
		onSortingChange: (update) => {
			onSortingChange?.(functionalUpdate(update, sorting));
			resetPage();
		},
		onPaginationChange: (update) => {
			const next = functionalUpdate(update, pagination);
			if (next.pageSize !== pageSize) onPageSizeChange?.(next.pageSize);
			if (next.pageIndex !== pageIndex) onPageIndexChange?.(next.pageIndex);
		},
		onGlobalFilterChange: (update) => {
			onFilterChange?.(functionalUpdate(update, filter));
			resetPage();
		},
		onRowSelectionChange: (update) => {
			const next = functionalUpdate(update, rowSelection);
			onSelectedIdsChange?.(Object.keys(next).filter((id) => next[id]).map((id) => id.slice(4)));
		},
	});
	// Controlled input may be stale after filtering or replacing rows. Preserve
	// the caller's State and project the last valid page until the caller changes
	// it. The fallback uses the same TanStack filtered/sorted row model.
	const pageCount = $derived(Math.max(1, table.getPageCount()));
	const displayedPage = $derived(Math.min(pageIndex, pageCount - 1));
	const pageText = $derived(text.page
		.replaceAll('{page}', () => String(displayedPage + 1))
		.replaceAll('{pages}', () => String(pageCount)));
	const displayedRows = $derived(pageIndex === displayedPage
		? table.getRowModel().rows
		: table.getPrePaginatedRowModel().rows.slice(displayedPage * pageSize, (displayedPage + 1) * pageSize));

	function resetPage() {
		if (pageIndex > 0) onPageIndexChange?.(0);
	}
</script>

<div data-viewstem-shadcn="" class="w-full">
	{#if safeColumns.some((column) => column.filterable)}
		<div class="flex items-center py-4">
			<Input
				type="search"
				aria-label={text.filter}
				placeholder={text.filter}
				class="max-w-sm"
				value={filter}
				oninput={(event) => table.setGlobalFilter(event.currentTarget.value)}
			/>
		</div>
	{/if}
	<div data-viewstem-shadcn="" class="overflow-hidden rounded-md border">
		<Table.Root>
			<Table.Header>
				{#each table.getHeaderGroups() as group (group.id)}
					<Table.Row>
						<Table.Head scope="col">{text.select}</Table.Head>
						{#each group.headers as header (header.id)}
							{@const direction = header.column.getIsSorted()}
							<Table.Head scope="col" aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined}>
								{#if header.column.getCanSort()}
									{@const SortIcon = direction === 'asc' ? ArrowUpIcon : direction === 'desc' ? ArrowDownIcon : ArrowUpDownIcon}
									<Button variant="ghost" size="sm" onclick={header.column.getToggleSortingHandler()}>
										{header.column.columnDef.header}
										<SortIcon data-icon="inline-end" />
									</Button>
								{:else}
									{header.column.columnDef.header}
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				{/each}
			</Table.Header>
			<Table.Body>
				{#each displayedRows as row (row.id)}
					<Table.Row data-state={row.getIsSelected() ? 'selected' : undefined}>
						<Table.Cell>
							<Checkbox
								aria-label={text.selectRow.replaceAll('{id}', () => String(row.original[rowId]))}
								bind:checked={() => row.getIsSelected(), (checked) => row.toggleSelected(checked)}
							/>
						</Table.Cell>
						{#each row.getAllCells() as cell (cell.id)}
							<Table.Cell>{String(cell.getValue() ?? '')}</Table.Cell>
						{/each}
					</Table.Row>
				{:else}
					<Table.Row><Table.Cell colspan={definitions.length + 1} class="h-24 text-center">{text.noRows}</Table.Cell></Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
	<div class="flex flex-wrap items-center justify-end gap-2 py-4">
		<Button variant="outline" size="sm" disabled={displayedPage === 0} onclick={() => table.setPageIndex(displayedPage - 1)}>{text.previous}</Button>
		<span class="text-sm text-muted-foreground">{pageText}</span>
		<Button variant="outline" size="sm" disabled={displayedPage >= pageCount - 1} onclick={() => table.setPageIndex(displayedPage + 1)}>{text.next}</Button>
		<div class="flex items-center gap-2">
			<Label for={pageSizeId}>{text.rowsPerPage}</Label>
			<NativeSelect.Root id={pageSizeId} value={pageSize} size="sm" onchange={(event) => table.setPageSize(Number(event.currentTarget.value))}>
				{#each [...new Set([10, 25, 50, pageSize])].sort((a, b) => a - b) as size (size)}
					<NativeSelect.Option value={size}>{size}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</div>
	</div>
</div>
