// Expected to COMPILE. These are runtime-invalid or runtime-dependent cases,
// demonstrating limits rather than positive product conformance.
import { createRegistry, createRuntime, createStateStore } from '@viewstem/core';
const registry = createRegistry(), runtime = createRuntime({ registry });
const scope = createStateStore().createScope();
const count = scope.registerState<number>('count', { schema: { type: 'number' }, initial: 0 });
count.write(Number.NaN); count.write(Infinity); count.write(Number.MAX_SAFE_INTEGER + 1);
// This fixture does not infer a TS value type from arbitrary JSON Schema.
scope.registerState<number>('schema-mismatch', { schema: { type: 'string' }, initial: 3 });
registry.registerAction<{}, boolean>({ kind: 'Action', id: 'schema-mismatch', spec: { output: { schema: { type: 'string' } } } }, () => true);
// The string does not establish registration, authority, readiness or lifetime.
await runtime.createView({ ref: 'not-registered' });
// TypeScript can erase actual return data through an existing () => void type.
const erasedReturn: () => void = () => 42;
registry.registerAction<{}>({ kind: 'Action', id: 'erased-void', spec: {} }, erasedReturn);
