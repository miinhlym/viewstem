// JSON projections of the six authored recipes. Function/render callbacks stay in host Svelte code.
const string = { type: 'string' }, number = { type: 'number' }, boolean = { type: 'boolean' };
const array = items => ({ type: 'array', items });
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const nullableString = { type: ['string', 'null'] };
const range = object({ start: nullableString, end: nullableString }, ['start', 'end']);
const strings = array(string);
const sorting = array(object({ id: string, desc: boolean }, ['id', 'desc']));
const props = values => Object.fromEntries(Object.entries(values).map(([key, schema]) => [key, { schema }]));
const callbacks = values => Object.fromEntries(Object.entries(values).map(([name, schema]) => ['on' + name[0].toUpperCase() + name.slice(1), { event: name, schema }]));
const recipe = (family, name, inputs, events = {}, slots = []) => ({
  id: 'shadcn.' + name, family, exportName: name, source: '../recipes/' + name + '.svelte',
  props: props(inputs), callbacks: callbacks(events), slots, unsupported: {}, recipe: true,
});
export const recipes = [
  recipe('combobox', 'Combobox', {
    options: array(object({ value: string, label: string, disabled: boolean }, ['value', 'label'])),
    value: string, disabled: boolean, placeholder: string, searchPlaceholder: string, emptyText: string,
  }, { valueChange: string }),
  recipe('date-picker', 'DatePicker', {
    value: nullableString, range, mode: { enum: ['single', 'range'] }, locale: string,
    min: nullableString, max: nullableString, disabled: boolean, placeholder: string,
  }, { valueChange: nullableString, rangeChange: range }),
  recipe('data-table', 'DataTable', {
    data: array({ type: 'object' }), columns: array(object({ id: string, accessorKey: string, label: string, sortable: boolean, filterable: boolean }, ['id', 'accessorKey', 'label'])),
    sorting, pageIndex: { type: 'integer', minimum: 0 }, pageSize: { type: 'integer', minimum: 1 },
    filter: string, selectedIds: strings, rowId: string,
  }, { sortingChange: sorting, pageIndexChange: number, pageSizeChange: number, filterChange: string, selectedIdsChange: strings }),
  recipe('typography', 'Typography', {
    as: { enum: ['h1','h2','h3','h4','h5','h6','p','blockquote','code','span','small','strong','em','div'] },
    variant: { enum: ['h1','h2','h3','h4','p','blockquote','code','lead','large','small','muted'] }, text: string,
  }, {}, ['default']),
  recipe('chart', 'Chart', {
    kind: { enum: ['line','bar','area','pie'] }, data: array({ type: 'object' }), x: string, label: string,
    series: array(object({ id: string, key: string, label: string, color: string }, ['id', 'key'])),
  }),
  recipe('sonner', 'Notifications', {
    notifications: array(object({ id: string, title: string, description: string, kind: { enum: ['default','success','info','warning','error'] }, duration: { type: 'number', minimum: 0 } }, ['id','title'])),
    position: { enum: ['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right'] }, closeButton: boolean,
  }, { dismiss: object({ id: string, reason: { enum: ['dismissed','expired'] } }, ['id','reason']) }),
];
