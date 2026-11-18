import assert from 'node:assert/strict';
import test from 'node:test';
import { createRegistry, createRuntime, defineCodeAction, defineResourceSet } from '@viewstem/core';
import { Registry } from '../src/registry.mjs';
import { defineResourceSet as declareSet, orderedResourceSets } from '../src/resource-set.mjs';

const set = (id, input = {}) => defineResourceSet({ id, version: '1', ...input });
const type = (id, schema = { type: 'string' }) => ({ kind: 'Type', id, spec: { schema } });
const contract = (id, spec = {}) => ({ kind: 'Component', id, spec });
const action = (id, spec = {}) => ({ kind: 'Action', id, spec });
const binding = (id, implementation = {}) => ({ contract: contract(id), connectorId: 'test', implementation });
const throwsCode = (fn, code = 'INVALID_DEFINITION') => assert.throws(fn, error => error.code === code);

test('a diamond of explicitly declared sets publishes definitions and trusted implementations together', async t => {
  const title = type('Shared');
  const component = binding('Shared');
  component.contract.spec.ports = { name: { kind: 'Value', required: true, typeRef: 'Shared' } };
  const read = action('Shared', { output: { typeRef: 'Shared' } });
  let calls = 0;
  const common = set('common', { resources: [title], actions: [{ definition: read, implementation: () => { calls++; return 'label'; } }] });
  const left = set('left', { dependencies: [common] });
  const right = set('right', { dependencies: [common], components: [component] });
  const root = set('root', { dependencies: [left, right] });
  title.spec.schema.type = 'number';
  delete component.contract.spec.ports;
  assert.equal(Object.isFrozen(root.dependencies), true);
  assert.equal(root.dependencies[0], left);
  assert.equal(Object.isFrozen(common.resources[0].spec.schema), true);
  assert.equal(right.components[0].implementation, component.implementation);
  assert.equal(Object.isFrozen(component.implementation), false);

  const registry = createRegistry();
  assert.equal(registry.registerResourceSet(root).registerResourceSet(common), registry);
  assert.equal(calls, 0);
  assert.equal(registry.isCode('Component', 'Shared'), true);
  assert.equal(registry.get('Type', 'Shared').spec.schema.type, 'string');
  assert.deepEqual(registry.list().map(({ kind }) => kind).sort(), ['Action', 'Component', 'Type']);
  const runtime = createRuntime({ registry });
  t.after(() => runtime.dispose());
  const view = await runtime.createView({ render: { id: 'text', componentRef: 'Shared', inputs: { name: 'label' } } });
  assert.equal(await view.invokeAction({ actionRef: 'Shared' }), 'label');
  assert.equal(calls, 1);
});

test('a rejected dependency, code binding collision or invalid reference leaves no part of the candidate in the Registry', () => {
  const registry = createRegistry().registerResourceSet(set('existing', { components: [binding('Bound')] }));
  const cleanDependency = set('dep', { resources: [type('Unpublished')] });
  const code = { definition: action('Unpublished'), implementation() {} };
  const before = registry.list();
  for (const candidate of [
    set('root', { dependencies: [cleanDependency], actions: [code], components: [binding('Bound')] }),
    set('root', { dependencies: [cleanDependency], actions: [code, code] }),
    set('root', { dependencies: [cleanDependency], components: [binding('Twice'), binding('Twice')] }),
    set('root', { dependencies: [cleanDependency], actions: [{ ...code, definition: action('Unpublished', { output: { typeRef: 'Missing' } }) }] }),
  ]) {
    assert.throws(() => registry.registerResourceSet(candidate), error => ['INVALID_DEFINITION', 'REFERENCE_NOT_FOUND'].includes(error.code));
    assert.deepEqual(registry.list(), before);
    assert.equal(registry.isCode('Action', 'Unpublished'), false);
  }
  assert.throws(() => registry.registerResourceSet(set('existing', { version: '2' })), error =>
    error.code === 'INVALID_DEFINITION' && error.message.includes('(1, 2)'));
  throwsCode(() => registry.registerResourceSet(set('existing')));
  registry.registerResourceSet(set('root', { dependencies: [cleanDependency], actions: [code] }));
  assert.equal(registry.isCode('Action', 'Unpublished'), true);
});

