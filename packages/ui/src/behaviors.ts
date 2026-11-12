import { scaleBand, scaleLinear, scalePoint } from 'd3-scale';
import type { NodeSnapshot } from '@viewstem/core';
import { registerControllers, type Controller } from './basecoat-controllers.js';
import { emitFrom, readInputs } from './component-context.js';

type Widget = HTMLElement & { _destroy?: () => void; refresh?: () => void; select?: (target: HTMLElement, focus?: boolean) => void; close?: (focus: boolean) => void };
type Props = NodeSnapshot['inputs'];
export type Send = (event: string, payload: unknown) => void;
export type Behavior = { sync(inputs: Props): void; dispose?(): void };
const instances = new WeakMap<Document, Map<string, Controller>>();
const modalRoot = '[data-vs-part="dialog-root"]';
let sequence = 0;
export const uniqueId = () => `viewstem-ui-${++sequence}`;

function controller(element: HTMLElement, name: string) {
  const document = element.ownerDocument;
  const realm = document.defaultView!;
  let registry = instances.get(document);
  if (!registry) {
    const next = new Map<string, Controller>();
    registerControllers({
      basecoat: { register(id, options, init) {
        next.set(id, typeof options === 'string' ? { init: init! } : options);
      } },
      get innerWidth() { return realm.innerWidth; },
      setTimeout: realm.setTimeout.bind(realm),
      clearTimeout: realm.clearTimeout.bind(realm),
      matchMedia: realm.matchMedia.bind(realm),
    }, document, realm.CustomEvent, realm.getComputedStyle.bind(realm));
    registry = next;
    instances.set(document, registry);
  }
  return registry.get(name)!;
}

function manage(element: Widget, name: string) {
  let anchors: (Element | null)[] | undefined;
  function dispose() {
    element._destroy?.();
    delete element._destroy;
    element.removeAttribute(`data-${name}-initialized`);
    anchors = undefined;
  }
  return {
    init(next: (Element | null)[]) {
      if (next.some(node => !node)) { dispose(); return false; }
      if (anchors?.length === next.length && next.every((node, index) => node === anchors?.[index])) return true;
      dispose();
      controller(element, name).init(element);
      if (!element.hasAttribute(`data-${name}-initialized`)) return false;
      anchors = next;
      return true;
    },
    dispose,
  };
}

const within = <T extends HTMLElement>(element: HTMLElement, part: string): T | null =>
  element.querySelector<T>(`:scope > [data-vs-part="${part}"]`);
const selection = (value: unknown): string[] => typeof value === 'string' ? [value] : Array.isArray(value) ? value.map(String) : [];
const string = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;

function afterMotion(elements: readonly Element[], done: () => void) {
  const animations = elements.flatMap(element => element.getAnimations());
  void Promise.allSettled(animations.map(animation => animation.finished)).then(done);
}

export function tooltip(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  let inputs: Props = {};
  let timer: number | undefined;
  let open = false;
  let delayedRequest = false;
  let transition = 0;
  const view = element.ownerDocument.defaultView!;
  const position = () => {
    const content = element.querySelector<HTMLElement>('[role="tooltip"]');
    if (!content) return;
    const root = element.getBoundingClientRect();
    const box = content.getBoundingClientRect();
    const viewport = element.ownerDocument.defaultView!;
    const left = Math.max(0, Math.min(root.left + (root.width - box.width) / 2, viewport.innerWidth - box.width));
    content.style.left = `${left - root.left}px`;
    const above = root.top >= box.height + 10;
    content.dataset.side = above ? 'top' : 'bottom';
    content.style.top = `${above ? -box.height - 10 : root.height + 10}px`;
    content.style.setProperty('--vs-tooltip-arrow', `${root.left + root.width / 2 - left}px`);
  };
  const provider = () => element.closest<HTMLElement>('[data-vs-component="Tooltip.Provider"]');
  const disabled = () => inputs.disabled === true || readInputs(provider()).disabled === true;
  function setOpen(value: boolean, delayed = false) {
    if (open === value) return;
    open = value;
    if (value) position();
    element.toggleAttribute('data-tooltip-delayed', value && delayed);
    element.toggleAttribute('data-tooltip-open', value);
    const content = element.querySelector('[role="tooltip"]');
    const current = ++transition;
    afterMotion(content ? [content] : [], () => {
      if (!signal.aborted && current === transition) send('openChangeComplete', { value });
    });
  }
  function request(value: boolean, delayed = false) {
    if (value === open || disabled()) return;
    delayedRequest = delayed;
    send('openChange', { value });
    if (typeof inputs.open !== 'boolean') setOpen(value, delayed);
  }
  const hide = () => { view.clearTimeout(timer); request(false); };
  const show = (delayed: boolean) => {
    view.clearTimeout(timer);
    if (disabled()) return;
    const delay = typeof inputs.delayDuration === 'number' ? inputs.delayDuration : Number(readInputs(provider()).delayDuration ?? 700);
    timer = view.setTimeout(() => request(true, delayed), delayed ? Math.max(0, delay) : 0);
  };
  element.addEventListener('pointerenter', () => show(true), { signal });
  element.addEventListener('pointerleave', hide, { signal });
  element.addEventListener('focusin', () => show(false), { signal });
  element.addEventListener('focusout', hide, { signal });
  element.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); }, { signal });
  element.ownerDocument.defaultView!.addEventListener('resize', position, { signal });
  element.ownerDocument.addEventListener('scroll', position, { signal, capture: true });
  return {
    sync(next) {
      inputs = next;
      if (disabled()) {
        view.clearTimeout(timer);
        delayedRequest = false;
        setOpen(false);
      } else if (typeof next.open === 'boolean' && next.open !== open) {
        view.clearTimeout(timer);
        setOpen(next.open, delayedRequest);
        delayedRequest = false;
      }
    },
    dispose() { view.clearTimeout(timer); },
  };
}

