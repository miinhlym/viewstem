import { Registry, UIProbe, gridLayout, mountDOM } from './ui-probe.mjs';
import { runDynamicScenarios, runDynamicDOM } from './dynamic-scenarios.mjs';

const path = value => ({ '@path': value });
const textPort = { kind: 'Value', schema: { type: ['string', 'number'] } };
const change = { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false };
export const adapters = {
  Row: { layout: 'row' }, Column: { layout: 'column' }, Grid: { layout: 'grid' },
  Text: { tag: 'span', text: 'text' }, Input: { tag: 'input', domEvent: 'change', event: 'change', payload: 'value' },
  Button: { tag: 'button', domEvent: 'click', event: 'click' },
};
const component = (id, spec) => ({ kind: 'Component', id, spec });
export const baseResources = () => [
  component('Row', { slots: { default: {} } }), component('Column', { slots: { default: {} } }),
  component('Grid', { slots: { default: {} }, ports: { layout: { kind: 'Value', schema: { type: 'object' } } } }),
  component('Text', { ports: { text: textPort } }),
  component('Input', { events: { change: { typeRef: 'Change' } } }),
  component('Button', { events: { click: { schema: { type: 'object', additionalProperties: false } } } }),
  { kind: 'Type', id: 'Change', spec: { schema: change } },
  { kind: 'Action', id: 'record', spec: {} },
  component('Counter', { states: { count: { kind: 'State', schema: { type: 'number' }, initial: 0 } },
    render: { id: 'inside', componentRef: 'Text', inputs: { text: path('/states/count') } } }),
  component('QueryCounter', { states: { count: { kind: 'State', schema: { type: 'number' }, initial: 0 } },
    queries: { data: { queryRef: 'query-spy' } }, render: { id: 'inside', componentRef: 'Text', inputs: { text: path('/states/count') } } }),
];
const node = (id, componentRef = 'Counter', extra = {}) => ({ id, componentRef, ...extra });
const row = (children, id = 'root') => node(id, 'Row', { slots: { default: children } });
const view = render => ({ render });
const repeat = (as = 'item') => ({ items: path('/states/items'), as, key: path(`/repeat/${as}/id`) });
function setup(extra = [], options = {}) { return new UIProbe(new Registry([...baseResources(), ...extra], adapters), options); }
function equal(actual, expected, message = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(`ASSERT ${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function ok(value, message = '') { if (!value) throw Error(`ASSERT ${message}`); }
function rejects(run, code) {
  try { run(); } catch (error) { if (!code || error.message.includes(code)) return; throw Error(`ASSERT expected ${code}, got ${error.message}`); }
  throw Error(`ASSERT expected rejection ${code ?? ''}`);
}
function itemsView(children, items) {
  return { states: { items: { kind: 'State', initial: items, schema: { type: 'array' } } }, render: row(children) };
}
const box = (id, address = id) => ({ id, address });
function position(placements, address) { const { row, column, rowSpan, columnSpan } = placements.get(address); return [row, column, rowSpan, columnSpan]; }

export async function runScenarios(test) {
  await test('U01.required-empty-optional-absent', () => {
    const receiver = component('Receiver', { slots: { body: { required: true }, footer: {} },
      render: node('layout', 'Row', { slots: { default: path('/slots/body') } }) });
    const p = setup([receiver]); p.apply(view(node('receiver', 'Receiver', { slots: { body: [] } })));
    equal(p.find('layout')[0].children, []);
    rejects(() => p.apply(view(node('receiver', 'Receiver'))), 'REQUIRED_SLOT');
  });
  await test('U01.unknown-and-array-item-slot-ref-rejected', () => {
    const p = setup();
    rejects(() => p.apply(view(node('r', 'Row', { slots: { body: [] } }))), 'UNKNOWN_SLOT');
    rejects(() => p.apply(view(row([path('/slots/body')]))), 'NODE');
  });
  await test('U02.slot-author-state-and-forwarding', () => {
    const resources = [component('Receiver', { states: { label: { kind: 'State', initial: 'receiver', schema: { type: 'string' } } },
      slots: { body: { required: true } }, render: node('r', 'Row', { slots: { default: path('/slots/body') } }) }),
    component('Forward', { slots: { body: { required: true } },
      render: node('receiver', 'Receiver', { slots: { body: path('/slots/body') } }) })];
    const p = setup(resources); p.apply({ states: { label: { kind: 'State', initial: 'author', schema: { type: 'string' } } },
      render: node('forward', 'Forward', { slots: { body: [node('text', 'Text', { inputs: { text: path('/states/label') } })] } }) });
    equal(p.find('text')[0].inputs.text, 'author');
    equal(p.find('text')[0].authorContext.owner.key, '$view');
  });
  await test('U03.multiple-slot-nodes-preserve-order', () => {
    const p = setup(); p.apply(view(row([node('a', 'Text', { inputs: { text: 'A' } }), node('b', 'Text', { inputs: { text: 'B' } })])));
    equal(p.roots[0].children.map(x => x.id), ['a', 'b']);
  });
  await test('U04.invalid-payload-zero-actions-and-input-isolation', () => {
    const calls = [], p = setup([], { action: (name, inputs) => calls.push([name, inputs]) });
    p.apply(view(node('input', 'Input', { on: { change: { actionRef: 'record', inputs: { text: path('/event/value') } } } })));
    const input = p.find('input')[0];
    class StateHandle { constructor() { this.value = 'state'; } }
    class QueryHandle { constructor() { this.value = 'query'; } }
    for (const payload of [{ value: 5 }, {}, { value: 'ok', extra: true }, null, { value: () => 'bad' },
      new StateHandle(), new QueryHandle(), { value: 'ok', state: new StateHandle() }]) rejects(() => p.emit(input, 'change', payload));
    equal(calls.length, 0);
    p.emit(input, 'change', { value: 'hello' }); equal(calls, [['record', { text: 'hello' }]]);
  });
  await test('U04.no-implicit-event-and-no-bubbling', () => {
    const calls = [], p = setup([], { action: (name, inputs) => calls.push(inputs) });
    p.apply(view(row([node('input', 'Input', { on: { change: { actionRef: 'record', inputs: {} } } })])));
    p.emit(p.find('input')[0], 'change', { value: 'unused' }); equal(calls, [{}]);
    rejects(() => p.emit(p.find('input')[0], 'other', {}), 'UNKNOWN_EVENT');
    const wrapper = component('Wrapper', { events: { change: { schema: change } }, render: node('inner', 'Input') });
    const q = setup([wrapper], { action: () => calls.push('bubbled') });
    q.apply(view(node('wrapper', 'Wrapper', { on: { change: { actionRef: 'record' } } })));
    q.emit(q.find('inner')[0], 'change', { value: 'not-forwarded' }); equal(calls, [{}]);
  });
  await test('U04.emit-validates-public-payload', () => {
    const publisher = component('Publisher', { events: { changed: { schema: change } }, render: node('i', 'Input', {
      on: { change: { emit: 'changed', payload: { value: path('/event/value') } } } }) });
    const calls = [], p = setup([publisher], { action: (name, inputs) => calls.push(inputs) });
    p.apply(view(node('publisher', 'Publisher', { on: { changed: { actionRef: 'record', inputs: { forwarded: path('/event/value') } } } })));
    p.emit(p.find('i')[0], 'change', { value: 'ok' }); equal(calls, [{ forwarded: 'ok' }]);
  });
  await test('U04.emit-invalid-payload-blocks-outer-action', () => {
    const publisher = component('Publisher', { events: { changed: { schema: change } }, render: node('i', 'Input', {
      on: { change: { emit: 'changed', payload: { value: 12 } } } }) });
    let calls = 0; const p = setup([publisher], { action: () => ++calls });
    p.apply(view(node('publisher', 'Publisher', { on: { changed: { actionRef: 'record' } } })));
    rejects(() => p.emit(p.find('i')[0], 'change', { value: 'ok' }), 'SCHEMA'); equal(calls, 0);
  });
  await test('U04.static-event-handler-and-schema-errors', () => {
    const p = setup();
    rejects(() => p.apply(view(node('i', 'Input', { when: false, on: { typo: { actionRef: 'record' } } }))), 'UNKNOWN_EVENT');
    rejects(() => p.apply(view(node('i', 'Input', { on: { change: { actionRef: 'record', emit: 'x' } } }))), 'HANDLER_XOR');
    rejects(() => setup([component('Bad', { events: { x: { schema: { type: 'string', unevaluatedProperties: false } } }, render: node('t', 'Text') })]));
  });
  await test('U05.when-false-skips-input-and-query', () => {
    let queries = 0; const p = setup([], { queryStarted: () => ++queries });
    p.apply(view(row([node('q', 'QueryCounter', { when: false }), node('text', 'Text', { when: false, inputs: { text: path('/states/absent') } })])));
    equal(p.find('q'), []); equal(p.find('text'), []); equal(queries, 0);
  });
  await test('U05.when-false-true-new-lifetime-external-state', () => {
    let queries = 0; const external = { selected: 'keep' }, p = setup([], { ports: { external }, queryStarted: () => ++queries });
    const v = active => ({ ports: { external: { kind: 'Value', schema: { type: 'object' } } }, render: row([node('q', 'QueryCounter', { when: active })]) });
    p.apply(v(true)); const first = p.find('q')[0]; first.states.count = 9;
    p.apply(v(false)); p.apply(v(true)); const next = p.find('q')[0];
    ok(first.generation !== next.generation); equal(next.states.count, 0); equal(external.selected, 'keep'); equal(queries, 2);
  });
  await test('U05.false-does-not-hide-static-reference-or-structure', () => {
    const p = setup();
    rejects(() => p.apply(view(row([node('bad', 'Missing', { when: false })]))), 'REFERENCE');
    rejects(() => p.apply(view(row([node('bad', 'Text', { when: false, inputs: { nope: 0 } })]))), 'UNKNOWN_INPUT');
    rejects(() => p.apply(view(row([node('bad', 'Text', { when: false, inputs: { text: { '@path': '/states/x', extra: 1 } } })]))), 'EXPRESSION');
  });
  await test('U05.strict-boolean', () => {
    const p = setup(); for (const when of [0, 1, '', 'false', null, []]) rejects(() => p.apply(view(row([node('x', 'Counter', { when })]))), 'WHEN_BOOLEAN');
  });
  await test('U06.reorder-preserves-state-remove-readd-new-lifetime', () => {
    const p = setup(), v = itemsView([node('card', 'Counter', { repeat: repeat() })], [{ id: 'a' }, { id: 'b' }]);
    p.apply(v); const first = p.find('card'); first[0].states.count = 7;
    p.viewStates.items = [{ id: 'b' }, { id: 'a' }]; p.apply(v);
    equal(p.find('card').map(x => x.generation), [first[1].generation, first[0].generation]); equal(p.find('card')[1].states.count, 7);
    p.viewStates.items = [{ id: 'b' }]; p.apply(v); p.viewStates.items = [{ id: 'a' }, { id: 'b' }]; p.apply(v);
    ok(p.find('card')[0].generation !== first[0].generation); equal(p.find('card')[0].states.count, 0);
  });
  await test('U06.keys-type-distinction-and-negative-zero', () => {
    const p = setup(), make = items => itemsView([node('c', 'Counter', { repeat: repeat() })], items);
    p.apply(make([{ id: '1' }, { id: 1 }])); equal(p.find('c').length, 2);
    const q = setup(); rejects(() => q.apply(make([{ id: -0 }, { id: 0 }])), 'DUPLICATE_KEY');
  });
  await test('U06.invalid-and-missing-key-rejected', () => {
    for (const id of [null, true, {}, [], undefined]) {
      const p = setup(); rejects(() => p.apply(itemsView([node('c', 'Counter', { repeat: repeat() })], [id === undefined ? {} : { id }])));
    }
    const p = setup(); rejects(() => p.apply(itemsView([node('c', 'Counter', { repeat: { ...repeat(), key: 1 / 0 } })], [{}])), 'REPEAT_KEY');
  });
  await test('U07.same-owner-row-move-preserves-state-and-inline-identity', () => {
    const p = setup(), make = move => view(row([row(move ? [] : [node('card')], 'left'), row(move ? [node('card')] : [], 'right')]));
    p.apply(make(false)); const first = p.find('card')[0]; first.states.count = 8; p.apply(make(true));
    equal(p.find('card')[0].generation, first.generation); equal(p.find('card')[0].states.count, 8);
    const inline = () => ({ id: 'inline', component: { states: { n: { kind: 'State', schema: { type: 'number' }, initial: 0 } }, render: node('inside', 'Text') } });
    const q = setup(), makeInline = move => view(row([row(move ? [] : [inline()], 'a'), row(move ? [inline()] : [], 'b')]));
    q.apply(makeInline(false)); const generation = q.find('inline')[0].generation; q.apply(makeInline(true)); equal(q.find('inline')[0].generation, generation);
  });
  await test('U07.definition-change-creates-new-instance', () => {
    const p = setup(); p.apply(view(node('same', 'Counter'))); const first = p.find('same')[0]; first.states.count = 12;
    p.apply(view(node('same', 'QueryCounter'))); ok(first.generation !== p.find('same')[0].generation); equal(p.find('same')[0].states.count, 0);
  });
  await test('U07.other-owner-move-creates-new-instance', () => {
    const owner = component('Owner', { ports: { active: { kind: 'Value', schema: { type: 'boolean' } } },
      render: row([node('card', 'Counter', { when: path('/ports/active') })]) });
    const p = setup([owner]), make = move => view(row([
      node('a', 'Owner', { inputs: { active: !move } }), node('b', 'Owner', { inputs: { active: move } }),
    ]));
    p.apply(make(false)); const first = p.find('card')[0]; first.states.count = 4;
    p.apply(make(true)); ok(first.generation !== p.find('card')[0].generation); equal(p.find('card')[0].states.count, 0);
    ok(first.authorContext.owner.key !== p.find('card')[0].authorContext.owner.key);
  });
  await test('U07.input-change-keeps-instance', () => {
    const p = setup(); p.apply(view(node('text', 'Text', { inputs: { text: 'before' } }))); const first = p.find('text')[0];
    p.apply(view(node('text', 'Text', { inputs: { text: 'after' } }))); equal(p.find('text')[0].generation, first.generation); equal(p.find('text')[0].inputs.text, 'after');
  });
  await test('U08.fixed-overlap-range-partial-and-positive-integer', () => {
    const declarations = [{ id: 'a' }, { id: 'b' }], active = [box('a'), box('b')];
    rejects(() => gridLayout(declarations, active, { a: { row: 1, column: 1 }, b: { row: 1, column: 1 } }), 'GRID_OVERLAP');
    for (const config of [{ columnSpan: 13 }, { row: 1, column: 12, columnSpan: 2 }]) rejects(() => gridLayout(declarations, active, { a: config }), 'GRID_RANGE');
    for (const config of [{ row: 1 }, { column: 1 }]) rejects(() => gridLayout(declarations, active, { a: config }), 'GRID_PARTIAL');
    for (const config of [{ rowSpan: 0 }, { columnSpan: 1.5 }, { rowSpan: '1' }, { rowSpan: -1 }]) rejects(() => gridLayout(declarations, active, { a: config }), 'GRID_INTEGER');
  });
  await test('U09.fixed-reserved-before-auto-regardless-of-source-order', () => {
    const placed = gridLayout([{ id: 'auto' }, { id: 'fixed' }], [box('auto'), box('fixed')],
      { auto: { columnSpan: 4 }, fixed: { row: 1, column: 1, columnSpan: 4 } });
    equal(position(placed, 'auto'), [1, 5, 1, 4]); equal(position(placed, 'fixed'), [1, 1, 1, 4]);
  });
  await test('U09.rectangle-search-checks-lower-row-and-no-dense-backfill', () => {
    const declarations = ['tall', 'fixed', 'small'].map(id => ({ id }));
    const placed = gridLayout(declarations, declarations.map(x => box(x.id)), {
      tall: { columnSpan: 4, rowSpan: 2 }, fixed: { row: 2, column: 3, columnSpan: 2 }, small: { columnSpan: 2 },
    });
    equal(position(placed, 'tall'), [1, 5, 2, 4]); equal(position(placed, 'small'), [1, 9, 1, 2]);
    // Empty row1 columns1-4 remain empty: the next small item does not return there.
  });
  await test('U09.repeat-expanded-order-default-span-and-repeat-fixed-rejected', () => {
    const declarations = [{ id: 'cards', repeat: {} }, { id: 'last' }];
    const placed = gridLayout(declarations, [box('cards', 'b'), box('cards', 'a'), box('last')], { cards: { columnSpan: 4 } });
    equal(['b', 'a', 'last'].map(id => position(placed, id)), [[1, 1, 1, 4], [1, 5, 1, 4], [2, 1, 1, 12]]);
    rejects(() => gridLayout(declarations, [], { cards: { row: 1, column: 1 } }), 'GRID_REPEAT_FIXED');
  });
  await test('U10.hidden-declaration-valid-no-space-unknown-key-rejected', () => {
    const p = setup(), make = layout => view(node('grid', 'Grid', { inputs: { layout }, slots: { default: [node('hidden', 'Counter', { when: false }), node('shown')] } }));
    p.apply(make({ hidden: { row: 1, column: 1 }, shown: { columnSpan: 4 } }));
    equal(position(p.find('grid')[0].placements, p.find('shown')[0].address), [1, 1, 1, 4]);
    rejects(() => p.apply(make({ unknown: {} })), 'GRID_UNKNOWN_ID');
  });
  await test('U10.grid-coordinate-change-preserves-child-state', () => {
    const p = setup(), make = column => view(node('grid', 'Grid', { inputs: { layout: { card: { row: 1, column, columnSpan: 4 } } }, slots: { default: [node('card')] } }));
    p.apply(make(1)); const first = p.find('card')[0]; first.states.count = 5; p.apply(make(5));
    equal(p.find('card')[0].generation, first.generation); equal(p.find('card')[0].states.count, 5);
  });
  await test('U11.unused-direct-cycle-register-error-query-zero', () => {
    let query = 0; rejects(() => setup([component('Unused', { queries: { x: {} }, render: node('self', 'Unused', { when: false }) })], { queryStarted: () => ++query }), 'COMPONENT_CYCLE');
    equal(query, 0);
  });
  await test('U11.unused-mutual-and-inline-cycle-rejected', () => {
    rejects(() => setup([component('A', { render: node('b', 'B') }), component('B', { render: node('a', 'A') })]), 'COMPONENT_CYCLE');
    rejects(() => setup([component('A', { render: { id: 'inline', component: { render: node('back', 'A') } } })]), 'COMPONENT_CYCLE');
  });
  await test('U11.acyclic-shared-child-and-kind-specific-registration', () => {
    const p = setup([component('A', { render: node('c', 'Counter') }), component('B', { render: node('c', 'Counter') }),
      { kind: 'Query', id: 'Counter', spec: {} }]);
    p.apply(view(row([node('a', 'A'), node('b', 'B')]))); equal(p.find('c').length, 2);
    rejects(() => setup([component('Counter', { render: node('r', 'Text') })]), 'DUPLICATE_RESOURCE');
  });
  await test('U12.duplicate-node-across-rows-even-hidden-rejected', () => {
    const p = setup(); rejects(() => p.apply(view(row([row([node('same')], 'a'), row([node('same', 'Counter', { when: false })], 'b')]))), 'DUPLICATE_NODE');
  });
  await test('U12.same-local-node-in-separate-components-independent', () => {
    const p = setup(); p.apply(view(row([node('a'), node('b')])));
    equal(p.find('inside').length, 2); p.find('a')[0].states.count = 3; equal(p.find('b')[0].states.count, 0);
    ok(p.find('inside')[0].address !== p.find('inside')[1].address);
  });
  await test('U12.action-alias-duplicate-in-owner-and-repeat-rejected', () => {
    const button = id => node(id, 'Button', { on: { click: { id: 'call', actionRef: 'record' } } });
    const p = setup(); rejects(() => p.apply(view(row([button('a'), row([button('b')], 'layout')]))), 'DUPLICATE_ACTION_ID');
    const q = setup(); rejects(() => q.apply(itemsView([{ ...button('b'), repeat: repeat() }], [{ id: 'a' }, { id: 'b' }])), 'DUPLICATE_ACTION_ID');
  });
  await test('U12.action-alias-separate-owner-and-projected-duplicate', () => {
    const widget = component('Widget', { render: node('button', 'Button', { on: { click: { id: 'call', actionRef: 'record' } } }) });
    const p = setup([widget]); p.apply(view(row([node('a', 'Widget'), node('b', 'Widget')]))); equal(p.find('button').length, 2);
    const double = component('Double', { slots: { body: {} }, render: row([
      node('left', 'Row', { slots: { default: path('/slots/body') } }), node('right', 'Row', { slots: { default: path('/slots/body') } }),
    ]) });
    const q = setup([double]); rejects(() => q.apply(view(node('d', 'Double', { slots: { body: [node('button', 'Button', { on: { click: { id: 'call', actionRef: 'record' } } })] } }))), 'DUPLICATE_ACTION_ID');
  });
  await test('U13.nested-repeat-parent-local-key-and-explicit-inputs', () => {
    const p = setup(), outer = node('outer', 'Row', { repeat: repeat('group'), slots: { default: [node('inner', 'Text', {
      repeat: { items: path('/repeat/group/items'), as: 'child', key: path('/repeat/child/id') },
      inputs: { text: path('/repeat/group/id') },
    })] } });
    p.apply(itemsView([outer], [{ id: 'A', items: [{ id: 1 }] }, { id: 'B', items: [{ id: 1 }] }]));
    equal(p.find('inner').map(x => x.inputs.text), ['A', 'B']); ok(p.find('inner')[0].address !== p.find('inner')[1].address);
    const q = setup(); q.apply(itemsView([node('card', 'Counter', { repeat: repeat() })], [{ id: 'x' }]));
    equal(q.find('inside')[0].authorContext.repeat, {});
  });
  await test('U13.both-alias-values-explicitly-available', () => {
    const pair = component('Pair', { ports: { outer: textPort, inner: textPort }, render: node('value', 'Text', { inputs: { text: path('/ports/inner') } }) });
    const p = setup([pair]); p.apply(itemsView([node('outer', 'Row', { repeat: repeat('group'), slots: { default: [node('pair', 'Pair', {
      repeat: { items: path('/repeat/group/items'), as: 'child', key: path('/repeat/child/id') },
      inputs: { outer: path('/repeat/group/id'), inner: path('/repeat/child/id') },
    })] } })], [{ id: 'A', items: [{ id: 1 }] }, { id: 'B', items: [{ id: 1 }] }]));
    equal(p.find('pair').map(x => x.inputs), [{ outer: 'A', inner: 1 }, { outer: 'B', inner: 1 }]);
  });
  await test('K21.repeat-key-before-when-and-hidden-input-query-zero', () => {
    let queries = 0; const p = setup([], { queryStarted: () => ++queries });
    const v = itemsView([node('card', 'QueryCounter', { repeat: repeat(), when: path('/repeat/item/visible') }),
      node('text', 'Text', { repeat: { ...repeat('label'), items: [] }, when: path('/states/absent') })], [{ id: 'a', visible: false }, { id: 'b', visible: true }]);
    p.apply(v); equal(p.find('card').length, 1); equal(queries, 1); equal(p.find('text'), []);
  });
  await test('K21.hidden-duplicate-full-key-pass-before-any-query', () => {
    let queries = 0; const p = setup([], { queryStarted: () => ++queries });
    rejects(() => p.apply(itemsView([node('card', 'QueryCounter', { repeat: repeat(), when: path('/repeat/item/visible') })],
      [{ id: 'a', visible: true }, { id: 'a', visible: false }])), 'DUPLICATE_KEY'); equal(queries, 0); equal(p.instances.size, 0);
  });
  await test('K21.hidden-dynamic-input-not-evaluated', () => {
    const p = setup(); p.apply(itemsView([node('text', 'Text', { repeat: repeat(), when: path('/repeat/item/visible'), inputs: { text: path('/repeat/item/text') } })],
      [{ id: 'a', visible: false }, { id: 'b', visible: true, text: 'visible' }])); equal(p.find('text').map(x => x.inputs.text), ['visible']);
  });
  await test('K21.nested-shadow-rejected-sibling-reuse-valid', () => {
    const p = setup(); rejects(() => p.apply(itemsView([node('outer', 'Row', { repeat: repeat(), slots: { default: [node('inner', 'Counter', { repeat: repeat() })] } })], [])), 'REPEAT_SHADOW');
    const q = setup(); q.apply(itemsView([node('a', 'Counter', { repeat: repeat() }), node('b', 'Counter', { repeat: repeat() })], [{ id: 1 }])); equal(q.find('a').length, 1); equal(q.find('b').length, 1);
  });
  await test('K21.repeat-root-and-nonarray-items-rejected', () => {
    const p = setup(); rejects(() => p.apply(view(node('x', 'Counter', { repeat: repeat() }))), 'REPEAT_ROOT');
    rejects(() => p.apply(view(row([node('x', 'Counter', { repeat: { ...repeat(), items: {} } })]))), 'REPEAT_ARRAY');
  });
  await test('UI.invalid-plan-preserves-tree-and-does-not-start-query', () => {
    let queries = 0; const p = setup([], { queryStarted: () => ++queries }); p.apply(view(node('old'))); const first = p.find('old')[0];
    rejects(() => p.apply(view(row([node('q', 'QueryCounter'), node('bad', 'Text', { inputs: { text: false } })]))), 'SCHEMA');
    equal(p.find('old')[0].generation, first.generation); equal(p.find('q'), []); equal(queries, 0);
  });
  await test('UI.removed-event-connection-rejected', () => {
    let calls = 0; const p = setup([], { action: () => ++calls }), v = active => view(row([node('i', 'Input', { when: active, on: { change: { actionRef: 'record' } } })]));
    p.apply(v(true)); const old = p.find('i')[0]; p.apply(v(false)); p.apply(v(true));
    rejects(() => p.emit(old, 'change', { value: 'late' }), 'REMOVED_CONNECTION'); equal(calls, 0);
  });
  await test('UI.inline-update-revalidates-own-static-tree', () => {
    const p = setup(), inline = children => view({ id: 'inline', component: { render: row(children) } });
    p.apply(inline([node('one', 'Text')]));
    rejects(() => p.apply(inline([node('same', 'Text'), node('same', 'Text', { when: false })])), 'DUPLICATE_NODE');
    equal(p.find('one').length, 1);
  });
  await test('UI.same-lifetime-event-reference-survives-layout-update', () => {
    let calls = 0; const p = setup([], { action: () => ++calls });
    const v = () => view(row([node('input', 'Input', { on: { change: { actionRef: 'record' } } })]));
    p.apply(v()); const old = p.find('input')[0]; p.apply(v()); p.emit(old, 'change', { value: 'ok' }); equal(calls, 1);
  });
  await runDynamicScenarios(test);
}

export async function runDOMScenarios(test, container) {
  await test('DOM.U02-U03.receiver-row-multiple-siblings-author-context', () => {
    const receiver = component('Receiver', { states: { label: { kind: 'State', initial: 'receiver', schema: { type: 'string' } } },
      slots: { body: { required: true } }, render: node('receiver-row', 'Row', { slots: { default: path('/slots/body') } }) });
    const p = setup([receiver]); p.apply({ states: { label: { kind: 'State', initial: 'author', schema: { type: 'string' } } },
      render: node('receiver', 'Receiver', { slots: { body: [node('a', 'Text', { inputs: { text: path('/states/label') } }), node('b', 'Text', { inputs: { text: 'B' } })] } }) });
    mountDOM(p, container); const rowElement = container.querySelector('[data-node="receiver-row"]');
    equal([...rowElement.children].map(x => x.dataset.node), ['a', 'b']); equal(rowElement.children[0].textContent, 'author');
    equal(getComputedStyle(rowElement).flexDirection, 'row');
    const [a, b] = [...rowElement.children].map(x => x.getBoundingClientRect()); ok(b.left >= a.right && a.top === b.top, 'actual horizontal sibling geometry');
    return { children: [...rowElement.children].map(x => x.dataset.node), text: rowElement.textContent,
      flexDirection: getComputedStyle(rowElement).flexDirection, geometry: [a, b].map(rect => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })) };
  });
  await test('DOM.U04.native-event-stays-in-adapter', () => {
    const calls = [], p = setup([], { action: (name, inputs) => calls.push(inputs) });
    p.apply(view(node('input', 'Input', { on: { change: { actionRef: 'record', inputs: { value: path('/event/value') } } } })));
    mountDOM(p, container); const input = container.querySelector('input'); input.value = 'typed'; input.dispatchEvent(new Event('change', { bubbles: true }));
    equal(calls, [{ value: 'typed' }]); rejects(() => p.emit(p.find('input')[0], 'change', new Event('change')), 'UNSUPPORTED_OBJECT'); equal(calls.length, 1);
    return { calls, nativeEventRejected: true };
  });
  await test('DOM.U05-U06.removal-reorder-and-new-generation-visible', () => {
    const p = setup(), v = itemsView([node('card', 'Counter', { repeat: repeat(), when: path('/repeat/item/visible') })], [{ id: 'a', visible: true }, { id: 'b', visible: true }]);
    p.apply(v); p.find('card')[0].states.count = 7; p.apply(v); mountDOM(p, container);
    const first = [...container.querySelectorAll('[data-node="card"]')].map(x => x.dataset.generation);
    p.viewStates.items.reverse(); p.apply(v); mountDOM(p, container);
    equal([...container.querySelectorAll('[data-node="card"]')].map(x => x.dataset.generation), [...first].reverse());
    equal([...container.querySelectorAll('[data-node="inside"]')].map(x => x.textContent), ['0', '7']);
    p.viewStates.items[1].visible = false; p.apply(v); mountDOM(p, container); equal(container.querySelectorAll('[data-node="card"]').length, 1);
    p.viewStates.items[1].visible = true; p.apply(v); mountDOM(p, container);
    ok(container.querySelectorAll('[data-node="card"]')[1].dataset.generation !== first[0]); equal(container.querySelectorAll('[data-node="inside"]')[1].textContent, '0');
    return { initialGenerations: first, finalGenerations: [...container.querySelectorAll('[data-node="card"]')].map(x => x.dataset.generation),
      finalText: [...container.querySelectorAll('[data-node="inside"]')].map(x => x.textContent) };
  });
  await test('DOM.U07.row-move-retains-core-state', () => {
    const p = setup(), v = move => view(row([row(move ? [] : [node('card')], 'left'), row(move ? [node('card')] : [], 'right')]));
    p.apply(v(false)); p.find('card')[0].states.count = 8; p.apply(v(false)); mountDOM(p, container);
    const generation = container.querySelector('[data-node="card"]').dataset.generation;
    p.apply(v(true)); mountDOM(p, container);
    equal(container.querySelector('[data-node="card"]').dataset.generation, generation);
    equal(container.querySelector('[data-node="right"] [data-node="inside"]').textContent, '8');
    return { generation, movedText: container.querySelector('[data-node="right"] [data-node="inside"]').textContent };
  });
  await test('DOM.U09-U10.grid-fixed-first-source-order-geometry', () => {
    const p = setup(); p.apply(view(node('grid', 'Grid', { inputs: { layout: { auto: { columnSpan: 4, rowSpan: 2 }, fixed: { row: 2, column: 3, columnSpan: 2 }, next: { columnSpan: 2 }, hidden: { row: 1, column: 1 } } },
      slots: { default: [node('auto', 'Text', { inputs: { text: 'auto' } }), node('fixed', 'Text', { inputs: { text: 'fixed' } }), node('next', 'Text', { inputs: { text: 'next' } }), node('hidden', 'Text', { when: false })] } })));
    mountDOM(p, container); const grid = container.querySelector('[data-node="grid"]'), children = [...grid.children];
    equal(children.map(x => x.dataset.node), ['auto', 'fixed', 'next']);
    const [a, f, n] = children.map(x => x.getBoundingClientRect()), g = grid.getBoundingClientRect();
    equal([a.left - g.left, a.top - g.top, a.width, a.height], [160, 0, 160, 60]);
    equal([f.left - g.left, f.top - g.top, f.width, f.height], [80, 30, 80, 30]);
    equal([n.left - g.left, n.top - g.top, n.width, n.height], [320, 0, 80, 30]);
    equal(container.querySelectorAll('[data-node="hidden"]').length, 0);
    return { domOrder: children.map(x => x.dataset.node), relativeGeometry: [a, f, n].map(rect => [rect.left - g.left, rect.top - g.top, rect.width, rect.height]) };
  });
  await test('DOM.U01.required-empty-does-not-create-wrapper-child', () => {
    const receiver = component('Empty', { slots: { body: { required: true } }, render: node('r', 'Row', { slots: { default: path('/slots/body') } }) });
    const p = setup([receiver]); p.apply(view(node('empty', 'Empty', { slots: { body: [] } }))); mountDOM(p, container);
    equal(container.querySelector('[data-node="r"]').childElementCount, 0);
    return { slotChildElementCount: container.querySelector('[data-node="r"]').childElementCount };
  });
  await test('DOM.U09.grid-repeat-expansion-and-slot-forwarded-ids', () => {
    const receiver = component('GridReceiver', { slots: { body: {} }, render: node('grid', 'Grid', {
      inputs: { layout: { card: { columnSpan: 4 }, fixed: { row: 1, column: 1, columnSpan: 4 } } }, slots: { default: path('/slots/body') },
    }) });
    const p = setup([receiver]); p.apply({ states: { items: { kind: 'State', initial: [{ id: 'B' }, { id: 'A' }], schema: { type: 'array' } } },
      render: node('receiver', 'GridReceiver', { slots: { body: [node('card', 'Text', { repeat: repeat(), inputs: { text: path('/repeat/item/id') } }), node('fixed', 'Text', { inputs: { text: 'F' } })] } }) });
    mountDOM(p, container); const grid = container.querySelector('[data-node="grid"]'), origin = grid.getBoundingClientRect();
    equal([...grid.children].map(x => x.textContent), ['B', 'A', 'F']);
    equal([...grid.children].map(x => x.getBoundingClientRect().left - origin.left), [160, 320, 0]);
    return { domTextOrder: [...grid.children].map(x => x.textContent), relativeLeft: [...grid.children].map(x => x.getBoundingClientRect().left - origin.left) };
  });
  await runDynamicDOM(test, container);
}
