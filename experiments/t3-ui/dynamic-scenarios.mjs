import { Registry, UIProbe, evaluate, mountDOM } from './ui-probe.mjs';
import { createValueEvaluator } from '../t2-http-boundary/value-expressions.mjs';
import { createActionBridge } from './action-bridge.mjs';
const path = value => ({ '@path': value }), call = (name, args) => ({ '@call': name, args });
const state = initial => ({ kind: 'State', schema: true, initial });
const valuePort = { kind: 'Value', schema: true };
const node = (id, componentRef, extra = {}) => ({ id, componentRef, ...extra });
const text = value => node('text', 'Text', { inputs: { value } });
const row = children => node('root', 'Row', { slots: { default: children } });
const resources = () => [
  { kind: 'Component', id: 'Text', spec: { ports: { value: valuePort } } },
  { kind: 'Component', id: 'Row', spec: { slots: { default: {} } } },
  { kind: 'Component', id: 'Button', spec: { ports: { value: valuePort }, events: { click: { schema: { type: 'object' } } } } },
  { kind: 'Action', id: 'record', spec: {} },
];
const adapters = { Text: { tag: 'span', text: 'value' }, Row: { layout: 'row' }, Button: { tag: 'button' } };
function setup(extra = [], options = {}) { return new UIProbe(new Registry([...resources(), ...extra], adapters), options); }
function canonical(value) { return value instanceof Set ? { set: [...value].map(canonical) } : value instanceof Map ? { map: [...value].map(([k, v]) => [k, canonical(v)]) }
  : Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, canonical(v)])) : value; }
const equal = (a, b) => { if (JSON.stringify(canonical(a)) !== JSON.stringify(canonical(b))) throw Error(`ASSERT ${JSON.stringify(canonical(a))} != ${JSON.stringify(canonical(b))}`); };
const ok = value => { if (!value) throw Error('ASSERT'); };
const code = error => error?.code ?? error?.message;
const rejects = (run, expected) => { try { run(); } catch (error) { if (!expected || code(error) === expected) return; throw Error(`ASSERT expected ${expected}, got ${code(error)}`); } throw Error(`ASSERT expected rejection ${expected}`); };

const array = ['zero']; array.extra = 'private'; array['01'] = 'private';
const commonScope = { ports: { label: 'B', nil: null, yes: true, number: 3, array, object: { length: 'data', '01': 'data', 'a/b': { '~key': 'escaped' } },
  returned: { '@call': 'not-registered', args: [] }, native: new Set([{ '@path': '/owner' }]), map: new Map([['x', { '@path': '/owner' }]]) } };