export function modal(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  let inputs: Props = {};
  let dialog: HTMLDialogElement | null = null;
  let requested = false;
  const drawer = element.dataset.vsComponent?.startsWith('Drawer.');
  const alert = element.dataset.vsComponent === 'AlertDialog.Root';
  const sheet = element.dataset.vsComponent === 'Sheet.Root';
  const view = element.ownerDocument.defaultView!;
  const closingAttribute = drawer ? 'data-closing' : 'data-vs-closing';
  const drawerAnimations = new Set<number>();
  let visible = false;
  let transition = 0;
  let trigger: HTMLElement | null = null;
  const syncOpen = (open: boolean) => {
    if (!dialog) return;
    trigger?.setAttribute('aria-expanded', String(open));
    if (visible === open) return;
    visible = open;
    const target = dialog;
    const panel = target.firstElementChild as HTMLElement;
    const current = ++transition;
    target.toggleAttribute(closingAttribute, !open);
    if (open) {
      if (drawer && panel) {
        // Vaul does not autofocus a control by default. Start on the panel so
        // the first Tab still reaches the first control inside the drawer.
        panel.tabIndex = -1;
        panel.autofocus = true;
      }
      if (!target.matches(':modal')) {
        if (target.open) target.close();
        target.showModal();
      }
      if (alert && panel) {
        panel.tabIndex = -1;
        panel.focus({ preventScroll: true });
      }
    }
    afterMotion(panel ? [target, panel] : [target], () => {
      if (signal.aborted || current !== transition) return;
      if (!open) {
        target.close();
        target.removeAttribute(closingAttribute);
      }
      send('openChangeComplete', { value: open });
    });
  };
  function request(open: boolean) {
    if (!dialog || visible === open || (drawer && !open && inputs.dismissible === false)) return;
    requested = open;
    if (drawer && !open) send('close', { value: null });
    send('openChange', { value: open });
    if (drawer) {
      // Vaul's animationEnd reports every accepted request, even if another
      // request replaces the presence transition before the 500 ms expires.
      const animationEnd = () => { if (!signal.aborted) send('animationEnd', { value: open }); };
      if (view.matchMedia('(prefers-reduced-motion: reduce)').matches) queueMicrotask(animationEnd);
      else {
        const timer = view.setTimeout(() => {
          drawerAnimations.delete(timer);
          animationEnd();
        }, 500);
        drawerAnimations.add(timer);
      }
    }
    if (inputs.open === undefined) syncOpen(open);
  }
  element.addEventListener('click', event => {
    const button = (event.target as Element).closest('[data-vs-modal-action]');
    if (button?.closest(modalRoot) === element) request(button.getAttribute('data-vs-modal-action') === 'open');
  }, { signal });
  if (!alert) {
    let backdrop = false;
    element.addEventListener('pointerdown', event => { backdrop = event.target === dialog; }, { signal });
    element.addEventListener('pointerup', event => {
      if (backdrop && event.target === dialog && (!sheet || !dialog || readInputs(dialog).interactOutsideBehavior !== 'ignore')) request(false);
      backdrop = false;
    }, { signal });
  }
  if (drawer) {
    element.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented || !dialog?.open ||
          (event.target as Element).closest('dialog') !== dialog) return;
      event.preventDefault();
      request(false);
    }, { signal });
    let gesture: { pointer: number; start: number; panel: HTMLDialogElement; handle: HTMLElement } | undefined;
    element.addEventListener('pointerdown', event => {
      const handle = (event.target as Element).closest<HTMLElement>('.vs-drawer-handle');
      if (!dialog || !event.isPrimary || event.button !== 0 || handle?.closest('dialog') !== dialog) return;
      handle.setPointerCapture(event.pointerId);
      gesture = { pointer: event.pointerId, start: event.clientY, panel: dialog, handle };
      dialog.style.setProperty('--vs-drawer-drag', '0px');
      dialog.dataset.vsDragging = '';
    }, { signal });
    element.addEventListener('pointermove', event => {
      if (gesture?.pointer === event.pointerId) {
        gesture.panel.style.setProperty('--vs-drawer-drag', `${Math.max(0, event.clientY - gesture.start)}px`);
      }
    }, { signal });
    const end = (event: PointerEvent) => {
      if (gesture?.pointer !== event.pointerId) return;
      const { start, panel, handle } = gesture;
      gesture = undefined;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      delete panel.dataset.vsDragging;
      panel.style.removeProperty('--vs-drawer-drag');
      const height = panel.firstElementChild?.getBoundingClientRect().height ?? 0;
      if (event.type === 'pointerup' && panel === dialog && height && event.clientY - start >= height * .25) request(false);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) element.addEventListener(type, end, { signal });
  }
  element.addEventListener('cancel', event => {
    if (event.target !== dialog) return;
    event.preventDefault();
    if (!sheet || !dialog || readInputs(dialog).escapeKeydownBehavior !== 'ignore') request(false);
  }, { signal, capture: true });
  return {
    sync(next) {
      inputs = next;
      const content = within<HTMLDialogElement>(element, 'dialog-content');
      if (content !== dialog) {
        transition++;
        if (dialog?.open) dialog.close();
        dialog = content;
        visible = false;
      }
      if (!dialog) return;
      const action = element.querySelector<HTMLElement>(':scope > [data-vs-modal-action="open"]');
      trigger = action?.matches('button') ? action : action?.querySelector('button') ?? null;
      dialog.id ||= uniqueId();
      trigger?.setAttribute('aria-haspopup', 'dialog');
      trigger?.setAttribute('aria-controls', dialog.id);
      for (const [part, attribute] of [['title', 'aria-labelledby'], ['description', 'aria-describedby']]) {
        const label = dialog.querySelector<HTMLElement>(`[data-vs-part="dialog-${part}"]`);
        if (label) {
          label.id ||= uniqueId();
          dialog.setAttribute(attribute!, label.id);
        } else dialog.removeAttribute(attribute!);
      }
      requested = typeof next.open === 'boolean' ? next.open : requested;
      syncOpen(requested);
    },
    dispose() {
      transition++;
      for (const timer of drawerAnimations) view.clearTimeout(timer);
      if (dialog?.open) dialog.close();
    },
  };
}

export function disclosure(element: HTMLElement, name: string, send: Send, signal: AbortSignal): Behavior {
  if (name === 'Collapsible.Root') {
    const details = element as HTMLDetailsElement;
    let initialized = false;
    let rendered = details.open;
    let externalOpen: boolean | undefined;
    details.addEventListener('toggle', () => {
      if (rendered === details.open) return;
      rendered = details.open;
      send('openChange', { value: rendered });
      send('openChangeComplete', { value: rendered });
    }, { signal });
    return { sync(inputs) {
      const next = typeof inputs.open === 'boolean' ? inputs.open : undefined;
      if (next !== externalOpen && next !== undefined && next !== rendered) {
        rendered = details.open = next;
        if (initialized) send('openChangeComplete', { value: rendered });
      }
      externalOpen = next;
      initialized = true;
    } };
  }
  const control = manage(element, 'accordion');
  let previous = '';
  let multiple = false;
  const read = () => Array.from(element.querySelectorAll<HTMLDetailsElement>(':scope > details[open]')).map(item => item.dataset.value ?? '');
  element.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const triggers = Array.from(element.querySelectorAll<HTMLElement>(':scope > details > summary'))
      .filter(trigger => !trigger.matches('[disabled], [aria-disabled="true"], details[aria-disabled="true"] > summary'));
    const index = triggers.indexOf(event.target as HTMLElement);
    if (index < 0 || triggers.length === 0) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? triggers.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + triggers.length) % triggers.length;
    event.preventDefault();
    triggers[next]?.focus();
  }, { signal });
  element.addEventListener('toggle', event => {
    const item = event.target as HTMLDetailsElement;
    if (item.parentElement !== element) return;
    queueMicrotask(() => {
      if (signal.aborted) return;
      // The new item can notify before Basecoat's listener closes its sibling.
      const values = !multiple && item.open ? [item.dataset.value ?? ''] : read();
      if (JSON.stringify(values) === previous) return;
      previous = JSON.stringify(values);
      send('valueChange', { value: multiple ? values : values[0] ?? '' });
    });
  }, { signal, capture: true });
  return {
    sync(inputs) {
      multiple = inputs.type === 'multiple';
      element.toggleAttribute('data-multiple', multiple);
      if (inputs.value !== undefined) {
        const values = selection(inputs.value);
        for (const item of element.querySelectorAll<HTMLDetailsElement>(':scope > details')) item.open = values.includes(item.dataset.value ?? '');
      }
      control.init([element]);
      previous = JSON.stringify(read());
    },
    dispose: control.dispose,
  };
}

