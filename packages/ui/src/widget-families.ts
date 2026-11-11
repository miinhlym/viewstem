import type { NodeSnapshot } from '@viewstem/core';
import EmblaCarousel, { type EmblaCarouselType } from 'embla-carousel';
import * as hover from '@zag-js/hover-card';
import * as navigation from '@zag-js/navigation-menu';
import * as splitter from '@zag-js/splitter';
import { normalizeProps, spreadProps, VanillaMachine, type Attrs } from '@zag-js/vanilla';
import { uniqueId, type Behavior, type Send } from './behaviors.js';
import { emitFrom, readInputs } from './component-context.js';
import type { Markup } from './dynamic-catalog.js';

export const widgetCatalog: Record<string, Markup> = {
  'Carousel.Root': ['div', 'vs-carousel', { role: 'region', 'aria-roledescription': 'carousel' }],
  'Carousel.Content': ['div', 'vs-carousel-track'],
  'Carousel.Item': ['div', 'vs-carousel-slide', { role: 'group', 'aria-roledescription': 'slide' }],
  'Carousel.Next': ['button', 'btn vs-carousel-next', { 'data-variant': 'outline', 'data-size': 'icon-sm', 'aria-label': 'Next slide' }],
  'Carousel.Previous': ['button', 'btn vs-carousel-previous', { 'data-variant': 'outline', 'data-size': 'icon-sm', 'aria-label': 'Previous slide' }],
  'Resizable.PaneGroup': ['div', 'vs-resizable'],
  'Resizable.Pane': ['div', 'vs-resizable-pane'],
  'Resizable.Handle': ['div', 'vs-resizable-handle', { role: 'separator' }],
  'InputOtp.Root': ['div', 'vs-otp'],
  'InputOtp.Group': ['div', 'vs-otp-group'],
  'InputOtp.Separator': ['div', 'vs-otp-separator', { role: 'separator' }],
  'InputOtp.Slot': ['div', 'vs-otp-cell', { 'aria-hidden': 'true' }],
  'HoverCard.Root': ['div', 'vs-hover-card'],
  'HoverCard.Trigger': ['a', 'vs-hover-trigger', { role: 'button', 'aria-haspopup': 'dialog' }],
  'HoverCard.Content': ['div', 'vs-hover-content', { hidden: '' }],
  'HoverCard.Portal': ['div', 'vs-ui-transparent'],
  'NavigationMenu.Root': ['nav', 'vs-navigation'],
  'NavigationMenu.List': ['ul', 'vs-navigation-list'],
  'NavigationMenu.Item': ['li', 'vs-navigation-item'],
  'NavigationMenu.Trigger': ['button', 'vs-navigation-trigger'],
  'NavigationMenu.Content': ['div', 'vs-navigation-content', { hidden: '' }],
  'NavigationMenu.Link': ['a', 'vs-navigation-link'],
  'NavigationMenu.Indicator': ['div', 'vs-navigation-indicator', { hidden: '' }],
  'NavigationMenu.Viewport': ['div', 'vs-navigation-viewport', { hidden: '' }],
};

export const widgetPorts: Record<string, string> = {
  'Carousel.Root': 'orientation',
  'Carousel.Next': 'variant size',
  'Carousel.Previous': 'variant size',
  'Resizable.PaneGroup': 'direction autoSaveId keyboardResizeBy',
  'Resizable.Pane': 'defaultSize minSize maxSize collapsedSize collapsible order',
  'Resizable.Handle': 'withHandle',
  'InputOtp.Root': 'value defaultValue maxlength pattern autocomplete inputmode name disabled readonly required placeholder spellcheck type form aria-errormessage',
  'InputOtp.Slot': 'cell',
  'HoverCard.Root': 'open disabled openDelay closeDelay',
  'HoverCard.Content': 'side sideOffset align alignOffset forceMount avoidCollisions collisionPadding hideWhenDetached sticky',
  'NavigationMenu.Root': 'orientation value viewport delayDuration skipDelayDuration',
  'NavigationMenu.Item': 'value openOnHover',
  'NavigationMenu.Trigger': 'value',
  'NavigationMenu.Link': 'active',
  'NavigationMenu.Content': 'forceMount',
  'NavigationMenu.Indicator': 'forceMount',
  'NavigationMenu.Viewport': 'forceMount',
};