export const commonExpressions = [
  ['concat', call('concat', ['A', path('/ports/label')]), 'AB'], ['concat-empty', call('concat', []), ''],
  ['format', call('formatString', { value: '${/ports/label}:${/ports/nil}:${/ports/yes}:${/ports/number}' }), 'B:null:true:3'],
  ['format-dollar', call('formatString', { value: '$${/ports/label}:$$' }), '${/ports/label}:$'],
  ['pointer-escapes', path('/ports/object/a~1b/~0key'), 'escaped'], ['object-length', path('/ports/object/length'), 'data'], ['object-01', path('/ports/object/01'), 'data'],
  ['array-0', path('/ports/array/0'), 'zero'], ['array-length', path('/ports/array/length'), undefined, 'REFERENCE_NOT_FOUND'],
  ['array-extra', path('/ports/array/extra'), undefined, 'REFERENCE_NOT_FOUND'], ['array-01', path('/ports/array/01'), undefined, 'REFERENCE_NOT_FOUND'],
  ['array-negative', path('/ports/array/-1'), undefined, 'REFERENCE_NOT_FOUND'], ['array-fraction', path('/ports/array/0.5'), undefined, 'REFERENCE_NOT_FOUND'],
  ['array-outside', path('/ports/array/1'), undefined, 'REFERENCE_NOT_FOUND'], ['array-unsafe', path('/ports/array/9007199254740992'), undefined, 'REFERENCE_NOT_FOUND'],
  ['pointer-invalid', path('/ports/a~2b'), undefined, 'INVALID_EXPRESSION'], ['pointer-relative', path('ports/label'), undefined, 'INVALID_EXPRESSION'],
  ['missing-port', path('/ports/absent'), undefined, 'REFERENCE_NOT_FOUND'], ['missing-data', path('/ports/object/absent'), undefined, 'INPUT_NOT_READY'],
  ['prototype', path('/ports/object/toString'), undefined, 'INPUT_NOT_READY'], ['null-traversal', path('/ports/nil/a'), undefined, 'TYPE_MISMATCH'],
  ['scalar-traversal', path('/ports/label/a'), undefined, 'TYPE_MISMATCH'], ['set-traversal', path('/ports/native/size'), undefined, 'TYPE_MISMATCH'],
  ['map-traversal', path('/ports/map/x'), undefined, 'TYPE_MISMATCH'], ['native-set-not-syntax', path('/ports/native'), commonScope.ports.native],
  ['native-map-not-syntax', path('/ports/map'), commonScope.ports.map], ['returned-not-syntax', path('/ports/returned'), commonScope.ports.returned],
  ['native-original-set', commonScope.ports.native, commonScope.ports.native], ['native-original-map', commonScope.ports.map, commonScope.ports.map],
  ['escaped-once', { '@@path': '/owner', nested: { '@@@path': '/owner' } }, { '@path': '/owner', nested: { '@@path': '/owner' } }],
  ['ordinary-keys', { path: '/owner', call: 'concat' }, { path: '/owner', call: 'concat' }],
  ['nested', { value: [call('concat', ['A', 'B'])], omit: undefined }, { value: ['AB'] }],
  ['mixed', { '@path': '/ports/label', extra: true }, undefined, 'INVALID_EXPRESSION'],
  ['unknown-call', call('unknown', []), undefined, 'INVALID_EXPRESSION'], ['concat-type', call('concat', [1]), undefined, 'TYPE_MISMATCH'],
  ['format-object', call('formatString', { value: '${/ports/object}' }), undefined, 'TYPE_MISMATCH'],
  ['format-invalid', call('formatString', { value: '${/ports/label' }), undefined, 'INVALID_EXPRESSION'],
  ['blocked-owner', path('/owner/key'), undefined, 'REFERENCE_NOT_FOUND'], ['blocked-secrets', path('/secrets/token'), undefined, 'REFERENCE_NOT_FOUND'], ['blocked-auth', path('/auth/token'), undefined, 'REFERENCE_NOT_FOUND'],
];
export const dynamicLocations = ['node.inputs', 'when', 'repeat.items', 'repeat.key', 'on.inputs', 'emit.payload', 'State.initial'];
function location(location, expression) {
  const seed = location === 'when' ? true : location === 'repeat.items' ? [{ id: 'one' }] : 'seed';
  const calls = [], p = setup([], { action: (_name, inputs) => calls.push(inputs) });
  const spec = { states: { seed: state(seed) }, render: text('visible') };
  let read;
  if (location === 'node.inputs') { spec.render = text(expression); read = () => p.find('text')[0].inputs.value; }
  else if (location === 'when') { spec.render = row([node('target', 'Text', { when: expression })]); read = () => p.find('target').length === 1; }
  else if (location.startsWith('repeat.')) {
    spec.render = row([node('target', 'Text', { repeat: { items: location === 'repeat.items' ? expression : [{ id: 'one' }], as: 'item', key: location === 'repeat.key' ? expression : path('/repeat/item/id') } })]);
    read = () => location === 'repeat.items' ? p.find('target').map(instance => ({ id: JSON.parse(instance.address)[2][0][1][1] })) : JSON.parse(p.find('target')[0].address)[2][0][1][1];
  } else if (location === 'on.inputs') {
    spec.render = node('button', 'Button', { on: { click: { actionRef: 'record', inputs: { value: expression } } } }); read = () => { p.emit(p.find('button')[0], 'click', {}); return calls[0].value; };
  } else if (location === 'emit.payload') {
    const publisher = { kind: 'Component', id: 'Publisher', spec: { states: { seed: state(seed) }, events: { published: { schema: true } }, render: node('button', 'Button', { on: { click: { emit: 'published', payload: expression } } }) } };
    const q = setup([publisher], { action: (_name, inputs) => calls.push(inputs) });
    q.apply({ render: node('publisher', 'Publisher', { on: { published: { actionRef: 'record', inputs: { value: path('/event') } } } }) });
    q.emit(q.find('button')[0], 'click', {}); return calls[0].value;
  } else { spec.states.target = state(expression); read = () => p.viewStates.target; }
  p.apply(spec); return read();
}

