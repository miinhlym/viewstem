import type { ExampleId, Locale } from './definitions';

export type ExampleFile = 'view' | 'resources' | 'inputs';
type Sources = Partial<Record<ExampleFile, string>>;
type Edit = (source: string, locale: Locale) => string;
type Solution = Partial<Record<ExampleFile, Edit>>;

const tr = (locale: Locale, en: string, ko: string) => locale === 'ko' ? ko : en;
const replace = (before: string | RegExp, after: string): Edit => source => source.replace(before, () => after);
const path = (value: string) => ({ '@path': value });
const quote = JSON.stringify;
const format = (value: unknown) => JSON.stringify(value, null, 2);

const solutions: Record<ExampleId, Solution> = {
  'issue-intake': { view: replace('size(title.trim()) > 0', 'size(title.trim()) >= 5') },
  'issue-queue': { resources: (source, locale) => replace(
    '"owner": ' + quote(tr(locale, 'Mina', '민아')),
    '"owner": ' + quote(tr(locale, 'Sam', '샘')),
  )(source, locale) },
  'service-overview': { view: replace('"requests": 58', '"requests": 68') },
  'first-view': { view: (source, locale) => {
    const view = JSON.parse(source);
    view.render.componentRef = 'shadcn.Alert.Root';
    view.render.inputs = { text: tr(locale, 'Trail closed after dark', '해가 지면 산책로를 닫습니다') };
    return format(view);
  } },
  'component-inputs': { view: replace('"disabled": true', '"disabled": false') },
  slots: { view: source => {
    const view = JSON.parse(source);
    const [header, body, footer] = view.render.slots.default;
    view.render.slots.default = [header, footer, body];
    return format(view);
  } },
  conditions: { view: replace('"when": false', '"when": true') },
  repeat: { view: (source, locale) => {
    const view = JSON.parse(source);
    const items = view.render.slots.default.find((node: { id: string }) => node.id === 'trail').repeat.items;
    items.push({ ...items[1], id: 'lake', name: tr(locale, 'Lakeside', '호숫가 코스') });
    return format(view);
  } },
  'view-inputs': { inputs: replace('"minutes": 35', '"minutes": 45') },
  'port-default': { inputs: (_, locale) => format({ language: tr(locale, 'Spanish', '스페인어') }) },
  'value-call': { inputs: replace('"start": "10:30"', '"start": "11:15"') },
  state: { view: replace('"initial": 42', '"initial": 90') },
  'set-state': { view: replace('"value": 750', '"value": 500') },
  'event-payload': { view: (source, locale) => source.replace(
    /"next": \{\s*"@path": "\/event\/value"\s*\}/, '"next": ' + quote(tr(locale, 'Guest', '손님')),
  ) },
  'conditional-ui': { view: replace(/"when": \{\s*"@path": "\/states\/enabled"\s*\}/, '"when": true') },
  derived: { view: replace('size(title)', 'size(title.trim())') },
  'state-reaction': { view: source => {
    const view = JSON.parse(source);
    view.reactions[0].value = 'A2';
    return format(view);
  } },
  'action-ref': { resources: replace('"value": 5', '"value": 3') },
  'action-branch': { view: replace(/"condition": \{\s*"@path": "\/ports\/accessible"\s*\}/, '"condition": true') },
  'action-assert': { view: replace(/"condition": \{\s*"@path": "\/ports\/confirmed"\s*\}/, '"condition": true') },
  'action-output': { resources: replace('"counter": "B"', '"counter": "D"') },
  'action-status': { view: replace(/"condition": \{\s*"@path": "\/ports\/closed"\s*\}/, '"condition": true') },
  'action-variable': { view: replace('int(packs) * 6', 'int(packs) * 8') },
  'query-result': { view: replace('"wind": 12', '"wind": 25') },
  'query-inputs': { view: replace('"departure": "14:40"', '"departure": "15:10"') },
  'query-ref': { resources: (source, locale) => source.replace('°C', tr(locale, 'degrees Celsius', ' 섭씨')) },
  'http-datasource': { view: replace('/sources/main/availability', '/sources/main/mediaRoom') },
  'query-on-click': { view: replace('"slot": "14:00"', '"slot": "16:30"') },
  'query-gate': { view: replace(/"executeWhen": \{\s*"@path": "\/states\/open"\s*\}/, '"executeWhen": true') },
  'refresh-query': { view: source => {
    const view = JSON.parse(source);
    view.queries.seats.refresh = false;
    return format(view);
  } },
  'query-polling': { view: replace('"intervalMs": 1500', '"intervalMs": 4000') },
  'query-concat': { view: source => {
    const view = JSON.parse(source);
    view.queries.scores.query.transform.steps[0].with = [];
    return format(view);
  } },
  'query-join': { view: replace('"book": "moon"', '"book": "missing"') },
  'query-sources': { view: source => {
    const view = JSON.parse(source);
    const transform = view.queries.schedule.query.transform;
    [transform.input, transform.steps[0].with[0]] = [transform.steps[0].with[0], transform.input];
    return format(view);
  } },
  'reusable-component': { resources: replace(/ · \$\{\/ports\/minutes\}(?: min|분)/, '') },
  'inline-component': { view: replace('"minimum": 5', '"minimum": 2') },
  'component-state': { resources: replace('"initial": 60', '"initial": 40') },
  'shared-state-port': { view: source => {
    const view = JSON.parse(source);
    const remote = view.render.slots.default.find((node: { id: string }) => node.id === 'remote');
    remote.inputs.level = path('/states/independent');
    return format(view);
  } },
  'forward-slot': { view: replace('08:00', '09:00') },
  'component-event': { view: replace('"room": "B"', '"room": "C"') },
  'variable-ref': { resources: replace('(plants + cells - 1) / cells', 'plants / cells') },
  'shared-type': {
    inputs: replace('"returnTrip": 20', '"returnTrip": 35'),
    resources: source => {
      const resources = JSON.parse(source);
      resources[0].spec.schema.enum.push(35);
      return format(resources);
    },
  },
};

export function getSolution(id: ExampleId, locale: Locale, sources: Sources): Sources {
  const solution: Sources = {};
  for (const file of ['view', 'resources', 'inputs'] as const) {
    const edit = solutions[id][file];
    if (!edit) continue;
    const initial = sources[file];
    if (initial === undefined) throw new Error(id + ' has no ' + file + '.json for its solution.');
    const updated = edit(initial, locale);
    if (updated === initial) throw new Error(id + ' solution does not change ' + file + '.json.');
    JSON.parse(updated);
    solution[file] = updated;
  }
  return solution;
}
