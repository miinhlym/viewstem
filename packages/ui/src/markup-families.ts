import type { NodeSnapshot } from '@viewstem/core';
import { uniqueId, type Behavior, type Send } from './behaviors.js';
import type { Markup } from './dynamic-catalog.js';
import { readInputs } from './component-context.js';

type Props = NodeSnapshot['inputs'];

export const markupCatalog: Record<string, Markup> = {
  AspectRatio: ['div', ''],
  'Attachment.Root': ['div', '', { 'data-size': 'default', 'data-orientation': 'horizontal' }],
  'Attachment.Action': ['button', 'btn', { 'data-size': 'icon-xs', 'data-variant': 'ghost' }],
  'Attachment.Actions': ['div', ''],
  'Attachment.Content': ['div', ''],
  'Attachment.Description': ['span', ''],
  'Attachment.Group': ['div', ''],
  'Attachment.Media': ['div', '', { 'data-variant': 'icon' }],
  'Attachment.Title': ['span', ''],
  'Attachment.Trigger': ['button', ''],
  'Bubble.Root': ['div', '', { 'data-align': 'start', 'data-variant': 'default' }],
  'Bubble.Content': ['div', ''],
  'Bubble.Group': ['div', ''],
  'Bubble.Reactions': ['div', '', { 'data-align': 'end' }],
  'CodeBlock.Root': ['div', '', { 'data-size': 'default', 'data-variant': 'default' }],
  'CodeBlock.Actions': ['div', ''],
  'CodeBlock.Content': ['pre', '', { dir: 'ltr', tabindex: '0' }],
  'CodeBlock.CopyButton': ['button', 'btn', { 'data-size': 'icon-xs', 'data-variant': 'ghost' }],
  'CodeBlock.Footer': ['div', ''],
  'CodeBlock.Header': ['div', ''],
  'CodeBlock.Line': ['span', '', { 'data-variant': 'default' }],
  'CodeBlock.Title': ['div', ''],
  'Marker.Root': ['div', '', { 'data-variant': 'default' }],
  'Marker.Content': ['span', ''],
  'Marker.Icon': ['span', '', { 'aria-hidden': 'true' }],
  'Message.Root': ['div', '', { 'data-align': 'start' }],
  'Message.Avatar': ['div', ''],
  'Message.Content': ['div', ''],
  'Message.Footer': ['div', ''],
  'Message.Group': ['div', ''],
  'Message.Header': ['div', ''],
  Toggle: ['button', ''],
  'ToggleGroup.Root': ['div', '', { role: 'group', 'data-orientation': 'horizontal', 'data-variant': 'default', 'data-size': 'default' }],
  'ToggleGroup.Item': ['button', ''],
  'Trace.Root': ['div', ''],
  'Trace.Collapsible': ['div', ''],
  'Trace.CollapsibleContent': ['div', ''],
  'Trace.CollapsibleTrigger': ['button', ''],
  'Trace.Description': ['span', ''],
  'Trace.Icon': ['span', ''],
  'Trace.Line': ['span', ''],
  'Trace.Title': ['span', ''],
  Typography: ['p', ''],
};

export const markupPorts: Record<string, string> = {
  AspectRatio: 'ratio',
  'Attachment.Root': 'orientation size state',
  'Attachment.Action': 'download size variant',
  'Attachment.Media': 'variant',
  'Bubble.Root': 'align variant',
  'Bubble.Reactions': 'align side',
  'CodeBlock.Root': 'size variant',
  'CodeBlock.Content': 'code lineNumbers startLine wrap',
  'CodeBlock.CopyButton': 'value size variant',
  'CodeBlock.Line': 'code variant',
  'Marker.Root': 'variant',
  'Message.Root': 'align',
  Toggle: 'pressed size variant value',
  'ToggleGroup.Root': 'disabled loop orientation rovingFocus size spacing type value variant',
  'ToggleGroup.Item': 'size value variant',
  'Trace.Collapsible': 'disabled open',
  'Trace.CollapsibleContent': 'forceMount hiddenUntilFound',
  'Trace.Line': 'status',
  Typography: 'as variant',
};

export const markupEvents: Record<string, string> = {
  Toggle: 'pressedChange',
  'ToggleGroup.Root': 'valueChange',
  'Trace.Collapsible': 'openChange openChangeComplete',
};

const typographyTags = {
  h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', p: 'p', blockquote: 'blockquote',
  code: 'code', lead: 'p', large: 'div', small: 'small', muted: 'p',
} as const;
const allowedTypographyTags = new Set<keyof HTMLElementTagNameMap>([
  ...Object.values(typographyTags), 'h5', 'h6', 'span', 'strong', 'em',
]);

