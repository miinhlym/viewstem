import type { ComponentAdapter, ComponentRegistration, Schema } from '@viewstem/svelte';
import type { Definition, NativeComponent } from './types.js';
import Bridge from './Bridge.svelte';

export function registration(component: NativeComponent, definition: Definition): ComponentRegistration {
  const adapter: ComponentAdapter = (anchor, props) => Bridge(anchor, {
    component, definition,
    get inputs() { return props.inputs; }, get node() { return props.node; },
    get emit() { return props.emit; }, get renderSlot() { return props.renderSlot; },
  });
  return Object.freeze({
    component: adapter,
    contract: {
      kind: 'Component' as const, id: definition.id,
      spec: {
        ports: Object.fromEntries(Object.entries(definition.props).map(([name, value]) => [name, {
          kind: 'Value' as const, schema: value.schema, ...(value.required ? { required: true } : {}),
        }])),
        slots: Object.fromEntries(definition.slots.map(name => [name, {}])),
        events: Object.fromEntries(Object.values(definition.callbacks).map(callback => [callback.event, {
          schema: callback.codec === 'dom' ? callback.schema : {
            type: 'object', properties: { value: callback.schema }, required: ['value'], additionalProperties: false,
          } as Schema,
        }])),
      },
    },
  });
}
