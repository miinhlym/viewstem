import test from 'node:test';
import assert from 'node:assert/strict';
import { Registry, createRegistry } from '../src/registry.mjs';

const resource = (kind, id, spec) => ({ kind, id, spec });
const value = (schema = true, extra = {}) => ({ kind: 'Value', schema, ...extra });
const state = (extra = {}) => ({ kind: 'State', schema: { type: 'string' }, ...extra });
const query = (sources = {}, input = []) => ({ sources, transform: { input } });
const bad = (run, code = 'INVALID_DEFINITION') => assert.throws(run, error => error.code === code);
const text = () => resource('Component', 'Text', { ports: { text: value(true) }, events: { change: { schema: true } } });
function ui() { const registry = createRegistry(); registry.registerComponentContract(text()); registry.registerComponentContract(resource('Component', 'Box', { slots: { body: {} } })); return registry; }
const node = (id = 'text', extra = {}) => ({ id, componentRef: 'Text', ...extra });
const view = render => ({ render });

test('registration is atomic; kind/id is the exact identity and definitions are isolated', () => {
  const definition = resource('Type', 'same', { schema: { type: 'string' } });
  const registry = new Registry([definition]);
  definition.spec.schema.type = 'number';
  assert.equal(registry.get('Type', 'same').spec.schema.type, 'string');
  assert.ok(Object.isFrozen(registry.get('Type', 'same').spec.schema));
  registry.registerResources([resource('Variable', 'same', { expression: '1' })]);
  assert.equal(registry.list('Variable').length, 1);
  bad(() => registry.registerResources([resource('Type', 'new', { schema: true }), resource('Type', 'same', { schema: true })]));
  bad(() => registry.get('Type', 'new'), 'REFERENCE_NOT_FOUND');
  const exported = registry.exportResource('Type', 'same'); exported.spec.schema.type = 'number';
  assert.equal(registry.get('Type', 'same').spec.schema.type, 'string');
  const fork = registry.fork(); fork.registerResources([resource('Type', 'local', { schema: false })]);
  bad(() => registry.get('Type', 'local'), 'REFERENCE_NOT_FOUND');
});

test('envelopes and declarations are exact JSON and schema contracts are compiled', () => {
  for (const definition of [resource('Unknown', 'x', {}), { ...resource('Type', 'x', { schema: true }), metadata: {} }, resource('Type', '', { schema: true }), resource('Type', 'x', { schema: { format: 'date' } })]) bad(() => new Registry([definition]));
  const getter = { kind: 'Type', id: 'x', get spec() { assert.fail('accessor executed'); } };
  bad(() => new Registry([getter]));
  bad(() => new Registry([resource('Type', 'x', { schema: { const: undefined } })]));
  bad(() => new Registry([resource('Variable', 'x', { ports: { x: value(true, { typeRef: 't' }) }, expression: 'x' })]));
  bad(() => new Registry([resource('Variable', 'x', { ports: { x: { kind: 'State', schema: true } }, expression: 'x' })]));
  bad(() => new Registry([resource('Variable', 'x', { ports: null, expression: '1' })]));
});

test('type references resolve across an unordered atomic batch', () => {
  const registry = new Registry([
    resource('Variable', 'size', { ports: { items: { kind: 'Value', typeRef: 'list', required: true } }, expression: 'size(items)' }),
    resource('Type', 'list', { schema: { type: 'array', items: true } }),
  ]);
  assert.equal(registry.types().list.type, 'array');
  bad(() => new Registry([resource('Variable', 'missing', { ports: { x: { kind: 'Value', typeRef: 'none' } }, expression: 'x' })]), 'REFERENCE_NOT_FOUND');
});

test('CEL syntax and unresolved functions fail registration without execution', () => {
  bad(() => new Registry([resource('Variable', 'x', { expression: '1 +' })]));
  bad(() => new Registry([resource('Variable', 'x', { expression: 'unregistered(1)' })]));
});

test('Query traverses named sources, including unused and inline cycles', () => {
  bad(() => new Registry([resource('Query', 'x', query({ main: { queryRef: 'absent' } }))]), 'REFERENCE_NOT_FOUND');
  bad(() => new Registry([resource('Query', 'a', query({ main: { query: query({ nested: { queryRef: 'a' } }) } }))]));
  bad(() => new Registry([resource('Query', 'a', query({ x: { queryRef: 'b' } })), resource('Query', 'b', query({ x: { queryRef: 'a' } }))]));
  const registry = new Registry([resource('Query', 'child', query()), resource('Query', 'parent', query({ a: { queryRef: 'child' }, b: { queryRef: 'child' } }))]);
  assert.equal(registry.list().length, 2);
});