export function markupTag(name: string, inputs: Props): keyof HTMLElementTagNameMap | undefined {
  if (name === 'Attachment.Action' || name === 'CodeBlock.CopyButton') return inputs.href ? 'a' : 'button';
  if (name !== 'Typography') return undefined;
  const as = inputs.as as keyof HTMLElementTagNameMap;
  if (allowedTypographyTags.has(as)) return as;
  const variant = inputs.variant as keyof typeof typographyTags;
  return Object.hasOwn(typographyTags, variant) ? typographyTags[variant] : 'p';
}

function toggle(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  let pressed = false;
  function syncState() {
    element.setAttribute('aria-pressed', String(pressed));
    element.dataset.state = pressed ? 'on' : 'off';
  }
  element.addEventListener('click', () => {
    if (element.matches(':disabled, [aria-disabled="true"]')) return;
    pressed = !pressed;
    syncState();
    send('pressedChange', { value: pressed });
  }, { signal });
  return {
    sync(inputs) {
      if (typeof inputs.pressed === 'boolean') pressed = inputs.pressed;
      if (typeof inputs.value === 'string' && element.localName === 'button') (element as HTMLButtonElement).value = inputs.value;
      syncState();
    },
  };
}

const toggleItemSelector = '[data-vs-component="ToggleGroup.Item"]';
const toggleGroupSelector = '[data-vs-component="ToggleGroup.Root"]';
const disabledSelector = ':disabled, [aria-disabled="true"]';

function toggleGroup(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  let props: Props = {};
  let selection: string[] = [];
  let tabStop: HTMLElement | undefined;
  const isOwn = (item: HTMLElement) => item.closest(toggleGroupSelector) === element;
  const items = () => Array.from(element.querySelectorAll<HTMLElement>(toggleItemSelector)).filter(isOwn);
  function render() {
    const all = items();
    for (const item of all) {
      const disabled = props.disabled === true || readInputs(item).disabled === true;
      (item as HTMLButtonElement).disabled = disabled;
      item.toggleAttribute('data-disabled', disabled);
      item.dataset.orientation = props.orientation === 'vertical' ? 'vertical' : 'horizontal';
      item.dataset.variant = typeof props.variant === 'string' ? props.variant : 'default';
      item.dataset.size = typeof props.size === 'string' ? props.size : 'default';
      const selected = selection.includes(item.dataset.value ?? '');
      item.dataset.state = selected ? 'on' : 'off';
      if (props.type === 'multiple') {
        item.removeAttribute('role');
        item.removeAttribute('aria-checked');
        item.setAttribute('aria-pressed', String(selected));
      } else {
        item.setAttribute('role', 'radio');
        item.removeAttribute('aria-pressed');
        item.setAttribute('aria-checked', String(selected));
      }
    }
    const enabled = all.filter(item => !item.matches(disabledSelector));
    if (!tabStop || !enabled.includes(tabStop)) tabStop = enabled[0];
    for (const item of all) item.tabIndex = enabled.includes(item) && (props.rovingFocus === false || item === tabStop) ? 0 : -1;
  }
  function activate(item: HTMLElement) {
    const value = item.dataset.value;
    if (value === undefined) return;
    if (selection.includes(value)) selection = selection.filter(selected => selected !== value);
    else {
      selection = props.type === 'multiple' ? [...selection, value] : [value];
      tabStop = item;
    }
    render();
    send('valueChange', { value: props.type === 'multiple' ? selection : selection[0] ?? '' });
  }
  element.addEventListener('click', event => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(toggleItemSelector);
    if (item && isOwn(item) && !item.matches(disabledSelector)) activate(item);
  }, { signal });
  element.addEventListener('keydown', event => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(toggleItemSelector);
    if (!item || !isOwn(item) || item.matches(disabledSelector)) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate(item);
      return;
    }
    if (props.rovingFocus === false) return;
    const enabled = items().filter(candidate => !candidate.matches(disabledSelector));
    const index = enabled.indexOf(item);
    const vertical = props.orientation === 'vertical';
    const rtl = element.ownerDocument.defaultView?.getComputedStyle(element).direction === 'rtl';
    const nextKey = vertical ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
    const previousKey = vertical ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
    const nextIndex = event.key === nextKey ? index + 1 : event.key === previousKey ? index - 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : undefined;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const next = enabled[props.loop === false ? nextIndex : (nextIndex + enabled.length) % enabled.length];
    if (!next) return;
    tabStop = next;
    render();
    next.focus();
  }, { signal });
  return {
    sync(inputs) {
      props = inputs;
      if (typeof inputs.value === 'string') selection = inputs.value ? [inputs.value] : [];
      else if (Array.isArray(inputs.value)) selection = inputs.value.filter((value): value is string => typeof value === 'string');
      const spacing = typeof inputs.spacing === 'number' ? inputs.spacing : 0;
      element.dataset.spacing = String(spacing);
      element.style.setProperty('--vs-toggle-spacing', String(spacing));
      render();
    },
  };
}

