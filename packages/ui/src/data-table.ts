import {
  columnFilteringFeature, constructTable, createFilteredRowModel, createPaginatedRowModel,
  createSortedRowModel, filterFn_includesString, functionalUpdate, globalFilteringFeature,
  rowPaginationFeature, rowSelectionFeature, rowSortingFeature, sortFn_alphanumeric,
  sortFn_basic, tableFeatures, type ColumnDef, type SortingState,
} from '@tanstack/table-core';
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings';
import { uniqueId, type Behavior, type Send } from './behaviors.js';

const features = tableFeatures({
  coreReactivityFeature: storeReactivityBindings(), columnFilteringFeature, globalFilteringFeature,
  rowPaginationFeature, rowSelectionFeature, rowSortingFeature,
  filteredRowModel: createFilteredRowModel(), paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(), filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});
type Row = Record<string, unknown>;
const rowKey = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
type Column = { id: string; accessorKey: string; label: string; sortable?: boolean; filterable?: boolean };
type Labels = Partial<Record<'filter' | 'select' | 'selectRow' | 'noRows' | 'previous' | 'next' | 'page' | 'rowsPerPage', string>>;

export function dataTable(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  const doc = element.ownerDocument;
  const filter = doc.createElement('input');
  filter.type = 'search';
  filter.className = 'input';
  const container = doc.createElement('div');
  container.className = 'table-container';
  const tableElement = doc.createElement('table');
  tableElement.className = 'table';
  const head = doc.createElement('thead');
  const body = doc.createElement('tbody');
  tableElement.append(head, body);
  container.append(tableElement);
  const footer = doc.createElement('div');
  footer.className = 'vs-data-table-footer';
  const previous = doc.createElement('button');
  const next = doc.createElement('button');
  previous.type = next.type = 'button';
  previous.className = next.className = 'btn';
  previous.dataset.variant = next.dataset.variant = 'outline';
  previous.dataset.size = next.dataset.size = 'sm';
  const page = doc.createElement('span');
  page.className = 'vs-data-table-page';
  const pageSizeControl = doc.createElement('div');
  pageSizeControl.className = 'vs-data-table-page-size';
  const sizeLabel = doc.createElement('label');
  const size = doc.createElement('select');
  size.id = uniqueId();
  size.className = 'select';
  size.dataset.size = 'sm';
  sizeLabel.htmlFor = size.id;
  pageSizeControl.append(sizeLabel, size);
  footer.append(previous, page, next, pageSizeControl);
  element.append(filter, container, footer);
  let setFilter = (_value: string) => {};
  let setPage = (_offset: number) => {};
  let setSize = (_value: number) => {};
  filter.addEventListener('input', () => setFilter(filter.value), { signal });
  previous.addEventListener('click', () => setPage(-1), { signal });
  next.addEventListener('click', () => setPage(1), { signal });
  size.addEventListener('change', () => setSize(Number(size.value)), { signal });

  return { sync(inputs) {
    const data = (inputs.data ?? []) as Row[];
    const columns = (inputs.columns ?? []) as Column[];
    const sorting = (inputs.sorting ?? []) as SortingState;
    const pageIndex = (inputs.pageIndex ?? 0) as number;
    const pageSize = (inputs.pageSize ?? 10) as number;
    const filterValue = (inputs.filter ?? '') as string;
    const selectedIds = (inputs.selectedIds ?? []) as string[];
    const rowId = (inputs.rowId ?? 'id') as string;
    const labels = (inputs.labels ?? {}) as Labels;
    const text = {
      filter: labels.filter ?? 'Filter rows', select: labels.select ?? 'Select',
      selectRow: labels.selectRow ?? 'Select row {id}', noRows: labels.noRows ?? 'No rows.',
      previous: labels.previous ?? 'Previous', next: labels.next ?? 'Next',
      page: labels.page ?? 'Page {page} of {pages}', rowsPerPage: labels.rowsPerPage ?? 'Rows per page',
    };
    const seenRows = new Set<string>();
    const safeRows = data.filter(row => {
      if (!row || !Object.hasOwn(row, rowId)) return false;
      const id = rowKey(row[rowId]);
      if (id === '' || seenRows.has(id)) return false;
      seenRows.add(id);
      return true;
    });
    const seenColumns = new Set<string>();
    const safeColumns = columns.filter(column => {
      if (!column.id || column.id in Object.prototype || seenColumns.has(column.id)) return false;
      seenColumns.add(column.id);
      return true;
    });
    const definitions: ColumnDef<typeof features, Row>[] = safeColumns.map(column => ({
      id: column.id, header: column.label,
      accessorFn: row => {
        const value = Object.hasOwn(row, column.accessorKey) ? row[column.accessorKey] : undefined;
        return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' ? value : undefined;
      },
      enableSorting: column.sortable === true, enableGlobalFilter: column.filterable === true,
    }));
    const pagination = { pageIndex, pageSize };
    const rowSelection = Object.fromEntries(selectedIds.map(id => [`row:${id}`, true as const]));
    const resetPage = () => { if (pageIndex > 0) send('pageIndexChange', { value: 0 }); };
    const table = constructTable({
      features, data: safeRows, columns: definitions, getRowId: row => `row:${row[rowId]}`,
      autoResetPageIndex: false, enableMultiSort: false, globalFilterFn: 'includesString',
      state: { sorting, pagination, globalFilter: filterValue, rowSelection },
      onSortingChange: update => { send('sortingChange', { value: functionalUpdate(update, sorting) }); resetPage(); },
      onPaginationChange: update => {
        const value = functionalUpdate(update, pagination);
        if (value.pageSize !== pageSize) send('pageSizeChange', { value: value.pageSize });
        if (value.pageIndex !== pageIndex) send('pageIndexChange', { value: value.pageIndex });
      },
      onGlobalFilterChange: update => { send('filterChange', { value: functionalUpdate(update, filterValue) }); resetPage(); },
      onRowSelectionChange: update => {
        const value = functionalUpdate(update, rowSelection);
        send('selectedIdsChange', { value: Object.keys(value).filter(id => value[id]).map(id => id.slice(4)) });
      },
    });
    const pageCount = Math.max(1, table.getPageCount());
    const displayedPage = Math.min(pageIndex, pageCount - 1);
    const rows = pageIndex === displayedPage ? table.getRowModel().rows
      : table.getPrePaginatedRowModel().rows.slice(displayedPage * pageSize, (displayedPage + 1) * pageSize);
    filter.hidden = !safeColumns.some(column => column.filterable);
    filter.placeholder = text.filter;
    filter.setAttribute('aria-label', text.filter);
    if (filter.value !== filterValue) filter.value = filterValue;
    setFilter = value => table.setGlobalFilter(value);
    setPage = offset => table.setPageIndex(displayedPage + offset);
    setSize = value => {
      const lastPage = Math.max(0, Math.ceil(table.getPrePaginatedRowModel().rows.length / value) - 1);
      const firstRow = displayedPage * pageSize;
      table.setPagination({ pageSize: value, pageIndex: Math.min(lastPage, Math.floor(firstRow / value)) });
    };
    const active = doc.activeElement;
    const focusedSort = Array.from(head.querySelectorAll('button')).indexOf(active as HTMLButtonElement);
    const focusedRow = active instanceof doc.defaultView!.HTMLInputElement && body.contains(active)
      ? active.dataset.vsRowId : undefined;
    let restoreFocus: HTMLElement | undefined;
    head.replaceChildren();
    for (const group of table.getHeaderGroups()) {
      const tr = doc.createElement('tr');
      const select = doc.createElement('th');
      select.scope = 'col'; select.textContent = text.select; tr.append(select);
      for (const header of group.headers) {
        const th = doc.createElement('th');
        th.scope = 'col';
        const direction = header.column.getIsSorted();
        if (direction) th.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
        const label = String(header.column.columnDef.header ?? '');
        if (header.column.getCanSort()) {
          const button = doc.createElement('button');
          button.type = 'button'; button.className = 'btn';
          button.dataset.variant = 'ghost';
          button.dataset.size = 'sm';
          const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
          icon.setAttribute('aria-hidden', 'true');
          icon.setAttribute('viewBox', '0 0 24 24');
          icon.setAttribute('fill', 'none');
          icon.setAttribute('stroke', 'currentColor');
          icon.setAttribute('stroke-width', '2');
          icon.setAttribute('stroke-linecap', 'round');
          icon.setAttribute('stroke-linejoin', 'round');
          const path = doc.createElementNS(icon.namespaceURI, 'path');
          path.setAttribute('d', direction === 'asc' ? 'M12 19V5 M5 12l7-7 7 7' :
            direction === 'desc' ? 'M12 5v14 M5 12l7 7 7-7' : 'm21 16-4 4-4-4 M17 20V4 M3 8l4-4 4 4 M7 4v16');
          icon.append(path);
          button.append(label, icon);
          if (focusedSort === tr.querySelectorAll('button').length) restoreFocus = button;
          button.addEventListener('click', header.column.getToggleSortingHandler()!);
          th.append(button);
        } else th.textContent = label;
        tr.append(th);
      }
      head.append(tr);
    }
    body.replaceChildren();
    for (const row of rows) {
      const tr = doc.createElement('tr');
      if (row.getIsSelected()) tr.dataset.state = 'selected';
      const td = doc.createElement('td');
      const checkbox = doc.createElement('input');
      checkbox.type = 'checkbox'; checkbox.className = 'input'; checkbox.checked = row.getIsSelected();
      checkbox.dataset.vsRowId = String(row.original[rowId]);
      if (focusedRow === checkbox.dataset.vsRowId) restoreFocus = checkbox;
      checkbox.setAttribute('aria-label', text.selectRow.replaceAll('{id}', () => String(row.original[rowId])));
      checkbox.addEventListener('change', () => row.toggleSelected(checkbox.checked));
      td.append(checkbox); tr.append(td);
      for (const cell of row.getAllCells()) {
        const cellElement = doc.createElement('td');
        cellElement.textContent = String(cell.getValue() ?? '');
        tr.append(cellElement);
      }
      body.append(tr);
    }
    if (!rows.length) {
      const tr = doc.createElement('tr');
      const td = doc.createElement('td');
      td.colSpan = definitions.length + 1; td.className = 'vs-data-table-empty'; td.textContent = text.noRows;
      tr.append(td); body.append(tr);
    }
    previous.textContent = text.previous; previous.disabled = displayedPage === 0;
    next.textContent = text.next; next.disabled = displayedPage >= pageCount - 1;
    page.textContent = text.page.replaceAll('{page}', () => String(displayedPage + 1)).replaceAll('{pages}', () => String(pageCount));
    sizeLabel.textContent = text.rowsPerPage;
    size.replaceChildren();
    for (const value of [...new Set([10, 25, 50, pageSize])].sort((a, b) => a - b)) {
      const option = doc.createElement('option'); option.value = String(value); option.textContent = String(value); size.append(option);
    }
    size.value = String(pageSize);
    restoreFocus?.focus();
  } };
}