export function tabs(element: Widget, send: Send, signal: AbortSignal): Behavior {
  const control = manage(element, 'tabs');
  let selected: string | undefined;
  const panelIds = new Map<string, string>();
  function updateSelection() {
    const tab = element.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const value = tab?.dataset.value;
    if (value !== undefined && selected !== value) {
      selected = value;
      send('valueChange', { value });
    }
  }
  element.addEventListener('click', updateSelection, { signal });
  element.addEventListener('keydown', updateSelection, { signal });
  return {
    sync(inputs) {
      const list = element.querySelector<HTMLElement>(':scope > [role="tablist"]');
      const tabs = Array.from(list?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
      const panels = Array.from(element.querySelectorAll<HTMLElement>(':scope > [role="tabpanel"]'));
      if (!list || !tabs.length) return;
      list.setAttribute('aria-orientation', string(inputs.orientation, 'horizontal'));
      for (const panel of panels) {
        const value = panel.dataset.value ?? '';
        panel.id ||= panelIds.get(value) ?? uniqueId();
        panelIds.set(value, panel.id);
      }
      for (const tab of tabs) {
        const panel = panels.find(item => item.dataset.value === tab.dataset.value);
        tab.id ||= uniqueId();
        if (panel) {
          tab.setAttribute('aria-controls', panel.id);
          panel.setAttribute('aria-labelledby', tab.id);
        }
        tab.setAttribute('aria-selected', String(tab.dataset.value === (inputs.value ?? selected)));
      }
      if (control.init([list])) {
        element.refresh?.();
        selected = element.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.dataset.value;
      }
    },
    dispose: control.dispose,
  };
}

const openPopovers = new WeakMap<Document, HTMLElement[]>();

function centerPopup(root: HTMLElement, trigger: HTMLElement, panel: HTMLElement) {
  const anchor = trigger.getBoundingClientRect();
  const viewportWidth = root.ownerDocument.defaultView!.innerWidth;
  const left = Math.max(0, Math.min(anchor.left + (anchor.width - panel.offsetWidth) / 2, viewportWidth - panel.offsetWidth));
  panel.style.left = `${left - root.getBoundingClientRect().left}px`;
}

export function popover(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  const doc = element.ownerDocument;
  const view = doc.defaultView!;
  let stack = openPopovers.get(doc);
  if (!stack) openPopovers.set(doc, stack = []);
  const layers = stack;
  let inputs: Props = {};
  let trigger: HTMLElement | undefined;
  let panel: HTMLElement | undefined;
  let triggerEvents: AbortController | undefined;
  let open = false;
  let pendingRequest: boolean | undefined;
  let transition = 0;

  function position() {
    if (open && trigger && panel) centerPopup(element, trigger, panel);
  }

  function forgetLayer() {
    const index = layers.indexOf(element);
    if (index !== -1) layers.splice(index, 1);
  }

  function setOpen(value: boolean) {
    if (value === open || !trigger || !panel) return;
    const anchor = trigger;
    const content = panel;
    open = value;
    forgetLayer();
    if (value) layers.push(element);
    anchor.setAttribute('aria-expanded', String(value));
    content.setAttribute('aria-hidden', String(!value));
    if (value) {
      doc.dispatchEvent(new view.CustomEvent('basecoat:popover', { detail: { source: element } }));
      position();
      content.tabIndex = -1;
      const focusable = Array.from(content.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]'))
        .find(item => item.tabIndex >= 0 && !item.matches(':disabled,[aria-disabled="true"]') &&
          item.getClientRects().length > 0 && view.getComputedStyle(item).visibility === 'visible');
      (focusable ?? content).focus({ preventScroll: true });
    }
    const restoreFocus = () => {
      if (!value && (doc.activeElement === doc.body || content.contains(doc.activeElement))) anchor.focus({ preventScroll: true });
    };
    restoreFocus();
    const current = ++transition;
    afterMotion([content], () => {
      if (signal.aborted || current !== transition) return;
      restoreFocus();
      send('openChangeComplete', { value });
    });
  }

  function request(value: boolean) {
    if (!panel || value === open || pendingRequest === value) return;
    pendingRequest = value;
    queueMicrotask(() => { pendingRequest = undefined; });
    send('openChange', { value });
    if (typeof inputs.open !== 'boolean') setOpen(value);
  }

  element.addEventListener('click', event => {
    const close = (event.target as Element).closest('[data-vs-component="Popover.Close"]');
    if (close?.closest('.popover') === element && !event.defaultPrevented) request(false);
  }, { signal });
  doc.addEventListener('click', event => {
    if (!event.composedPath().includes(element)) request(false);
  }, { signal });
  doc.addEventListener('basecoat:popover', event => {
    const source = (event as CustomEvent<{ source: HTMLElement }>).detail?.source;
    if (source && !element.contains(source)) request(false);
  }, { signal });
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || layers.at(-1) !== element) return;
    const modal = event.composedPath().find(target => target instanceof view.HTMLDialogElement && target.matches(':modal'));
    if (modal instanceof view.HTMLDialogElement && !modal.contains(element)) return;
    event.preventDefault();
    request(false);
  }, { signal });
  view.addEventListener('resize', position, { signal });
  doc.addEventListener('scroll', position, { signal, capture: true });

  function unbind() {
    triggerEvents?.abort();
    trigger?.removeAttribute('aria-controls');
    trigger?.setAttribute('aria-expanded', 'false');
    panel?.setAttribute('aria-hidden', 'true');
    trigger = panel = undefined;
    open = false;
    transition++;
    forgetLayer();
  }

  return {
    sync(next) {
      const controlledChange = next.open !== inputs.open;
      inputs = next;
      const anchor = element.querySelector<HTMLElement>(':scope > [data-vs-component="Popover.Trigger"].vs-ui-transparent > *, :scope > button[data-vs-component="Popover.Trigger"]') ?? undefined;
      const content = element.querySelector<HTMLElement>(':scope > [data-popover]') ?? undefined;
      if (anchor === trigger && content === panel) {
        if (controlledChange && typeof next.open === 'boolean') setOpen(next.open);
        position();
        return;
      }
      unbind();
      if (!anchor || !content) return;
      trigger = anchor;
      panel = content;
      content.id ||= uniqueId();
      anchor.setAttribute('aria-controls', content.id);
      anchor.setAttribute('aria-haspopup', 'dialog');
      anchor.setAttribute('aria-expanded', 'false');
      content.setAttribute('aria-hidden', 'true');
      triggerEvents = new AbortController();
      anchor.addEventListener('click', event => {
        if (!event.defaultPrevented) request(!open);
      }, { signal: triggerEvents.signal });
      if (next.open === true) setOpen(true);
    },
    dispose: unbind,
  };
}

