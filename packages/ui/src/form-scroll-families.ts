import type { NodeSnapshot } from '@viewstem/core';
import * as scrollArea from '@zag-js/scroll-area';
import { normalizeProps, spreadProps, VanillaMachine, type Attrs } from '@zag-js/vanilla';
import { uniqueId, type Behavior, type Send } from './behaviors.js';
import { emitFrom, readInputs } from './component-context.js';
import type { Markup } from './dynamic-catalog.js';

type Inputs = NodeSnapshot['inputs'];
const propsOf = readInputs;
const part = (name: string) => `[data-vs-component="${name}"]`;
const find = <T extends HTMLElement = HTMLElement>(root: HTMLElement, name: string) => root.querySelector<T>(part(name));
const all = <T extends HTMLElement = HTMLElement>(root: HTMLElement, name: string) => [...root.querySelectorAll<T>(part(name))];

export const formScrollCatalog: Record<string, Markup> = {
  'MessageScroller.Provider': ['div', 'vs-ui-transparent'],
  'MessageScroller.Root': ['div', 'vs-message-scroller'],
  'MessageScroller.Viewport': ['div', 'vs-message-viewport'],
  'MessageScroller.Content': ['div', 'vs-message-content'],
  'MessageScroller.Item': ['div', 'vs-message-item'],
  'MessageScroller.Button': ['button', 'btn vs-message-scroll-button', { 'data-variant': 'secondary', 'data-size': 'icon-sm', 'data-active': 'false' }],
  'Questionnaire.Root': ['form', 'vs-questionnaire'],
  'Questionnaire.Actions': ['div', 'vs-questionnaire-actions'],
  'Questionnaire.Choice': ['label', 'vs-questionnaire-choice'],
  'Questionnaire.ChoiceDescription': ['span', 'vs-questionnaire-description'],
  'Questionnaire.Choices': ['div', 'vs-questionnaire-choices'],
  'Questionnaire.Description': ['p', 'vs-questionnaire-description'],
  'Questionnaire.Error': ['p', 'vs-questionnaire-error', { hidden: '' }],
  'Questionnaire.Input': ['input', 'input vs-questionnaire-input'],
  'Questionnaire.Item': ['fieldset', 'vs-questionnaire-item', { tabindex: '-1' }],
  'Questionnaire.Next': ['button', 'btn vs-questionnaire-next', { 'data-variant': 'primary' }],
  'Questionnaire.Previous': ['button', 'btn vs-questionnaire-previous', { 'data-variant': 'outline' }],
  'Questionnaire.Progress': ['div', 'vs-questionnaire-progress', { role: 'status' }],
  'Questionnaire.Skip': ['button', 'btn vs-questionnaire-skip', { 'data-variant': 'outline' }],
  'Questionnaire.Submit': ['button', 'btn vs-questionnaire-next', { 'data-variant': 'primary' }],
  'Questionnaire.Title': ['legend', 'vs-questionnaire-title'],
  'ScrollArea.Root': ['div', 'vs-scroll-area'],
  'ScrollArea.Scrollbar': ['div', 'vs-scrollbar-definition', { hidden: '' }],
  'Select.ScrollUpButton': ['div', 'vs-select-scroll-button', { 'data-direction': 'up', 'aria-hidden': 'true', hidden: '' }],
  'Select.ScrollDownButton': ['div', 'vs-select-scroll-button', { 'data-direction': 'down', 'aria-hidden': 'true', hidden: '' }],
};

export const formScrollPorts: Record<string, string> = {
  'MessageScroller.Provider': 'autoScroll defaultScrollPosition scrollEdgeThreshold scrollMargin scrollPreviousItemPeek',
  'MessageScroller.Viewport': 'preserveScrollOnPrepend',
  'MessageScroller.Content': 'spacerClassName',
  'MessageScroller.Item': 'messageId scrollAnchor',
  'MessageScroller.Button': 'direction behavior variant size type value',
  'Questionnaire.Root': 'defaultItem item items noValidate novalidate shortcuts',
  'Questionnaire.Choice': 'value checked defaultChecked',
  'Questionnaire.Input': 'type value defaultValue',
  'Questionnaire.Item': 'invalid multiple name required disabled',
  'Questionnaire.Next': 'type value variant size',
  'Questionnaire.Previous': 'type value variant size',
  'Questionnaire.Skip': 'type value variant size',
  'Questionnaire.Submit': 'type value variant size',
  'ScrollArea.Root': 'orientation type scrollHideDelay scrollbarXClasses scrollbarYClasses',
  'ScrollArea.Scrollbar': 'orientation forceMount',
};
export const formScrollEvents: Record<string, string> = {
  'Questionnaire.Root': 'itemChange submit reset',
  'Questionnaire.Item': 'statusChange',
};

