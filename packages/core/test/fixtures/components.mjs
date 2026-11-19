import { createRuntime, defineResourceSet } from '@viewstem/core';

let nextSet = 0;
const binding = contract => ({ contract, connectorId: 'test', implementation: {} });

export function bindTestComponents(registry, contracts, declare = defineResourceSet) {
  return registry.registerResourceSet(declare({
    id: `test-components-${++nextSet}`, version: '1', components: contracts.map(binding),
  }));
}

export function createTestRuntime(options = {}) {
  const runtime = createRuntime(options);
  for (const contract of options.componentContracts ?? []) runtime.registry.replaceResource({ component: binding(contract) });
  return runtime;
}