function observeSelect(trigger: HTMLElement, panel: HTMLElement, signal: AbortSignal, send: Send) {
  let open = trigger.getAttribute('aria-expanded') === 'true';
  let highlighted: HTMLElement | null = null;
  let transition = 0;
  const observer = new trigger.ownerDocument.defaultView!.MutationObserver(() => {
    const next = trigger.getAttribute('aria-expanded') === 'true';
    const changed = next !== open;
    if (changed) {
      open = next;
      send('openChange', { value: next });
    }
    const active = next ? panel.querySelector<HTMLElement>('[role="option"].active') : null;
    if (active !== highlighted) {
      if (highlighted) emitFrom(highlighted, 'unhighlight', { value: null });
      if (active) emitFrom(active, 'highlight', { value: null });
      highlighted = active;
    }
    if (changed) {
      const current = ++transition;
      const animations = panel.getAnimations().filter(animation => 'animationName' in animation);
      void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
        if (!signal.aborted && current === transition) send('openChangeComplete', { value: next });
      });
    }
  });
  observer.observe(trigger, { attributes: true, attributeFilter: ['aria-expanded'] });
  observer.observe(panel, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });
}

export function select(element: Widget, send: Send, signal: AbortSignal): Behavior {
  const control = manage(element, 'select');
  const doc = element.ownerDocument;
  const hidden = doc.createElement('input');
  hidden.type = 'hidden';
  element.append(hidden);
  let trigger: HTMLButtonElement | null = null;
  let observedPanel: HTMLElement | null = null;
  let triggerEvents: AbortController | undefined;
  let valueSignature: string | undefined;
  let itemsSignature: string | undefined;
  let previousList: HTMLElement | undefined;
  const view = doc.defaultView!;
  const position = () => {
    if (trigger && observedPanel && trigger.getAttribute('aria-expanded') === 'true') centerPopup(element, trigger, observedPanel);
  };
  const schedulePosition = () => view.requestAnimationFrame(position);
  element.addEventListener('click', schedulePosition, { signal });
  element.addEventListener('keydown', schedulePosition, { signal });
  view.addEventListener('resize', position, { signal });
  doc.addEventListener('scroll', position, { signal, capture: true });
  element.addEventListener('change', event => {
    if (event.target === element) {
      const detail = (event as CustomEvent).detail;
      if (detail) send('valueChange', { value: detail.value });
    }
  }, { signal });
  return {
    sync(inputs) {
      const next = element.querySelector<HTMLButtonElement>(':scope > button');
      const panel = element.querySelector<HTMLElement>(':scope > [data-popover]');
      const list = panel?.querySelector<HTMLElement>('[role="listbox"]');
      hidden.name = string(inputs.name);
      hidden.disabled = inputs.disabled === true;
      if (!next || !panel || !list) {
        triggerEvents?.abort();
        trigger = observedPanel = null;
        control.dispose();
        return;
      }
      if (next !== trigger || panel !== observedPanel) {
        triggerEvents?.abort();
        trigger = next;
        observedPanel = panel;
        triggerEvents = new AbortController();
        observeSelect(next, panel, triggerEvents.signal, send);
      }
      next.disabled = inputs.disabled === true || readInputs(next).disabled === true;
      if (next.disabled) element.close?.(false);
      panel.inert = next.disabled || readInputs(panel).inert === true;
      const selectedLabel = next.querySelector<HTMLElement>('[data-vs-component="Select.Value"]');
      const placeholder = selectedLabel && readInputs(selectedLabel).placeholder;
      if (typeof placeholder === 'string') element.dataset.placeholder = placeholder;
      else delete element.dataset.placeholder;
      list.id ||= uniqueId();
      next.setAttribute('aria-controls', list.id);
      list.setAttribute('aria-multiselectable', String(inputs.type === 'multiple'));
      const explicit = new Set(Array.from(list.querySelectorAll<HTMLElement>('[role="option"]:not([data-vs-generated])'), item => item.dataset.value));
      const items = JSON.stringify([inputs.items, [...explicit]]);
      if (itemsSignature !== items || previousList !== list) {
        list.querySelectorAll('[data-vs-generated]').forEach(item => item.remove());
        for (const item of (inputs.items ?? []) as { value: string; label: string; disabled?: boolean }[]) {
          if (explicit.has(item.value)) continue;
          explicit.add(item.value);
          const option = doc.createElement('div');
          option.setAttribute('role', 'option');
          option.setAttribute('aria-disabled', String(item.disabled === true));
          option.dataset.value = item.value;
          option.dataset.label = item.label;
          option.dataset.vsGenerated = '';
          option.textContent = item.label;
          list.append(option);
        }
      }
      itemsSignature = items;
      previousList = list;
      for (const option of list.querySelectorAll<HTMLElement>('[role="option"]')) option.id ||= uniqueId();
      const value = inputs.value;
      const encoded = Array.isArray(value) ? JSON.stringify(value) : string(value);
      if (value !== undefined && encoded !== valueSignature) {
        hidden.value = encoded;
        for (const option of list.querySelectorAll('[role="option"]')) option.removeAttribute('aria-selected');
      }
      valueSignature = value !== undefined ? encoded : undefined;
      if (control.init([next, panel, list])) {
        element.refresh?.();
        schedulePosition();
      }
    },
    dispose() { triggerEvents?.abort(); control.dispose(); },
  };
}

