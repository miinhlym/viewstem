import type { NodeSnapshot, View } from '@viewstem/core';
import { attributes, components, domEvents, support } from './shadcn.js';
import { chart, combobox, command, disclosure, group, modal, notifications, popup, range, tabs, tooltip, uniqueId, type Behavior, type Send } from './behaviors.js';

import { dateCalendar } from './date-calendar.js';
import { multiSlider } from './slider.js';
import { dataTable } from './data-table.js';
import { bindComponent, emitFrom, readInputs } from './component-context.js';
import { menus } from './menus.js';
import { markupBehavior, markupTag } from './markup-families.js';
import { widgetBehavior } from './widget-families.js';
import { formScrollBehavior, formScrollHost } from './form-scroll-families.js';

export { registerShadcn } from './shadcn.js';

export interface Attachment {
  dispose(): void;
}

export interface AttachOptions {
  onError?: (error: unknown) => void;
}

type Entry = {
  node: NodeSnapshot;
  name: string;
  element: HTMLElement;
  control: HTMLElement;
  host: HTMLElement;
  label: Text;
  markup: NonNullable<ReturnType<typeof components.get>>;
  children: Map<string, Entry>;
  composing: boolean;
  events: AbortController;
  behavior?: Behavior;
  auxiliary?: HTMLElement;
};
const targets = new WeakSet<HTMLElement>();
const contracts = new Map(support.map(spec => [spec.id, spec]));
const detailsGroup = new Set(['RadioGroup.Root', 'Pagination.Root', 'Sidebar.Provider']);
const modalRoots = /^(?:Dialog|AlertDialog|Drawer|Sheet)\.(?:Root|NestedRoot)$/;
const modalParts = /^(?:Dialog|AlertDialog|Drawer|Sheet)\.(Trigger|Close|Content|Title|Description|Action|Cancel|Overlay)$/;
const labelledMenuParts = /^(?:Command\.(?:Item|LinkItem)|(?:ContextMenu|DropdownMenu|Menubar)\.Item)$/;

function domEvent(event: Event, target: HTMLElement) {
  const payload: Record<string, string | boolean | number> = { type: event.type };
  for (const key of ['value', 'checked'] as const) {
    const value = (target as HTMLInputElement)[key];
    if (typeof value === 'boolean' || typeof value === 'string') payload[key] = value;
  }
  const source = event as unknown as Record<string, unknown>;
  for (const key of ['key', 'code', 'button', 'buttons', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
    const value = source[key];
    if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') payload[key] = value;
  }
  return payload;
}

function setAttribute(element: HTMLElement, key: string, value: unknown, fallback?: string) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const boolean = ['disabled', 'required', 'readonly', 'multiple', 'hidden', 'inert', 'selected'];
    if (boolean.includes(key) && typeof value === 'boolean') element.toggleAttribute(key, value);
    else if (element.getAttribute(key) !== String(value)) element.setAttribute(key, String(value));
  } else if (fallback !== undefined) element.setAttribute(key, fallback);
  else if (element.hasAttribute(key)) element.removeAttribute(key);
}

function safeUrl(element: HTMLElement, value: unknown, allowCsvDownload = false) {
  if (typeof value !== 'string') return undefined;
  try {
    if (allowCsvDownload && /^data:text\/csv(?:;charset=utf-8)?(?:;base64)?,/i.test(value)) return value;
    const protocol = new URL(value, element.ownerDocument.baseURI).protocol;
    return ['http:', 'https:', 'mailto:', 'tel:', 'blob:'].includes(protocol) ? value : undefined;
  } catch { return undefined; }
}

function disposeEntry(entry: Entry) {
  entry.events.abort();
  entry.behavior?.dispose?.();
  for (const child of entry.children.values()) disposeEntry(child);
  entry.element.remove();
}

