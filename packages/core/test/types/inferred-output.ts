import { createRegistry } from '@viewstem/core';
const registry = createRegistry();
// @ts-expect-error the native return must match the inferred output schema.
registry.registerAction({ kind: 'Action', id: 'wrong-inferred', spec: { output: { schema: { type: 'boolean' } } } } as const, () => 'wrong');
// @ts-expect-error typed output requires a real return value.
registry.registerAction({ kind: 'Action', id: 'missing-inferred', spec: { output: { schema: { type: 'boolean' } } } } as const, () => undefined);