export function combobox(element: Widget, send: Send, signal: AbortSignal): Behavior {
  const doc = element.ownerDocument;
  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = 'btn';
  trigger.dataset.variant = 'outline';
  trigger.setAttribute('aria-haspopup', 'listbox');
  const value = doc.createElement('span');
  value.dataset.value = '';
  trigger.append(value);
  const hidden = doc.createElement('input');
  hidden.type = 'hidden';
  const popup = doc.createElement('div');
  popup.dataset.popover = '';
  const search = doc.createElement('div');
  search.className = 'vs-combobox-search';
  const field = doc.createElement('input');
  field.setAttribute('role', 'combobox');
  const list = doc.createElement('div');
  list.setAttribute('role', 'listbox');
  list.id = uniqueId();
  const empty = doc.createElement('div');
  empty.className = 'vs-combobox-empty';
  empty.setAttribute('role', 'status');
  field.setAttribute('aria-controls', list.id);
  trigger.setAttribute('aria-controls', list.id);
  search.append(field);
  popup.append(search, list);
  element.dataset.autoHighlight = 'true';
  element.append(trigger, hidden, popup);
  const control = manage(element, 'combobox');
  element.addEventListener('keydown', event => {
    if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      (element as Widget & { close?: (focus?: boolean) => void }).close?.(false);
      trigger.focus();
    }
  }, { signal, capture: true });
  let optionsSignature = '';
  let previous: unknown;
  element.addEventListener('change', event => {
    if (event.target === element) send('valueChange', { value: (event as CustomEvent).detail?.value ?? '' });
  }, { signal });
  return {
    sync(inputs) {
      trigger.disabled = inputs.disabled === true;
      trigger.dataset.placeholder = string(inputs.placeholder, 'Select…');
      value.dataset.placeholder = trigger.dataset.placeholder;
      element.dataset.placeholder = trigger.dataset.placeholder;
      field.placeholder = string(inputs.searchPlaceholder, 'Search…');
      empty.textContent = string(inputs.emptyText, 'No options found.');
      field.setAttribute('aria-label', field.placeholder);
      const options = JSON.stringify(inputs.options);
      if (optionsSignature !== options) {
        optionsSignature = options;
        list.replaceChildren(empty);
        for (const item of inputs.options as readonly { value: string; label: string; disabled?: boolean }[] ?? []) {
          const option = doc.createElement('div');
          option.setAttribute('role', 'option');
          option.setAttribute('aria-disabled', String(item.disabled === true));
          option.dataset.value = item.value;
          option.dataset.label = item.label;
          option.textContent = item.label;
          list.append(option);
        }
      }
      if (inputs.value !== undefined && inputs.value !== previous) hidden.value = string(inputs.value);
      previous = inputs.value;
      if (control.init([trigger, popup, field, list])) element.refresh?.();
    },
    dispose: control.dispose,
  };
}

export function command(element: Widget, send: Send, signal: AbortSignal): Behavior {
  const control = manage(element, 'command');
  const view = element.ownerDocument.defaultView!;
  const boundary = '[data-vs-component="Command.Root"], [data-vs-component="Command.Dialog"]';
  const owner = element.closest(boundary);
  let menu: HTMLElement | null = null;
  let items: HTMLElement[] = [];
  let filters = '';
  let selected: string | undefined;
  let externalValue: unknown;
  let queued = false;
  const valueOf = (item: HTMLElement) => item.dataset.value ?? item.textContent?.trim() ?? '';
  const publish = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (signal.aborted || !menu) return;
      const active = items.find(item => item.classList.contains('active') && item.getAttribute('aria-hidden') !== 'true');
      const value = active ? valueOf(active) : '';
      if (value === selected) return;
      selected = value;
      send('valueChange', { value });
    });
  };
  const observer = new view.MutationObserver(publish);
  element.addEventListener('click', event => {
    const item = (event.target as Element).closest<HTMLElement>('[role="menuitem"]');
    if (item && items.includes(item) && item.getAttribute('aria-disabled') !== 'true') element.select?.(item);
  }, { signal });
  return {
    sync(inputs) {
      const input = element.querySelector('header input');
      const candidate = element.querySelector<HTMLElement>('[role="menu"]');
      // An explicit Command.Root inside a dialog owns its own controller.
      const nextMenu = input?.closest(boundary) === owner && candidate?.closest(boundary) === owner ? candidate : null;
      if (element !== owner) element.classList.toggle('command', nextMenu !== null);
      if (nextMenu !== menu) {
        observer.disconnect();
        menu = nextMenu;
        items = [];
        if (menu) observer.observe(menu, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-hidden'] });
      }
      if (!menu) { control.dispose(); return; }
      menu.toggleAttribute('data-empty', !!menu.querySelector('[data-vs-component="Command.Empty"]'));
      const nextItems = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      for (const item of nextItems) item.id ||= uniqueId();
      const signature = JSON.stringify(nextItems.map(item => [valueOf(item), item.textContent, item.dataset.keywords, item.getAttribute('aria-disabled')]));
      if (!control.init([input, menu])) return;
      if (filters !== signature || nextItems.some((item, index) => item !== items[index])) {
        element.refresh?.();
        filters = signature;
      }
      items = nextItems;
      if (externalValue !== inputs.value || selected === undefined) {
        externalValue = inputs.value;
        const item = items.find(item => valueOf(item) === inputs.value);
        if (item) element.select?.(item);
        if (selected === undefined && typeof inputs.value === 'string') selected = inputs.value;
      }
      publish();
    },
    dispose() { observer.disconnect(); control.dispose(); },
  };
}

export function commandDialog(dialog: HTMLDialogElement, host: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  const commands = command(host, send, signal);
  let requestedOpen: unknown;
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dialog.close();
    send('openChange', { value: false });
  }, { signal });
  return {
    sync(inputs) {
      if (requestedOpen !== inputs.open) {
        requestedOpen = inputs.open;
        if (inputs.open === true && !dialog.open) dialog.showModal();
        else if (inputs.open === false && dialog.open) dialog.close();
      }
      if (typeof inputs.title === 'string') dialog.setAttribute('aria-label', inputs.title);
      else if (inputs['aria-label'] === undefined) dialog.removeAttribute('aria-label');
      if (typeof inputs.description === 'string') dialog.setAttribute('aria-description', inputs.description);
      else dialog.removeAttribute('aria-description');
      commands.sync(inputs);
    },
    dispose() {
      if (dialog.open) dialog.close();
      commands.dispose?.();
    },
  };
}