export function formScrollHost(name: string, control: HTMLElement): HTMLElement | undefined {
  const doc = control.ownerDocument;
  if (name === 'ScrollArea.Root') {
    const viewport = doc.createElement('div');
    viewport.className = 'vs-scroll-area-viewport';
    const content = doc.createElement('div');
    content.className = 'vs-scroll-area-content';
    viewport.append(content);
    control.append(viewport);
    return content;
  }
  if (name === 'Questionnaire.Choice') {
    const input = doc.createElement('input');
    input.className = 'vs-questionnaire-option-input';
    const indicator = doc.createElement('span');
    indicator.className = 'vs-questionnaire-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    const label = doc.createElement('span');
    label.className = 'vs-questionnaire-option-label';
    control.append(input, indicator, label);
    return label;
  }
}

function showFallback(element: HTMLElement, content: string, className: string, allowText = false) {
  const inputs = propsOf(element);
  let label = element.querySelector<HTMLElement>(`:scope > .${className}`);
  const hasSlot = [...element.children].some(child => child !== label);
  if (hasSlot || (allowText && typeof inputs.text === 'string')) {
    label?.remove();
    return;
  }
  if (!label) {
    label = element.ownerDocument.createElement('span');
    label.className = className;
    element.append(label);
  }
  label.textContent = content;
}

type AnswerState = 'unanswered' | 'answered' | 'skipped';
type QuestionDefinition = { name: string; required?: boolean; disabled?: boolean; choices?: readonly { value: string; disabled?: boolean }[] };
const question = 'Questionnaire.Item';
const questionChoice = 'Questionnaire.Choice';
const questionInput = 'Questionnaire.Input';
const navigation = ['Previous', 'Skip', 'Next', 'Submit'] as const;

