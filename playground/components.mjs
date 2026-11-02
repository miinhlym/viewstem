// These are playground-owned DOM adapters, never core defaults.
const string = { type: 'string' }, number = { type: 'number' }, boolean = { type: 'boolean' };
const value = (schema, fallback) => ({ kind: 'Value', schema, ...(fallback === undefined ? {} : { default: fallback }) });
const definition = (id, spec) => ({ kind: 'Component', id, spec });
export const components = [
  definition('Stack', { ports: { gap: value(number, 16) }, slots: { default: {} } }),
  definition('Row', { ports: { gap: value(number, 12) }, slots: { default: {} } }),
  definition('Card', { ports: { title: value(string, '') }, slots: { header: {}, default: {}, footer: {} } }),
  definition('Text', { ports: { text: value(string, ''), tone: value({ enum: ['normal', 'muted', 'title'] }, 'normal') } }),
  definition('TextInput', { ports: { value: value(string, ''), label: value(string, '텍스트'), placeholder: value(string, '') }, events: { change: { schema: string } } }),
  definition('NumberInput', { ports: { value: value(number, 0), label: value(string, '숫자') }, events: { change: { schema: number } } }),
  definition('Checkbox', { ports: { value: value(boolean, false), label: value(string, '선택') }, events: { change: { schema: boolean } } }),
  definition('Button', { ports: { label: value(string, '실행'), disabled: value(boolean, false) }, events: { click: { schema: { type: 'object', additionalProperties: false } } } }),
  definition('Json', { ports: { value: value(true), label: value(string, '') } }),
];
export function display(value) {
  const stack = new WeakSet();
  const convert = (v, depth = 0) => {
    if (v === undefined) return { $type: 'missing' };
    if (typeof v === 'bigint') return { $type: 'bigint', value: String(v) };
    if (typeof v === 'function') return '[function]';
    if (!v || typeof v !== 'object') return v;
    if (depth > 20) return '[depth limit]';
    if (stack.has(v)) return '[circular]';
    stack.add(v);
    let result;
    if (typeof v.read === 'function' && typeof v.write === 'function') result = { $type: 'StateHandle', address: v.address };
    else if (typeof v.refresh === 'function' && typeof v.getSnapshot === 'function') result = { $type: 'QueryHandle' };
    else if (v instanceof Set) result = { $type: 'Set', values: [...v].map(x => convert(x, depth + 1)) };
    else if (v instanceof Map) result = { $type: 'Map', entries: [...v].map(pair => pair.map(x => convert(x, depth + 1))) };
    else if (Array.isArray(v)) result = v.map(x => convert(x, depth + 1));
    else result = Object.fromEntries(Object.entries(v).map(([key, x]) => [key, convert(x, depth + 1)]));
    stack.delete(v); return result;
  };
  const text = JSON.stringify(convert(value), null, 2);
  return text.length > 40000 ? `${text.slice(0, 40000)}\n… 표시 한도 초과 (40,000자)` : text;
}
export const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const place = (parent, nodes) => {
  // Reorder siblings around the retained focused subtree; moving that subtree
  // itself with insertBefore would drop focus and cancel native IME editing.
  const focused = nodes.find(node => node.parentNode === parent && node.contains(document.activeElement));
  let before = null;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node !== focused && (node.parentNode !== parent || node.nextSibling !== before)) parent.insertBefore(node, before);
    before = node;
  }
  const retained = new Set(nodes);
  for (const child of [...parent.children]) if (!retained.has(child)) child.remove();
};
export function createPreview(container, sendEvent) {
  const entries = new Map();
  function create(node) {
    const shell = element('div', 'preview-node');
    const notice = element('div', 'node-notice'); notice.hidden = true;
    const body = element('div', 'node-body'); shell.append(notice, body);
    const entry = { shell, body, notice, node, slots: {}, composing: false, trailingCompositionValue: null };
    shell.dataset.nodeId = node.id;
    shell.dataset.address = node.address;
    const addSlot = name => { const slot = element('div', `slot slot-${name}`); body.append(slot); entry.slots[name] = slot; };
    const send = (event, payload) => sendEvent(entry.node, event, payload);
    switch (node.componentRef) {
      case 'Stack': case 'Row':
        shell.classList.add(node.componentRef === 'Stack' ? 'preview-stack' : 'preview-row'); addSlot('default'); break;
      case 'Card':
        shell.classList.add('preview-card');
        entry.title = element('h3'); body.append(entry.title); addSlot('header'); addSlot('default'); addSlot('footer'); break;
      case 'Text': entry.text = element('p'); body.append(entry.text); break;
      case 'Json':
        entry.title = element('div', 'json-label'); entry.text = element('pre', 'preview-json'); body.append(entry.title, entry.text); break;
      case 'Button':
        entry.control = element('button', 'preview-button'); entry.control.type = 'button';
        entry.control.addEventListener('click', () => send('click', {})); body.append(entry.control); break;
      case 'TextInput': case 'NumberInput': case 'Checkbox': {
        const label = element('label', node.componentRef === 'Checkbox' ? 'preview-check' : 'preview-field');
        entry.label = element('span'); entry.control = element('input');
        entry.control.type = node.componentRef === 'TextInput' ? 'text' : node.componentRef === 'NumberInput' ? 'number' : 'checkbox';
        if (node.componentRef === 'NumberInput') entry.control.step = 'any';
        label.append(entry.label, entry.control); body.append(label);
        let compositionValue = '';
        const publishInput = () => {
          if (node.componentRef === 'Checkbox') send('change', entry.control.checked);
          else if (node.componentRef === 'NumberInput') { if (Number.isFinite(entry.control.valueAsNumber)) send('change', entry.control.valueAsNumber); }
          else send('change', entry.control.value);
        };
        entry.control.addEventListener('compositionstart', () => {
          entry.composing = true; compositionValue = entry.control.value; entry.trailingCompositionValue = null;
        });
        entry.control.addEventListener('compositionend', () => {
          entry.composing = false;
          if (entry.control.value !== compositionValue) publishInput();
          // Cancellation emits no change; apply any external value deferred during composition.
          else entry.control.value = String(entry.node.inputs?.value ?? '');
          entry.trailingCompositionValue = entry.control.value;
        });
        entry.control.addEventListener(node.componentRef === 'Checkbox' ? 'change' : 'input', event => {
          if (entry.composing || event.isComposing) return;
          // compositionend and the browser's final input describe the same edit.
          const duplicate = entry.trailingCompositionValue === entry.control.value;
          entry.trailingCompositionValue = null;
          if (!duplicate) publishInput();
        });
        if (node.componentRef === 'NumberInput') entry.control.addEventListener('blur', () => {
          entry.control.value = String(entry.node.inputs?.value ?? '');
          entry.trailingCompositionValue = null;
        });
        break;
      }
      default: entry.children = element('div', 'composed-children'); body.append(entry.children);
    }
    return entry;
  }
  function render(snapshot) {
    const used = new Set(); let visited = 0;
    const visit = node => {
      if (++visited > 3000) throw Error('미리보기는 최대 3,000개 노드까지 표시합니다.');
      // Unresolved when/repeat projections have no runtime address or lifetime.
      // Keep these diagnostics distinct; only real instances retain DOM across snapshots.
      const key = node.address === undefined ? node : `${node.address}:${node.generation}`;
      let entry = entries.get(key);
      if (!entry) { entry = create(node); entries.set(key, entry); }
      used.add(key); entry.node = node;
      const { body, notice, control } = entry, inputs = node.inputs ?? {};
      notice.hidden = node.status === 'ready';
      notice.textContent = node.status === 'error' ? `${node.id}: ${node.error?.code ?? '오류'}` : `${node.id}: 입력 대기`;
      entry.shell.dataset.status = node.status;
      body.inert = node.status !== 'ready';
      if (control) control.disabled = node.status !== 'ready' || Boolean(inputs.disabled);
      if (node.componentRef === 'Text') { entry.text.textContent = inputs.text ?? ''; entry.text.className = `preview-text tone-${inputs.tone ?? 'normal'}`; }
      if (node.componentRef === 'Json') { entry.title.textContent = inputs.label ?? ''; entry.text.textContent = display(inputs.value); }
      if (node.componentRef === 'Card') { entry.title.textContent = inputs.title ?? ''; entry.title.hidden = !inputs.title; }
      if (node.componentRef === 'Button') control.textContent = inputs.label ?? '실행';
      if (entry.label) {
        entry.label.textContent = inputs.label ?? '';
        if (control.type === 'checkbox') control.checked = Boolean(inputs.value);
        else {
          const desired = String(inputs.value ?? '');
          const numericDraft = control.type === 'number' && control === document.activeElement && (control.value === '' || control.valueAsNumber === inputs.value);
          // A value assignment would cancel the browser's live IME composition.
          if (!entry.composing && control.value !== desired && !numericDraft) {
            control.value = desired;
            entry.trailingCompositionValue = null;
          }
          control.placeholder = inputs.placeholder ?? '';
        }
      }
      if ('gap' in inputs) entry.body.style.setProperty('--node-gap', `${Math.min(80, Math.max(0, inputs.gap))}px`);
      for (const [name, slot] of Object.entries(entry.slots)) place(slot, (node.slots?.[name] ?? []).map(visit));
      if (entry.children) place(entry.children, (node.children ?? []).map(visit));
      return entry.shell;
    };
    place(container, snapshot.roots.map(visit));
    for (const [key, entry] of entries) if (!used.has(key)) { entry.shell.remove(); entries.delete(key); }
  }
  return { render, clear() { entries.clear(); container.replaceChildren(); } };
}