test('the declaration boundary requires branded dependencies and rejects wrappers with invalid implementations', () => {
  const valid = set('valid');
  throwsCode(() => createRegistry().registerResourceSet({ ...valid }));
  throwsCode(() => set('bad', { dependencies: [{ ...valid }] }));
  throwsCode(() => set('', {}));
  throwsCode(() => set('bad', { version: '' }));
  throwsCode(() => set('bad', { actions: [{ definition: action('f'), implementation() {}, requires: ['host', 'host'] }] }));
  throwsCode(() => set('bad', { components: [{ contract: contract('X'), connectorId: 'test' }] }));
  const first = { id: 'first', dependencies: [] }, second = { id: 'second', dependencies: [first] };
  first.dependencies.push(second);
  assert.throws(() => orderedResourceSets(first), error => error.code === 'INVALID_DEFINITION' && error.message.endsWith('first → second → first'));
});

test('explicit Action replacement keeps existing snapshots on the old function and rejects changes to the contract', async t => {
  const base = action('save', {
    ports: { title: { kind: 'Value', typeRef: 'Label', required: true } }, output: { typeRef: 'Label' },
  });
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  const save = defineCodeAction({ definition: base, requires: ['storage', 'clock'] });
  const registry = createRegistry().registerResourceSet(set('base', {
    resources: [type('Label')], components: [binding('Leaf')],
    actions: [save.implement(async ({ inputs }) => {
      started.resolve();
      await release.promise;
      return `old ${inputs.title}`;
    })],
  }));
  const hostCapabilities = { clock: {}, storage: {} };
  const a = createRuntime({ registry, hostCapabilities }), b = createRuntime({ registry, hostCapabilities }), c = createRuntime();
  t.after(() => Promise.all([a.dispose(), b.dispose(), c.dispose()]));
  throwsCode(() => c.registry.get('Action', 'save'), 'REFERENCE_NOT_FOUND');
  const source = { render: { id: 'leaf', componentRef: 'Leaf' } };
  const oldView = await a.createView(source);
  const request = { actionRef: 'save', inputs: { title: 'T' } };
  const running = a.invokeAction(request);
  await started.promise;
  const newHandler = ({ inputs }) => `new ${inputs.title}`;
  registry.replaceResource({ action: save.implement(newHandler) });
  release.resolve();
  assert.equal(await running, 'old T');
  assert.equal(await a.invokeAction(request), 'new T');
  for (const [definition, requires, location] of [
    [action('save', { ...base.spec, ports: {} }), ['clock', 'storage'], '/ports/title'],
    [action('save', { ...base.spec, output: { schema: { type: 'number' } } }), ['clock', 'storage'], '/output'],
    [base, ['clock'], '/requires'],
  ]) {
    const candidate = defineCodeAction({ definition, requires }).implement(newHandler);
    assert.throws(() => registry.replaceResource({ action: candidate }), error =>
      error.code === 'TYPE_CONTRACT_MISMATCH' && error.location === location);
    assert.equal(await a.invokeAction(request), 'new T');
  }
  throwsCode(() => registry.replaceResource({ resource: action('save', { steps: [] }) }));
  throwsCode(() => registry.replaceResource({ resource: type('Unknown') }), 'REFERENCE_NOT_FOUND');
  assert.equal(await oldView.invokeAction(request), 'old T');
  assert.equal(await (await b.createView(source)).invokeAction(request), 'new T');
  await oldView.replace(source);
  assert.equal(await oldView.invokeAction(request), 'new T');
});

test('a code Action contract captures its definition and requirements before binding implementations', () => {
  const definition = action('original', { output: { schema: { type: 'number' } } });
  const requires = ['storage'];
  const contract = defineCodeAction({ definition, requires });
  definition.id = 'mutated';
  definition.spec.output.schema.type = 'string';
  requires.push('other');
  const first = contract.implement(() => 1);
  const second = contract.implement(() => 2);
  assert.equal(first.definition.id, 'original');
  assert.equal(second.definition, first.definition);
  assert.equal(Object.isFrozen(first.definition.spec.output.schema), true);
  assert.deepEqual(second.requires, ['storage']);
  assert.notEqual(second.implementation, first.implementation);
  throwsCode(() => contract.implement(null));
});

test('binding replacement is local to the new Registry and re-registering a dependency keeps the new binding', () => {
  const original = binding('Leaf');
  const base = declareSet({ id: 'base', version: '1', components: [original] });
  const registry = new Registry().registerResourceSet(base);
  const snapshot = registry.fork();
  const newer = binding('Leaf');
  registry.replaceResource({ component: newer });
  const replaced = registry.componentBinding('Leaf');
  registry.registerResourceSet(declareSet({ id: 'root', version: '1', dependencies: [base] }));
  assert.equal(registry.componentBinding('Leaf'), replaced);
  assert.equal(replaced.implementation, newer.implementation);
  assert.equal(snapshot.componentBinding('Leaf').implementation, original.implementation);
});
