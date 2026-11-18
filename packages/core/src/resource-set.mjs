import { copy, freeze, name, object } from './definition.mjs';
import { fail } from './errors.mjs';

const declaredSets = new WeakSet();
const empty = Object.freeze([]);
const invalid = () => fail('INVALID_DEFINITION');

function dataFields(value, allowed) {
  const descriptors = Object.getOwnPropertyDescriptors(object(value));
  for (const key of Reflect.ownKeys(descriptors)) {
    const field = descriptors[key];
    if (!allowed.includes(key) || !field.enumerable || !Object.hasOwn(field, 'value')) invalid();
  }
}

function array(value, parse) {
  if (value === undefined) return empty;
  if (!Array.isArray(value)) invalid();
  const result = [];
  for (let index = 0; index < value.length; index++) {
    const field = Object.getOwnPropertyDescriptor(value, index);
    if (!field || !Object.hasOwn(field, 'value')) invalid();
    result.push(parse(field.value));
  }
  return Object.freeze(result);
}

export function assertResourceSet(set) {
  if (!declaredSets.has(set)) invalid();
  return set;
}

function actionContract(definition, names) {
  const snapshot = freeze(copy(definition));
  if (snapshot?.kind !== 'Action') invalid();
  const requires = array(names, name);
  if (new Set(requires).size !== requires.length) invalid();
  return { definition: snapshot, requires: Object.freeze([...requires].sort()) };
}

function bindAction(contract, implementation) {
  if (typeof implementation !== 'function') invalid();
  return Object.freeze({ ...contract, implementation });
}

export function defineCodeAction(input) {
  dataFields(input, ['definition', 'requires']);
  const contract = actionContract(input.definition, input.requires);
  return Object.freeze({ implement: implementation => bindAction(contract, implementation) });
}

export function codeActionEntry(entry) {
  dataFields(entry, ['definition', 'implementation', 'requires']);
  return bindAction(actionContract(entry.definition, entry.requires), entry.implementation);
}

export function componentBinding(entry) {
  dataFields(entry, ['contract', 'connectorId', 'implementation']);
  const contract = freeze(copy(entry.contract));
  if (contract?.kind !== 'Component' || entry.implementation === undefined) invalid();
  return Object.freeze({ contract, connectorId: name(entry.connectorId), implementation: entry.implementation });
}

export function defineResourceSet(input) {
  dataFields(input, ['id', 'version', 'dependencies', 'resources', 'actions', 'components']);
  const set = Object.freeze({
    id: name(input.id),
    version: name(input.version),
    dependencies: array(input.dependencies, assertResourceSet),
    resources: array(input.resources, definition => freeze(copy(definition))),
    actions: array(input.actions, codeActionEntry),
    components: array(input.components, componentBinding),
  });
  declaredSets.add(set);
  return set;
}

export function replacementEntry(entry) {
  dataFields(entry, ['resource', 'action', 'component']);
  const keys = Object.keys(entry);
  if (keys.length !== 1) invalid();
  if (keys[0] === 'action') {
    const action = codeActionEntry(entry.action);
    return { definition: action.definition, codeKind: 'Action', action };
  }
  if (keys[0] === 'component') {
    const component = componentBinding(entry.component);
    return { definition: component.contract, codeKind: 'Component', component };
  }
  return { definition: freeze(copy(entry.resource)), codeKind: undefined };
}

export function orderedResourceSets(root) {
  const active = new Set();
  const done = new Set();
  const result = [];
  function visit(set) {
    if (active.has(set)) {
      const path = [...active, set].map(item => item.id).join(' → ');
      fail('INVALID_DEFINITION', { message: `Resource set dependency cycle: ${path}` });
    }
    if (done.has(set)) return;
    active.add(set);
    for (const dependency of set.dependencies) visit(dependency);
    active.delete(set);
    done.add(set);
    result.push(set);
  }
  visit(root);
  return result;
}