export const widgetEvents: Record<string, string> = {
  'Resizable.PaneGroup': 'layoutChange',
  'Resizable.Pane': 'collapse expand',
  'Resizable.Handle': 'draggingChange',
  'InputOtp.Root': 'valueChange complete beforeInput compositionStart compositionUpdate compositionEnd paste select',
  'HoverCard.Root': 'openChange openChangeComplete',
  'NavigationMenu.Root': 'valueChange',
  'NavigationMenu.Link': 'select',
};

type Props = NodeSnapshot['inputs'];
const part = <T extends HTMLElement = HTMLElement>(root: HTMLElement, name: string) =>
  root.querySelector<T>(`[data-vs-component="${name}"]`);
const owner = (element: Element, name: string) => element.closest(`[data-vs-component="${name}"]`);
const number = (value: unknown) => typeof value === 'number' ? value : undefined;
const string = (value: unknown) => typeof value === 'string' ? value : undefined;
const direction = (element: HTMLElement, inputs: Props): 'ltr' | 'rtl' =>
  inputs.dir === 'rtl' || (inputs.dir !== 'ltr' && element.matches(':dir(rtl)')) ? 'rtl' : 'ltr';
const orientation = (value: unknown): 'horizontal' | 'vertical' => value === 'vertical' ? 'vertical' : 'horizontal';
const rootNode = (element: HTMLElement) => element.getRootNode() as Document | ShadowRoot;

function partBindings(id: string) {
  const current = new Map<HTMLElement, () => void>();
  return {
    apply(parts: ReadonlyMap<HTMLElement, Attrs>) {
      for (const [node, attrs] of parts) current.set(node, spreadProps(node, attrs, id));
      for (const [node, cleanup] of current) {
        if (parts.has(node)) continue;
        cleanup();
        current.delete(node);
      }
    },
    dispose() { for (const cleanup of current.values()) cleanup(); current.clear(); },
  };
}

function onMachineUpdate(signal: AbortSignal, update: () => void) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!signal.aborted) update();
    });
  };
}

function carousel(element: HTMLElement, signal: AbortSignal): Behavior {
  let instance: EmblaCarouselType | undefined;
  let viewport: HTMLElement | undefined;
  let optionsKey = '';
  const next = () => part<HTMLButtonElement>(element, 'Carousel.Next');
  const previous = () => part<HTMLButtonElement>(element, 'Carousel.Previous');
  const updateButtons = () => {
    for (const [button, canScroll] of [[previous(), instance?.canScrollPrev()], [next(), instance?.canScrollNext()]] as const) {
      if (!button) continue;
      button.disabled = !canScroll || readInputs(button)?.disabled === true;
      button.setAttribute('aria-disabled', String(button.disabled));
    }
  };
  const action = (target: EventTarget | null) => {
    const button = (target as Element | null)?.closest<HTMLButtonElement>('.vs-carousel-next,.vs-carousel-previous');
    return button && owner(button, 'Carousel.Root') === element ? button : undefined;
  };
  element.addEventListener('click', event => {
    const button = action(event.target);
    if (!button || button.disabled || event.defaultPrevented) return;
    if (button === next()) instance?.scrollNext();
    else instance?.scrollPrev();
  }, { signal });
  element.addEventListener('keydown', event => {
    if (!action(event.target) || event.defaultPrevented) return;
    if (event.key === 'ArrowLeft') instance?.scrollPrev();
    else if (event.key === 'ArrowRight') instance?.scrollNext();
    else return;
    event.preventDefault();
  }, { signal });
  return {
    sync(inputs) {
      const axis = orientation(inputs.orientation) === 'vertical' ? 'y' : 'x';
      const dir = direction(element, inputs);
      element.dataset.vsAxis = axis;
      const track = part(element, 'Carousel.Content');
      const container = track?.parentElement;
      const nextViewport = container?.classList.contains('vs-carousel-viewport') ? container : undefined;
      const key = axis + dir;
      if (viewport !== nextViewport || optionsKey !== key) {
        instance?.destroy();
        viewport = nextViewport;
        optionsKey = key;
        instance = viewport && track ? EmblaCarousel(viewport, {
          axis, direction: dir, container: track,
          slides: '[data-vs-component="Carousel.Item"]',
        }) : undefined;
        instance?.on('select', updateButtons).on('reInit', updateButtons);
      }
      updateButtons();
    },
    dispose() { instance?.destroy(); },
  };
}