function visibleNodes(nodes: readonly NodeSnapshot[]): NodeSnapshot[] {
  return nodes.flatMap(node => {
    if (node.status !== 'ready' || node.address === undefined) return [];
    const name = node.componentRef?.slice('shadcn.'.length);
    if (name && /\.Portal$/.test(name) && components.has(name)) return visibleNodes(node.slots.default ?? []);
    return [node];
  });
}

function behavior(name: string, element: HTMLElement, send: Send, signal: AbortSignal) {
  if (name === 'Calendar.Root' || name === 'RangeCalendar.Root' || name === 'DatePicker') return dateCalendar(element, name, send, signal);
  if (name === 'DataTable') return dataTable(element, send, signal);
  if (modalRoots.test(name)) return modal(element, send, signal);
  if (name === 'Accordion.Root' || name === 'Collapsible.Root') return disclosure(element, name, send, signal);
  if (name === 'Tabs.Root') return tabs(element, send, signal);
  if (name === 'Select.Root') return popup(element, 'select', send, signal);
  if (name === 'Popover.Root') return popup(element, 'popover', send, signal);
  if (name === 'DropdownMenu.Root' || name === 'ContextMenu.Root' || name === 'Menubar.Root') {
    const family = name.slice(0, -5) as 'DropdownMenu' | 'ContextMenu' | 'Menubar';
    return menus(element, family, send, signal);
  }
  if (name === 'Tooltip.Root') return tooltip(element, send, signal);
  if (name === 'Combobox') return combobox(element, send, signal);
  if (name === 'Command.Root') return command(element, send, signal);
  if (name === 'Slider') return element.localName === 'input'
    ? range(element as HTMLInputElement, send, signal) : multiSlider(element, send, signal);
  if (detailsGroup.has(name)) return group(element, name, send, signal);
  if (name === 'Notifications') return notifications(element, send);
  if (name === 'Chart') return chart(element);
  return markupBehavior(name, element, send, signal) ??
    widgetBehavior(name, element, send, signal) ??
    formScrollBehavior(name, element, send, signal);
}

function place(parent: HTMLElement, element: HTMLElement, before: Element | null) {
  if (element === before) return;
  const { moveBefore } = parent as HTMLElement & { moveBefore?: (node: Node, before: Node | null) => void };
  if (element.isConnected && moveBefore) {
    moveBefore.call(parent, element, before);
    return;
  }
  const active = element.ownerDocument.activeElement;
  const focused = active && element.contains(active) ? active as HTMLElement : null;
  const input = focused?.localName === 'input' ? focused as HTMLInputElement : null;
  const start = input?.selectionStart;
  const end = input?.selectionEnd;
  const direction = input?.selectionDirection;
  parent.insertBefore(element, before);
  if (focused && element.ownerDocument.activeElement !== focused) {
    focused.focus({ preventScroll: true });
    if (input && typeof start === 'number' && typeof end === 'number') input.setSelectionRange(start, end, direction ?? undefined);
  }
}

