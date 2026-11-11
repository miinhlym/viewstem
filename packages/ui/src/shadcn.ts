import type { Registry } from '@viewstem/core';
import { support } from './basecoat-contracts.js';

export { components, domEvents, attributes } from './catalog-meta.js';
export { support } from './basecoat-contracts.js';

export function registerShadcn(registry: Registry): void {
  registry.registerComponentContracts(support.map(({ id, ports, slots, events }) => ({
    kind: 'Component',
    id,
    spec: { ...(ports && { ports }), ...(slots && { slots }), ...(events && { events }) },
  })));
}
