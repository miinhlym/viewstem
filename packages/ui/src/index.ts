import { defineResourceSet } from '@viewstem/core';
import { DOM_CONNECTOR_ID } from '@viewstem/dom';
import { shadcnContracts } from './shadcn.js';
import { catalogComponent } from './components.js';

export const ui = defineResourceSet({
  id: '@viewstem/ui', version: '1',
  components: shadcnContracts.map(contract => ({
    contract,
    connectorId: DOM_CONNECTOR_ID,
    implementation: catalogComponent(contract.id.slice('shadcn.'.length)),
  })),
});
