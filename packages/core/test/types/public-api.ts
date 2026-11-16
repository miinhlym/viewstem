import { createRegistry, createRuntime, createStateStore, computeGridLayout, mergeOwnedUrl } from '@viewstem/core';
import * as core from '@viewstem/core';
import type { Registry, Runtime, StateStore, View, ActionHandler, StateHandle } from '@viewstem/core';
import { createHttpExecutor } from '@viewstem/core/http';
import type { HttpExecutorOptions, RequestExecutor } from '@viewstem/core/http';
import { compileCel, evaluateCel, defaultCelLimits } from '@viewstem/core/cel';
import type { CelOptions, CelFunction, CelValue } from '@viewstem/core/cel';

// @ts-expect-error Root constructors are type-only opaque interfaces.
new core.Registry();
// @ts-expect-error Root constructors are type-only opaque interfaces.
new core.StateStore();
// @ts-expect-error Root constructors are type-only opaque interfaces.
new core.Runtime({ registry: createRegistry() });
// @ts-expect-error Root constructors are type-only opaque interfaces.
new core.View(createRuntime({ registry: createRegistry() }));
// @ts-expect-error Schema and expression engines are internal.
import { compileSchema } from '@viewstem/core';
// @ts-expect-error Schema and expression engines are internal.
import { equal } from '@viewstem/core';
// @ts-expect-error Schema and expression engines are internal.
import { evaluate } from '@viewstem/core';
// @ts-expect-error Schema and expression engines are internal.
import { evaluateSnapshot } from '@viewstem/core';
// @ts-expect-error Schema and expression engines are internal.
import { createQueryEngine } from '@viewstem/core';
// @ts-expect-error Boundary and transform helpers are internal.
import { normalizeDate } from '@viewstem/core';
// @ts-expect-error Boundary and transform helpers are internal.
import { localInstant } from '@viewstem/core';
// @ts-expect-error Boundary and transform helpers are internal.
import { encodeBoundary } from '@viewstem/core';
// @ts-expect-error Boundary and transform helpers are internal.
import { joinRows } from '@viewstem/core';
// @ts-expect-error Optional execution values belong to subpaths.
import { createHttpExecutor as rootHttp } from '@viewstem/core';
// @ts-expect-error Optional execution values belong to subpaths.
import { compileCel as rootCel } from '@viewstem/core';
// @ts-expect-error Optional execution values belong to subpaths.
import { evaluateCel as rootEvaluateCel } from '@viewstem/core';
// @ts-expect-error Optional execution values belong to subpaths.
import { defaultCelLimits as rootLimits } from '@viewstem/core';
// @ts-expect-error Engine and evaluation contracts are internal.
import type { QueryEngine } from '@viewstem/core';
// @ts-expect-error Engine and evaluation contracts are internal.
import type { QueryUsage } from '@viewstem/core';
// @ts-expect-error Engine and evaluation contracts are internal.
import type { QueryUsageOptions } from '@viewstem/core';
// @ts-expect-error Engine and evaluation contracts are internal.
import type { QueryTarget } from '@viewstem/core';
// @ts-expect-error Engine and evaluation contracts are internal.
import type { SchemaValidator } from '@viewstem/core';
// @ts-expect-error Engine and evaluation contracts are internal.
import type { EvaluationContext } from '@viewstem/core';
// @ts-expect-error Engine and evaluation contracts are internal.
import type { EvaluationOptions } from '@viewstem/core';
// @ts-expect-error Optional execution options belong to subpaths.
import type { HttpExecutorOptions as RootHttpOptions } from '@viewstem/core';
// @ts-expect-error Optional execution options belong to subpaths.
import type { CelOptions as RootCelOptions } from '@viewstem/core';
// @ts-expect-error Optional execution options belong to subpaths.
import type { CelLimits } from '@viewstem/core';
// @ts-expect-error Inference helpers are private.
import type { ReferenceOrInline } from '@viewstem/core';
// @ts-expect-error Inference helpers are private.
import type { PortsFor } from '@viewstem/core';
// @ts-expect-error Inference helpers are private.
import type { SchemaValue } from '@viewstem/core';
// @ts-expect-error Inference helpers are private.
import type { InputsFromPorts } from '@viewstem/core';
// @ts-expect-error Inference helpers are private.
import type { ContractValue } from '@viewstem/core';
// @ts-expect-error Inference helpers are private.
import type { InferredNative } from '@viewstem/core';
// @ts-expect-error Opaque brands cannot be obtained by consumers.
import { stateBrand } from '@viewstem/core';
// @ts-expect-error Opaque brands cannot be obtained by consumers.
import { queryBrand } from '@viewstem/core';
// @ts-expect-error Opaque brands cannot be obtained by consumers.
import { registryBrand } from '@viewstem/core';
// @ts-expect-error Opaque brands cannot be obtained by consumers.
import { stateStoreBrand } from '@viewstem/core';
// @ts-expect-error Opaque brands cannot be obtained by consumers.
import { runtimeBrand } from '@viewstem/core';
// @ts-expect-error Opaque brands cannot be obtained by consumers.
import { viewBrand } from '@viewstem/core';
// @ts-expect-error HTTP address composition is internal.
import { joinAddress } from '@viewstem/core/http';
// @ts-expect-error Package private implementation paths are unsupported.
import { Registry as InternalRegistry } from '@viewstem/core/src/registry.mjs';

