import { DateFormatter, parseDate, type DateValue } from '@internationalized/date';
import { connect, machine, type Props as ZagProps, type SelectionMode, type Service as ZagService } from '@zag-js/date-picker';
import { normalizeProps, spreadProps, VanillaMachine, type Attrs } from '@zag-js/vanilla';
import type { NodeSnapshot } from '@viewstem/core';
import { uniqueId, type Behavior, type Send } from './behaviors.js';

type Inputs = NodeSnapshot['inputs'];
type Kind = 'Calendar.Root' | 'RangeCalendar.Root' | 'DatePicker';
type Range = { start?: string | null; end?: string | null };
const getApi = (service: { readonly service: ZagService }) => connect(service.service, normalizeProps);

function date(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  try {
    const parsed = parseDate(value);
    return parsed.toString() === value ? parsed : undefined;
  } catch { return undefined; }
}

function dates(input: Inputs, kind: Kind, mode: SelectionMode): DateValue[] {
  if (mode === 'range') {
    const value = (kind === 'DatePicker' ? input.range : input.value) as Range | undefined;
    const start = date(value?.start);
    const end = date(value?.end);
    return start ? end && start.compare(end) <= 0 ? [start, end] : [start] : [];
  }
  const values = Array.isArray(input.value) ? input.value : [input.value];
  return values.map(date).filter((value): value is NonNullable<typeof value> => value !== undefined);
}

function locale(input: Inputs) {
  try { return Intl.DateTimeFormat.supportedLocalesOf(String(input.locale ?? 'en-US'))[0] ?? 'en-US'; }
  catch { return 'en-US'; }
}

function getMode(kind: Kind, input: Inputs): SelectionMode {
  if (kind === 'RangeCalendar.Root' || (kind === 'DatePicker' && (input.mode === 'range' || (input.mode === undefined && input.range !== undefined)))) return 'range';
  return input.type === 'multiple' ? 'multiple' : 'single';
}

function iso(value: DateValue | undefined) { return value?.toString() ?? null; }
const keyOf = (values: DateValue[]) => values.map(iso).join(',');

type Grid = {
  table: HTMLTableElement;
  caption: HTMLElement;
  month: HTMLSelectElement;
  year: HTMLSelectElement;
  headings: HTMLTableCellElement[];
};

