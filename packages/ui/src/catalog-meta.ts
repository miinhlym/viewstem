import { staticCatalog } from './static-catalog.js';
import { dynamicCatalog, type Markup } from './dynamic-catalog.js';
import { menuCatalog, menuPorts, menuEvents } from './menus.js';
import { markupCatalog, markupPorts, markupEvents } from './markup-families.js';
import { widgetCatalog, widgetPorts, widgetEvents } from './widget-families.js';
import { formScrollCatalog, formScrollPorts, formScrollEvents } from './form-scroll-families.js';

export const components = new Map<string, Markup>(Object.entries({
  ...staticCatalog, ...dynamicCatalog, ...menuCatalog, ...markupCatalog, ...widgetCatalog, ...formScrollCatalog,
}));

export const attributes = new Set([
  'id', 'class', 'style', 'title', 'role', 'dir', 'lang', 'tabindex', 'hidden', 'inert',
  'name', 'for', 'label', 'alt', 'src', 'href', 'target', 'rel', 'placeholder', 'rows', 'cols', 'colspan', 'rowspan',
  'disabled', 'required', 'readonly', 'multiple', 'autocomplete', 'maxlength', 'minlength', 'inputmode', 'pattern',
  'data-icon', 'data-invalid', 'data-disabled', 'aria-label', 'aria-labelledby', 'aria-describedby',
  'aria-current', 'aria-hidden', 'aria-invalid', 'aria-busy', 'aria-disabled', 'aria-live',
]);

const calendarInputs = 'buttonVariant captionLayout calendarLabel disableDaysOutsideMonth locale weekdayFormat yearFormat disabled fixedWeeks id initialFocus maxDays minValue maxValue monthFormat months numberOfMonths pagedNavigation placeholder preventDeselect readonly value weekStartsOn years';

const inputs: Record<string, string> = {
  'Calendar.Root': calendarInputs + ' type',
  'RangeCalendar.Root': calendarInputs + ' minDays excludeDisabled',
  DatePicker: 'value range mode locale min max disabled placeholder',
  DataTable: 'data columns sorting pageIndex pageSize filter selectedIds rowId labels',
  'Accordion.Root': 'type value',
  'Accordion.Item': 'value',
  'Alert.Root': 'variant',
  Badge: 'variant',
  Button: 'variant size type',
  'ButtonGroup.Root': 'orientation',
  Checkbox: 'checked indeterminate value',
  Switch: 'checked value',
  'Collapsible.Root': 'open',
  Combobox: 'value options emptyText searchPlaceholder',
  'Command.Root': 'value',
  'Command.Dialog': 'open title description',
  'Command.Group': 'heading',
  'Command.Item': 'value keywords',
  'Command.LinkItem': 'value keywords',
  'Dialog.Root': 'open',
  'Dialog.Content': 'showCloseButton',
  'AlertDialog.Root': 'open',
  'AlertDialog.Content': 'size',
  'Drawer.Root': 'open dismissible',
  'Drawer.NestedRoot': 'open dismissible',
  'Sheet.Root': 'open',
  'Sheet.Content': 'side showCloseButton escapeKeydownBehavior interactOutsideBehavior',
  'Empty.Media': 'variant',
  'Field.Field': 'orientation',
  'InputGroup.Addon': 'align',
  'InputGroup.Button': 'variant size type',
  'InputGroup.Input': 'type value',
  'InputGroup.Textarea': 'value',
  Input: 'type value',
  Textarea: 'value',
  'Item.Root': 'variant size',
  'Item.Media': 'variant',
  'NativeSelect.Root': 'value',
  'NativeSelect.Option': 'value selected',
  'Pagination.Root': 'count perPage page',
  'Pagination.Link': 'page isActive',
  'Popover.Root': 'open',
  Progress: 'value max',
  'RadioGroup.Root': 'value',
  'RadioGroup.Item': 'value',
  'Select.Root': 'type value items',
  'Select.Item': 'value label',
  'Sidebar.Provider': 'open',
  'Sidebar.Root': 'collapsible',
  'Sidebar.MenuButton': 'isActive',
  'Sidebar.MenuSubButton': 'isActive',
  Slider: 'type value min max step',
  'Tooltip.Provider': 'delayDuration disabled',
  'Tooltip.Root': 'delayDuration disabled open',
  'Tabs.Root': 'value orientation',
  'Tabs.Trigger': 'value',
  'Tabs.Content': 'value',
  Separator: 'decorative',
  Notifications: 'notifications closeButton closeButtonAriaLabel containerAriaLabel position',
  Sonner: 'position closeButton closeButtonAriaLabel containerAriaLabel',
  'Chart.Container': 'config',
  Chart: 'kind data x series label',
};

const behaviors: Record<string, string> = {
  'Avatar.Root': 'loadingStatusChange',
  'Calendar.Root': 'valueChange placeholderChange',
  'RangeCalendar.Root': 'valueChange placeholderChange startValueChange endValueChange',
  DatePicker: 'valueChange rangeChange',
  DataTable: 'sortingChange pageIndexChange pageSizeChange filterChange selectedIdsChange',
  'Accordion.Root': 'valueChange',
  'Collapsible.Root': 'openChange openChangeComplete',
  Combobox: 'valueChange',
  'Command.Root': 'valueChange',
  'Command.Item': 'select',
  'Command.LinkItem': 'select',
  'Dialog.Root': 'openChange openChangeComplete',
  'AlertDialog.Root': 'openChange openChangeComplete',
  'Drawer.Root': 'openChange openChangeComplete close animationEnd',
  'Drawer.NestedRoot': 'openChange openChangeComplete animationEnd',
  'Sheet.Root': 'openChange openChangeComplete',
  'Pagination.Root': 'pageChange',
  'Popover.Root': 'openChange openChangeComplete',
  'Tooltip.Root': 'openChange openChangeComplete',
  'RadioGroup.Root': 'valueChange',
  'Select.Root': 'valueChange openChange openChangeComplete',
  'Select.Item': 'highlight unhighlight',
  'Sidebar.Provider': 'openChange',
  'Tabs.Root': 'valueChange',
  Checkbox: 'checkedChange indeterminateChange',
  Switch: 'checkedChange',
  Slider: 'valueChange valueCommit',
  Notifications: 'dismiss',
};
export const domEvents = {
  click: 'click', input: 'input', change: 'change', keyDown: 'keydown', keyUp: 'keyup',
  focus: 'focus', blur: 'blur', focusIn: 'focusin', focusOut: 'focusout', load: 'load', error: 'error',
  scroll: 'scroll', mouseEnter: 'mouseenter', mouseLeave: 'mouseleave',
  select: 'select', beforeInput: 'beforeinput',
  submit: 'submit', reset: 'reset',
} as const;

export function portNames(name: string) {
  return new Set([...attributes, 'text', ...[inputs, menuPorts, markupPorts, widgetPorts, formScrollPorts]
    .flatMap(table => table[name]?.split(' ') ?? [])]);
}

export function eventNames(name: string) {
  return new Set([...Object.keys(domEvents), ...[behaviors, menuEvents, markupEvents, widgetEvents, formScrollEvents]
    .flatMap(table => table[name]?.split(' ') ?? [])]);
}

export function slotNames(name: string) {
  const child = /^(?:Dialog|AlertDialog|Drawer|Sheet)\.(?:Trigger|Close|Action|Cancel)$/.test(name) || /^(?:Collapsible|DropdownMenu|HoverCard|Popover|Tooltip)\.Trigger$/.test(name) || name === 'Popover.Close';
  return new Set(child ? ['default', 'child'] : ['default']);
}
