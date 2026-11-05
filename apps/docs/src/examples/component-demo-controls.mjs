/** @typedef {{value: string, label: string}} Option */
/** @typedef {{id: string, label: string, description: string, kind: 'text'|'boolean'|'select'|'number', value: string|number|boolean, path: string[], reference: string, options?: Option[], min?: number, max?: number, step?: number}} DemoControl */

export const controlFamilies = Object.freeze(['button', 'input', 'checkbox', 'switch', 'slider', 'tabs', 'dialog', 'sonner']);

/** Find exactly one component by its public ref and, when needed, its semantic inputs. */
function component(view, ref, predicate = () => true) {
  const matches = [];
  function visit(node, path) {
    if (!node || typeof node !== 'object') return;
    if (node.componentRef === `shadcn.${ref}` && predicate(node)) matches.push({ node, path });
    for (const [slot, children] of Object.entries(node.slots ?? {})) {
      children.forEach((child, index) => visit(child, [...path, 'slots', slot, String(index)]));
    }
  }
  visit(view.render, ['render']);
  if (matches.length !== 1) throw new Error(`Expected one ${ref} demo component, found ${matches.length}`);
  return matches[0];
}

/** @param {string} family @param {'en'|'ko'} locale @param {import('@viewstem/svelte').ViewSpec} view @returns {DemoControl[]} */
export function getDemoControls(family, locale, view) {
  if (!controlFamilies.includes(family)) return [];
  const t = (en, ko) => locale === 'ko' ? ko : en;
  const make = (id, label, description, kind, path, value, ref, extra = {}) => ({
    id, label, description, kind, path, value, reference: `#shadcn-${ref}-input-${id === 'initial' ? ({input:'value', checkbox:'checked', switch:'checked', slider:'value', tabs:'value'}[family]) : id.toLowerCase()}`, ...extra,
  });
  const input = (ref, key, fallback, predicate) => {
    const found = component(view, ref, predicate);
    return { path: [...found.path, 'inputs', key], value: found.node.inputs?.[key] ?? fallback };
  };
  const initial = (ref, key) => {
    const found = component(view, ref);
    const binding = found.node.inputs?.[key]?.['@path'];
    const match = typeof binding === 'string' && /^\/states\/([^/]+)$/.exec(binding);
    if (!match || view.states?.[match[1]]?.kind !== 'State') throw new Error(`Expected State binding for ${ref}.${key}`);
    return { path: ['states', match[1], 'initial'], value: view.states[match[1]].initial };
  };
  const field = (id, label, description, kind, source, ref, extra) => make(id, label, description, kind, source.path, source.value, ref, extra);
  const disabled = (ref, predicate, anchor = family) => field('disabled', t('Disabled', '비활성화'), t('Disable this component.', '이 컴포넌트를 비활성화합니다.'), 'boolean', input(ref, 'disabled', false, predicate), anchor);
  const initialControl = (ref, key, kind, extra) => field('initial', t('Initial value', '초깃값'), t('Initial State value; the binding remains intact.', 'State 초깃값이며 바인딩은 유지됩니다.'), kind, initial(ref, key), family === 'tabs' ? 'tabs-root' : family, extra);
  switch (family) {
    case 'button': {
      const actionable = node => Boolean(node.on?.click);
      return [
        field('text', t('Text', '텍스트'), t('Label of the actionable button.', '동작 버튼의 텍스트입니다.'), 'text', input('Button', 'text', '', actionable), 'button'),
        field('variant', t('Variant', '변형'), t('Button appearance.', '버튼의 모양입니다.'), 'select', input('Button', 'variant', 'default', actionable), 'button', { options: ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'].map(value => ({value, label: value})) }),
        field('size', t('Size', '크기'), t('Size for a button with text.', '텍스트 버튼의 크기입니다.'), 'select', input('Button', 'size', 'default', actionable), 'button', { options: ['default', 'xs', 'sm', 'lg'].map(value => ({value, label: value})) }),
        disabled('Button', actionable),
      ];
    }
    case 'input': return [initialControl('Input', 'value', 'text'), field('placeholder', t('Placeholder', '안내 문구'), t('Text shown when empty.', '값이 비었을 때 표시합니다.'), 'text', input('Input', 'placeholder', ''), 'input'), disabled('Input')];
    case 'checkbox': return [initialControl('Checkbox', 'checked', 'boolean'), disabled('Checkbox')];
    case 'switch': return [initialControl('Switch', 'checked', 'boolean'), disabled('Switch')];
    case 'slider': return [initialControl('Slider', 'value', 'number', {min: 0, max: 100, step: 5}), disabled('Slider')];
    case 'tabs': return [initialControl('Tabs.Root', 'value', 'select', {options: [{value: 'summary', label: t('Summary', '요약')}, {value: 'activity', label: t('Activity', '활동')}]}), {...disabled('Tabs.Trigger', node => node.inputs?.value === 'activity', 'tabs-trigger'), label: t('Disable Activity tab', '활동 탭 비활성화'), description: t('Disable the Activity trigger without removing its content.', '활동 탭의 콘텐츠는 유지하고 선택 버튼을 비활성화합니다.')} ];
    case 'dialog': return [
      field('text', t('Title', '제목'), t('Dialog title text.', '대화상자 제목입니다.'), 'text', input('Dialog.Title', 'text', ''), 'dialog-title'),
      field('description', t('Description', '설명'), t('Dialog description text.', '대화상자 설명입니다.'), 'text', input('Dialog.Description', 'text', ''), 'dialog-description'),
    ].map(control => control.id === 'description' ? {...control, reference: '#shadcn-dialog-description-input-text'} : control);
    case 'sonner': return [field('position', t('Position', '위치'), t('Toast position in the browser window.', '브라우저 화면에서 알림이 나타날 위치입니다.'), 'select', input('Sonner', 'position', 'bottom-right'), 'sonner', {options: ['bottom-left', 'bottom-center', 'bottom-right'].map(value => ({value, label: value}))}), field('closeButton', t('Close button', '닫기 버튼'), t('Show a close button.', '닫기 버튼을 표시합니다.'), 'boolean', input('Sonner', 'closeButton', true), 'sonner')];
  }
  return [];
}