const registry = createRegistry(), store = createStateStore(), scope = store.createScope();
const count = scope.registerState<number>('count', { schema: { type: 'integer' }, initial: 0 });
const httpOptions: HttpExecutorOptions = { authorize: ({ destination }) => destination.startsWith('https:') };
const executor: RequestExecutor = createHttpExecutor(httpOptions);
const double: CelFunction<[number], number> = { name: 'double', inputs: [{ type: 'number' }], output: { type: 'number' }, run: value => value * 2 };
const celOptions: CelOptions = { inputs: { n: { type: 'number' } }, functions: [double], limits: { depth: defaultCelLimits.depth } };
const computed: unknown = compileCel('double(n)', celOptions)({ n: 2 });
const value: CelValue = 2;
evaluateCel('n', { n: value }, celOptions);
const runtime = createRuntime({ registry, stateStore: store, requestExecutor: executor });
registry.registerComponentContract({ kind: 'Component', id: 'Leaf', spec: {} }).registerResources([]);
registry.registerComponentContracts([{ kind: 'Component', id: 'Other', spec: {} }] as const).registerResources([]);
// @ts-expect-error Only Component contracts are accepted by the batch.
registry.registerComponentContracts([{ kind: 'Type', id: 'not-component', spec: { schema: true } }]);
registry.registerAction({ kind: 'Action', id: 'inferred', spec: {
  ports: { count: { kind: 'State', required: true, schema: { type: 'integer' } }, label: { kind: 'Value', required: true, schema: { type: 'string' } } },
  output: { schema: { type: 'boolean' } },
} } as const, ({ inputs }) => {
  inputs.count.write(inputs.label.length);
  // @ts-expect-error Public native-action inference preserves the State schema.
  inputs.count.write('wrong');
  // @ts-expect-error Public native-action inference preserves Value types.
  const wrong: number = inputs.label;
  return inputs.label.length > 0;
});
const typed: ActionHandler<{ count: StateHandle<number> }> = ({ inputs }) => { inputs.count.reset(); };
registry.registerAction<{ count: StateHandle<number> }>({ kind: 'Action', id: 'typed', spec: { ports: { count: { kind: 'State', schema: { type: 'number' }, required: true } } } }, typed);

// @ts-expect-error Registry engine methods are absent.
registry.fork();
// @ts-expect-error Native implementation callbacks cannot be retrieved.
registry.implementation('Action', 'typed');
// @ts-expect-error Registry CEL implementation data is private.
registry.functions;
// @ts-expect-error Registry schema engines are private.
registry.validator({ schema: true });
// @ts-expect-error Runtime Variable evaluation is internal.
runtime.variable('value');
// @ts-expect-error Runtime execution engines are private.
runtime.actions;
// @ts-expect-error Store capability inspection is internal.
store.contract(count);
// @ts-expect-error Store internal initialization cannot be invoked.
store.initialize(count, { status: 'ready', value: 1 });
// @ts-expect-error Store internal write origins are unavailable.
store.writeBatch([[count, 1]], { origin: 'initial' });
// @ts-expect-error Host Scope declarations cannot install internal derived functions.
scope.registerState('derived', { schema: true, derived: () => 1 });
// @ts-expect-error Host Scope declarations cannot install internal async initialization.
scope.replaceState('count', { schema: true, pendingInitial: Promise.resolve(1) });

