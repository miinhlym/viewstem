// Private A14 adapter for unconditional, non-repeated named bindings only.
// No new native context capability or dynamic child-call API is introduced.
import { ActionProbe } from '../t3-action/action-probe.mjs';
import { StateProbe } from '../t3-state/state-probe.mjs';
export function createActionBridge(definitions) {
  const engine = new ActionProbe({ store: new StateProbe() }); engine.register(definitions);
  const scopes = new Map();
  const snapshots = ({ ownerKey, spec }) => {
    let scope = scopes.get(ownerKey);
    if (!scope) { scope = { owner: engine.owner(), links: new Map() }; scopes.set(ownerKey, scope); }
    const current = new Set();
    const walk = node => {
      if (node.repeat || Object.hasOwn(node, 'when')) throw Error('BRIDGE_STRUCTURAL_LIFETIME_OUTSIDE_PROBE');
      for (const handler of Object.values(node.on ?? {})) if (!handler.emit && handler.id !== undefined) {
        current.add(handler.id);
        if (!scope.links.has(handler.id)) {
          const item = { values: {} };
          item.connection = engine.connect(scope.owner, { id: handler.id, ...(handler.actionRef ? { actionRef: handler.actionRef } : { spec: handler.action }), inputs: () => item.values });
          scope.links.set(handler.id, item);
        }
      }
      for (const content of Object.values(node.slots ?? {})) if (Array.isArray(content)) content.forEach(walk);
    };
    walk(spec.render);
    for (const [id, item] of scope.links) if (!current.has(id)) { item.connection.dispose(); scope.links.delete(id); }
    return Object.fromEntries([...scope.links].map(([id]) => [id, scope.owner.snapshot(id)]));
  };
  return {
    snapshots,
    action(_reference, values, { ownerKey, id }) {
      const item = scopes.get(ownerKey)?.links.get(id); if (!item) throw Error('BRIDGE_UNREGISTERED');
      item.values = values; return item.connection.invoke();
    },
    snapshot(ownerKey, id) { return scopes.get(ownerKey).owner.snapshot(id); },
    dispose() { for (const scope of scopes.values()) scope.owner.dispose(); scopes.clear(); },
  };
}