/** Renders a borrowed View into a connected browser container. Dispose before removing the container. */
export function attach(view: View, target: HTMLElement, { onError }: AttachOptions = {}): Attachment {
  if (!target.isConnected || targets.has(target)) {
    throw new Error('Viewstem UI requires a connected container with no active attachment.');
  }
  targets.add(target);
  const doc = target.ownerDocument;
  const scope = doc.createElement('div');
  scope.setAttribute('data-viewstem-ui', '');
  const entries = new Map<string, Entry>();
  let alive = true;
  let currentNodes = new Set<NodeSnapshot>();

  function report(error: unknown) {
    try { onError?.(error); } catch { /* Diagnostic callbacks cannot interrupt rendering. */ }
  }

  function createEntry(node: NodeSnapshot): Entry {
    const name = node.componentRef?.startsWith('shadcn.') ? node.componentRef.slice('shadcn.'.length) : '';
    const definition = components.get(name);
    const markup = name === 'Slider' && node.inputs.type === 'multiple'
      ? ['div', 'vs-slider-group', { role: 'group' }] as const
      : definition ?? ['div', ''] as const;
    const tag = markupTag(name, node.inputs) ?? markup[0];
    const defaults = markup[2];
    const part = modalParts.exec(name)?.[1]?.toLowerCase();
    const childAction = !!node.slots.child?.length && !!part;
    const childTrigger = !!node.slots.child?.length && (/^(?:DropdownMenu|HoverCard|Tooltip|Popover)\.Trigger$/.test(name) || name === 'Popover.Close');
    const control = doc.createElement(childAction || childTrigger ? 'span' : tag);
    if (defaults) for (const [key, value] of Object.entries(defaults)) {
      if (name !== 'Button' || tag !== 'a' || key !== 'type') control.setAttribute(key, value);
    }

    let element = control;
    let host = formScrollHost(name, control) ?? control;
    if (name === 'Carousel.Content' || name === 'HoverCard.Content' || name === 'AspectRatio') {
      element = doc.createElement('div');
      element.className = name === 'Carousel.Content' ? 'vs-carousel-viewport' : name === 'HoverCard.Content' ? 'vs-hover-positioner' : 'vs-ui-aspect-frame';
      element.append(control);
    } else if (name === 'CodeBlock.Content') {
      host = doc.createElement('code');
      control.append(host);
    } else if (name === 'Command.Input') {
      element = doc.createElement('header');
      element.append(control);
    } else if (name === 'Table.Root') {
      element = doc.createElement('div');
      element.className = 'table-container';
      element.append(control);
    } else if (tag === 'dialog') {
      host = doc.createElement('div');
      control.append(host);
    } else if (name === 'Sidebar.Root') {
      host = doc.createElement('nav');
      control.append(host);
    } else if (name === 'Field.Separator' || name === 'Command.Group') {
      host = doc.createElement(name === 'Field.Separator' ? 'span' : 'div');
      control.append(host);
    } else if (/^(?:DropdownMenu|ContextMenu|Menubar)\.(?:Sub)?Content$/.test(name)) {
      element = doc.createElement('div');
      element.dataset.vsMenuPositioner = '';
      control.setAttribute('aria-hidden', 'true');
      element.append(control);
    } else if (name === 'Select.Content') {
      host = doc.createElement('div');
      host.setAttribute('role', 'listbox');
      control.append(host);
    }
    if (childAction || childTrigger) control.className = 'vs-ui-transparent';
    control.dataset.vsComponent = name;
    control.dataset.vsPart = !definition ? 'group' : name === 'Card.Root' ? 'card' : name.startsWith('Card.') ? name.replace('Card.', 'card-').toLowerCase() : modalRoots.test(name) ? 'dialog-root' : part ? 'dialog-' + part : name.split('.').at(-1)!.toLowerCase();
    if (part === 'trigger') control.dataset.vsModalAction = 'open';
    if (part === 'close' || part === 'cancel') control.dataset.vsModalAction = 'close';

    const label = doc.createTextNode('');
    if (!['input', 'img', 'hr'].includes(tag)) host.prepend(label);
    const entry: Entry = { node, name, element, control, host, label, markup, children: new Map(), composing: false, events: new AbortController() };
    const { signal } = entry.events;
    if (name === 'Avatar.Image') {
      let pendingStatus: MutationObserver | undefined;
      const reportImageStatus = (status: 'loaded' | 'error') => {
        pendingStatus?.disconnect();
        control.toggleAttribute('data-vs-loaded', status === 'loaded');
        const avatar = control.closest<HTMLElement>('[data-vs-component="Avatar.Root"]');
        if (!avatar) return;
        const hover = avatar.closest<HTMLElement>('[data-vs-component="HoverCard.Content"]');
        const src = control.getAttribute('src');
        const publish = () => {
          if (control.getAttribute('src') === src) emitFrom(avatar, 'loadingStatusChange', { value: status });
        };
        if (!hover || hover.dataset.state === 'open' || readInputs(hover).forceMount === true) { publish(); return; }
        pendingStatus = new doc.defaultView!.MutationObserver(() => {
          if (hover.dataset.state !== 'open') return;
          pendingStatus?.disconnect();
          publish();
        });
        pendingStatus.observe(hover, { attributes: true, attributeFilter: ['data-state'] });
      };
      signal.addEventListener('abort', () => pendingStatus?.disconnect(), { once: true });
      control.addEventListener('load', () => reportImageStatus('loaded'), { signal });
      control.addEventListener('error', () => reportImageStatus('error'), { signal });
    }
    const events = contracts.get(node.componentRef ?? '')?.events ?? {};
    const send: Send = (event, payload) => {
      if (!Object.hasOwn(events, event)) return;
      const source = entry.node;
      // Controllers finish their native event stack before an Action can replace the DOM.
      queueMicrotask(() => {
        if (alive && !signal.aborted && currentNodes.has(entry.node) && source.generation === entry.node.generation) void view.emit(entry.node, event, payload).catch(report);
      });
    };
    bindComponent(control, () => entry.node.inputs, send);
    for (const [eventName, nativeName] of Object.entries(domEvents)) {
      if (!Object.hasOwn(events, eventName)) continue;
      control.addEventListener(nativeName, event => {
        if (nativeName === 'submit') event.preventDefault();
        if (nativeName === 'input' && (entry.composing || (event as InputEvent).isComposing)) return;
        send(eventName, domEvent(event, control));
      }, { signal });
    }
    if (Object.hasOwn(events, 'input') && ['input', 'textarea'].includes(tag)) {
      control.addEventListener('compositionstart', () => { entry.composing = true; }, { signal });
      control.addEventListener('compositionend', event => {
        entry.composing = false;
        send('input', { ...domEvent(event, control), type: 'input' });
      }, { signal });
    }
    if (name === 'Checkbox' || name === 'Switch') {
      const input = control as HTMLInputElement;
      input.addEventListener('change', () => {
        send('checkedChange', { value: input.checked });
        if (entry.node.inputs.indeterminate === true && !input.indeterminate) send('indeterminateChange', { value: false });
      }, { signal });
    }
    if (name === 'Collapsible.Trigger' && node.slots.child?.length) {
      control.addEventListener('click', event => {
        if ((event.target as Element).closest('button, a, input, select, textarea')) {
          event.preventDefault();
          const details = control.closest('details');
          if (details) details.open = !details.open;
        }
      }, { signal });
    }
    if (name === 'InputGroup.Addon') {
      control.addEventListener('click', event => {
        if (!event.defaultPrevented && !(event.target as Element).closest('button, a[href]')) {
          control.parentElement?.querySelector<HTMLInputElement>(':scope > input')?.focus();
        }
      }, { signal });
    }
    if (name === 'Command.Item' || name === 'Command.LinkItem') {
      control.addEventListener('click', event => {
        if (entry.node.inputs.disabled !== true) {
          send('select', { value: null });
        }
      }, { signal });
    }
    if (name === 'Progress' || name === 'Field.Separator' || name === 'Command.Group') {
      const auxiliary = doc.createElement(name === 'Field.Separator' ? 'hr' : 'span');
      if (name === 'Field.Separator') auxiliary.setAttribute('role', 'separator');
      if (name === 'Command.Group') auxiliary.setAttribute('role', 'heading');
      control.prepend(auxiliary);
      entry.auxiliary = auxiliary;
    }
    if (name === 'Dialog.Content' || name === 'Sheet.Content') {
      const close = doc.createElement('button');
      close.type = 'button';
      close.className = 'btn vs-dialog-dismiss';
      close.dataset.variant = 'ghost';
      close.dataset.size = 'icon-sm';
      close.dataset.vsModalAction = 'close';
      close.setAttribute('aria-label', 'Close');
      host.append(close);
      entry.auxiliary = close;
    }
    if (name === 'Drawer.Content') {
      const handle = doc.createElement('div');
      handle.className = 'vs-drawer-handle';
      handle.setAttribute('aria-hidden', 'true');
      host.append(handle);
    }
    const enhancement = name === 'Command.Dialog'
      ? command(host, send, signal)
      : behavior(name, control, send, signal);
    if (enhancement) entry.behavior = enhancement;
    return entry;
  }

  function update(entry: Entry, node: NodeSnapshot, active: Set<NodeSnapshot>) {
    entry.node = node;
    active.add(node);
    const { control, host, label, children, name, markup, auxiliary } = entry;
    const { inputs } = node;
    const descendants = components.has(name) ? node.slots.child?.length ? node.slots.child : node.slots.default ?? [] : node.children;
    const defaultText = name === 'Breadcrumb.Ellipsis' || name === 'Pagination.Ellipsis' ? '…'
      : name === 'Breadcrumb.Separator' ? '›'
      : name === 'Pagination.NextButton' || name === 'Pagination.Next' ? 'Next'
      : name === 'Pagination.PrevButton' || name === 'Pagination.Previous' ? 'Previous'
      : name === 'Pagination.Link' && inputs.page && typeof inputs.page === 'object' && 'value' in inputs.page ? String(inputs.page.value)
      : name === 'Select.Value' && typeof inputs.placeholder === 'string' ? inputs.placeholder : '';
    const shortcutRef = labelledMenuParts.test(name) ? 'shadcn.' + name.split('.')[0] + '.Shortcut' : undefined;
    const replacesLabel = descendants.length && (!shortcutRef || descendants.some(child => child.componentRef !== shortcutRef));
    const content = replacesLabel ? ''
      : typeof inputs.text === 'string' ? inputs.text : defaultText;
    if (label.data !== content) label.data = content;

    const [, className, defaults] = markup;
    const activeCommand = (name === 'Command.Item' || name === 'Command.LinkItem') && control.classList.contains('active');
    const combined = [node.slots.child?.length && (modalParts.test(name) || (/^(?:DropdownMenu|HoverCard|Tooltip|Popover)\.Trigger$/.test(name) || name === 'Popover.Close')) ? 'vs-ui-transparent' : className,
      inputs.class, activeCommand && 'active'].filter(Boolean).join(' ');
    if (control.className !== combined) control.className = combined;
    for (const key of attributes) {
      if (key === 'class' || !Object.hasOwn(inputs, key)) continue;
      const value = key === 'href' || key === 'src' ? safeUrl(control, inputs[key], name === 'Attachment.Action' && key === 'href' && (inputs.download === true || typeof inputs.download === 'string')) : inputs[key];
      if (name === 'Avatar.Image' && key === 'src' && control.getAttribute('src') !== value) delete control.dataset.vsLoaded;
      setAttribute(control, key, value, defaults?.[key]);
    }
    for (const key of attributes) {
      if (key === 'class' || Object.hasOwn(inputs, key)) continue;
      if (entry.control.dataset.vsManaged?.split(' ').includes(key)) setAttribute(control, key, undefined, defaults?.[key]);
    }
    control.dataset.vsManaged = [...attributes].filter(key => key !== 'class' && Object.hasOwn(inputs, key)).join(' ');

    if (control.localName === 'button') {
      const button = control as HTMLButtonElement;
      button.type = inputs.type === 'submit' || inputs.type === 'reset' ? inputs.type : 'button';
      if (control.dataset.vsModalAction === 'open') button.setAttribute('aria-haspopup', 'dialog');
    }
    for (const key of ['variant', 'size', 'orientation', 'align'] as const) {
      const value = key === 'variant' && inputs.variant === 'default' && (name === 'Button' || name === 'InputGroup.Button') ? 'primary'
        : key === 'size' && inputs.size === 'default' ? undefined : inputs[key];
      setAttribute(control, 'data-' + key, value, defaults?.['data-' + key]);
    }
    if (typeof inputs.value === 'string' && !['input', 'select', 'textarea', 'option'].includes(control.localName)) {
      control.dataset.value = inputs.value;
    } else delete control.dataset.value;
    if (name === 'Select.Item') setAttribute(control, 'data-label', inputs.label);
    if (name === 'Command.Item' || name === 'Command.LinkItem') {
      setAttribute(control, 'data-keywords', Array.isArray(inputs.keywords) ? inputs.keywords.join(',') : undefined);
    }
    if (name === 'Command.Group' && auxiliary) {
      auxiliary.textContent = typeof inputs.heading === 'string' ? inputs.heading : '';
      auxiliary.hidden = !auxiliary.textContent;
    }
    if (name === 'Sidebar.MenuButton' || name === 'Sidebar.MenuSubButton') {
      setAttribute(control, 'data-active', inputs.isActive);
    }
    if (typeof inputs.disabled === 'boolean' && ['summary', 'details', 'div'].includes(control.localName)) {
      control.setAttribute('aria-disabled', String(inputs.disabled));
    }

    const fieldValue = typeof inputs.value === 'number' ? String(inputs.value) : inputs.value;
    if (control.localName === 'input') {
      const input = control as HTMLInputElement;
      if (name === 'Checkbox' || name === 'Switch' || name === 'RadioGroup.Item') {
        if (typeof inputs.checked === 'boolean') input.checked = inputs.checked;
        if (name === 'Checkbox') input.indeterminate = inputs.indeterminate === true;
        setAttribute(input, 'value', inputs.value);
      } else if (name !== 'Slider') {
        const type = typeof inputs.type === 'string' ? inputs.type : 'text';
        if (input.type !== type) input.type = type;
        if (!entry.composing && typeof fieldValue === 'string' && input.value !== fieldValue && type !== 'file') input.value = fieldValue;
      }
    }
    if (control.localName === 'textarea' && !entry.composing && typeof fieldValue === 'string') {
      const textarea = control as HTMLTextAreaElement;
      if (textarea.value !== fieldValue) textarea.value = fieldValue;
    }
    if (control.localName === 'option') {
      setAttribute(control, 'value', inputs.value);
      setAttribute(control, 'selected', inputs.selected);
    }
    if (name === 'Card.Title' || name.endsWith('Dialog.Title') || name === 'Drawer.Title') control.dataset.title = '';
    if (name === 'Card.Description' || name.endsWith('Dialog.Description') || name === 'Drawer.Description') control.dataset.description = '';
    if (name === 'Pagination.Link' && inputs.page && typeof inputs.page === 'object') {
      control.dataset.vsPage = String((inputs.page as { value: number }).value);
    }
    if (/^Pagination\.(Next|Prev)/.test(name)) control.dataset.vsPage ||= '1';
    if (name === 'Separator') {
      setAttribute(control, 'role', inputs.decorative === false ? 'separator' : 'none');
    }
    if (name === 'Sonner' || name === 'Notifications') setAttribute(control, 'aria-label', inputs.containerAriaLabel);
    if (name === 'Sidebar.Root') setAttribute(control, 'data-collapsible', inputs.collapsible);
    if (name === 'Field.Separator') host.hidden = !content && !descendants.length;
    if ((name === 'Dialog.Content' || name === 'Sheet.Content') && auxiliary) auxiliary.hidden = inputs.showCloseButton === false;
    if (name === 'Sheet.Content') control.dataset.side = typeof inputs.side === 'string' ? inputs.side : 'right';
    if (name === 'Progress' && auxiliary) {
      const value = Number(inputs.value ?? 0);
      const max = Number(inputs.max ?? 100);
      setAttribute(control, 'aria-valuemax', max);
      setAttribute(control, 'aria-valuenow', value);
      auxiliary.style.width = `${Math.max(0, Math.min(100, value / (max || 1) * 100))}%`;
    }
    if (name === 'Chart.Container' && inputs.config && typeof inputs.config === 'object') {
      const config = inputs.config as Record<string, { color?: string }>;
      for (const key of Array.from(control.style)) if (key.startsWith('--color-')) control.style.removeProperty(key);
      for (const [key, { color }] of Object.entries(config)) {
        if (/^[\w-]+$/.test(key) && color && doc.defaultView?.CSS.supports('color', color)) {
          control.style.setProperty('--color-' + key, color);
        }
      }
    }
    renderList(host, children, descendants, active);
    if (name === 'Tooltip.Provider') {
      setAttribute(control, 'data-tooltip-delay', inputs.delayDuration);
      setAttribute(control, 'data-tooltip-disabled', inputs.disabled);
    }
    if (name === 'Tooltip.Root') {
      const trigger = control.querySelector<HTMLElement>('[data-vs-component="Tooltip.Trigger"]');
      const tooltip = control.querySelector<HTMLElement>('[data-vs-component="Tooltip.Content"]');
      if (trigger && tooltip) {
        tooltip.id ||= uniqueId();
        (trigger.classList.contains('vs-ui-transparent') ? trigger.querySelector<HTMLElement>(':scope > *') ?? trigger : trigger).setAttribute('aria-describedby', tooltip.id);
      }
    }
    if (name === 'NativeSelect.Root' && inputs.value !== undefined) {
      const select = control as HTMLSelectElement;
      const values = Array.isArray(inputs.value) ? inputs.value : [inputs.value];
      for (const option of select.options) option.selected = values.includes(option.value);
    }
    if (name === 'Command.Dialog') {
      const dialog = control as HTMLDialogElement;
      if (inputs.open === true && !dialog.open) dialog.showModal();
      else if (inputs.open === false && dialog.open) dialog.close();
      setAttribute(dialog, 'aria-label', inputs.title);
      setAttribute(dialog, 'aria-description', inputs.description);
    }
    entry.behavior?.sync(inputs);
  }

  function renderList(parent: HTMLElement, rendered: Map<string, Entry>, nodes: readonly NodeSnapshot[], active: Set<NodeSnapshot>) {
    const ready = visibleNodes(nodes);
    const keys = new Set(ready.map(node => node.address!));
    for (const [key, entry] of rendered) {
      if (!keys.has(key)) {
        disposeEntry(entry);
        rendered.delete(key);
      }
    }
    let before = parent.firstElementChild;
    for (const node of ready) {
      const key = node.address!;
      let entry = rendered.get(key);
      const nextTag = entry && markupTag(entry.name, node.inputs);
      if (entry && (entry.node.generation !== node.generation || !!entry.node.slots.child?.length !== !!node.slots.child?.length ||
          (nextTag !== undefined && entry.control.localName !== nextTag))) {
        if (before === entry.element) before = entry.element.nextElementSibling;
        disposeEntry(entry);
        rendered.delete(key);
        entry = undefined;
      }
      if (!entry) {
        entry = createEntry(node);
        rendered.set(key, entry);
      }
      place(parent, entry.element, before);
      before = entry.element.nextElementSibling;
      update(entry, node, active);
    }
  }

  let unsubscribe: (() => void) | undefined;
  const dispose = () => {
    if (!alive) return;
    alive = false;
    unsubscribe?.();
    currentNodes.clear();
    for (const entry of entries.values()) disposeEntry(entry);
    entries.clear();
    scope.remove();
    targets.delete(target);
  };
  try {
    target.append(scope);
    let initialFailure: { error: unknown } | undefined;
    unsubscribe = view.subscribe(snapshot => {
      const nextNodes = new Set<NodeSnapshot>();
      currentNodes = nextNodes;
      try { renderList(scope, entries, snapshot.roots, nextNodes); }
      catch (error) {
        if (unsubscribe) report(error);
        else initialFailure = { error };
      }
    });
    if (initialFailure) throw initialFailure.error;
  } catch (error) {
    dispose();
    throw error;
  }
  return { dispose };
}