export function range(element: HTMLInputElement, send: Send, signal: AbortSignal): Behavior {
  const control = manage(element, 'range');
  const read = () => ({ value: element.valueAsNumber });
  element.addEventListener('input', () => send('valueChange', read()), { signal });
  element.addEventListener('change', () => send('valueCommit', read()), { signal });
  return {
    sync(inputs) {
      const value = Array.isArray(inputs.value) ? inputs.value[0] : inputs.value;
      for (const key of ['min', 'max', 'step'] as const) {
        if (typeof inputs[key] === 'number') element[key] = String(inputs[key]);
        else element.removeAttribute(key);
      }
      if (typeof value === 'number') element.valueAsNumber = value;
      control.init([element]);
      const min = Number(element.min || 0);
      const max = Number(element.max || 100);
      element.style.setProperty('--slider-value', `${(element.valueAsNumber - min) / (max - min || 1) * 100}%`);
    },
    dispose: control.dispose,
  };
}

export function group(element: HTMLElement, name: string, send: Send, signal: AbortSignal): Behavior {
  let props: Props = {};
  const id = uniqueId();
  const radio = name === 'RadioGroup.Root';
  const pagination = name === 'Pagination.Root';
  const sidebar = name === 'Sidebar.Provider';
  const desktop = sidebar ? element.ownerDocument.defaultView?.matchMedia('(min-width: 48rem)') : undefined;
  const selector = radio ? 'input[type="radio"]' : pagination ? 'button[data-vs-page]' : '[data-vs-component="Sidebar.Root"]';
  const control = sidebar ? manageSidebar() : undefined;
  const sidebarTrigger = () => element.querySelector<HTMLElement>('[data-vs-component="Sidebar.Trigger"]');

  if (sidebar) desktop?.addEventListener('change', () => {
    const panel = element.querySelector<Widget & { open?: () => void; close?: () => void }>(selector);
    if (desktop.matches && props.open !== false) panel?.open?.();
    else panel?.close?.();
  }, { signal });
  if (sidebar) element.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || desktop?.matches) return;
    const panel = element.querySelector<Widget & { close?: () => void }>(selector);
    if (panel?.getAttribute('aria-hidden') !== 'false') return;
    event.preventDefault();
    panel.close?.();
    sidebarTrigger()?.focus();
  }, { signal });

  function manageSidebar() {
    let active: Widget | null = null;
    let controller: ReturnType<typeof manage> | undefined;
    const updateExpanded = () => {
      if (active) sidebarTrigger()?.setAttribute('aria-expanded', String(active.getAttribute('aria-hidden') !== 'true'));
    };
    const observer = new MutationObserver(updateExpanded);
    return {
      update(next: Widget | null) {
        if (next !== active) {
          controller?.dispose();
          observer.disconnect();
          active = next;
          controller = next ? manage(next, 'sidebar') : undefined;
          if (next) observer.observe(next, { attributes: true, attributeFilter: ['aria-hidden'] });
        }
        if (active) {
          controller?.init([active]);
          active.id ||= uniqueId();
          sidebarTrigger()?.setAttribute('aria-controls', active.id);
          updateExpanded();
        }
      },
      dispose() { observer.disconnect(); controller?.dispose(); },
    };
  }

  element.addEventListener(radio ? 'change' : 'click', event => {
    const target = event.target as HTMLElement;
    if (radio) {
      if (target.matches(selector) && target.closest('[data-vs-component="RadioGroup.Root"]') === element &&
          (target as HTMLInputElement).checked) send('valueChange', { value: (target as HTMLInputElement).value });
    } else if (pagination) {
      const page = target.closest<HTMLElement>(selector)?.dataset.vsPage;
      if (page) send('pageChange', { value: Number(page) });
    } else if (sidebar) {
      if (!target.closest('[data-vs-component="Sidebar.Trigger"], [data-vs-component="Sidebar.Rail"]')) return;
      const panel = element.querySelector<HTMLElement>(selector);
      if (!panel || readInputs(panel).collapsible === 'none') return;
      const value = panel.getAttribute('aria-hidden') === 'true';
      if (desktop?.matches !== true || props.open === undefined) {
        (panel as Widget & { toggle?: () => void }).toggle?.();
        if (!desktop?.matches && value) panel.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled]), a[href]')?.focus();
      }
      if (desktop?.matches) send('openChange', { value });
    }
  }, { signal });
  return {
    sync(inputs) {
      props = inputs;
      if (sidebar) {
        const panel = element.querySelector<Widget & { open?: () => void; close?: () => void }>(selector);
        const panelInputs = panel && readInputs(panel);
        if (panel && panelInputs?.collapsible === 'none') {
          control?.update(null);
          panel.setAttribute('aria-hidden', 'false');
          if (panelInputs.inert !== true) panel.removeAttribute('inert');
          return;
        }
        control?.update(panel);
        if (desktop?.matches && typeof inputs.open === 'boolean') (inputs.open ? panel?.open : panel?.close)?.();
        return;
      }
      if (pagination) {
        const page = Number(inputs.page ?? 1);
        const total = Math.max(1, Math.ceil(Number(inputs.count ?? 1) / Number(inputs.perPage ?? 1)));
        for (const button of element.querySelectorAll<HTMLButtonElement>('button[data-vs-page]')) {
          const part = button.dataset.vsComponent ?? '';
          if (part.includes('Next')) button.dataset.vsPage = String(page + 1);
          if (part.includes('Prev')) button.dataset.vsPage = String(page - 1);
          const target = Number(button.dataset.vsPage);
          button.disabled = target < 1 || target > total;
          if (target === page) button.setAttribute('aria-current', 'page');
          else button.removeAttribute('aria-current');
          if (part === 'Pagination.Link') button.dataset.variant = target === page ? 'outline' : 'ghost';
        }
        return;
      }
      const values = selection(inputs.value);
      for (const input of element.querySelectorAll<HTMLInputElement>(selector)) {
        if (input.closest('[data-vs-component="RadioGroup.Root"]') !== element) continue;
        const item = readInputs(input);
        input.name = string(inputs.name, id);
        input.disabled = inputs.disabled === true || item.disabled === true;
        input.required = inputs.required === true || item.required === true;
        if (inputs.value !== undefined) input.checked = values.includes(input.value);
      }
    },
    dispose() { control?.dispose(); },
  };
}