export function dateCalendar(element: HTMLElement, kind: Kind, send: Send, signal: AbortSignal): Behavior {
  const doc = element.ownerDocument;
  const view = doc.defaultView!;
  const picker = kind === 'DatePicker';
  const id = uniqueId();
  const root = doc.createElement('div');
  root.className = 'vs-date-calendar';
  if (picker) root.dataset.picker = '';
  const control = doc.createElement('div');
  const trigger = doc.createElement('button');
  trigger.className = 'btn vs-date-trigger';
  trigger.dataset.variant = 'outline';
  const positioner = doc.createElement('div');
  const panel = doc.createElement('div');
  panel.className = 'vs-date-panel';
  const navigation = doc.createElement('div');
  navigation.className = 'vs-date-navigation';
  const previous = doc.createElement('button');
  const next = doc.createElement('button');
  previous.className = next.className = 'btn';
  previous.dataset.variant = next.dataset.variant = 'ghost';
  navigation.append(previous, next);
  const months = doc.createElement('div');
  months.className = 'vs-date-months';
  panel.append(navigation, months);
  if (picker) {
    control.append(trigger);
    positioner.append(panel);
    root.append(control, positioner);
  } else root.append(panel);
  element.append(root);

  let inputs: Inputs = {};
  let mode: SelectionMode = 'single';
  let current: DateValue[] = [];
  const createService = () => new VanillaMachine(machine, machineProps);
  let service: ReturnType<typeof createService> | undefined;
  let unsubscribe: (() => void) | undefined;
  let previousExternal: string | undefined;
  let previousPlaceholder: string | null = null;
  let publishedPlaceholder: string | null = null;
  let pageAnchor: DateValue | undefined;
  let silentFocus: string | null = null;
  let clearedDate: DateValue | undefined;
  let dateFocus = false;
  let wasOpen = false;
  let pickerCloseTimer: number | undefined;
  let initialYear: number | undefined;
  let closed = false;
  let grids: Grid[] = [];
  const bindings = new Map<Element, () => void>();
  let needsRender = false;

  if (picker) doc.addEventListener('click', event => {
    if (!service || event.composedPath().includes(root)) return;
    const api = getApi(service);
    if (!api.open) return;
    // The deferred Zag listener can miss a click immediately after opening.
    api.setOpen(false);
    if (doc.activeElement === doc.body || panel.contains(doc.activeElement)) trigger.focus({ preventScroll: true });
  }, { capture: true, signal });

  function bind(node: Element, props: Attrs) {
    bindings.set(node, spreadProps(node, props, id));
  }

  function removeBindings(within?: Element) {
    for (const [node, cleanup] of bindings) {
      if (within && !within.contains(node)) continue;
      cleanup();
      bindings.delete(node);
    }
  }

  function requestRender() {
    if (needsRender || signal.aborted || closed) return;
    needsRender = true;
    queueMicrotask(() => {
      needsRender = false;
      if (!signal.aborted && !closed) render();
    });
  }

  function selectionFocus(values: DateValue[]) {
    return mode === 'range' ? values[0] : values.at(-1);
  }

  function publishPlaceholder(focused: DateValue | undefined) {
    const value = iso(focused);
    if (picker || !value || value === publishedPlaceholder) return;
    publishedPlaceholder = value;
    send('placeholderChange', { value });
  }

  function applyValue(nextValues: DateValue[]): void {
    const previous = current;
    let next = nextValues;
    if (mode === 'range' && next[0] && next[1] && kind === 'RangeCalendar.Root') {
      const span = Math.round((next[1].toDate('UTC').getTime() - next[0].toDate('UTC').getTime()) / 86_400_000) + 1;
      const min = Number(inputs.minDays ?? 0);
      const max = Number(inputs.maxDays ?? Infinity);
      if (span < min || span > max) {
        const selected = next.find(value => iso(value) !== iso(previous[0]));
        next = selected ? [selected] : [next[0]];
      }
    }
    if (keyOf(previous) === keyOf(next)) return;
    current = next;
    if (mode === 'range') {
      const range = { start: iso(next[0]), end: iso(next[1]) };
      if (kind === 'RangeCalendar.Root') {
        if (range.start !== iso(previous[0])) send('startValueChange', { value: range.start });
        if (range.end !== iso(previous[1])) send('endValueChange', { value: range.end });
      }
      send(picker ? 'rangeChange' : 'valueChange', { value: range });
      if (next.length === 1 && nextValues.length === 2) queueMicrotask(() => { if (!closed) service?.service.context.set('activeIndex', 1); });
    } else send('valueChange', { value: mode === 'multiple' ? next.map(iso) : iso(next[0]) });
    publishPlaceholder(selectionFocus(next) ?? clearedDate);
    clearedDate = undefined;
    if (picker && (mode === 'single' || next.length === 2) && service) {
      getApi(service).setOpen(false);
      queueMicrotask(() => { if (!closed) trigger.focus({ preventScroll: true }); });
    }
    requestRender();
  }

  function machineProps() {
    const min = date(picker ? inputs.min : inputs.minValue);
    const max = date(picker ? inputs.max : inputs.maxValue);
    const focused = date(picker ? undefined : inputs.placeholder);
    const count = Number(inputs.numberOfMonths ?? 1);
    return {
      id,
      getRootNode: () => {
        const owner = element.getRootNode();
        // Zag can finish a queued focus or dismissable task after the element is detached.
        return owner instanceof view.ShadowRoot ? owner : doc;
      },
      selectionMode: mode,
      value: current,
      min,
      max,
      ...(focused && { defaultFocusedValue: focused }),
      disabled: inputs.disabled === true,
      readOnly: inputs.readonly === true,
      locale: locale(inputs),
      dir: inputs.dir === 'rtl' ? 'rtl' : 'ltr',
      timeZone: 'UTC',
      numOfMonths: Number.isFinite(count) ? Math.max(1, Math.trunc(count)) : 1,
      startOfWeek: typeof inputs.weekStartsOn === 'number' ? inputs.weekStartsOn : undefined,
      fixedWeeks: inputs.fixedWeeks === true,
      outsideDaySelectable: inputs.disableDaysOutsideMonth !== true,
      maxSelectedDates: typeof inputs.maxDays === 'number' && mode === 'multiple' ? inputs.maxDays : undefined,
      inline: !picker,
      closeOnSelect: false,
      positioning: { placement: 'bottom-start', gutter: 4 },
      onValueChange({ value }) { if (!closed) applyValue(value); },
      onFocusChange({ focusedValue }) {
        // Zag queues its machine actions, so use the action's actual origin.
        const origin = service?.service.event.type;
        if (!closed && origin !== 'CELL.POINTER_MOVE' && origin !== 'CELL.CLICK' && origin !== 'TABLE.ENTER' &&
            iso(focusedValue) !== silentFocus) publishPlaceholder(focusedValue);
        silentFocus = null;
      },
    } satisfies ZagProps;
  }

  function makeGrid(): Grid {
    const wrapper = doc.createElement('section');
    const caption = doc.createElement('div');
    caption.className = 'vs-date-caption';
    const month = doc.createElement('select');
    const year = doc.createElement('select');
    month.className = year.className = 'select';
    const table = doc.createElement('table');
    const head = table.createTHead().insertRow();
    const headings = Array.from({ length: 7 }, () => {
      const heading = doc.createElement('th');
      heading.scope = 'col';
      head.append(heading);
      return heading;
    });
    table.createTBody();
    const heading = doc.createElement('div');
    heading.className = 'vs-date-heading';
    heading.append(caption, month, year);
    wrapper.append(heading, table);
    months.append(wrapper);
    return { table, caption, month, year, headings };
  }

  function setOptions(select: HTMLSelectElement, values: readonly number[], format: (value: number) => string, selected: number) {
    const options = values.map(value => [String(value), format(value)] as const);
    if (options.length !== select.options.length || options.some(([value, label], index) =>
      select.options[index]?.value !== value || select.options[index]?.textContent !== label)) {
      select.replaceChildren(...options.map(([value, label]) => {
        const option = doc.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
      }));
    }
    select.value = String(selected);
  }

  function deselect(api: ReturnType<typeof getApi>, value: DateValue) {
    if (picker || inputs.disabled === true || inputs.readonly === true || inputs.preventDeselect === true || mode === 'multiple') return false;
    const selected = mode === 'range' ? current.at(-1) : current[0];
    if (iso(selected) !== iso(value)) return false;
    clearedDate = value;
    api.setValue([]);
    service?.service.context.set('activeIndex', 0);
    service?.service.context.set('hoveredValue', null);
    return true;
  }

  function keepSelection(value: DateValue) {
    return mode === 'multiple' && inputs.preventDeselect === true && current.some(item => item.compare(value) === 0);
  }

  function render() {
    if (!service || closed || signal.aborted) return;
    const api = getApi(service);
    const language = locale(inputs);
    const monthFormat = (inputs.monthFormat ?? (String(inputs.captionLayout).startsWith('dropdown') ? 'short' : 'long')) as Intl.DateTimeFormatOptions['month'];
    const yearFormat = (inputs.yearFormat ?? 'numeric') as 'numeric' | '2-digit';
    const monthName = new DateFormatter(language, { timeZone: 'UTC', month: monthFormat });
    const yearName = new DateFormatter(language, { timeZone: 'UTC', year: yearFormat });
    const labels = new DateFormatter(language, { timeZone: 'UTC', dateStyle: 'long' });
    const active = doc.activeElement;
    if (picker) {
      if (api.open) {
        if (!wasOpen) dateFocus = true;
        view.clearTimeout(pickerCloseTimer);
        pickerCloseTimer = undefined;
      } else if (wasOpen && !view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        pickerCloseTimer = view.setTimeout(() => {
          pickerCloseTimer = undefined;
          requestRender();
        }, 100);
      }
      wasOpen = api.open;
      bind(control, api.getControlProps());
      bind(positioner, api.getPositionerProps());
      const label = current.map(value => labels.format(value.toDate('UTC'))).join(' – ') || String(inputs.placeholder ?? 'Pick a date');
      bind(trigger, { ...api.getTriggerProps(), 'aria-label': label, 'aria-haspopup': 'dialog' });
      trigger.textContent = label;
    }
    bind(root, api.getRootProps());
    bind(panel, {
      ...api.getContentProps(),
      ...(picker ? {
        role: 'dialog',
        hidden: !api.open && pickerCloseTimer === undefined,
        inert: !api.open,
        'aria-hidden': !api.open,
      } : { hidden: false }),
    });
    const first = api.visibleRange.start;
    if (pageAnchor?.year !== first.year || pageAnchor.month !== first.month) {
      pageAnchor = api.focusedValue.year === first.year && api.focusedValue.month === first.month ? api.focusedValue : first;
    }
    const initialPlaceholderYear = initialYear ??= first.year;
    const step = inputs.pagedNavigation === true ? api.numOfMonths : 1;
    bind(previous, { ...api.getPrevTriggerProps(), ...((!picker || step !== api.numOfMonths) && {
      onclick: () => navigate(-step),
    }) });
    bind(next, { ...api.getNextTriggerProps(), ...((!picker || step !== api.numOfMonths) && {
      onclick: () => navigate(step),
    }) });
    function navigate(amount: number) {
      // Paging keeps the original view's day even if a different cell was selected.
      const focused = (picker ? first : pageAnchor ?? first).add({ months: amount });
      pageAnchor = focused;
      service?.service.context.set('startValue', first.add({ months: amount }));
      api.setFocusedValue(focused);
    }

    while (grids.length < api.numOfMonths) grids.push(makeGrid());
    while (grids.length > api.numOfMonths) {
      const removed = grids.pop()!.table.parentElement!;
      removeBindings(removed);
      removed.remove();
    }
    let focusTarget: HTMLButtonElement | undefined;
    grids.forEach((grid, index) => {
      const start = first.add({ months: index });
      const weeks = api.getMonthWeeks(start);
      const tableProps = api.getTableProps({ id: String(index) });
      bind(grid.table, { ...tableProps,
        ...(inputs['aria-label'] || inputs.calendarLabel ? { 'aria-label': inputs['aria-label'] ?? inputs.calendarLabel } : {}),
        onkeydown(event: KeyboardEvent) {
          if ((event.key === 'Enter' || event.key === ' ') && (keepSelection(api.focusedValue) || deselect(api, api.focusedValue))) event.preventDefault();
          else tableProps.onkeydown?.(event);
        },
      });
      const startDate = start.toDate('UTC');
      const layout = inputs.captionLayout;
      grid.month.hidden = index !== 0 || (layout !== 'dropdown' && layout !== 'dropdown-months');
      grid.year.hidden = index !== 0 || (layout !== 'dropdown' && layout !== 'dropdown-years');
      grid.caption.hidden = !grid.month.hidden && !grid.year.hidden;
      grid.caption.textContent = grid.month.hidden && grid.year.hidden
        ? `${monthName.format(startDate)} ${yearName.format(startDate)}`
        : grid.month.hidden ? monthName.format(startDate) : yearName.format(startDate);
      if (!grid.month.hidden) {
        const options = Array.isArray(inputs.months) ? inputs.months as number[] : Array.from({ length: 12 }, (_, i) => i + 1);
        bind(grid.month, {
          ...api.getMonthSelectProps(),
          ...(!picker && {
            oninput: undefined,
            onchange: () => api.setFocusedValue((date(publishedPlaceholder) ?? api.focusedValue).set({ month: Number(grid.month.value) })),
          }),
        });
        setOptions(grid.month, options, value => monthName.format(start.set({ month: value }).toDate('UTC')), start.month);
      }
      if (!grid.year.hidden) {
        const latest = Math.max(initialPlaceholderYear, new Date().getFullYear());
        const earliest = initialPlaceholderYear < latest - 100 ? initialPlaceholderYear - 10 : latest - 100;
        const min = machineProps().min?.year ?? Math.min(start.year, earliest);
        const max = machineProps().max?.year ?? Math.max(start.year, latest + 10);
        const options = Array.isArray(inputs.years) ? inputs.years as number[] : Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
        bind(grid.year, {
          ...api.getYearSelectProps(),
          ...(!picker && {
            oninput: undefined,
            onchange: () => api.setFocusedValue((date(publishedPlaceholder) ?? api.focusedValue).set({ year: Number(grid.year.value) })),
          }),
        });
        setOptions(grid.year, options, value => yearName.format(start.set({ year: value }).toDate('UTC')), start.year);
      }
      const weekday = (inputs.weekdayFormat ?? 'short') as 'short' | 'long' | 'narrow';
      grid.headings.forEach((heading, day) => { heading.textContent = api.weekDays[day]?.[weekday] ?? ''; });
      const body = grid.table.tBodies[0]!;
      while (body.rows.length > weeks.length) {
        const row = body.rows[body.rows.length - 1]!;
        removeBindings(row);
        row.remove();
      }
      while (body.rows.length < weeks.length) {
        const row = body.insertRow();
        for (let day = 0; day < 7; day++) {
          const cell = row.insertCell();
          const button = doc.createElement('button');
          button.type = 'button';
          button.className = 'btn vs-date-day';
          cell.append(button);
        }
      }
      const end = start.add({ months: 1 }).subtract({ days: 1 });
      weeks.forEach((week, row) => week.forEach((value, day) => {
        const cell = body.rows[row]!.cells[day]!;
        const button = cell.firstElementChild as HTMLButtonElement;
        const inMonth = start.month === value.month && start.year === value.year;
        const duplicate = !inMonth && first.compare(value) <= 0 && api.visibleRange.end.compare(value) >= 0;
        const args = { value, visibleRange: { start, end } };
        const props = api.getDayTableCellTriggerProps(args);
        bind(cell, api.getDayTableCellProps(args));
        bind(button, { ...props, id: duplicate ? undefined : props.id, hidden: duplicate, 'data-date': iso(value),
          'aria-invalid': undefined, 'data-outside-month': !inMonth || undefined,
          'data-variant': inputs.buttonVariant === 'default' ? 'primary' : inputs.buttonVariant ?? 'ghost',
          onfocus() {
            if (duplicate || !service) return;
            const activeApi = getApi(service);
            if (iso(activeApi.focusedValue) !== iso(value)) {
              // DOM focus and the public placeholder differ when a range's end is clicked.
              if (!picker) silentFocus = iso(value);
              activeApi.setFocusedValue(value);
            }
          },
          onclick(event: MouseEvent) { if (!keepSelection(value) && !deselect(api, value)) props.onclick?.(event); },
        });
        button.textContent = String(value.day);
        if (!duplicate && iso(value) === iso(api.focusedValue)) focusTarget = button;
      }));
    });
    if (focusTarget && (!picker || api.open) && (dateFocus || (active && panel.contains(active) && active.getAttribute('data-date') !== null))) {
      focusTarget.focus({ preventScroll: true });
      dateFocus = false;
    }
  }

  return {
    sync(next) {
      inputs = next;
      const selectionMode = getMode(kind, inputs);
      const value = picker && selectionMode === 'range' ? inputs.range : inputs.value;
      const suppliedDates = dates(inputs, kind, selectionMode);
      const min = picker ? date(inputs.min) : undefined;
      const max = picker ? date(inputs.max) : undefined;
      const constrain = (value: DateValue) => {
        const lower = min && value.compare(min) < 0 ? min : value;
        return max && lower.compare(max) > 0 ? max : lower;
      };
      const nextValues = picker ? suppliedDates.map(constrain) : suppliedDates;
      const signature = value === undefined ? undefined : picker
        ? JSON.stringify([keyOf(suppliedDates), keyOf(nextValues)]) : keyOf(suppliedDates);
      const placeholder = picker ? null : iso(date(inputs.placeholder));
      if (!service || mode !== selectionMode) {
        unsubscribe?.();
        service?.stop();
        mode = selectionMode;
        current = nextValues;
        previousExternal = signature;
        previousPlaceholder = placeholder;
        pageAnchor = date(placeholder) ?? selectionFocus(nextValues);
        publishedPlaceholder = iso(pageAnchor);
        dateFocus = !picker && inputs.initialFocus === true;
        service = createService();
        unsubscribe = service.subscribe(requestRender);
        render();
        service.start();
        if (mode === 'range' && current.length === 1) service.service.context.set('activeIndex', 1);
      } else {
        const changed = signature !== previousExternal && signature !== undefined;
        const projected = changed ? nextValues : picker ? current.map(constrain) : current;
        const externalSelection = keyOf(current) !== keyOf(projected);
        current = projected;
        let nextFocus = placeholder !== previousPlaceholder ? date(placeholder) : externalSelection ? selectionFocus(projected) : undefined;
        previousExternal = signature;
        previousPlaceholder = placeholder;
        service.updateProps({});
        const api = getApi(service);
        if (picker && !nextFocus) {
          const boundedFocus = constrain(api.focusedValue);
          if (boundedFocus.compare(api.focusedValue) !== 0) nextFocus = boundedFocus;
        }
        if ((changed || externalSelection) && mode === 'range') service.service.context.set('activeIndex', current.length === 1 ? 1 : 0);
        if (nextFocus) {
          silentFocus = publishedPlaceholder = iso(nextFocus);
          api.setFocusedValue(nextFocus);
        }
        render();
      }
    },
    dispose() {
      closed = true;
      view.clearTimeout(pickerCloseTimer);
      unsubscribe?.();
      service?.stop();
      removeBindings();
    },
  };
}