test('Query source XOR, explicit-null inputs and transform structure are validated', () => {
  for (const spec of [query([]), { ...query(), transform: { input: [], steps: null } }, { ...query(), transform: { steps: [] } }, query({ x: { query: query(), inputs: null } }), query({ x: { query: query(), request: {} } }), query({ x: { query: query(), queryRef: 'x' } }), { ...query(), transform: { input: [], steps: [{ kind: 'Join', mode: null, right: [], on: [{ left: 'a', right: 'a' }] }] } }]) bad(() => new Registry([resource('Query', 'x', spec)]));
  bad(() => new Registry([resource('Query', 'x', query({ child: { query: { ...query(), ports: { x: value(true, { required: true }) } } } }))]));
  new Registry([resource('Query', 'x', query({ child: { query: { ...query(), ports: { '@x': value(true, { required: true }) } }, inputs: { '@@x': 1 } } }))]);
  bad(() => new Registry([resource('Query', 'x', query({ x: { query: query(), inputs: { '@path': '/sources/sibling' } } }))]), 'REFERENCE_NOT_FOUND');
});

test('HTTP declarations check all dynamic fields, Login context and static header names', () => {
  const datasource = { kind: 'Http', baseUrl: 'https://example.test', secrets: { token: 'server-ref' }, headers: { Authorization: { '@call': 'concat', args: ['Bearer ', { '@path': '/secrets/token' }] } } };
  new Registry([resource('Datasource', 'api', datasource)]);
  bad(() => new Registry([resource('Datasource', 'api', { ...datasource, headers: { Host: null } })]));
  bad(() => new Registry([resource('Datasource', 'api', { ...datasource, baseUrl: { '@call': 'unknown', args: [] } })]), 'INVALID_EXPRESSION');
  bad(() => new Registry([resource('Datasource', 'api', { ...datasource, auth: { kind: 'Login', request: { method: 'POST', path: '/login' }, token: { '@path': '/secrets/token' } } })]), 'REFERENCE_NOT_FOUND');
  new Registry([resource('Datasource', 'api', { ...datasource, auth: { kind: 'Login', request: { method: 'POST', path: '/login' }, token: { '@path': '/response/body/token' } } })]);
});

test('native and declarative Action contracts share one registry identity', () => {
  const registry = new Registry(), native = () => 'ok';
  registry.registerAction(resource('Action', 'native', { output: { schema: { type: 'string' } } }), native);
  assert.equal(registry.implementation('Action', 'native'), native);
  assert.equal(registry.fork().isCode('Action', 'native'), true);
  bad(() => registry.registerResources([resource('Action', 'native', { steps: [] })]));
  bad(() => registry.registerAction(resource('Action', 'bad', { steps: [] }), native));
  bad(() => registry.registerAction(resource('Action', 'bad', { output: { schema: true, value: 1 } }), native));
  bad(() => registry.registerResources([resource('Action', 'bad', { steps: [], output: { schema: true } })]));
});

test('Action validates unused branch recursion, schema XOR and step targets', () => {
  bad(() => new Registry([resource('Action', 'a', { steps: [{ kind: 'If', condition: false, then: [{ kind: 'Action', spec: { steps: [{ kind: 'Action', actionRef: 'a' }] } }] }] })]));
  for (const spec of [{ steps: [], catch: [] }, { steps: [{ kind: 'Try' }] }, { steps: [{ kind: 'SetState', target: { '@path': '/ports/value' }, value: 1 }], ports: { value: value(true) } }, { steps: [{ kind: 'Query', queryRef: 'missing', spec: query() }] }]) bad(() => new Registry([resource('Action', 'a', spec)]));
  new Registry([resource('Action', 'a', { ports: { target: state() }, steps: [{ kind: 'SetState', target: { '@path': '/ports/target' }, value: 'ok' }] })]);
  bad(() => new Registry([resource('Action', 'a', { steps: [{ kind: 'Assert', condition: { '@path': '/steps/later' } }, { kind: 'Variable', id: 'later', spec: { expression: '1' } }] })]), 'REFERENCE_NOT_FOUND');
});