type Notification = { id: string; title: string; description?: string; kind?: string; duration?: number };
export function notifications(element: HTMLElement, send: Send): Behavior {
  const view = element.ownerDocument.defaultView!;
  const active = new Map<string, { element: HTMLElement; timer?: ReturnType<typeof setTimeout>; signature: string }>();
  const exiting = new Map<string, { element: HTMLElement; timer: number }>();
  const dismissed = new Set<string>();
  function finishExit(id: string) {
    const item = exiting.get(id);
    if (!item) return;
    view.clearTimeout(item.timer);
    item.element.remove();
    exiting.delete(id);
  }
  function remove(id: string, animate = false) {
    const item = active.get(id);
    if (!item) return;
    clearTimeout(item.timer);
    active.delete(id);
    if (!animate || view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      item.element.remove();
      return;
    }
    item.element.dataset.vsToastExit = '';
    item.element.inert = true;
    item.element.setAttribute('aria-hidden', 'true');
    exiting.set(id, { element: item.element, timer: view.setTimeout(() => finishExit(id), 400) });
  }
  function dismiss(id: string, reason: string) {
    remove(id, true);
    dismissed.add(id);
    send('dismiss', { value: { id, reason } });
  }
  return {
    sync(inputs) {
      const [edge, alignment] = string(inputs.position, 'bottom-right').split('-');
      element.dataset.edge = edge ?? 'bottom';
      element.dataset.align = alignment === 'left' ? 'start' : alignment === 'center' ? 'center' : 'end';
      const data = (inputs.notifications ?? []) as readonly Notification[];
      const ids = new Set(data.map(item => item.id));
      for (const id of dismissed) if (!ids.has(id)) dismissed.delete(id);
      for (const id of active.keys()) if (!ids.has(id)) remove(id, true);
      for (const item of data) {
        if (dismissed.has(item.id)) continue;
        const signature = JSON.stringify([item, inputs.closeButton, inputs.closeButtonAriaLabel]);
        if (active.get(item.id)?.signature === signature) continue;
        remove(item.id);
        finishExit(item.id);
        const doc = element.ownerDocument;
        const box = doc.createElement('div');
        box.className = 'toast';
        box.dataset.category = item.kind ?? 'default';
        const content = doc.createElement('div');
        content.className = 'toast-content';
        const section = doc.createElement('section');
        const heading = doc.createElement('h2');
        heading.textContent = item.title;
        section.append(heading);
        if (item.description) {
          const description = doc.createElement('p');
          description.textContent = item.description;
          section.append(description);
        }
        content.append(section);
        box.append(content);
        if (inputs.closeButton !== false) {
          const close = doc.createElement('button');
          close.className = 'btn';
          close.type = 'button';
          close.setAttribute('aria-label', typeof inputs.closeButtonAriaLabel === 'string' ? inputs.closeButtonAriaLabel : 'Close');
          close.textContent = '×';
          close.addEventListener('click', () => dismiss(item.id, 'dismissed'));
          close.dataset.toastCancel = '';
          const footer = doc.createElement('footer');
          footer.append(close);
          content.append(footer);
        }
        element.append(box);
        const timer = item.duration ? setTimeout(() => dismiss(item.id, 'expired'), item.duration) : undefined;
        active.set(item.id, { element: box, ...(timer !== undefined && { timer }), signature });
      }
    },
    dispose() {
      for (const id of active.keys()) remove(id);
      for (const id of exiting.keys()) finishExit(id);
    },
  };
}

