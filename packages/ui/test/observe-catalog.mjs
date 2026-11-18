import { defineResourceSet } from '@viewstem/core';
import { domConnector } from '@viewstem/dom';
import { ui } from '@viewstem/ui';

export function observeCatalog(registry, observe) {
  const connector = {
    id: 'test-dom',
    accepts: domConnector.accepts,
    mount(implementation, context) {
      let node = context.node;
      const handle = domConnector.mount(implementation, { ...context, emit(event, payload) {
        observe(node, event, payload);
        return context.emit(event, payload);
      } });
      return { ...handle, update(next, signal) { node = next; handle.update(next, signal); } };
    },
  };
  registry.registerResourceSet(defineResourceSet({ id: 'test-catalog', version: '1',
    components: ui.components.map(binding => ({ ...binding, connectorId: connector.id })),
  }));
  return connector;
}