function questionnaire(form: HTMLFormElement, send: Send, signal: AbortSignal): Behavior {
  let inputs: Inputs = {};
  let activeName: string | undefined;
  let pendingFocus: string | undefined;
  let questions: { name: string; definition: QuestionDefinition; node: HTMLFieldSetElement | undefined }[] = [];
  const state = new WeakMap<HTMLElement, { attempted: boolean; skipped: boolean; status?: AnswerState }>();
  const initialized = new WeakSet<HTMLInputElement>();
  const freeAnswers = new WeakSet<HTMLInputElement>();
  const previousValues = new WeakMap<HTMLInputElement, unknown>();
  const controls = (node: HTMLElement) => [...node.querySelectorAll<HTMLInputElement>(`input.vs-questionnaire-option-input, ${part(questionInput)}`)]
    .filter(input => input.closest(part(question)) === node && !input.disabled);
  const isChoice = (input: HTMLInputElement) => input.classList.contains('vs-questionnaire-option-input');
  const filled = (input: HTMLInputElement) => isChoice(input) ? input.checked : freeAnswers.has(input);
  const current = () => questions.findIndex(item => item.name === activeName);
  const data = (node: HTMLElement) => {
    let item = state.get(node);
    if (!item) { item = { attempted: false, skipped: false }; state.set(node, item); }
    return item;
  };
  const status = (node: HTMLElement): AnswerState => data(node).skipped ? 'skipped' : controls(node).some(filled) ? 'answered' : 'unanswered';
  const valid = (node: HTMLElement) => {
    const answer = status(node);
    const item = propsOf(node);
    return answer === 'skipped' ? item.required !== true : item.invalid !== true && answer === 'answered';
  };
  const focusInvalid = (node: HTMLElement) => (controls(node).find(filled) ?? controls(node)[0] ?? node).focus({ preventScroll: true });
  const move = (name: string, focus: 'item' | 'invalid' = 'item') => {
    if (name !== activeName) {
      activeName = name;
      send('itemChange', { value: name });
    }
    paint();
    const node = questions[current()]?.node;
    if (node) {
      if (focus === 'invalid') focusInvalid(node);
      else node.focus({ preventScroll: true });
    } else pendingFocus = name;
  };
  const validate = (node: HTMLElement) => {
    data(node).attempted = true;
    if (!valid(node)) return false;
    if (!form.noValidate) {
      const invalid = controls(node).find(input => filled(input) && !input.validity.valid);
      if (invalid) { invalid.reportValidity(); return false; }
    }
    return true;
  };
  const next = (submit: boolean) => {
    const index = current();
    const item = questions[index];
    if (!item?.node) return;
    if (!validate(item.node)) { paint(); focusInvalid(item.node); return; }
    const following = questions[index + 1];
    if (following) move(following.name);
    else if (submit) form.requestSubmit();
  };
  const skip = () => {
    const index = current();
    const item = questions[index];
    if (!item?.node || item.definition.required || propsOf(item.node).required === true) return;
    data(item.node).skipped = true;
    for (const input of controls(item.node)) {
      if (isChoice(input)) input.checked = false;
      else freeAnswers.delete(input);
    }
    paint();
    const following = questions[index + 1];
    if (following) move(following.name);
    else form.requestSubmit();
  };
  const own = (element: Element) => element.closest(part('Questionnaire.Root')) === form;
  const answerChanged = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (!input?.matches?.(`.vs-questionnaire-option-input, ${part(questionInput)}`) || !own(input)) return;
    const node = input.closest<HTMLElement>(part(question));
    if (!node) return;
    if (!isChoice(input)) {
      if (input.value.trim()) freeAnswers.add(input);
      else freeAnswers.delete(input);
    }
    if (filled(input)) {
      data(node).skipped = false;
      if (propsOf(node).multiple !== true) {
        for (const sibling of controls(node)) if (sibling !== input) {
          if (isChoice(sibling)) sibling.checked = false;
          else freeAnswers.delete(sibling);
        }
      }
    }
    paint();
  };
  form.addEventListener('change', answerChanged, { signal });
  form.addEventListener('input', event => {
    if (!(event.target as HTMLElement)?.matches?.(part(questionInput)) || (event as InputEvent).isComposing) return;
    answerChanged(event);
  }, { signal });
  form.addEventListener('compositionend', answerChanged, { signal });
  form.addEventListener('click', event => {
    const action = (event.target as Element | null)?.closest<HTMLElement>('button[data-vs-component^="Questionnaire."]');
    if (!action || !own(action) || event.defaultPrevented) return;
    const key = action.dataset.vsComponent?.slice('Questionnaire.'.length);
    if (key === 'Previous') {
      const previous = questions[current() - 1];
      if (previous) move(previous.name);
    }
    if (key === 'Next') next(false);
    if (key === 'Skip') skip();
  }, { signal });
  form.addEventListener('submit', event => {
    if (event.target !== form) return;
    const invalid = questions.find(item => item.node && !validate(item.node));
    if (!invalid) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    move(invalid.name, 'invalid');
  }, { capture: true, signal });
  form.addEventListener('reset', event => {
    if (event.target !== form) return;
    queueMicrotask(() => {
      if (signal.aborted || event.defaultPrevented) return;
      for (const { node } of questions) if (node) {
        data(node).skipped = false;
        data(node).attempted = false;
        for (const input of controls(node)) if (!isChoice(input)) {
          if (input.value.trim() && (propsOf(node).multiple === true || !controls(node).some(other => other.checked))) freeAnswers.add(input);
          else freeAnswers.delete(input);
        }
      }
      const first = questions.find(item => item.name === inputs.defaultItem) ?? questions[0];
      if (first) move(first.name);
    });
  }, { signal });
  form.addEventListener('keydown', event => {
    const target = event.target as HTMLElement;
    const item = questions[current()]?.node;
    if (!item || !own(target) || event.isComposing || event.defaultPrevented) return;
    const answers = controls(item);
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) next(true);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const focused = answers.indexOf(target as HTMLInputElement);
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && answers.length) {
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const selected = answers[focused];
      const canMove = target === item || (selected && (
        isChoice(selected) || (!selected.value.trim() && ['email', 'password', 'search', 'tel', 'text', 'url'].includes(selected.type))
      ));
      const nextAnswer = focused < 0 ? answers.find(filled) ?? answers.at(direction > 0 ? 0 : -1)
        : answers[(focused + direction + answers.length) % answers.length];
      const nativeRadio = selected?.type === 'radio' && nextAnswer?.type === 'radio';
      if (canMove && nextAnswer && nextAnswer !== target && !nativeRadio) {
        event.preventDefault();
        nextAnswer.focus();
        if (nextAnswer.type === 'radio') nextAnswer.click();
        return;
      }
    }
    if (event.key === 'Enter' && focused >= 0) {
      event.preventDefault();
      if (!event.repeat && filled(answers[focused]!)) next(true);
      return;
    }
    if ((focused < 0 || target.matches('[type=checkbox]')) && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      if (event.repeat) return;
      if (event.key === 'ArrowLeft') {
        const previous = questions[current() - 1];
        if (previous) move(previous.name);
      } else if (status(item) !== 'unanswered') next(false);
      return;
    }
    if (target.matches(part(questionInput))) return;
    const shortcut = answers.find(input => input.dataset.vsShortcut?.toLowerCase() === event.key.toLowerCase());
    if (shortcut) {
      event.preventDefault();
      if (!event.repeat) { shortcut.focus(); shortcut.click(); }
    }
  }, { signal });

  function paint() {
    const index = current();
    const last = index === questions.length - 1 && index >= 0;
    const currentItem = questions[index];
    for (const { name, node, definition } of questions) {
      if (!node) continue;
      node.hidden = name !== activeName || propsOf(node).hidden === true;
      node.tabIndex = -1;
      node.toggleAttribute('inert', node.hidden);
      const currentState = data(node);
      const itemStatus = status(node);
      if (currentState.status !== undefined && currentState.status !== itemStatus) emitFrom(node, 'statusChange', { value: itemStatus });
      currentState.status = itemStatus;
      node.dataset.status = itemStatus;
      const invalid = !valid(node) && (propsOf(node).invalid === true || currentState.attempted);
      node.toggleAttribute('data-invalid', invalid);
      const description = find(node, 'Questionnaire.Description');
      const error = find(node, 'Questionnaire.Error');
      if (description) description.id ||= uniqueId();
      if (error) {
        error.id ||= uniqueId();
        error.hidden = !invalid || propsOf(error).hidden === true;
        error.setAttribute('role', 'alert');
        showFallback(error, definition.required ? 'Choose an answer to continue.' : 'Choose an answer or skip this question.', 'vs-questionnaire-fallback', true);
      }
      const descriptionIds = [propsOf(node)['aria-describedby'], description?.id, invalid && error?.id].filter(Boolean).join(' ');
      if (descriptionIds) node.setAttribute('aria-describedby', descriptionIds);
      else node.removeAttribute('aria-describedby');
      const fields = controls(node);
      if (!node.hidden) {
        const keys = ['Meta+Enter', 'Control+Enter', fields.length && 'ArrowUp ArrowDown', index > 0 && 'ArrowLeft', !last && itemStatus !== 'unanswered' && 'ArrowRight'];
        node.setAttribute('aria-keyshortcuts', keys.filter(Boolean).join(' '));
      } else node.removeAttribute('aria-keyshortcuts');
      for (const input of fields) {
        if (isChoice(input)) {
          const choice = input.parentElement!;
          choice.toggleAttribute('data-checked', input.checked);
          choice.toggleAttribute('data-invalid', invalid);
          input.name = itemStatus === 'skipped' ? '' : name;
        } else {
          input.toggleAttribute('data-filled', input.value.trim() !== '');
          if (itemStatus !== 'skipped' && filled(input)) input.name = name;
          else input.removeAttribute('name');
          if (invalid) input.setAttribute('aria-invalid', 'true');
          else if (propsOf(input)['aria-invalid'] === undefined) input.removeAttribute('aria-invalid');
        }
      }
    }
    for (const [action, visible] of [
      ['Previous', index > 0], ['Skip', !!currentItem && !currentItem.definition.required], ['Next', questions.length > 1 && !last], ['Submit', last],
    ] as const) for (const button of all<HTMLButtonElement>(form, 'Questionnaire.' + action).filter(own)) {
      const settings = propsOf(button);
      button.hidden = !visible || settings.hidden === true;
      button.toggleAttribute('inert', button.hidden);
      button.type = action === 'Submit' && settings.type === undefined ? 'submit' : button.type;
      if (settings.variant === 'default') button.dataset.variant = 'primary';
      showFallback(button, action, 'vs-questionnaire-fallback', true);
    }
    for (const progress of all(form, 'Questionnaire.Progress').filter(own)) {
      showFallback(progress, questions.length ? `Question ${index + 1} of ${questions.length}` : '', 'vs-questionnaire-fallback', true);
    }
  }

  return { sync(nextInputs) {
    const previous = activeName;
    const oldControlled = inputs.item;
    inputs = nextInputs;
    form.noValidate = inputs.noValidate !== false && inputs.novalidate !== false;
    const nodes = all<HTMLFieldSetElement>(form, question).filter(own);
    const byName = new Map(nodes.map(node => [String(propsOf(node).name), node]));
    const definitions = Array.isArray(inputs.items) ? inputs.items as QuestionDefinition[] : nodes.map(node => ({
      name: String(propsOf(node).name), required: propsOf(node).required === true, disabled: propsOf(node).disabled === true,
    }));
    questions = definitions.filter(definition => !definition.disabled && propsOf(byName.get(definition.name) ?? form).disabled !== true)
      .map(definition => ({ name: definition.name, definition, node: byName.get(definition.name) }));
    if (typeof inputs.item === 'string' && inputs.item !== oldControlled) activeName = inputs.item;
    else if (!questions.some(item => item.name === activeName)) activeName = questions.find(item => item.name === inputs.defaultItem)?.name ?? questions[0]?.name;
    for (const node of nodes) {
      const entry = questions.find(item => item.node === node);
      if (!entry) { node.hidden = true; node.inert = true; continue; }
      const multiple = propsOf(node).multiple === true;
      const shortcuts = inputs.shortcuts === 'numbers' ? '123456789' : inputs.shortcuts === 'letters' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '';
      let index = 0;
      for (const choice of all(node, questionChoice)) {
        const settings = propsOf(choice);
        const input = choice.querySelector<HTMLInputElement>('.vs-questionnaire-option-input')!;
        input.type = multiple ? 'checkbox' : 'radio';
        input.name = entry.name;
        input.value = String(settings.value ?? '');
        input.disabled = settings.disabled === true;
        choice.dataset.type = input.type;
        choice.toggleAttribute('data-disabled', input.disabled);
        if (!initialized.has(input)) {
          initialized.add(input);
          input.defaultChecked = settings.defaultChecked === true;
          input.checked = input.defaultChecked;
        }
        if (typeof settings.checked === 'boolean' && settings.checked !== previousValues.get(input)) input.checked = settings.checked;
        previousValues.set(input, settings.checked);
        const logical = entry.definition.choices?.filter(choice => !choice.disabled).findIndex(candidate => candidate.value === settings.value);
        const shortcut = !input.disabled ? shortcuts[logical !== undefined && logical >= 0 ? logical : index++] : undefined;
        const old = choice.querySelector<HTMLElement>('.vs-questionnaire-shortcut');
        if (shortcut) {
          const badge = old ?? form.ownerDocument.createElement('kbd');
          badge.className = 'vs-questionnaire-shortcut';
          badge.textContent = shortcut;
          badge.setAttribute('aria-hidden', 'true');
          if (!old) choice.append(badge);
          input.dataset.vsShortcut = shortcut;
          input.setAttribute('aria-keyshortcuts', shortcut);
        } else {
          old?.remove();
          delete input.dataset.vsShortcut;
          input.removeAttribute('aria-keyshortcuts');
        }
      }
      for (const input of all<HTMLInputElement>(node, questionInput)) {
        const settings = propsOf(input);
        const initial = !initialized.has(input);
        if (initial && typeof settings.defaultValue === 'string') {
          input.defaultValue = settings.defaultValue;
          if (settings.value === undefined) input.value = settings.defaultValue;
        }
        if (initial || (settings.value !== undefined && settings.value !== previousValues.get(input))) {
          if (input.value.trim() && (multiple || !controls(node).some(other => other !== input && filled(other)))) freeAnswers.add(input);
          else freeAnswers.delete(input);
        }
        initialized.add(input);
        previousValues.set(input, settings.value);
      }
    }
    paint();
    const focus = questions[current()]?.node;
    if (focus && (pendingFocus === activeName || (previous !== undefined && previous !== activeName))) {
      pendingFocus = undefined;
      focus.focus({ preventScroll: true });
    }
  } };
}