export function chart(element: HTMLElement): Behavior {
  type Row = Readonly<Record<string, unknown>>;
  type Series = { id: string; key: string; label?: string; color?: string };
  type Category = string | number;
  const doc = element.ownerDocument;
  const view = doc.defaultView!;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('role', 'img');
  const tooltip = doc.createElement('div');
  tooltip.className = 'vs-chart-tooltip';
  tooltip.hidden = true;
  const highlights = doc.createElementNS(ns, 'g');
  const events = new AbortController();
  const { signal } = events;
  element.append(svg, tooltip);

  // Keep the chart recipe's outer aspect ratio while laying out the axes
  // in CSS pixels, including its 20px label gutters and 4px opposite gutters.
  const left = 20;
  const top = 4;
  let plotWidth = 0;
  let plotHeight = 0;
  let chartSeries: readonly Series[] = [];
  let categories: Category[] = [];
  let positions: number[] = [];
  let chartKind = 'line';
  let values: (number | undefined)[][] = [];
  let lineMarks: SVGElement[][] = [];
  let y = scaleLinear();
  let hoveredIndex: number | undefined;
  let tooltipTimer: number | undefined;

  const seriesColor = (color: string | undefined, index: number) => color && view.CSS.supports('color', color)
    ? color : `var(--chart-${index % 5 + 1}, currentColor)`;
  function add(parent: SVGElement, tag: string, attrs: Record<string, string | number>, text?: string) {
    const shape = doc.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, String(value));
    if (text !== undefined) shape.textContent = text;
    parent.append(shape);
    return shape;
  }
  function hideTooltip(animate = true) {
    hoveredIndex = undefined;
    highlights.replaceChildren();
    for (const marks of lineMarks) for (const mark of marks) mark.removeAttribute('opacity');
    if (tooltip.hidden) return;
    view.clearTimeout(tooltipTimer);
    if (animate && !view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      tooltip.dataset.exiting = '';
      tooltipTimer = view.setTimeout(() => { tooltip.hidden = true; }, 100);
    } else tooltip.hidden = true;
  }
  svg.addEventListener('pointerleave', () => hideTooltip(), { signal });
  svg.addEventListener('pointermove', event => {
    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    if (!positions.length || x < left || x > left + plotWidth || pointerY < top || pointerY > top + plotHeight) {
      if (hoveredIndex !== undefined) hideTooltip();
      return;
    }
    const step = positions.length > 1 ? positions[1]! - positions[0]! : 0;
    const index = step > 0 ? Math.max(0, Math.min(positions.length - 1, Math.round((x - positions[0]!) / step))) : 0;
    const visible = chartSeries.flatMap((item, i) => {
      const value = values[i]?.[index];
      return value === undefined ? [] : [{ value, item, index: i, color: seriesColor(item.color, i) }];
    });
    if (!visible.length) {
      if (hoveredIndex !== undefined) hideTooltip();
      return;
    }
    if (index !== hoveredIndex) {
      const title = doc.createElement('div');
      title.className = 'vs-chart-tooltip-title';
      title.textContent = String(categories[index] ?? '');
      const rows = doc.createElement('div');
      rows.className = 'vs-chart-tooltip-rows';
      for (const { item, color, value } of visible) {
        const line = doc.createElement('div');
        line.className = 'vs-chart-tooltip-row';
        const swatch = doc.createElement('span');
        swatch.className = 'vs-chart-swatch';
        swatch.style.background = color;
        const name = doc.createElement('span');
        name.textContent = item.label ?? item.id;
        const number = doc.createElement('span');
        number.className = 'vs-chart-tooltip-value';
        number.textContent = value.toLocaleString();
        line.append(swatch, name, number);
        rows.append(line);
      }
      tooltip.replaceChildren(title, rows);
      hoveredIndex = index;
      view.clearTimeout(tooltipTimer);
      delete tooltip.dataset.exiting;
      tooltip.hidden = false;
    }

    if (chartKind === 'line' || chartKind === 'area') {
      const nearest = visible.reduce((best, item) => Math.abs(y(item.value) - pointerY) < Math.abs(y(best.value) - pointerY) ? item : best);
      const highlighted = Math.hypot(positions[index]! - x, y(nearest.value) - pointerY) <= 7;
      for (const [i, marks] of lineMarks.entries()) for (const mark of marks) {
        if (chartKind === 'line' && highlighted && i !== nearest.index) mark.setAttribute('opacity', '.1');
        else mark.removeAttribute('opacity');
      }
      highlights.replaceChildren();
      for (const row of visible) {
        add(highlights, 'circle', { cx: positions[index]!, cy: y(row.value), r: 4, fill: row.color,
          class: 'vs-chart-point' });
      }
    }

    const popupWidth = tooltip.offsetWidth;
    const popupHeight = tooltip.offsetHeight;
    tooltip.style.left = `${x + 10 + popupWidth > rect.width ? x - 10 - popupWidth : x + 10}px`;
    tooltip.style.top = `${pointerY + 10 + popupHeight > rect.height ? pointerY - 10 - popupHeight : pointerY + 10}px`;
  }, { signal });

  let width = -1;
  let height = -1;
  function render(force = false) {
    const nextWidth = element.clientWidth;
    const nextHeight = element.clientHeight;
    if (!force && width === nextWidth && height === nextHeight) return;
    width = nextWidth;
    height = nextHeight;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    if (chartKind === 'pie') {
      svg.setAttribute('viewBox', '0 0 320 160');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    } else {
      svg.removeAttribute('viewBox');
      svg.removeAttribute('preserveAspectRatio');
    }
    svg.replaceChildren();
    positions = [];
    hideTooltip(false);
    lineMarks = chartSeries.map(() => []);
    if (width <= left + 4 || height <= top + 20 || !categories.length || !chartSeries.length) return;

    if (chartKind === 'pie') {
      const line = values[0] ?? [];
      const total = line.reduce<number>((sum, value) => sum + Math.max(0, value ?? 0), 0);
      if (total <= 0) return;
      let offset = 0;
      line.forEach((value, i) => {
        const fraction = Math.max(0, value ?? 0) / total * 100;
        add(svg, 'circle', { cx: 160, cy: 80, r: 34, pathLength: 100, fill: 'none',
          stroke: seriesColor(undefined, i), 'stroke-width': 68, 'stroke-dasharray': `${fraction} ${100 - fraction}`,
          'stroke-dashoffset': -offset, transform: 'rotate(-90 160 80)' });
        offset += fraction;
      });
      return;
    }

    plotWidth = width - left - 4;
    plotHeight = height - top - 20;
    const bottom = top + plotHeight;
    const range: [number, number] = [left, left + plotWidth];
    const band = scaleBand<Category>().domain(categories).range(range).padding(.25);
    const point = scalePoint<Category>().domain(categories).range(range).padding(.25);
    positions = categories.map(category => chartKind === 'bar' ? band(category)! + band.bandwidth() / 2 : point(category)!);
    let min = 0;
    let max = 0;
    for (const row of values) for (const value of row) {
      if (value === undefined) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    y = scaleLinear().domain([min, max]).nice().range([bottom, top]);
    for (const tick of y.ticks(4)) {
      add(svg, 'line', { x1: left, x2: range[1], y1: y(tick), y2: y(tick), class: 'vs-chart-gridline' });
    }

    const grouped = scaleBand<number>().domain(chartSeries.map((_, i) => i)).range([0, band.bandwidth()]).paddingInner(.15);
    for (const [i, series] of chartSeries.entries()) {
      const line = values[i]!;
      const color = seriesColor(series.color, i);
      if (chartKind === 'bar') {
        line.forEach((value, j) => {
          if (value === undefined) return;
          add(svg, 'rect', { x: band(categories[j]!)! + grouped(i)!, y: Math.min(y(value), y(0)),
            width: grouped.bandwidth(), height: Math.abs(y(value) - y(0)), fill: color });
        });
        continue;
      }

      // Preserve gaps for null data, and round paths at the same precision as the SVG reference.
      const round = (value: number) => Number(value.toFixed(3));
      const baseline = round(y(0));
      let start = 0;
      let path = '';
      for (let j = 0; j <= line.length; j++) {
        const value = line[j];
        if (value !== undefined) {
          if (!path) start = j;
          path += `${path ? 'L' : 'M'}${round(positions[j]!)},${round(y(value))}`;
          continue;
        }
        if (!path) continue;
        if (chartKind === 'area') {
          add(svg, 'path', { d: `${path}L${round(positions[j - 1]!)},${baseline}L${round(positions[start]!)},${baseline}Z`,
            fill: color, opacity: .3 });
        }
        lineMarks[i]!.push(add(svg, 'path', { d: j - start === 1 ? path + 'Z' : path, fill: 'transparent', stroke: color, 'stroke-width': 1 }));
        path = '';
      }
    }

    const tickCount = Math.round(plotHeight / 50);
    const format = y.tickFormat(tickCount);
    for (const tick of y.ticks(tickCount)) {
      add(svg, 'text', { x: left - 4, y: y(tick) + 3.5, 'text-anchor': 'end', class: 'vs-chart-axis-label' }, format(tick));
    }
    const labels = categories.map((category, index) => add(svg, 'text', {
      x: positions[index]!, y: bottom + 15, 'text-anchor': 'middle', class: 'vs-chart-axis-label',
    }, String(category)) as SVGTextElement);
    let lastLabelEnd = -Infinity;
    const overlapping = labels.filter((label, index) => {
      const x = positions[index]!;
      const halfWidth = label.getComputedTextLength() / 2;
      if (x - halfWidth < lastLabelEnd + 4) return true;
      lastLabelEnd = x + halfWidth;
      return false;
    });
    for (const label of overlapping) label.remove();
    svg.append(highlights);
  }

  const resize = new view.ResizeObserver(() => render());
  resize.observe(element);
  let signature = '';
  return {
    sync(inputs) {
      const next = JSON.stringify(inputs);
      if (signature === next) return;
      signature = next;
      svg.setAttribute('aria-label', string(inputs.label, 'Chart'));
      const chartData = (inputs.data ?? []) as readonly Row[];
      chartSeries = (inputs.series ?? []) as readonly Series[];
      const categoryKey = string(inputs.x, 'x');
      chartKind = string(inputs.kind, 'line');
      categories = chartData.map(row => typeof row[categoryKey] === 'number' ? row[categoryKey] as number : String(row[categoryKey] ?? ''));
      values = chartSeries.map(item => chartData.map(row => {
        const value = row[item.key];
        return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
      }));
      render(true);
    },
    dispose() {
      events.abort();
      resize.disconnect();
      view.clearTimeout(tooltipTimer);
    },
  };
}