test('UI statically validates when:false, node scopes, root and nested repeat aliases', () => {
  const registry = ui();
  bad(() => registry.validateDefinition('View', view(node('hidden', { componentRef: 'missing', when: false }))), 'REFERENCE_NOT_FOUND');
  bad(() => registry.validateDefinition('View', view(node('root', { repeat: { items: [], as: 'x', key: 'x' } }))));
  bad(() => registry.validateDefinition('View', view({ id: 'root', componentRef: 'Box', slots: { body: [node('same'), node('same')] } })));
  bad(() => registry.validateDefinition('View', view({ id: 'root', componentRef: 'Box', slots: { body: [{ id: 'outer', componentRef: 'Box', repeat: { items: [], as: 'x', key: 'x' }, slots: { body: [node('inner', { repeat: { items: [], as: 'x', key: 'x' } })] } }] } })));
  registry.validateDefinition('View', view({ id: 'root', componentRef: 'Box', slots: { body: [node('a', { repeat: { items: [], as: 'x', key: 'x' } }), node('b', { repeat: { items: [], as: 'x', key: 'x' } })] } }));
});

test('Component cycles include inline definitions and do not reject shared DAG children', () => {
  const registry = ui();
  bad(() => registry.registerResources([resource('Component', 'a', { render: { id: 'root', component: { render: { id: 'back', componentRef: 'a' } } } })]));
  registry.registerResources([resource('Component', 'a', { render: node() }), resource('Component', 'b', { render: { id: 'root', componentRef: 'Box', slots: { body: [{ id: 'a', componentRef: 'a' }, { id: 'b', componentRef: 'a' }] } } })]);
});

test('slots, event handlers and inline actions use their actual contracts', () => {
  const registry = ui();
  bad(() => registry.validateDefinition('View', view(node('x', { slots: { unknown: [] } }))));
  bad(() => registry.validateDefinition('View', view(node('x', { on: { unknown: { action: { steps: [] } } } }))));
  bad(() => registry.validateDefinition('View', view(node('x', { on: { change: { actionRef: 'missing' } } }))), 'REFERENCE_NOT_FOUND');
  bad(() => registry.validateDefinition('View', view(node('x', { on: { change: { action: { steps: [], finally: [] } } } }))));
  registry.registerResources([resource('Component', 'forwarder', { slots: { body: { required: true } }, events: { change: { schema: true } }, render: { id: 'box', componentRef: 'Box', slots: { body: { '@path': '/slots/body' } } } })]);
  bad(() => registry.validateDefinition('View', view({ id: 'f', componentRef: 'forwarder' })));
  registry.validateDefinition('View', view({ id: 'f', componentRef: 'forwarder', slots: { body: [] } }));
});

test('State, Derived and reaction dependencies reject cycles and unknown roots', () => {
  const registry = ui();
  const spec = { states: { a: state({ initial: { '@path': '/states/b' } }), b: state({ initial: { '@path': '/states/a' } }) }, render: node() };
  bad(() => registry.validateDefinition('View', spec));
  bad(() => registry.validateDefinition('View', { states: { a: state({ initial: { '@path': '/queries/q/data' } }) }, render: node() }), 'REFERENCE_NOT_FOUND');
  const derived = { kind: 'Derived', schema: { type: 'string' }, variable: { ports: { x: value(true) }, expression: 'x' }, inputs: { x: { '@path': '/states/a' } } };
  bad(() => registry.validateDefinition('View', { states: { a: state(), b: derived }, reactions: [{ watch: [{ '@path': '/states/b' }], target: { '@path': '/states/a' }, value: 'reset' }], render: node() }));
  bad(() => registry.validateDefinition('View', { states: { a: state() }, reactions: [{ watch: [{ '@path': '/states/a' }], target: { '@path': '/states/a' }, value: 1 }], render: node() }));
  registry.validateDefinition('View', { states: { a: state({ initial: { '@call': 'concat', args: ['a', 'b'] } }) }, render: node() });
});

test('capability inputs require real writable cells and compatible contracts', () => {
  const registry = ui();
  registry.registerComponentContract(resource('Component', 'Editor', { ports: { selection: state({ required: true }) } }));
  bad(() => registry.validateDefinition('View', { states: { a: { kind: 'State', schema: { type: 'number' }, initial: 1 } }, render: { id: 'editor', componentRef: 'Editor', inputs: { selection: { '@path': '/states/a' } } } }), 'TYPE_CONTRACT_MISMATCH');
  bad(() => registry.validateDefinition('View', { render: { id: 'editor', componentRef: 'Editor', inputs: { selection: 'constant' } } }));
  registry.validateDefinition('View', { states: { a: state() }, render: { id: 'editor', componentRef: 'Editor', inputs: { selection: { '@path': '/states/a' } } } });
});