function messageScroller(root: HTMLElement, signal: AbortSignal): Behavior {
  const win = root.ownerDocument.defaultView!;
  let viewport: HTMLElement | null = null;
  let content: HTMLElement | null = null;
  let bindings: AbortController | undefined;
  let sizeObserver: ResizeObserver | undefined;
  let config: Inputs = {};
  let frame = 0;
  let initial = true;
  let pinnedToEnd = true;
  let anchor: { row: HTMLElement; offset: number } | undefined;
  let lastRow: HTMLElement | undefined;
  let lastMessageAnchor: HTMLElement | undefined;
  let activeMessageAnchor: HTMLElement | undefined;
  let tail: HTMLElement | undefined;

  const rows = () => content ? all(content, 'MessageScroller.Item') : [];
  const threshold = () => typeof config.scrollEdgeThreshold === 'number' ? Math.max(0, config.scrollEdgeThreshold) : 8;
  const atEnd = () => !viewport || viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= threshold();
  const setScroll = (position: number, behavior: ScrollBehavior = 'instant') => viewport?.scrollTo({ top: position, behavior });
  const locateAnchor = () => {
    if (!viewport) return;
    const top = viewport.getBoundingClientRect().top;
    const row = rows().find(row => row.getBoundingClientRect().bottom > top);
    anchor = row ? { row, offset: row.getBoundingClientRect().top - top } : undefined;
  };
  function paint() {
    if (!viewport) return;
    pinnedToEnd = atEnd();
    const atStart = viewport.scrollTop <= threshold();
    for (const button of all<HTMLButtonElement>(root, 'MessageScroller.Button')) {
      const options = propsOf(button);
      const direction = options.direction === 'start' ? 'start' : 'end';
      const active = direction === 'end' ? !pinnedToEnd : !atStart;
      button.dataset.direction = direction;
      button.dataset.active = String(active);
      button.tabIndex = active ? (typeof options.tabindex === 'number' ? options.tabindex : 0) : -1;
      if (active) button.removeAttribute('aria-hidden');
      else button.setAttribute('aria-hidden', 'true');
      if (!button.textContent?.trim() && !button.children.length && options['aria-label'] === undefined) {
        button.setAttribute('aria-label', direction === 'end' ? 'Scroll to end' : 'Scroll to start');
        button.dataset.vsScrollIcon = '';
      } else delete button.dataset.vsScrollIcon;
      if (options.variant === 'default') button.dataset.variant = 'primary';
    }
    locateAnchor();
  }

  function anchorPosition(row: HTMLElement) {
    if (!viewport || !content) return 0;
    const margin = typeof config.scrollMargin === 'number' ? config.scrollMargin : 0;
    const peek = typeof config.scrollPreviousItemPeek === 'number' ? config.scrollPreviousItemPeek : 64;
    const bounds = viewport.getBoundingClientRect();
    return row.getBoundingClientRect().top - bounds.top + viewport.scrollTop - margin - peek;
  }

  function resizeTail() {
    const last = rows().at(-1);
    if (!viewport || !content || !activeMessageAnchor || !content.contains(activeMessageAnchor) || !last) {
      if (tail) tail.hidden = true;
      return;
    }
    if (!tail) {
      tail = root.ownerDocument.createElement('div');
      tail.setAttribute('aria-hidden', 'true');
      content.append(tail);
    }
    const bottom = last.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top + viewport.scrollTop;
    const gap = parseFloat(win.getComputedStyle(content).rowGap) || 0;
    const height = Math.max(0, anchorPosition(activeMessageAnchor) + viewport.clientHeight - bottom - gap);
    tail.className = ['vs-message-tail', propsOf(content).spacerClassName].filter(value => typeof value === 'string' && value).join(' ');
    tail.hidden = height === 0;
    tail.style.height = `${height}px`;
  }

  function positionAnchor(row: HTMLElement) {
    activeMessageAnchor = row;
    resizeTail();
    setScroll(anchorPosition(row));
  }

  function layout() {
    frame = 0;
    if (!viewport || !content || !viewport.clientHeight || signal.aborted) return;
    const items = rows();
    if (items.length === 0) { paint(); return; }
    const marked = [...items].reverse().find(row => propsOf(row).scrollAnchor === true);
    if (!initial) resizeTail();
    if (initial) {
      initial = false;
      if (config.defaultScrollPosition === 'last-anchor' && marked) positionAnchor(marked);
      else if (config.defaultScrollPosition === 'start') setScroll(0);
      else setScroll(viewport.scrollHeight);
    } else if (config.autoScroll === true && marked && lastRow !== items.at(-1) && marked !== lastMessageAnchor) {
      positionAnchor(marked);
    } else if (config.autoScroll === true && pinnedToEnd) {
      setScroll(viewport.scrollHeight);
    } else if (anchor?.row.isConnected && propsOf(viewport).preserveScrollOnPrepend !== false) {
      const offset = anchor.row.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      if (Math.abs(offset - anchor.offset) > 1) setScroll(viewport.scrollTop + offset - anchor.offset);
    }
    lastRow = items.at(-1);
    lastMessageAnchor = marked;
    paint();
  }
  const schedule = () => { if (!frame && !signal.aborted) frame = win.requestAnimationFrame(layout); };

  root.addEventListener('click', event => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(part('MessageScroller.Button'));
    if (!button || !viewport || event.defaultPrevented) return;
    const options = propsOf(button);
    const desired = options.behavior;
    const behavior = desired === 'instant' || desired === 'auto' ? desired : 'smooth';
    activeMessageAnchor = undefined;
    resizeTail();
    setScroll(options.direction === 'start' ? 0 : viewport.scrollHeight, behavior);
  }, { signal });
  return { sync() {
    const provider = root.closest<HTMLElement>(part('MessageScroller.Provider'));
    const nextConfig = provider ? propsOf(provider) : {};
    if (nextConfig.defaultScrollPosition !== config.defaultScrollPosition) initial = true;
    config = nextConfig;
    const nextViewport = find(root, 'MessageScroller.Viewport');
    const nextContent = nextViewport && find(nextViewport, 'MessageScroller.Content');
    if (nextViewport !== viewport || nextContent !== content) {
      bindings?.abort();
      sizeObserver?.disconnect();
      viewport = nextViewport;
      content = nextContent;
      activeMessageAnchor = undefined;
      tail = undefined;
      initial = true;
      if (viewport && content) {
        bindings = new AbortController();
        viewport.addEventListener('scroll', paint, { passive: true, signal: bindings.signal });
        sizeObserver = new ResizeObserver(schedule);
        sizeObserver.observe(viewport);
        sizeObserver.observe(content);
      }
    }
    schedule();
  }, dispose() {
    bindings?.abort();
    sizeObserver?.disconnect();
    win.cancelAnimationFrame(frame);
  } };
}