function traceCollapsible(element: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  let open = false;
  let initialized = false;
  let disabled = false;
  let animation: Animation | undefined;
  let content: HTMLElement | null = null;
  let trigger: HTMLButtonElement | null = null;
  function render(animate: boolean) {
    element.dataset.state = open ? 'open' : 'closed';
    if (trigger) {
      trigger.setAttribute('aria-expanded', String(open));
      trigger.disabled = disabled || readInputs(trigger).disabled === true;
    }
    if (!content) return;
    content.dataset.state = element.dataset.state;
    const contentInputs = readInputs(content);
    const finalHidden = () => {
      if (open || (contentInputs.forceMount === true && contentInputs.hiddenUntilFound !== true)) content?.removeAttribute('hidden');
      else content?.setAttribute('hidden', contentInputs.hiddenUntilFound === true ? 'until-found' : '');
    };
    if (!animate) {
      if (!animation) finalHidden();
      return;
    }

    const start = content.hasAttribute('hidden') ? 0 : content.getBoundingClientRect().height;
    animation?.cancel();
    content.removeAttribute('hidden');
    if (element.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof content.animate !== 'function') {
      animation = undefined;
      finalHidden();
      send('openChangeComplete', { value: open });
      return;
    }
    const end = open ? content.getBoundingClientRect().height : 0;
    const current = content.animate([{ height: start + 'px' }, { height: end + 'px' }], {
      duration: 200, easing: 'ease-out',
    });
    animation = current;
    void current.finished.then(() => {
      if (signal.aborted || animation !== current) return;
      animation = undefined;
      finalHidden();
      send('openChangeComplete', { value: open });
    }, () => {});
  }
  function change(next: boolean) {
    if (open === next || disabled) return;
    open = next;
    send('openChange', { value: open });
    render(true);
  }
  element.addEventListener('click', event => {
    if (trigger?.contains(event.target as Node) && !trigger.disabled) change(!open);
  }, { signal });
  element.addEventListener('keydown', event => {
    if ((event.key !== 'Enter' && event.key !== ' ') || !trigger?.contains(event.target as Node) || trigger.disabled) return;
    event.preventDefault();
    change(!open);
  }, { signal });
  element.addEventListener('beforematch', event => {
    if (event.target === content) change(true);
  }, { signal });
  return {
    sync(inputs) {
      disabled = inputs.disabled === true;
      const nextTrigger = element.querySelector<HTMLButtonElement>(':scope > [data-vs-component="Trace.CollapsibleTrigger"]');
      const nextContent = element.querySelector<HTMLElement>(':scope > [data-vs-component="Trace.CollapsibleContent"]');
      if (nextContent !== content) {
        animation?.cancel();
        animation = undefined;
        content = nextContent;
      }
      trigger = nextTrigger;
      if (content && trigger) {
        content.id ||= uniqueId();
        trigger.setAttribute('aria-controls', content.id);
      }
      const previous = open;
      if (typeof inputs.open === 'boolean') open = inputs.open;
      render(initialized && open !== previous);
      initialized = true;
    },
    dispose() { animation?.cancel(); },
  };
}

type Token = { content: string; class?: string; style?: string };
const tokenStyles = ['color', 'background-color', 'font-style', 'font-weight', 'text-decoration', 'text-decoration-color'];

function codeText(element: HTMLElement, name: 'CodeBlock.Content' | 'CodeBlock.Line'): Behavior {
  const doc = element.ownerDocument;
  const host = name === 'CodeBlock.Content' ? element.querySelector('code') ?? element : element;
  const generated = doc.createElement('span');
  generated.dataset.vsCodeText = '';
  const styleParser = doc.createElement('span').style;
  let previous: Props['code'];
  let previousNumbered = false;
  return {
    sync(inputs) {
      const numbered = name === 'CodeBlock.Content' && inputs.lineNumbers === true;
      if (name === 'CodeBlock.Content') {
        element.toggleAttribute('data-numbered', numbered);
        element.toggleAttribute('data-wrap', inputs.wrap === true);
        element.style.counterReset = 'vs-code-line ' + (typeof inputs.startLine === 'number' ? Math.trunc(inputs.startLine) - 1 : 0);
      }
      if (inputs.code === undefined) {
        generated.remove();
        previous = undefined;
        return;
      }
      if (!generated.isConnected) host.append(generated);
      if (inputs.code === previous && numbered === previousNumbered) return;
      previous = inputs.code;
      previousNumbered = numbered;
      if (typeof inputs.code === 'string') {
        if (numbered) {
          generated.replaceChildren(...inputs.code.replace(/\n$/, '').split('\n').map(value => {
            const line = doc.createElement('span');
            line.dataset.vsComponent = 'CodeBlock.Line';
            line.textContent = value || '\n';
            return line;
          }));
        } else generated.textContent = inputs.code || (name === 'CodeBlock.Line' ? '\n' : '');
      } else if (Array.isArray(inputs.code)) {
        generated.replaceChildren(...(inputs.code as Token[]).map(token => {
          const span = doc.createElement('span');
          span.textContent = token.content;
          if (token.class) span.className = token.class;
          if (token.style) {
            styleParser.cssText = token.style;
            for (const property of tokenStyles) {
              const value = styleParser.getPropertyValue(property);
              if (value) span.style.setProperty(property, value);
            }
          }
          return span;
        }));
        if (!inputs.code.length) generated.textContent = '\n';
      }
    },
  };
}