test('reference inventory traverses syntax positions, named sources and branch/inline definitions', () => {
  const registry = new Registry();
  const refs = registry.references('Query', query({ alpha: { queryRef: 'one' }, beta: { datasourceRef: 'http', request: {} }, gamma: { query: { ...query(), ports: { p: { kind: 'Value', typeRef: 'type' } } } } }, { queryRef: 'ordinary-data' }));
  assert.deepEqual(refs, [['Query', 'one'], ['Datasource', 'http'], ['Type', 'type']]);
  assert.deepEqual(registry.references('Action', { steps: [{ kind: 'If', then: [{ kind: 'Variable', variableRef: 'v' }], else: [{ kind: 'Action', spec: { steps: [{ kind: 'Query', queryRef: 'q' }] } }] }] }), [['Variable', 'v'], ['Query', 'q']]);
});


test('when:false preserves unevaluated dynamic input paths while validating syntax', () => {
  const registry = ui();
  registry.validateDefinition('View', view(node('hidden', { when: false, inputs: { text: { '@path': '/states/absent' } } })));
  bad(() => registry.validateDefinition('View', view(node('hidden', { when: false, inputs: { text: { '@path': '/states/absent', extra: true } } }))), 'INVALID_EXPRESSION');
});


test('Derived and reaction cycles include explicitly connected State ports', () => {
  const registry = ui();
  bad(() => registry.validateDefinition('View', {
    ports: { external: state() },
    states: { calculated: { kind: 'Derived', schema: { type: 'string' }, variable: { ports: { x: value({ type: 'string' }) }, expression: 'x' }, inputs: { x: { '@path': '/ports/external' } } } },
    reactions: [{ watch: [{ '@path': '/states/calculated' }], target: { '@path': '/ports/external' }, value: 'reset' }],
    render: node(),
  }));
});


test('nested Query inputs can forward the complete ports object', () => {
  new Registry([resource('Query', 'outer', { ports: { term: value({ type: 'string' }, { required: true }) }, sources: { child: { query: { ...query(), ports: { term: value({ type: 'string' }, { required: true }) } }, inputs: { '@path': '/ports' } } }, transform: { input: [] } })]);
});


test('trusted CEL function schemas and callbacks survive registry forks', () => {
  const functions = [{ name: 'plusOne', inputs: [{ type: 'number' }], output: { type: 'number' }, run: value => value + 1 }];
  const registry = createRegistry({ functions });
  registry.registerResources([resource('Variable', 'increment', { ports: { n: value({ type: 'number' }, { required: true }) }, expression: 'plusOne(n)' })]);
  assert.equal(registry.fork().functions[0].run, functions[0].run);
  assert.ok(Object.isFrozen(registry.functions));
  functions[0].inputs[0].type = 'string';
  assert.equal(registry.functions[0].inputs[0].type, 'number');
  bad(() => createRegistry({ functions: [{ name: 'bad', inputs: [], output: true }] }));
});

test('resource updates validate atomically, preserve implementations and existing snapshots', () => {
  const registry = ui();
  registry.registerResources([resource('Component', 'panel', { render: node('old', { inputs: { text: 'old' } }) })]);
  const snapshot = registry.fork();
  registry.updateResource(resource('Component', 'panel', { render: node('new', { inputs: { text: 'new' } }) }));
  assert.equal(snapshot.get('Component', 'panel').spec.render.id, 'old');
  assert.equal(registry.get('Component', 'panel').spec.render.id, 'new');
  bad(() => registry.updateResource(resource('Component', 'panel', { render: { id: 'bad', componentRef: 'missing' } })), 'REFERENCE_NOT_FOUND');
  assert.equal(registry.get('Component', 'panel').spec.render.id, 'new');
  const implementation = () => undefined;
  registry.registerAction(resource('Action', 'code', {}), implementation);
  registry.updateResource(resource('Action', 'code', { ports: { n: value({ type: 'number' }) } }));
  assert.equal(registry.implementation('Action', 'code'), implementation);
  assert.equal(registry.isCode('Action', 'code'), true);
});