type Axis = 'vertical' | 'horizontal';
function scrollContainer(root: HTMLElement, send: Send, signal: AbortSignal): Behavior {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const viewport = root.querySelector<HTMLElement>('.vs-scroll-area-viewport')!;
  const content = root.querySelector<HTMLElement>('.vs-scroll-area-content')!;
  const corner = doc.createElement('div');
  corner.className = 'vs-scroll-area-corner';
  root.append(corner);
  const id = uniqueId();
  let rootId = id;
  let direction: 'ltr' | 'rtl' = root.matches(':dir(rtl)') ? 'rtl' : 'ltr';
  const service = new VanillaMachine(scrollArea.machine, () => ({
    id, dir: direction, ids: { root: rootId }, getRootNode: () => root.getRootNode() as Document | ShadowRoot,
  }));
  const tracks = new Map<Axis, { track: HTMLElement; thumb: HTMLElement; marker?: HTMLElement }>();
  const bindings = new Map<HTMLElement, () => void>();
  let frame = 0;
  let settings: Inputs = {};
  let started = false;
  let hideTimer = 0;
  function bind(element: HTMLElement, props: Attrs) {
    bindings.set(element, spreadProps(element, props, id));
  }
  function paint() {
    frame = 0;
    if (signal.aborted || !started) return;
    const api = scrollArea.connect(service.service, normalizeProps);
    bind(root, { ...api.getRootProps(), id: rootId, role: typeof settings.role === 'string' ? settings.role : undefined });
    bind(viewport, {
      ...api.getViewportProps(), tabindex: api.hasOverflowX || api.hasOverflowY ? 0 : undefined, role: undefined,
      style: { overflowX: tracks.has('horizontal') ? 'auto' : 'hidden', overflowY: tracks.has('vertical') ? 'auto' : 'hidden' },
    });
    bind(content, api.getContentProps());
    bind(corner, api.getCornerProps());
    for (const [orientation, { track, thumb, marker }] of tracks) {
      const trackProps = api.getScrollbarProps({ orientation });
      const force = marker && propsOf(marker).forceMount === true;
      track.hidden = !force && api.getScrollbarState({ orientation }).hidden;
      bind(track, trackProps);
      bind(thumb, api.getThumbProps({ orientation }));
    }
  }
  const schedule = () => { if (!frame && !signal.aborted) frame = win.requestAnimationFrame(paint); };
  const unsubscribe = service.subscribe(schedule);
  const hideDelay = () => typeof settings.scrollHideDelay === 'number' ? settings.scrollHideDelay : 600;
  root.addEventListener('pointerenter', () => {
    if (root.dataset.vsScrollMode !== 'hover') return;
    win.clearTimeout(hideTimer);
    root.dataset.vsHovering = '';
  }, { signal });
  root.addEventListener('pointerleave', () => {
    if (root.dataset.vsScrollMode !== 'hover') return;
    win.clearTimeout(hideTimer);
    hideTimer = win.setTimeout(() => { delete root.dataset.vsHovering; }, hideDelay());
  }, { signal });
  const markScrolling = () => {
    if (root.dataset.vsScrollMode === 'scroll') {
      root.dataset.vsScrolling = '';
      win.clearTimeout(hideTimer);
      hideTimer = win.setTimeout(() => { delete root.dataset.vsScrolling; }, 100 + hideDelay());
    }
    send('scroll', { type: 'scroll' });
  };
  viewport.addEventListener('scroll', markScrolling, { signal, passive: true });

  return { sync(inputs) {
    const previousDir = direction;
    const previousId = rootId;
    settings = inputs;
    rootId = typeof inputs.id === 'string' && inputs.id ? inputs.id : id;
    direction = inputs.dir === 'rtl' || root.matches(':dir(rtl)') ? 'rtl' : 'ltr';
    if (started && (direction !== previousDir || rootId !== previousId)) service.updateProps({ dir: direction, ids: { root: rootId } });
    const mode = typeof inputs.type === 'string' ? inputs.type : 'hover';
    if (mode !== root.dataset.vsScrollMode) {
      win.clearTimeout(hideTimer);
      root.dataset.vsScrollMode = mode;
      delete root.dataset.vsScrolling;
      root.toggleAttribute('data-vs-hovering', mode === 'hover' && root.matches(':hover'));
    }
    const requested = new Map<Axis, HTMLElement | undefined>();
    if (inputs.orientation !== 'horizontal') requested.set('vertical', undefined);
    if (inputs.orientation === 'horizontal' || inputs.orientation === 'both') requested.set('horizontal', undefined);
    for (const marker of all(content, 'ScrollArea.Scrollbar')) {
      marker.hidden = true;
      const axis = propsOf(marker).orientation === 'horizontal' ? 'horizontal' : 'vertical';
      requested.set(axis, marker);
    }
    for (const [orientation, track] of tracks) if (!requested.has(orientation)) {
      for (const node of [track.track, track.thumb]) {
        bindings.get(node)?.();
        bindings.delete(node);
      }
      track.track.remove();
      tracks.delete(orientation);
    }
    for (const [orientation, marker] of requested) {
      let entry = tracks.get(orientation);
      if (!entry) {
        const track = doc.createElement('div');
        const thumb = doc.createElement('div');
        thumb.className = 'vs-scroll-area-thumb';
        track.append(thumb);
        root.insertBefore(track, corner);
        entry = { track, thumb };
        tracks.set(orientation, entry);
      }
      if (marker) entry.marker = marker;
      else delete entry.marker;
      const classes = marker ? propsOf(marker).class : inputs[orientation === 'horizontal' ? 'scrollbarXClasses' : 'scrollbarYClasses'];
      entry.track.className = ['vs-scroll-area-scrollbar', classes].filter(value => typeof value === 'string' && value).join(' ');
    }
    if (!started) {
      started = true;
      paint();
      service.start();
    }
    schedule();
  }, dispose() {
    unsubscribe();
    service.stop();
    for (const dispose of bindings.values()) dispose();
    bindings.clear();
    win.cancelAnimationFrame(frame);
    win.clearTimeout(hideTimer);
  } };
}