function disableAction(element: HTMLElement, signal: AbortSignal) {
  element.addEventListener('click', event => {
    if (!element.matches(disabledSelector)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, signal });
  return (inputs: Props) => {
    if (element.localName !== 'a') return;
    if (inputs.disabled === true) {
      element.removeAttribute('href');
      element.setAttribute('role', 'link');
      element.setAttribute('aria-disabled', 'true');
      element.tabIndex = -1;
    } else {
      if (typeof inputs.role !== 'string') element.removeAttribute('role');
      if (inputs['aria-disabled'] === undefined) element.removeAttribute('aria-disabled');
      if (inputs.tabindex === undefined) element.removeAttribute('tabindex');
    }
  };
}

function copyButton(element: HTMLElement, signal: AbortSignal): Behavior {
  const syncDisabled = disableAction(element, signal);
  const doc = element.ownerDocument;
  const win = doc.defaultView!;
  const status = doc.createElement('span');
  status.className = 'vs-code-copy-status';
  status.setAttribute('aria-live', 'polite');
  let reset: number | undefined;
  let value = '';
  let customLabel: string | undefined;
  const label = () => element.setAttribute('aria-label', customLabel ?? (element.hasAttribute('data-copied') ? 'Copied' : 'Copy'));
  element.addEventListener('click', () => {
    if (element.matches(disabledSelector)) return;
    const clipboard = win.navigator.clipboard;
    if (!clipboard) return;
    void clipboard.writeText(value).then(() => {
      if (signal.aborted) return;
      element.setAttribute('data-copied', '');
      status.textContent = 'Copied';
      label();
      win.clearTimeout(reset);
      reset = win.setTimeout(() => {
        element.removeAttribute('data-copied');
        status.textContent = '';
        label();
      }, 2000);
    }, () => {});
  }, { signal });
  return {
    sync(inputs) {
      if (status.parentElement !== element) element.append(status);
      value = typeof inputs.value === 'string' ? inputs.value : '';
      customLabel = typeof inputs['aria-label'] === 'string' ? inputs['aria-label'] : undefined;
      label();
      syncDisabled(inputs);
    },
    dispose() { win.clearTimeout(reset); },
  };
}

export function markupBehavior(name: string, element: HTMLElement, send: Send, signal: AbortSignal): Behavior | undefined {
  switch (name) {
    case 'AspectRatio':
      return {
        sync(inputs) {
          const ratio = typeof inputs.ratio === 'number' ? inputs.ratio : 1;
          if (element.parentElement?.classList.contains('vs-ui-aspect-frame')) {
            element.parentElement.style.paddingBlockEnd = (ratio > 0 ? 100 / ratio : 0) + '%';
          } else element.style.aspectRatio = ratio > 0 ? String(ratio) : 'auto';
        },
      };
    case 'Attachment.Root':
      return { sync(inputs) { element.dataset.state = typeof inputs.state === 'string' ? inputs.state : 'done'; } };
    case 'Attachment.Action': {
      const syncDisabled = disableAction(element, signal);
      return { sync(inputs) {
        syncDisabled(inputs);
        element.toggleAttribute('data-vs-labelled', typeof inputs.text === 'string' && inputs.text.trim() !== '');
        if (element.localName !== 'a') return;
        if (inputs.download === true || typeof inputs.download === 'string') {
          element.setAttribute('download', inputs.download === true ? '' : inputs.download);
        } else element.removeAttribute('download');
      } };
    }
    case 'Bubble.Reactions':
      return { sync(inputs) { element.dataset.side = inputs.side === 'top' ? 'top' : 'bottom'; } };
    case 'Trace.Line':
      return { sync(inputs) {
        if (typeof inputs.status === 'string') element.dataset.status = inputs.status;
        else delete element.dataset.status;
      } };
    case 'Toggle': return toggle(element, send, signal);
    case 'ToggleGroup.Root': return toggleGroup(element, send, signal);
    case 'Trace.Collapsible': return traceCollapsible(element, send, signal);
    case 'CodeBlock.Content':
    case 'CodeBlock.Line': return codeText(element, name);
    case 'CodeBlock.CopyButton': return copyButton(element, signal);
    default: return undefined;
  }
}
