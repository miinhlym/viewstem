// Editor projections only. Execution always receives the original ViewSpec shape.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const entries = value => object(value) ? Object.entries(value) : [];
const child = (base, key) => base + '/' + String(key).replaceAll('~', '~0').replaceAll('/', '~1');
export const sectionKinds = ['State', 'Derived', 'Query', 'Action', 'Component', 'Variable', 'Datasource'];

export function collectSections(view) {
  const sections = Object.fromEntries(sectionKinds.map(kind => [kind, []]));
  const seen = new Set();
  function add(kind, path, label) {
    const key = kind + ':' + path;
    if (seen.has(key)) return;
    seen.add(key);
    sections[kind].push({ kind, path, label });
  }
  function query(usage, path, label) {
    if (!object(usage)) return;
    add('Query', path, label);
    queryBody(usage.query, child(path, 'query'), label);
  }
  function queryBody(body, path, label) {
    if (!object(body)) return;
    for (const [name, source] of entries(body.sources)) {
      const sourcePath = child(child(path, 'sources'), name);
      if (!object(source)) continue;
      if ('query' in source || 'queryRef' in source) query(source, sourcePath, `${label} / ${name}`);
      else if ('datasource' in source || 'datasourceRef' in source) add('Datasource', sourcePath, `${label} / ${name}`);
    }
  }
  function steps(items, path, label) {
    if (!Array.isArray(items)) return;
    items.forEach((step, index) => {
      if (!object(step)) return;
      const stepPath = child(path, index);
      const stepLabel = `${label} / ${step.id ?? index + 1}`;
      if (['Action', 'Query', 'Variable'].includes(step.kind)) add(step.kind, stepPath, stepLabel);
      if (step.kind === 'Action') steps(step.spec?.steps, child(child(stepPath, 'spec'), 'steps'), stepLabel);
      if (step.kind === 'Query') queryBody(step.spec, child(stepPath, 'spec'), stepLabel);
      if (step.kind === 'If') {
        steps(step.then, child(stepPath, 'then'), stepLabel + ' / then');
        steps(step.else, child(stepPath, 'else'), stepLabel + ' / else');
      }
    });
  }
  function component(node, path) {
    if (!object(node)) return;
    const label = [node.inputs?.id, node.inputs?.text, node.id, node.componentRef].find(value => typeof value === 'string') ?? 'Component';
    add('Component', path, `${label} · ${node.componentRef ?? 'inline'}`);
    for (const [event, binding] of entries(node.on)) {
      if (!object(binding) || !('action' in binding || 'actionRef' in binding)) continue;
      const bindingPath = child(child(path, 'on'), event);
      add('Action', bindingPath, `${label} · ${event}`);
      steps(binding.action?.steps, child(child(bindingPath, 'action'), 'steps'), `${label} · ${event}`);
    }
    if (object(node.component)) definition(node.component, child(path, 'component'), label);
    for (const [name, children] of entries(node.slots)) {
      if (Array.isArray(children)) children.forEach((item, index) => component(item, child(child(child(path, 'slots'), name), index)));
    }
  }
  function definition(body, path, owner) {
    if (!object(body)) return;
    for (const [name, state] of entries(body.states)) {
      if (!object(state) || !['State', 'Derived'].includes(state.kind)) continue;
      const statePath = child(child(path, 'states'), name);
      const label = owner ? `${owner} / ${name}` : name;
      add(state.kind, statePath, label);
      if (state.kind === 'Derived' && object(state.variable)) add('Variable', child(statePath, 'variable'), label);
    }
    for (const [name, usage] of entries(body.queries)) query(usage, child(child(path, 'queries'), name), owner ? `${owner} / ${name}` : name);
    if (object(body.render)) component(body.render, child(path, 'render'));
  }
  definition(view, '', '');
  return sections;
}

function segments(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) throw Error('잘못된 JSON 위치입니다.');
  return pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}
export function readSection(view, pointer) {
  let value = view;
  for (const key of segments(pointer)) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw Error('선택한 항목이 없습니다. 전체 JSON을 확인하세요.');
    value = value[key];
  }
  return value;
}
export function replaceSection(view, pointer, replacement) {
  if (pointer === '') {
    if (!object(replacement)) throw Error('전체 ViewSpec은 JSON 객체여야 합니다.');
    return structuredClone(replacement);
  }
  // Validate the old path before cloning. Never create a missing branch or follow
  // inherited properties (including __proto__) while editing arbitrary JSON.
  readSection(view, pointer);
  const next = structuredClone(view);
  const keys = segments(pointer);
  const last = keys.pop();
  let parent = next;
  for (const key of keys) parent = parent[key];
  Object.defineProperty(parent, last, { value: structuredClone(replacement), enumerable: true, configurable: true, writable: true });
  return next;
}

export function createDefinitionDraft() {
  let view = {};
  let selection = { kind: 'all', path: '' };
  return {
    get selection() { return { ...selection }; },
    get sections() { return collectSections(view); },
    load(next, preferredKind = selection.kind) {
      view = replaceSection(view, '', JSON.parse(JSON.stringify(next)));
      this.select(preferredKind);
    },
    select(kind, path) {
      const items = collectSections(view)[kind];
      const item = items?.find(entry => entry.path === path) ?? items?.[0];
      selection = item ? { kind, path: item.path } : { kind: 'all', path: '' };
    },
    text() { return JSON.stringify(readSection(view, selection.path), null, 2); },
    commit(text) {
      const next = JSON.parse(text);
      view = replaceSection(view, selection.path, next);
      return structuredClone(view);
    },
  };
}