function selectScroll(content: HTMLElement, signal: AbortSignal): Behavior {
  const win = content.ownerDocument.defaultView!;
  let viewport: HTMLElement | null = null;
  let buttons: HTMLElement[] = [];
  let observer: ResizeObserver | undefined;
  let frame = 0;
  let timer = 0;
  const stop = () => { win.clearTimeout(timer); timer = 0; };
  const open = () => content.getAttribute('aria-hidden') === 'false';
  function update() {
    frame = 0;
    if (!viewport) return;
    const scroll = viewport.scrollTop;
    const max = viewport.scrollHeight - viewport.clientHeight;
    for (const button of buttons) button.hidden = !open() || (button.dataset.direction === 'up' ? scroll <= 1 : scroll >= max - 1);
  }
  const schedule = () => { if (!frame && !signal.aborted) frame = win.requestAnimationFrame(update); };
  function start(button: HTMLElement) {
    if (!viewport || timer || button.hidden || !open()) return;
    const direction = button.dataset.direction === 'up' ? -1 : 1;
    const tick = () => {
      if (!viewport || button.hidden || !open()) { stop(); return; }
      const before = viewport.scrollTop;
      const row = viewport.querySelector<HTMLElement>('[role="option"].active, [role="option"][aria-selected="true"]')
        ?? viewport.querySelector<HTMLElement>('[role="option"]');
      viewport.scrollTop += (row?.offsetHeight || 24) * direction;
      if (viewport.scrollTop === before) { stop(); return; }
      schedule();
      timer = win.setTimeout(tick, 50);
    };
    timer = win.setTimeout(tick, 50);
  }
  const target = (event: Event) => (event.target as Element | null)?.closest<HTMLElement>('.vs-select-scroll-button');
  for (const type of ['pointerdown', 'pointermove'] as const) content.addEventListener(type, event => {
    const button = target(event);
    if (button) { if (type === 'pointerdown') event.preventDefault(); start(button); }
  }, { signal });
  content.addEventListener('pointerout', event => {
    const button = target(event);
    if (button && !button.contains(event.relatedTarget as Node | null)) stop();
  }, { signal });
  content.addEventListener('scroll', schedule, { capture: true, passive: true, signal });
  const visibility = new MutationObserver(() => { if (!open()) stop(); schedule(); });
  visibility.observe(content, { attributes: true, attributeFilter: ['aria-hidden'] });
  return { sync() {
    buttons = [...content.querySelectorAll<HTMLElement>('.vs-select-scroll-button')];
    const next = content.querySelector<HTMLElement>('[role="listbox"]');
    content.classList.toggle('vs-select-with-scroll', !!buttons.length);
    if (viewport !== next) {
      observer?.disconnect();
      viewport = next;
      if (viewport) {
        observer = new ResizeObserver(schedule);
        observer.observe(viewport);
        observer.observe(content);
      }
    }
    schedule();
  }, dispose() {
    stop();
    visibility.disconnect();
    observer?.disconnect();
    win.cancelAnimationFrame(frame);
  } };
}

export function formScrollBehavior(name: string, element: HTMLElement, send: Send, signal: AbortSignal): Behavior | undefined {
  if (name === 'Questionnaire.Root') return questionnaire(element as HTMLFormElement, send, signal);
  if (name === 'MessageScroller.Root') return messageScroller(element, signal);
  if (name === 'ScrollArea.Root') return scrollContainer(element, send, signal);
  if (name === 'Select.Content') return selectScroll(element, signal);
}