declare const view: View;
// @ts-expect-error Query identity is internal; consumers use the issued handle.
view.getQuery('rows').identity;
// @ts-expect-error View engine objects are absent.
view.runtime;
// @ts-expect-error View internal lifecycle control is absent.
view.alive = false;
declare const fakeRegistry: Pick<Registry, Extract<keyof Registry, string>>;
declare const fakeStore: Pick<StateStore, Extract<keyof StateStore, string>>;
declare const fakeRuntime: Pick<Runtime, Extract<keyof Runtime, string>>;
declare const fakeView: Pick<View, Extract<keyof View, string>>;
// @ts-expect-error Matching all string-named Registry members cannot forge the brand.
const forgedRegistry: Registry = fakeRegistry;
// @ts-expect-error Matching all string-named Store members cannot forge the brand.
const forgedStore: StateStore = fakeStore;
// @ts-expect-error Matching all string-named Runtime members cannot forge the brand.
const forgedRuntime: Runtime = fakeRuntime;
// @ts-expect-error Matching all string-named View members cannot forge the brand.
const forgedView: View = fakeView;
createRuntime({ registry, authorize: context => {
  if (context.operation === 'update') { const samePublicView: View = context.owner; void samePublicView.getSnapshot(); }
  else {
    // @ts-expect-error Invoke authorization receives an opaque owner.
    context.owner.dispose();
    // @ts-expect-error Invoke authorization does not expose native callbacks.
    context.definition.native();
  }
  return true;
} });
await view.invokeAction({ actionRef: 'typed', inputs: { count } });
computeGridLayout([{ id: 'leaf' }], [{ id: 'leaf', address: 'node' }]);
mergeOwnedUrl('https://example.test', { count: '1' });
void computed;

// @ts-expect-error Previous public type names are removed without aliases.
import type { ActionObservation } from '@viewstem/core';

// @ts-expect-error Previous public type names are removed without aliases.
import type { NativeAction } from '@viewstem/core';

// @ts-expect-error Previous public type names are removed without aliases.
import type { NativeContext } from '@viewstem/core';

// @ts-expect-error Previous public type names are removed without aliases.
import type { NativeActionSpec } from '@viewstem/core';

// @ts-expect-error Previous public type names are removed without aliases.
import type { NativeActionDefinition } from '@viewstem/core';

// @ts-expect-error Previous public type names are removed without aliases.
import type { Scope } from '@viewstem/core';

// @ts-expect-error Previous public type names are removed without aliases.
import type { ViewHandle } from '@viewstem/core';

// @ts-expect-error The Grid function now describes computation.
import { gridLayout } from '@viewstem/core';
// @ts-expect-error CEL exports defaults, not the active limits for every evaluator.
import { celLimits } from '@viewstem/core/cel';
import type { ActionSnapshot, ActionContext, CodeActionSpec, CodeActionDefinition, StateScope, InitialReport } from '@viewstem/core';
const stateScope: StateScope = scope;
const handlerContext = null as unknown as ActionContext<{ count: StateHandle<number> }>;
handlerContext.inputs.count.getSnapshot();
const codeSpec: CodeActionSpec<{}, number> = { output: { schema: { type: 'number' } } };
const codeDefinition: CodeActionDefinition<{}, number> = { kind: 'Action', id: 'typed-code', spec: codeSpec };
registry.registerAction<{}, number>(codeDefinition, () => 7);
const observed: ActionSnapshot | undefined = view.getSnapshot().actions.submit;
const created = await runtime.createView({ render: { id: 'leaf', componentRef: 'Leaf' } });
const completed: InitialReport = await created.whenSettled(created.initial);
const reapplied: InitialReport = await view.whenSettled(await view.updateDefinition(view.exportDefinition()));
const replaced: InitialReport = await view.whenSettled(await view.replace(view.exportDefinition()));
store.writeBatch([[count, 1]]);
const cleanup = store.registerReaction(stateScope, { watch: [count], target: scope.registerState('other', { schema: true }), value: 0 });
cleanup();
store.getDiagnostics(); registry.exportResource('Action', 'typed');
// @ts-expect-error Headless runtime creation is createView.
runtime.mount({ view: view.exportDefinition() });
// @ts-expect-error Component contract registration is explicit.
registry.registerComponent({ kind: 'Component', id: 'Old', spec: {} });
// @ts-expect-error Resource export has one name on Registry and Runtime.
registry.export('Action', 'typed');
// @ts-expect-error Resource export has one name on Registry and Runtime.
runtime.describeResource('Action', 'typed');
// @ts-expect-error The old completion field is not exposed.
created.initialComplete;
// @ts-expect-error Application result uses the same completion name.
(await view.updateDefinition(view.exportDefinition())).initial;
// @ts-expect-error Snapshot getters use getSnapshot.
view.snapshot();
// @ts-expect-error Snapshot getters use getSnapshot.
count.snapshot();
// @ts-expect-error Snapshot getters use getSnapshot.
view.getQuery('rows').snapshot();
// @ts-expect-error Writes use writeBatch.
store.batch([[count, 1]]);
// @ts-expect-error Reactions use registerReaction.
store.reaction(scope, { watch: [count], target: count, value: 0 });
// @ts-expect-error Diagnostic getters use getDiagnostics.
store.diagnostics();
declare const connection: import('@viewstem/core').UrlConnection;
connection.getDiagnostics();
// @ts-expect-error URL diagnostic getters also use getDiagnostics.
connection.diagnostics();
void observed; void completed; void reapplied; void replaced;
