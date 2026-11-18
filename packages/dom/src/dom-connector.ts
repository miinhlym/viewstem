import type { ComponentConnector, ComponentMountContext, MountedComponent } from './connector.js';

export const DOM_CONNECTOR_ID = 'dom';
export interface DomComponent {
  mount(context: ComponentMountContext): MountedComponent;
}

function isDomComponent(value: unknown): value is DomComponent {
  return typeof value === 'object' && value !== null && 'mount' in value && typeof value.mount === 'function';
}

export const domConnector: ComponentConnector = Object.freeze({
  id: DOM_CONNECTOR_ID,
  accepts: isDomComponent,
  mount(implementation: unknown, context: ComponentMountContext) {
    if (!isDomComponent(implementation)) throw new TypeError('Invalid DOM component implementation');
    return implementation.mount(context);
  },
});