export async function runDynamicScenarios(test) {
  const http = createValueEvaluator(() => {});
  for (const [id, expression, expected, expectedError] of commonExpressions) await test(`VALUE.common.${id}`, async () => {
    let sync, asyncValue, syncError, asyncError;
    try { sync = evaluate(expression, commonScope); } catch (error) { syncError = code(error); }
    try { asyncValue = await http(expression, { values: commonScope }); } catch (error) { asyncError = code(error); }
    equal([syncError, asyncError], [expectedError, expectedError]);
    if (!expectedError) { equal(sync, expected); equal(asyncValue, expected); }
  });
  for (const item of dynamicLocations) {
    await test(`MATRIX.${item}.path`, () => equal(location(item, path('/states/seed')), item === 'when' ? true : item === 'repeat.items' ? [{ id: 'one' }] : 'seed'));
    await test(`MATRIX.${item}.mixed`, () => rejects(() => location(item, { '@path': '/states/seed', extra: true }), 'INVALID_EXPRESSION'));
    for (const root of ['owner', 'secrets', 'auth']) await test(`MATRIX.${item}.blocked-${root}`, () => rejects(() => location(item, path(`/${root}/token`)), 'REFERENCE_NOT_FOUND'));
    await test(`MATRIX.${item}.pointer`, () => rejects(() => location(item, path('/states/a~2b')), 'INVALID_EXPRESSION'));
    await test(`MATRIX.${item}.call-type`, () => rejects(() => location(item, call('concat', [1])), 'TYPE_MISMATCH'));
    if (!['when', 'repeat.items'].includes(item)) {
      await test(`MATRIX.${item}.concat`, () => equal(location(item, call('concat', [path('/states/seed'), '-call'])), 'seed-call'));
      await test(`MATRIX.${item}.formatString`, () => equal(location(item, call('formatString', { value: '${/states/seed}-format' })), 'seed-format'));
    } else await test(`MATRIX.${item}.string-call-result-type`, () => rejects(() => location(item, call('concat', ['valid-string'])), item === 'when' ? 'WHEN_BOOLEAN' : 'REPEAT_ARRAY'));
  }
  await test('VALUE.current-scope-only-and-safe-errors', () => {
    const context = { owner: { key: 'hidden' }, secrets: { token: 'hidden' }, auth: { token: 'hidden' }, steps: {}, response: {}, slots: {}, states: { object: { owner: 'data' } } };
    for (const root of ['owner', 'secrets', 'auth', 'steps', 'response', 'slots']) rejects(() => evaluate(path(`/${root}`), context), 'REFERENCE_NOT_FOUND');
    equal(evaluate(path('/states/object/owner'), context), 'data');
    const hostile = { ports: new Proxy({}, { getOwnPropertyDescriptor() { throw Error('private exception text'); } }) };
    try { evaluate(path('/ports/value'), hostile); throw Error('expected failure'); } catch (error) { equal(error.code, 'INTERNAL_ERROR'); equal(error.message.includes('private exception text'), false); }
  });
  await test('INITIAL.own-ports-dependent-state-and-no-reinitialization', () => {
    const p = setup([], { ports: { seed: 'first' } });
    const spec = { ports: { seed: valuePort }, states: { a: state(path('/ports/seed')), b: state(call('concat', [path('/states/a'), '-B'])) }, render: text(path('/states/b')) };
    p.apply(spec); equal(p.viewStates.b, 'first-B'); p.ports.seed = 'second'; p.apply(spec); equal(p.viewStates.b, 'first-B');
  });
  await test('INITIAL.component-ports-update-preserves-initial-remove-readd-reinitializes', () => {
    const box = { kind: 'Component', id: 'Box', spec: { ports: { value: valuePort }, states: { own: state(path('/ports/value')) }, render: text(path('/states/own')) } };
    const p = setup([box], { ports: { value: 'first', active: true } });
    const spec = { ports: { value: valuePort, active: { kind: 'Value', schema: { type: 'boolean' } } }, render: row([node('box', 'Box', { when: path('/ports/active'), inputs: { value: path('/ports/value') } })]) };
    p.apply(spec); equal(p.find('text')[0].inputs.value, 'first'); p.ports.value = 'second'; p.apply(spec); equal(p.find('text')[0].inputs.value, 'first');
    p.ports.active = false; p.apply(spec); p.ports.active = true; p.apply(spec); equal(p.find('text')[0].inputs.value, 'second');
  });
  await test('INITIAL.port-default-is-literal-returned-data-not-reexecuted', () => {
    const literal = { '@path': '/owner' };
    const box = { kind: 'Component', id: 'Box', spec: { ports: { value: { ...valuePort, default: literal } }, states: { own: state(path('/ports/value')) }, render: text(path('/states/own')) } };
    const p = setup([box]); p.apply({ render: node('box', 'Box') }); equal(p.find('text')[0].inputs.value, literal);
  });
  await test('INITIAL.missing-null-undefined-and-cycles', () => {
    const p = setup(); p.apply({ states: { missing: { kind: 'State', schema: { type: 'string' } }, nil: state(null) }, render: text('visible') });
    equal(Object.hasOwn(p.viewStates, 'missing'), true); equal(p.viewStates.missing, undefined); equal(p.viewStates.nil, null);
    rejects(() => setup().apply({ states: { bad: state(undefined) }, render: text('visible') }));
    rejects(() => setup().apply({ states: { a: state(path('/states/b')), b: state(path('/states/a')) }, render: text('visible') }), 'INVALID_DEFINITION');
  });
  await test('INITIAL.forward-dependencies-independent-of-declaration-order', () => {
    const declarations = { source: state('seed'), viaPath: state(path('/states/source')), viaFormat: state(call('formatString', { value: '${/states/viaPath}-format' })) };
    for (const names of [['viaFormat', 'viaPath', 'source'], ['source', 'viaPath', 'viaFormat']]) {
      const p = setup(); p.apply({ states: Object.fromEntries(names.map(name => [name, declarations[name]])), render: text(path('/states/viaFormat')) });
      equal(p.find('text')[0].inputs.value, 'seed-format'); equal(p.viewStates.viaPath, 'seed');
    }
  });
  await test('INITIAL.dynamic-format-template-forward-dependency-and-cycle', () => {
    const p = setup(); p.apply({ states: { result: state(call('formatString', { value: path('/states/template') })), template: state('${/states/source}-dynamic'), source: state('seed') }, render: text(path('/states/result')) });
    equal(p.find('text')[0].inputs.value, 'seed-dynamic');
    rejects(() => setup().apply({ states: { result: state(call('formatString', { value: path('/states/template') })), template: state('${/states/result}') }, render: text('visible') }), 'INVALID_DEFINITION');
  });
  await test('INITIAL.unknown-state-and-unready-dependent-state', () => {
    rejects(() => setup().apply({ states: { a: state(path('/states/unknown')) }, render: text('visible') }), 'REFERENCE_NOT_FOUND');
    rejects(() => setup().apply({ states: { empty: { kind: 'State', schema: true }, a: state(path('/states/empty')) }, render: text('visible') }), 'INPUT_NOT_READY');
    rejects(() => setup([], { ports: { secret: 'undeclared' } }).apply({ states: { a: state(path('/ports/secret')) }, render: text('visible') }));
  });
  await test('VALUE.slot-pointer-escaped-static-name', () => {
    const receiver = { kind: 'Component', id: 'Receiver', spec: { slots: { 'a/b': {} }, render: node('layout', 'Row', { slots: { default: path('/slots/a~1b') } }) } };
    const p = setup([receiver]); p.apply({ render: node('receiver', 'Receiver', { slots: { 'a/b': [text('slot-data')] } }) }); equal(p.find('text')[0].inputs.value, 'slot-data');
  });
  await test('K01.Component-ref-inline-same-input-contract-and-own-initial', () => {
    const body = { ports: { value: valuePort }, states: { own: state(path('/ports/value')) }, render: text(path('/states/own')) };
    const p = setup([{ kind: 'Component', id: 'Box', spec: body }]);
    p.apply({ states: { parent: state('parent') }, render: row([node('ref', 'Box', { inputs: { value: path('/states/parent') } }), { id: 'inline', component: body, inputs: { value: path('/states/parent') } }]) });
    equal(p.find('text').map(item => item.inputs.value), ['parent', 'parent']);
    for (const component of [{ componentRef: 'Box', component: body }, {}]) rejects(() => p.apply({ render: { id: 'bad', ...component } }), 'COMPONENT_XOR');
  });
  await test('K01.Component-ref-inline-no-ambient-parent-capture', () => {
    const body = { states: { own: state(path('/states/parent')) }, render: text(path('/states/own')) };
    rejects(() => setup([{ kind: 'Component', id: 'Box', spec: body }]), 'REFERENCE_NOT_FOUND');
    rejects(() => setup().apply({ states: { parent: state('parent') }, render: { id: 'box', component: body } }), 'REFERENCE_NOT_FOUND');
  });
  await test('A14.actual-action-idle-before-inputs-field-and-sibling-order-independent', async () => {
    for (const reverseFields of [false, true]) for (const reverseSiblings of [false, true]) {
      const bridge = createActionBridge([['check', { output: { schema: { type: 'boolean' } }, native: async () => false }]]);
      const handler = { click: { id: 'checkCall', actionRef: 'check' } };
      const buttonNode = node('button', 'Button', { inputs: { value: path('/actions/checkCall/status') } });
      const button = reverseFields ? { on: handler, ...buttonNode } : { ...buttonNode, on: handler };
      const status = text(path('/actions/checkCall/status'));
      const p = setup([{ kind: 'Action', id: 'check', spec: {} }], { actionSnapshots: bridge.snapshots, action: bridge.action });
      p.apply({ render: row(reverseSiblings ? [button, status] : [status, button]) }); equal(p.find('text')[0].inputs.value, 'idle');
      equal(p.find('button')[0].inputs.value, 'idle');
      const pending = p.emit(p.find('button')[0], 'click', {}); p.apply(p.view); equal(p.find('text')[0].inputs.value, 'running'); await pending;
      p.apply(p.view); equal(p.find('text')[0].inputs.value, 'success'); equal(bridge.snapshot('$view', 'checkCall').data, false); bridge.dispose();
    }
  });
  await test('A14.separate-owner-actions-id-data-and-explicit-inputs', async () => {
    const bridge = createActionBridge([['produce', { output: { schema: { type: 'string' } }, native: () => 'result' }], ['consume', { ports: { value: { kind: 'Value', schema: { type: 'string' }, required: true } }, output: { schema: { type: 'string' } }, native: ({ inputs }) => inputs.value }]]);
    const widget = { kind: 'Component', id: 'Widget', spec: { render: row([
      node('produce', 'Button', { on: { click: { id: 'producer', actionRef: 'produce' } } }),
      node('consume', 'Button', { on: { click: { id: 'consumer', actionRef: 'consume', inputs: { value: path('/actions/producer/data') } } } }), text(path('/actions/producer/status')),
    ]) } };
    const p = setup([widget, { kind: 'Action', id: 'produce', spec: {} }, { kind: 'Action', id: 'consume', spec: {} }], { actionSnapshots: bridge.snapshots, action: bridge.action });
    p.apply({ render: row([node('A', 'Widget'), node('B', 'Widget')]) });
    await p.emit(p.find('produce')[0], 'click', {}); p.apply(p.view); equal(p.find('text').map(item => item.inputs.value), ['success', 'idle']);
    await p.emit(p.find('consume')[0], 'click', {}); const ownerKey = p.find('consume')[0].authorContext.owner.key;
    equal(bridge.snapshot(ownerKey, 'consumer').data, 'result'); equal(bridge.snapshot(p.find('consume')[1].authorContext.owner.key, 'producer').data, null); bridge.dispose();
  });
}

