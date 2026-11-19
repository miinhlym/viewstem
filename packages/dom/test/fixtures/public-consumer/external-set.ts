import { defineResourceSet } from '@viewstem/core';
import { ui } from '@viewstem/ui';
import { commonSet } from './common-set.js';
import { externalConnector, material } from './external-connector.js';

const port = { kind: 'Value', schema: { type: 'string' }, required: true } as const;
export const externalSet = defineResourceSet({ id: 'external-ui', version: '1', dependencies: [commonSet, ui], components: [
  {
    contract: { kind: 'Component', id: 'External', spec: { ports: { key: port, label: port }, events: { click: { schema: true } } } },
    connectorId: externalConnector.id, implementation: material,
  },
] });