function inputOtp(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  const input = element.ownerDocument.createElement('input');
  input.className = 'vs-otp-input';
  input.type = 'text';
  input.spellcheck = false;
  input.autocomplete = 'one-time-code';
  input.inputMode = 'numeric';
  element.append(input);
  let initialized = false;
  let composing = false;
  let lastValue = '';
  let lastComplete: string | undefined;
  let inputAfterComposition: string | undefined;
  let pattern: RegExp | undefined;
  let inputs: Props = {};
  let appliedValue: unknown;
  let previousSelection: [number, number] = [0, 0];
  const payload = (event: Event) => {
    const details: Record<string, string | boolean | number> = { type: event.type, value: input.value, checked: input.checked };
    const source = event as unknown as Record<string, unknown>;
    for (const key of ['key', 'code', 'button', 'buttons', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      const value = source[key];
      if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') details[key] = value;
    }
    return details;
  };
  const renderCells = () => {
    const cells = element.querySelectorAll<HTMLElement>('[data-vs-component="InputOtp.Slot"]');
    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const focused = input.matches(':focus');
    cells.forEach((cell, index) => {
      if (readInputs(cell)?.cell != null) return;
      cell.dataset.vsOtpChar = input.value.charAt(index);
      const active = focused && (selectionStart === selectionEnd ? index === selectionStart : index >= selectionStart && index < selectionEnd);
      cell.dataset.active = String(active);
      cell.toggleAttribute('data-vs-caret', active && !input.value.charAt(index));
    });
  };
  const selectCell = () => {
    if (!input.matches(':focus') || composing) return;
    const { selectionStart: start, selectionEnd: end, value, maxLength } = input;
    if (start === null || end === null) return;
    if (maxLength > 0 && value && start === end && !(start === value.length && value.length < maxLength)) {
      const [previousStart, previousEnd] = previousSelection;
      const backward = start === maxLength || start < previousEnd;
      const index = Math.max(0, Math.min(value.length - 1, start - (backward && previousStart !== previousEnd ? 1 : 0)));
      input.setSelectionRange(index, index + 1, backward ? 'backward' : 'forward');
      previousSelection = [index, index + 1];
    } else previousSelection = [start, end];
    renderCells();
  };
  input.ownerDocument.addEventListener('selectionchange', selectCell, { signal });
  const commit = (event: Event, emitInput: boolean) => {
    const value = input.maxLength >= 0 ? input.value.slice(0, input.maxLength) : input.value;
    if (pattern && !pattern.test(value)) {
      input.value = lastValue;
      return;
    }
    if (input.value !== value) input.value = value;
    if (emitInput) send('input', { ...payload(event), type: 'input' });
    if (value !== lastValue) {
      const complete = value.length === input.maxLength && lastValue.length < input.maxLength;
      lastValue = value;
      send('valueChange', { value });
      if (complete && lastComplete !== value) {
        lastComplete = value;
        send('complete', { value });
      }
      if (!complete) lastComplete = undefined;
    }
    renderCells();
  };
  input.addEventListener('input', event => {
    event.stopPropagation();
    if (composing || (event as InputEvent).isComposing) return;
    if (inputAfterComposition !== undefined && inputAfterComposition === input.value) {
      inputAfterComposition = undefined;
      return;
    }
    inputAfterComposition = undefined;
    commit(event, true);
  }, { signal });
  input.addEventListener('compositionstart', event => {
    composing = true;
    inputAfterComposition = undefined;
    send('compositionStart', payload(event));
  }, { signal });
  input.addEventListener('compositionupdate', event => send('compositionUpdate', payload(event)), { signal });
  input.addEventListener('compositionend', event => {
    composing = false;
    commit(event, true);
    inputAfterComposition = input.value;
    send('compositionEnd', payload(event));
  }, { signal });
  const forwarded = {
    beforeinput: 'beforeInput', change: 'change', focus: 'focus', blur: 'blur', focusin: 'focusIn',
    focusout: 'focusOut', keydown: 'keyDown', keyup: 'keyUp', paste: 'paste', select: 'select',
  };
  for (const [native, event] of Object.entries(forwarded)) input.addEventListener(native, source => {
    source.stopPropagation();
    if (native === 'keydown') {
      const key = source as KeyboardEvent;
      if (pattern && key.key.length === 1 && !key.ctrlKey && !key.metaKey && !key.isComposing && !pattern.test(key.key)) key.preventDefault();
    }
    if (native === 'focus') {
      const end = input.value.length;
      const start = input.maxLength > 0 ? Math.min(end, input.maxLength - 1) : end;
      input.setSelectionRange(start, end);
      previousSelection = [start, end];
    }
    send(event, payload(source));
    renderCells();
  }, { signal });
  return {
    sync(next) {
      if (next.pattern !== inputs.pattern) {
        try { pattern = typeof next.pattern === 'string' ? new RegExp(next.pattern) : undefined; }
        catch { pattern = undefined; }
      }
      // An unrelated projection can arrive before valueChange updates the bound State.
      // Reapplying the previous value moves the browser selection to the end of the input.
      if (!composing) {
        if (!initialized || (typeof next.value === 'string' && next.value !== appliedValue)) {
          const value = string(next.value) ?? string(next.defaultValue) ?? '';
          if (input.value !== value) input.value = value;
          lastValue = value;
        }
        appliedValue = next.value;
      }
      initialized = true;
      inputs = next;
      input.disabled = next.disabled === true;
      input.readOnly = next.readonly === true;
      input.required = next.required === true;
      input.spellcheck = next.spellcheck === true;
      for (const key of ['maxlength', 'pattern', 'autocomplete', 'inputmode', 'name', 'placeholder', 'form'] as const) {
        const value = next[key] ?? (key === 'autocomplete' ? 'one-time-code' : key === 'inputmode' ? 'numeric' : undefined);
        if (value === undefined) input.removeAttribute(key);
        else input.setAttribute(key, String(value));
      }
      input.type = next.type === 'password' ? 'password' : 'text';
      for (const key of ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-invalid', 'aria-errormessage'] as const) {
        if (next[key] == null) input.removeAttribute(key);
        else input.setAttribute(key, String(next[key]));
      }
      if (typeof next.id === 'string') {
        element.removeAttribute('id');
        input.id = next.id;
      } else input.removeAttribute('id');
      if (typeof next.tabindex === 'number') {
        element.removeAttribute('tabindex');
        input.tabIndex = next.tabindex;
      } else input.removeAttribute('tabindex');
      renderCells();
    },
  };
}

function inputOtpCell(element: HTMLElement): Behavior {
  return { sync(inputs) {
    const cell = inputs.cell as { char?: string | null; isActive?: boolean; hasFakeCaret?: boolean } | undefined;
    if (!cell) return;
    element.dataset.vsOtpChar = cell.char ?? '';
    element.dataset.active = String(cell.isActive === true);
    element.toggleAttribute('data-vs-caret', cell.hasFakeCaret === true);
  } };
}

function resizable(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  const id = uniqueId();
  const bindings = partBindings(id);
  const panelIds = new WeakMap<HTMLElement, string>();
  let panelElements = new Map<string, HTMLElement>();
  let handles = new Map<splitter.ResizeTriggerId, HTMLElement>();
  let inputs: Props = {};
  let initialSizes: (number | string)[] = [];
  let panels: splitter.PanelData[] = [];
  let storageKey: string | undefined;
  let layoutKey = '';
  let draggingHandle: HTMLElement | undefined;
  let lastSizes: number[] | undefined;
  let propsSignature = '';
  let unsubscribe: (() => void) | undefined;

  const publishLayout = (size: number[]) => {
    if (!size.length || size.length !== panels.length || size.some(value => !Number.isFinite(value))) return false;
    if (lastSizes?.length === size.length && lastSizes.every((value, index) => value === size[index])) return false;
    lastSizes = [...size];
    send('layoutChange', { value: lastSizes });
    return true;
  };

  const createMachine = () => new VanillaMachine(splitter.machine, () => ({
    id,
    getRootNode: () => rootNode(element),
    panels,
    defaultSize: initialSizes,
    ids: { root: string(inputs.id), panel: (panelId) => {
      const panel = panelElements.get(String(panelId));
      return panel && string(readInputs(panel).id) || `splitter:${id}:panel:${panelId}`;
    } },
    orientation: orientation(inputs.direction),
    dir: direction(element, inputs),
    keyboardResizeBy: number(inputs.keyboardResizeBy) ?? 10,
    onCollapse({ panelId }) {
      const panel = panelElements.get(panelId);
      if (panel) emitFrom(panel, 'collapse', { value: null });
    },
    onExpand({ panelId }) {
      const panel = panelElements.get(panelId);
      if (panel) emitFrom(panel, 'expand', { value: null });
    },
    onResize({ size, expandToSizes }) {
      if (publishLayout(size) && storageKey) {
        try {
          const storage = element.ownerDocument.defaultView?.localStorage;
          const existing = JSON.parse(storage?.getItem(storageKey) ?? '{}') as Record<string, unknown> | null;
          storage?.setItem(storageKey, JSON.stringify({ ...existing, [layoutKey]: { layout: size, expandToSizes } }));
        } catch { /* Storage can be unavailable in a sandboxed iframe. */ }
      }
    },
  } as const satisfies splitter.Props));
  let machine: ReturnType<typeof createMachine> | undefined;
  const render = () => {
    if (!machine) return;
    const api = splitter.connect(machine.service, normalizeProps);
    const attrs = new Map<HTMLElement, Attrs>();
    const rootAttrs = api.getRootProps();
    attrs.set(element, { ...rootAttrs, style: undefined });
    for (const [panelId, panel] of panelElements) {
      attrs.set(panel, api.getPanelProps({ id: panelId }));
    }
    let currentDrag: HTMLElement | undefined;
    for (const [handleId, handle] of handles) {
      const props = { id: handleId, disabled: readInputs(handle).disabled === true };
      attrs.set(handle, api.getResizeTriggerProps(props));
      handle.toggleAttribute('data-vs-with-handle', readInputs(handle).withHandle === true);
      if (api.getResizeTriggerState(props).dragging) currentDrag = handle;
    }
    if (currentDrag !== draggingHandle) {
      if (draggingHandle) emitFrom(draggingHandle, 'draggingChange', { value: false });
      if (currentDrag) emitFrom(currentDrag, 'draggingChange', { value: true });
      draggingHandle = currentDrag;
    }
    bindings.apply(attrs);
    publishLayout(api.getSizes());
  };
  const update = onMachineUpdate(signal, render);
  return {
    sync(next) {
      inputs = next;
      const parts = Array.from(element.querySelectorAll<HTMLElement>('.vs-resizable-pane,.vs-resizable-handle'))
        .filter(child => owner(child, 'Resizable.PaneGroup') === element);
      panelElements = new Map();
      const nextPanels: splitter.PanelData[] = [];
      const nextSizes: (number | string)[] = [];
      const storageParts: string[] = [];
      for (const panel of parts.filter(child => child.classList.contains('vs-resizable-pane'))) {
        const pane = readInputs(panel);
        const panelId = panelIds.get(panel) ?? uniqueId();
        panelIds.set(panel, panelId);
        panelElements.set(panelId, panel);
        nextPanels.push({ id: panelId, order: number(pane.order), minSize: number(pane.minSize), maxSize: number(pane.maxSize), collapsible: pane.collapsible === true, collapsedSize: number(pane.collapsedSize) });
        nextSizes.push(number(pane.defaultSize) ?? '');
        const constraintKey = JSON.stringify({ collapsedSize: number(pane.collapsedSize) ?? 0, collapsible: pane.collapsible === true, defaultSize: number(pane.defaultSize), maxSize: number(pane.maxSize) ?? 100, minSize: number(pane.minSize) ?? 0 });
        storageParts.push(pane.order ? `${pane.order}:${constraintKey}` : constraintKey);
      }
      handles = new Map();
      parts.forEach((handle, index) => {
        if (!handle.classList.contains('vs-resizable-handle')) return;
        const before = parts.slice(0, index).reverse().find(part => panelIds.has(part));
        const after = parts.slice(index + 1).find(part => panelIds.has(part));
        if (!before || !after) return;
        handles.set(`${panelIds.get(before)!}:${panelIds.get(after)!}`, handle);
      });
      const key = JSON.stringify([nextPanels, nextSizes, next.direction, next.dir, next.autoSaveId, next.keyboardResizeBy, next.id]);
      if (key !== propsSignature) {
        propsSignature = key;
        panels = nextPanels;
        initialSizes = nextSizes;
        storageKey = typeof next.autoSaveId === 'string' && next.autoSaveId ? 'paneforge:' + next.autoSaveId : undefined;
        layoutKey = storageParts.sort().join(',');
        if (storageKey) {
          try {
            const serialized = element.ownerDocument.defaultView?.localStorage.getItem(storageKey);
            const saved = serialized ? JSON.parse(serialized)?.[layoutKey]?.layout : undefined;
            if (Array.isArray(saved) && saved.length === nextSizes.length && saved.every(value => typeof value === 'number' && Number.isFinite(value))) initialSizes = saved;
          } catch { /* Storage can be unavailable in a sandboxed iframe. */ }
        }
      }
      if (!machine) {
        machine = createMachine();
        const rootAttrs = splitter.connect(machine.service, normalizeProps).getRootProps();
        if (typeof rootAttrs.id === 'string') element.id = rootAttrs.id;
        unsubscribe = machine.subscribe(update);
        machine.start();
      } else machine.updateProps({});
      render();
    },
    dispose() { unsubscribe?.(); machine?.stop(); bindings.dispose(); },
  };
}

function hoverCard(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  const id = uniqueId();
  const view = element.ownerDocument.defaultView!;
  const bindings = partBindings(id);
  let inputs: Props = {};
  let contentInputs: Props = {};
  let trigger: HTMLElement | null = null;
  let content: HTMLElement | null = null;
  let unsubscribe: (() => void) | undefined;
  let wasOpen: boolean | undefined;
  let closeVisible = false;
  let transition: number | undefined;
  const positioning = (): hover.PositioningOptions => {
    const side = ['top', 'right', 'bottom', 'left'].includes(String(contentInputs.side)) ? contentInputs.side : 'bottom';
    const align = contentInputs.align === 'start' || contentInputs.align === 'end' ? '-' + contentInputs.align : '';
    const gutter = number(contentInputs.sideOffset) ?? 4;
    return {
      placement: (side + align) as hover.Placement,
      gutter,
      offset: { mainAxis: gutter, crossAxis: number(contentInputs.alignOffset) },
      flip: contentInputs.avoidCollisions !== false,
      slide: contentInputs.avoidCollisions !== false,
      overflowPadding: number(contentInputs.collisionPadding) ?? 0,
      hideWhenDetached: contentInputs.hideWhenDetached === true,
    };
  };
  const createMachine = () => new VanillaMachine(hover.machine, () => ({
    id,
    getRootNode: () => rootNode(element),
    disabled: inputs.disabled === true,
    dir: direction(element, inputs),
    open: typeof inputs.open === 'boolean' ? inputs.open : undefined,
    openDelay: number(inputs.openDelay) ?? 700,
    closeDelay: number(inputs.closeDelay) ?? 300,
    positioning: positioning(),
    ids: { trigger: string(trigger && readInputs(trigger).id), content: string(contentInputs.id) },
    onOpenChange: ({ open }) => send('openChange', { value: open }),
  } as const satisfies hover.Props));
  let machine: ReturnType<typeof createMachine> | undefined;
  const render = () => {
    const attrs = new Map<HTMLElement, Attrs>();
    if (!machine) return;
    const api = hover.connect(machine.service, normalizeProps);
    if (wasOpen !== undefined && wasOpen !== api.open) {
      view.clearTimeout(transition);
      const delay = view.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 100;
      closeVisible = !api.open && delay > 0;
      const value = api.open;
      transition = view.setTimeout(() => {
        closeVisible = false;
        render();
        send('openChangeComplete', { value });
      }, delay);
    }
    wasOpen = api.open;
    if (trigger) attrs.set(trigger, { ...api.getTriggerProps(),
      'aria-haspopup': 'dialog', 'aria-expanded': api.open,
      tabindex: !trigger.hasAttribute('href') ? 0 : readInputs(trigger).tabindex,
    });
    if (content) {
      const forceMount = contentInputs.forceMount === true;
      if (content.parentElement?.classList.contains('vs-hover-positioner')) {
        attrs.set(content.parentElement, { ...api.getPositionerProps(), hidden: !api.open && !closeVisible && !forceMount });
      }
      attrs.set(content, { ...api.getContentProps(), hidden: !api.open && !closeVisible && !forceMount, inert: !api.open, 'aria-hidden': !api.open || undefined });
    }
    bindings.apply(attrs);
  };
  const update = onMachineUpdate(signal, render);
  let positionSignature: string | undefined;
  return {
    sync(next) {
      inputs = next;
      trigger = part(element, 'HoverCard.Trigger');
      content = part(element, 'HoverCard.Content');
      contentInputs = content ? readInputs(content) : {};
      const positionKey = JSON.stringify(positioning());
      if (!machine) {
        machine = createMachine();
        unsubscribe = machine.subscribe(update);
        machine.start();
      } else {
        machine.updateProps({});
        if (positionKey !== positionSignature && hover.connect(machine.service, normalizeProps).open) {
          hover.connect(machine.service, normalizeProps).reposition(positioning());
        }
      }
      positionSignature = positionKey;
      render();
    },
    dispose() { view.clearTimeout(transition); unsubscribe?.(); machine?.stop(); bindings.dispose(); },
  };
}

function navigationMenu(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  const doc = element.ownerDocument;
  const view = doc.defaultView!;
  const id = uniqueId();
  const bindings = partBindings(id);
  const generatedViewport = doc.createElement('div');
  generatedViewport.className = 'vs-navigation-viewport';
  const proxies = new Map<HTMLElement, HTMLElement>();
  let inputs: Props = {};
  let unsubscribe: (() => void) | undefined;
  let lastOpenTime = -Infinity;
  let previousValue: string | null = null;
  let closingValue: string | null = null;
  let transition: number | undefined;
  let indicatorExit: number | undefined;
  const createMachine = () => new VanillaMachine(navigation.machine, () => ({
    id,
    getRootNode: () => rootNode(element),
    dir: direction(element, inputs),
    orientation: orientation(inputs.orientation),
    value: string(inputs.value),
    openDelay: view.performance.now() - lastOpenTime < (number(inputs.skipDelayDuration) ?? 300) ? 0 : number(inputs.delayDuration) ?? 200,
    onValueChange: ({ value }) => send('valueChange', { value }),
  } as const satisfies navigation.Props));
  let machine: ReturnType<typeof createMachine> | undefined;
  const ownParts = <T extends HTMLElement = HTMLElement>(name: string) => Array.from(element.querySelectorAll<T>(`[data-vs-component="NavigationMenu.${name}"]`))
    .filter(child => owner(child, 'NavigationMenu.Root') === element);
  const render = () => {
    if (!machine) return;
    const api = navigation.connect(machine.service, normalizeProps);
    if (api.value !== previousValue) {
      view.clearTimeout(transition);
      view.clearTimeout(indicatorExit);
      indicatorExit = undefined;
      closingValue = null;
      if (!api.open && previousValue) {
        lastOpenTime = view.performance.now();
        if (!view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          closingValue = previousValue;
          transition = view.setTimeout(() => { closingValue = null; render(); }, inputs.viewport === false ? 300 : 100);
          indicatorExit = view.setTimeout(() => { indicatorExit = undefined; render(); }, 150);
        }
      }
      previousValue = api.value;
    }
    const attrs = new Map<HTMLElement, Attrs>();
    const rootAttrs = api.getRootProps();
    attrs.set(element, { ...rootAttrs, 'aria-label': string(inputs['aria-label']), 'data-vs-viewport': String(inputs.viewport !== false) });
    const list = ownParts('List')[0];
    if (list) {
      const listAttrs = api.getListProps();
      attrs.set(list, { ...listAttrs, id: string(readInputs(list).id) ?? listAttrs.id, style: undefined });
    }
    const viewport = ownParts('Viewport')[0] ?? (inputs.viewport === false ? undefined : generatedViewport);
    if (viewport === generatedViewport && !generatedViewport.isConnected) element.append(generatedViewport);
    else if (viewport !== generatedViewport) generatedViewport.remove();
    if (viewport) {
      const viewportAttrs = api.getViewportProps({ align: 'start' });
      attrs.set(viewport, { ...viewportAttrs, hidden: !api.open && readInputs(viewport).forceMount !== true });
    }
    for (const indicator of ownParts('Indicator')) {
      attrs.set(indicator, { ...api.getIndicatorProps(),
        hidden: !api.open && indicatorExit === undefined && readInputs(indicator).forceMount !== true,
        'data-vs-closing': indicatorExit !== undefined || undefined });
    }
    const items = ownParts('Item');
    for (const [index, item] of items.entries()) {
      const itemInputs = readInputs(item);
      const value = string(itemInputs.value) ?? `item-${index}`;
      const trigger = part<HTMLButtonElement>(item, 'NavigationMenu.Trigger');
      const content = part(item, 'NavigationMenu.Content');
      const itemProps = { value, disabled: trigger ? readInputs(trigger).disabled === true : false };
      const itemAttrs = api.getItemProps(itemProps);
      attrs.set(item, { ...itemAttrs, 'data-vs-open': api.value === value });
      if (trigger) {
        const triggerAttrs = api.getTriggerProps(itemProps);
        attrs.set(trigger, {
          ...triggerAttrs,
          ...(itemInputs.openOnHover === false && { onpointerenter: undefined, onpointerleave: undefined }),
        });
        let proxy = proxies.get(item);
        if (!proxy) {
          proxy = doc.createElement('span');
          proxies.set(item, proxy);
          item.append(proxy);
        }
        attrs.set(proxy, api.getTriggerProxyProps(itemProps));
      }
      if (content) {
        const contentAttrs = api.getContentProps({ value });
        const selected = api.value === value;
        const closing = closingValue === value;
        attrs.set(content, { ...contentAttrs, hidden: !selected && !closing && readInputs(content).forceMount !== true, inert: !selected, 'data-state': selected ? 'open' : 'closed', 'data-vs-closing': closing || undefined });
      }
      for (const link of Array.from(item.querySelectorAll<HTMLElement>('.vs-navigation-link')).filter(link => owner(link, 'NavigationMenu.Item') === item)) {
        attrs.set(link, api.getLinkProps({ value, current: readInputs(link).active === true, onSelect: () => emitFrom(link, 'select', { type: 'bitsLinkSelect' }) }));
      }
    }
    for (const [item, proxy] of proxies) {
      if (!items.includes(item) || !part(item, 'NavigationMenu.Trigger')) {
        proxy.remove();
        proxies.delete(item);
      }
    }
    bindings.apply(attrs);
  };
  const update = onMachineUpdate(signal, render);
  return {
    sync(next) {
      inputs = next;
      if (!machine) {
        machine = createMachine();
        unsubscribe = machine.subscribe(update);
        machine.start();
      } else machine.updateProps({});
      render();
    },
    dispose() { view.clearTimeout(transition); view.clearTimeout(indicatorExit); unsubscribe?.(); machine?.stop(); bindings.dispose(); },
  };
}

export function widgetBehavior(name: string, element: HTMLElement, send: Send, signal: AbortSignal): Behavior | undefined {
  if (name === 'Carousel.Root') return carousel(element, signal);
  if (name === 'Resizable.PaneGroup') return resizable(element, send, signal);
  if (name === 'InputOtp.Root') return inputOtp(element, send, signal);
  if (name === 'InputOtp.Slot') return inputOtpCell(element);
  if (name === 'HoverCard.Root') return hoverCard(element, send, signal);
  if (name === 'NavigationMenu.Root') return navigationMenu(element, send, signal);
}
