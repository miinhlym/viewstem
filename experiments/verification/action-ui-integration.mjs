// Private integration experiment, not Viewstem core, a renderer or a public API.
import assert from 'node:assert/strict';
import { ActionProbe } from '../t3-action/action-probe.mjs';
import { StateProbe } from '../t3-state/state-probe.mjs';
import { Registry, UIProbe } from '../t3-ui/ui-probe.mjs';
import { harness, report } from './report.mjs';

const { test: record, results } = harness();
// Bound failures even if an implementation stops settling cancellation promises.
const test = (id, run) => record(id, async () => {
  let timer;
  try { await Promise.race([run(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('TEST_TIMEOUT')), 3000); })]); }
  finally { clearTimeout(timer); }
});
const ref = path => ({ '@path': path });
const flush = async () => { for (let i = 0; i < 48; ++i) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const observed = promise => Promise.resolve(promise).then(value => ({ status: 'success', value }), error => ({ status: 'error', error }));
const cancelled = async promise => { const result = await promise; assert.equal(result.status, 'error'); assert.equal(result.error.code, 'CANCELLED'); };
const valuePort = schema => ({ kind: 'Value', schema });

function controlled() {
  const calls = [];
  return { calls, definition: {
    ports: { value: { ...valuePort(true), required: true } }, output: { schema: { type: 'string' } },
    native({ inputs, signal }) {
      const gate = deferred(); calls.push({ inputs, signal, gate });
      return gate.promise.then(value => value);
    },
  } };
}

// Reconcile only a successfully committed UI expansion. UIProbe's old A14
// bridge scans declarations and deliberately cannot cover when/repeat lifetimes.
// Inputs are refreshed per dispatch; they are excluded from connection identity.
function integrate(ui, engine, { resolveInputs = values => values } = {}) {
  const owners = new Map(), links = new Map(), dispatch = [];
  const keyOf = (instance, event, handler) => JSON.stringify([
    instance.authorContext.owner.key, instance.address, instance.generation, event,
    handler.id ?? null, handler.actionRef ?? null, handler.action ?? null,
  ]);
  const reconcile = () => {
    const liveOwners = new Set(['$view']), desired = new Map();
    for (const instance of ui.instances.values()) {
      liveOwners.add(instance.authorContext.owner.key);
      if (instance.spec.render) liveOwners.add(JSON.stringify([instance.address, instance.generation]));
      for (const [event, handler] of Object.entries(instance.source.on ?? {})) if (!handler.emit)
        desired.set(keyOf(instance, event, handler), { instance, handler });
    }
    // Remove first: reusing a local observation id must create a fresh connection.
    for (const [key, link] of links) if (!desired.has(key)) { link.connection.dispose(); links.delete(key); }
    for (const [key, owner] of owners) if (!liveOwners.has(key)) { owner.dispose(); owners.delete(key); }
    for (const [key, { instance, handler }] of desired) if (!links.has(key)) {
      const ownerKey = instance.authorContext.owner.key;
      if (!owners.has(ownerKey)) owners.set(ownerKey, engine.owner());
      const link = { values: {} };
      link.connection = engine.connect(owners.get(ownerKey), {
        ...(handler.id === undefined ? {} : { id: handler.id }),
        ...(handler.actionRef ? { actionRef: handler.actionRef } : { spec: handler.action }),
        inputs: () => link.values,
      });
      links.set(key, link);
    }
  };
  const originalApply = ui.apply, originalEmit = ui.emit, originalAction = ui.action;
  ui.apply = function (...args) { const tree = originalApply.apply(this, args); reconcile(); return tree; };
  // UIProbe's callback carries only owner/id/handler. Track the actual emitter,
  // including nested emit forwarding, to distinguish idless repeated instances.
  ui.emit = function (instance, event, payload) {
    const current = this.instances.get(instance.address) ?? instance;
    dispatch.push({ instance: current, event });
    try { return originalEmit.call(this, instance, event, payload); } finally { dispatch.pop(); }
  };
  ui.action = (_reference, values, { ownerKey, handler }) => {
    const frame = dispatch.at(-1); assert.ok(frame, 'dispatch must originate in UIProbe.emit');
    assert.equal(frame.instance.authorContext.owner.key, ownerKey);
    const link = links.get(keyOf(frame.instance, frame.event, handler)); assert.ok(link, 'committed connection');
    // Optional fixture-only capability binding: UIProbe accepts Value ports only.
    // This maps explicit host wiring to an actual StateProbe handle, without
    // adding State support or token interpretation to the shared UI model.
    link.values = resolveInputs(values, { instance: frame.instance, handler });
    return link.connection.invoke();
  };
  return {
    link(instance, event = 'press') {
      const current = ui.instances.get(instance.address); assert.ok(current);
      return links.get(keyOf(current, event, current.source.on[event])).connection;
    },
    dispose() {
      for (const owner of owners.values()) owner.dispose(); owners.clear(); links.clear();
      ui.apply = originalApply; ui.emit = originalEmit; ui.action = originalAction;
    },
  };
}

const button = (extra = {}) => ({ id: 'button', componentRef: 'Button', on: { press: { id: 'run', actionRef: 'hold', inputs: { value: ref('/event/value') } } }, ...extra });
const view = (children, ports = {}) => ({ ports, render: { id: 'root', componentRef: 'Row', slots: { default: children } } });
function fixture({ definitions, resources = [], adapters = {}, ports = {}, store = new StateProbe(), resolveInputs } = {}) {
  const hold = controlled(), engine = new ActionProbe({ store });
  const entries = definitions ?? [['hold', hold.definition]]; engine.register(entries);
  const registry = new Registry([
    { kind: 'Component', id: 'Row', spec: { slots: { default: {} } } },
    { kind: 'Component', id: 'Button', spec: { events: { press: { schema: true } } } },
    ...entries.map(([id]) => ({ kind: 'Action', id, spec: {} })), ...resources,
  ], { Row: { layout: 'row' }, Button: { tag: 'button' }, ...adapters });
  const ui = new UIProbe(registry, { ports }), bridge = integrate(ui, engine, { resolveInputs });
  return { ui, bridge, hold, close: () => bridge.dispose() };
}

await test('A12-A15-U05/UI-when-removal-recreated-local-id-rejects-late-result', async () => {
  const f = fixture({ ports: { visible: true } }), spec = view([button({ when: ref('/ports/visible') })], { visible: valuePort({ type: 'boolean' }) });
  try {
    f.ui.apply(spec); const old = f.ui.find('button')[0], firstLink = f.bridge.link(old);
    const first = observed(f.ui.emit(old, 'press', { value: 1 })); await flush();
    f.ui.ports.visible = false; f.ui.apply(spec); assert.equal(f.ui.find('button').length, 0);
    assert.equal(f.hold.calls[0].signal.aborted, true); await cancelled(first);
    f.ui.ports.visible = true; f.ui.apply(spec); const fresh = f.ui.find('button')[0], nextLink = f.bridge.link(fresh);
    assert.notEqual(fresh.generation, old.generation); assert.notEqual(nextLink, firstLink);
    assert.deepEqual(nextLink.snapshot(), { status: 'idle', running: false, data: null, error: null });
    const second = observed(f.ui.emit(fresh, 'press', { value: 2 })); await flush();
    f.hold.calls[1].gate.resolve('fresh'); assert.equal((await second).value, 'fresh');
    f.hold.calls[0].gate.resolve('stale'); await flush();
    assert.equal(nextLink.snapshot().data, 'fresh'); assert.equal(nextLink.snapshot().status, 'success');
    assert.throws(() => f.ui.emit(old, 'press', { value: 3 }), /REMOVED_CONNECTION/);
  } finally { f.close(); }
});

await test('A15/UI-on-removal-keeps-node-and-recreates-fresh-connection', async () => {
  const f = fixture();
  try {
    f.ui.apply(view([button()])); const node = f.ui.find('button')[0], link = f.bridge.link(node);
    const run = observed(f.ui.emit(node, 'press', { value: 1 })); await flush();
    f.ui.apply(view([button({ on: {} })])); const retained = f.ui.find('button')[0];
    assert.equal(retained.generation, node.generation); assert.equal(retained.states, node.states);
    assert.equal(f.hold.calls[0].signal.aborted, true); await cancelled(run);
    assert.equal(f.ui.emit(retained, 'press', { value: 2 }), undefined);
    f.ui.apply(view([button()])); const recreated = f.bridge.link(f.ui.find('button')[0]);
    assert.notEqual(recreated, link); assert.equal(recreated.snapshot().status, 'idle');
    f.hold.calls[0].gate.resolve('late'); await flush(); assert.equal(recreated.snapshot().data, null);
  } finally { f.close(); }
});

await test('A12-A15/UI-actionRef-replacement-keeps-node-and-renews-connection', async () => {
  const first = controlled(), replacement = controlled();
  const f = fixture({ definitions: [['hold', first.definition], ['replacement', replacement.definition]] });
  try {
    f.ui.apply(view([button()])); const before = f.ui.find('button')[0], previousLink = f.bridge.link(before);
    const previousRun = observed(f.ui.emit(before, 'press', { value: 1 })); await flush(); assert.equal(first.calls.length, 1);
    f.ui.apply(view([button({ on: { press: { id: 'run', actionRef: 'replacement', inputs: { value: ref('/event/value') } } } })]));
    const after = f.ui.find('button')[0], nextLink = f.bridge.link(after);
    assert.equal(after.id, before.id); assert.equal(after.authorContext.owner.key, before.authorContext.owner.key);
    assert.equal(after.address, before.address); assert.equal(after.definition, before.definition);
    assert.equal(after.generation, before.generation); assert.equal(after.states, before.states);
    assert.equal(after.source.on.press.id, before.source.on.press.id); assert.notEqual(nextLink, previousLink);
    assert.equal(first.calls[0].signal.aborted, true); await cancelled(previousRun);
    assert.deepEqual(nextLink.snapshot(), { status: 'idle', running: false, data: null, error: null });
    const nextRun = observed(f.ui.emit(after, 'press', { value: 2 })); await flush();
    assert.equal(first.calls.length, 1); assert.equal(replacement.calls.length, 1); assert.equal(replacement.calls[0].inputs.value, 2);
    first.calls[0].gate.resolve('previous-target-late'); await flush();
    assert.equal(nextLink.snapshot().status, 'running'); assert.equal(nextLink.snapshot().data, null);
    assert.equal(replacement.calls[0].signal.aborted, false);
    replacement.calls[0].gate.resolve('replacement-result'); assert.equal((await nextRun).value, 'replacement-result');
    assert.equal(nextLink.snapshot().status, 'success'); assert.equal(nextLink.snapshot().data, 'replacement-result');
  } finally { f.close(); }
});

await test('A12-A15-U07/UI-componentRef-replacement-renews-generation-and-blocks-late-result', async () => {
  const f = fixture({ resources: [{ kind: 'Component', id: 'AlternateButton', spec: { events: { press: { schema: true } } } }],
    adapters: { AlternateButton: { tag: 'button' } } });
  try {
    f.ui.apply(view([button()])); const before = f.ui.find('button')[0], previousLink = f.bridge.link(before);
    const previousRun = observed(f.ui.emit(before, 'press', { value: 1 })); await flush(); assert.equal(f.hold.calls.length, 1);
    f.ui.apply(view([button({ componentRef: 'AlternateButton' })]));
    const after = f.ui.find('button')[0], nextLink = f.bridge.link(after);
    assert.equal(after.id, before.id); assert.equal(after.authorContext.owner.key, before.authorContext.owner.key);
    assert.equal(after.address, before.address); assert.notEqual(after.definition, before.definition);
    assert.notEqual(after.generation, before.generation); assert.notEqual(after.states, before.states);
    assert.equal(after.source.on.press.id, before.source.on.press.id); assert.equal(after.source.on.press.actionRef, before.source.on.press.actionRef);
    assert.notEqual(nextLink, previousLink); assert.equal(f.hold.calls[0].signal.aborted, true); await cancelled(previousRun);
    assert.deepEqual(nextLink.snapshot(), { status: 'idle', running: false, data: null, error: null });
    assert.throws(() => f.ui.emit(before, 'press', { value: 99 }), /REMOVED_CONNECTION/);
    const nextRun = observed(f.ui.emit(after, 'press', { value: 2 })); await flush(); assert.equal(f.hold.calls.length, 2);
    assert.equal(f.hold.calls[1].inputs.value, 2); assert.equal(f.hold.calls[1].signal.aborted, false);
    f.hold.calls[1].gate.resolve('new-component-result'); assert.equal((await nextRun).value, 'new-component-result');
    f.hold.calls[0].gate.resolve('old-component-late'); await flush();
    assert.equal(nextLink.snapshot().status, 'success'); assert.equal(nextLink.snapshot().data, 'new-component-result');
  } finally { f.close(); }
});

const repeatPorts = { items: valuePort({ type: 'array', items: { type: 'object' } }) };
const repeated = () => button({ repeat: { items: ref('/ports/items'), as: 'item', key: ref('/repeat/item/key') },
  on: { press: { actionRef: 'hold', inputs: { value: ref('/repeat/item') } } } });
const byKey = (ui, key) => ui.find('button').find(node => node.authorContext.repeat.item.key === key);
await test('A02-A11-A21-U06/UI-repeat-reorder-retains-idless-running-connections-and-value-snapshots', async () => {
  const f = fixture({ ports: { items: [{ key: 'a', value: 1 }, { key: 'b', value: 2 }] } }), spec = view([repeated()], repeatPorts);
  try {
    f.ui.apply(spec); const a = byKey(f.ui, 'a'), b = byKey(f.ui, 'b'), aLink = f.bridge.link(a), bLink = f.bridge.link(b);
    const aRun = observed(f.ui.emit(a, 'press', {})), bRun = observed(f.ui.emit(b, 'press', {})); await flush();
    assert.equal(f.hold.calls.length, 2); assert.notEqual(aLink, bLink);
    f.ui.ports.items = [{ key: 'b', value: 20 }, { key: 'a', value: 10 }]; f.ui.apply(spec);
    assert.deepEqual(f.ui.find('button').map(node => node.authorContext.repeat.item.key), ['b', 'a']);
    assert.equal(f.bridge.link(byKey(f.ui, 'a')), aLink); assert.equal(f.bridge.link(byKey(f.ui, 'b')), bLink);
    assert.equal(byKey(f.ui, 'a').generation, a.generation); assert.equal(byKey(f.ui, 'b').generation, b.generation);
    assert.equal(await f.ui.emit(byKey(f.ui, 'a'), 'press', {}), undefined);
    assert.equal(await f.ui.emit(byKey(f.ui, 'b'), 'press', {}), undefined); assert.equal(f.hold.calls.length, 2);
    assert.equal(f.hold.calls[0].inputs.value.value, 1); assert.equal(f.hold.calls[1].inputs.value.value, 2);
    assert.ok(f.hold.calls.every(call => !call.signal.aborted));
    f.hold.calls[0].gate.resolve('a-1'); f.hold.calls[1].gate.resolve('b-2');
    assert.equal((await aRun).value, 'a-1'); assert.equal((await bRun).value, 'b-2');
    const freshRun = observed(f.ui.emit(byKey(f.ui, 'a'), 'press', {})); await flush();
    assert.equal(f.hold.calls[2].inputs.value.value, 10); f.hold.calls[2].gate.resolve('a-10'); await freshRun;
  } finally { f.close(); }
});

await test('A12-A13-U06/UI-removing-one-repeat-item-keeps-other-call-running', async () => {
  const f = fixture({ ports: { items: [{ key: 'a' }, { key: 'b' }] } }), spec = view([repeated()], repeatPorts);
  try {
    f.ui.apply(spec); const a = byKey(f.ui, 'a'), b = byKey(f.ui, 'b'), bLink = f.bridge.link(b);
    const aRun = observed(f.ui.emit(a, 'press', {})), bRun = observed(f.ui.emit(b, 'press', {})); await flush();
    f.ui.ports.items = [{ key: 'b' }]; f.ui.apply(spec); await cancelled(aRun);
    assert.equal(f.hold.calls[0].signal.aborted, true); assert.equal(f.hold.calls[1].signal.aborted, false);
    assert.equal(f.bridge.link(byKey(f.ui, 'b')), bLink); assert.equal(bLink.snapshot().status, 'running');
    f.hold.calls[0].gate.resolve('removed'); f.hold.calls[1].gate.resolve('kept'); assert.equal((await bRun).value, 'kept');
    await flush(); assert.equal(bLink.snapshot().data, 'kept');
  } finally { f.close(); }
});

await test('A12-A21/UI-component-owners-isolate-same-on-id-and-owner-disposal', async () => {
  const resources = [{ kind: 'Component', id: 'Card', spec: { render: button() } }];
  const f = fixture({ resources, ports: { visible: true } });
  const spec = view([{ id: 'left', componentRef: 'Card', when: ref('/ports/visible') }, { id: 'right', componentRef: 'Card' }], { visible: valuePort({ type: 'boolean' }) });
  try {
    f.ui.apply(spec); const [left, right] = f.ui.find('button');
    assert.notEqual(left.authorContext.owner.key, right.authorContext.owner.key);
    const leftLink = f.bridge.link(left), rightLink = f.bridge.link(right); assert.notEqual(leftLink, rightLink);
    const leftRun = observed(f.ui.emit(left, 'press', { value: 1 })), rightRun = observed(f.ui.emit(right, 'press', { value: 2 })); await flush();
    assert.equal(f.hold.calls.length, 2); f.ui.ports.visible = false; f.ui.apply(spec); await cancelled(leftRun);
    assert.equal(f.hold.calls[1].signal.aborted, false); assert.equal(f.bridge.link(f.ui.find('button')[0]), rightLink);
    f.hold.calls[0].gate.resolve('left-late'); f.hold.calls[1].gate.resolve('right'); await rightRun;
    assert.equal(rightLink.snapshot().data, 'right');
  } finally { f.close(); }
});

await test('U07/UI-row-move-preserves-author-owner-node-definition-and-running-call', async () => {
  const f = fixture();
  const placed = side => view(['left', 'right'].map(id => ({ id, componentRef: 'Row', slots: { default: side === id ? [button()] : [] } })));
  try {
    f.ui.apply(placed('left')); const before = f.ui.find('button')[0], link = f.bridge.link(before);
    const run = observed(f.ui.emit(before, 'press', { value: 1 })); await flush(); f.ui.apply(placed('right'));
    const after = f.ui.find('button')[0];
    assert.equal(after.authorContext.owner.key, before.authorContext.owner.key); assert.equal(after.address, before.address);
    assert.equal(after.definition, before.definition); assert.equal(after.generation, before.generation); assert.equal(f.bridge.link(after), link);
    assert.equal(f.hold.calls[0].signal.aborted, false); assert.equal(await f.ui.emit(after, 'press', { value: 2 }), undefined);
    assert.equal(f.hold.calls.length, 1); f.hold.calls[0].gate.resolve('moved'); await run; assert.equal(link.snapshot().data, 'moved');
  } finally { f.close(); }
});

await test('M01/UI-invalid-structural-apply-preserves-existing-call-and-tree', async () => {
  const f = fixture({ ports: { items: [{ key: 'a' }] } }), spec = view([repeated()], repeatPorts);
  try {
    f.ui.apply(spec); const before = byKey(f.ui, 'a'), instances = f.ui.instances, link = f.bridge.link(before);
    const run = observed(f.ui.emit(before, 'press', {})); await flush();
    f.ui.ports.items = [{ key: 'a' }, { key: 'a' }]; assert.throws(() => f.ui.apply(spec), /DUPLICATE_KEY/);
    assert.equal(f.ui.instances, instances); assert.equal(f.bridge.link(before), link); assert.equal(f.hold.calls[0].signal.aborted, false);
    assert.equal(await f.ui.emit(before, 'press', {}), undefined); assert.equal(f.hold.calls.length, 1);
    f.hold.calls[0].gate.resolve('kept-after-rejection'); await run; assert.equal(link.snapshot().data, 'kept-after-rejection');
  } finally { f.close(); }
});

await test('A12-K16/UI-connection-removal-cancels-declarative-parent-child-and-followups', async () => {
  const child = controlled(); let childAfter = 0, parentAfter = 0;
  const definitions = [['hold', child.definition], ['childAfter', { native() { childAfter++; } }], ['parentAfter', { native() { parentAfter++; } }],
    ['child', { ports: { value: valuePort(true) }, steps: [
      { kind: 'Action', actionRef: 'hold', inputs: { value: ref('/ports/value') } }, { kind: 'Action', actionRef: 'childAfter' },
    ] }], ['parent', { steps: [{ kind: 'Action', actionRef: 'child', inputs: { value: 1 } }, { kind: 'Action', actionRef: 'parentAfter' }] }]];
  const f = fixture({ definitions });
  try {
    const node = button({ on: { press: { id: 'run', actionRef: 'parent' } } }); f.ui.apply(view([node]));
    const run = observed(f.ui.emit(f.ui.find('button')[0], 'press', {})); await flush(); assert.equal(child.calls.length, 1);
    f.ui.apply(view([button({ on: {} })])); assert.equal(child.calls[0].signal.aborted, true); await cancelled(run);
    child.calls[0].gate.resolve('late-child'); await flush(); assert.equal(childAfter, 0); assert.equal(parentAfter, 0);
    f.ui.apply(view([node])); assert.equal(f.bridge.link(f.ui.find('button')[0]).snapshot().status, 'idle');
  } finally { f.close(); }
});

await test('A16/State-write-removes-own-when-connection-before-next-step', async () => {
  const store = new StateProbe(), scope = store.scope(), visible = scope.register('visible', { schema: { type: 'boolean' }, initial: true });
  let after = 0;
  const definitions = [['after', { native() { after++; } }], ['hide', { ports: { visible: { kind: 'State', required: true, schema: { type: 'boolean' } } },
    steps: [{ kind: 'SetState', target: ref('/ports/visible'), value: false }, { kind: 'Action', actionRef: 'after' }] }]];
  const f = fixture({ store, definitions, ports: { visible: true }, resolveInputs: values => ({ ...values, visible }) });
  const spec = view([button({ when: ref('/ports/visible'), on: { press: { id: 'self', actionRef: 'hide' } } })], { visible: valuePort({ type: 'boolean' }) });
  let unsubscribe;
  try {
    f.ui.apply(spec);
    unsubscribe = store.subscribe(visible.address, () => { f.ui.ports.visible = visible.read(); f.ui.apply(spec); });
    const rootGeneration = f.ui.find('root')[0].generation;
    const run = observed(f.ui.emit(f.ui.find('button')[0], 'press', {})); await cancelled(run); await flush();
    assert.equal(visible.read(), false); assert.equal(f.ui.find('button').length, 0); assert.equal(after, 0);
    assert.equal(f.ui.find('root')[0].generation, rootGeneration); assert.deepEqual(store.diagnostics(), []);
    // Cancelling this call must leave the original shared State usable.
    visible.write(true); assert.equal(f.ui.find('button').length, 1);
    assert.equal(f.bridge.link(f.ui.find('button')[0]).snapshot().status, 'idle');
  } finally { unsubscribe?.(); f.close(); scope.dispose(); }
});

await report({ base: import.meta.url, name: process.argv[2] ?? 'action-ui-node24.json',
  scope: 'Actual UIProbe expanded instance/generation/author-owner lifetimes reconciled with ActionProbe connect/invoke/dispose by a private dispatch adapter; includes StateProbe-triggered self-removal. No production core, renderer, UI action-observation initialization, native dynamic-child API, or public API claim.', results,
  sources: ['action-ui-integration.mjs', 'report.mjs', 'errors.mjs', '../t3-ui/ui-probe.mjs', '../t3-ui/value-evaluator.mjs', '../t3-action/action-probe.mjs', '../t3-state/state-probe.mjs', '../t3-state/ports-probe.mjs', '../t3-state/immutable.mjs', '../t2-http-boundary/value-expressions.mjs', '../t1-values/schema-runtime.mjs', '../t1-values/schema-profile.mjs', '../t1-values/values.mjs', '../t1-values/package-lock.json'] });