export async function runDynamicDOM(test, container) {
  await test('DOM.VALUE.concat-format-and-initial-visible', () => {
    const p = setup([], { ports: { seed: 'Hello' } }); p.apply({ ports: { seed: valuePort }, states: { title: state(call('concat', [path('/ports/seed'), '-initial'])) }, render: text(call('formatString', { value: '${/states/title}:$$' })) });
    mountDOM(p, container); equal(container.textContent, 'Hello-initial:$'); return { text: container.textContent };
  });
  await test('DOM.A14.actual-action-snapshots-visible-in-own-UI', async () => {
    let release; const pending = new Promise(resolve => { release = resolve; });
    const bridge = createActionBridge([['check', { output: { schema: { type: 'boolean' } }, native: () => pending }]]);
    const p = setup([{ kind: 'Action', id: 'check', spec: {} }], { actionSnapshots: bridge.snapshots, action: bridge.action });
    const spec = { render: row([text(path('/actions/call/status')), node('button', 'Button', { on: { click: { id: 'call', actionRef: 'check' } } })]) };
    p.apply(spec); mountDOM(p, container); equal(container.textContent, 'idle'); const observed = [container.textContent];
    const call = p.emit(p.find('button')[0], 'click', {}); p.apply(spec); mountDOM(p, container); equal(container.textContent, 'running'); observed.push(container.textContent);
    release(false); await call; p.apply(spec); mountDOM(p, container); equal(container.textContent, 'success'); observed.push(container.textContent); bridge.dispose(); return { observed };
  });
}
