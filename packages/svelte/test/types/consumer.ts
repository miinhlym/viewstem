import { createRenderer, ViewstemView, transformError } from '@viewstem/svelte';
import type { ComponentRegistration } from '@viewstem/svelte';
import type { ComponentAdapterProps, RendererErrorListener, RenderFallback, RenderAttachment, MountedView, ComponentAdapter, Renderer, RendererOptions, ViewstemViewProps, PublicError, View, ComponentContract, ViewSpec, RequestExecutor, StateHandle, Runtime } from '@viewstem/svelte';
import type { ActionSnapshot, ActionHandler, ActionContext, CodeActionSpec, CodeActionDefinition, StateScope, CelFunction, CelValue } from '@viewstem/svelte';
import type { Component, Snippet } from 'svelte';
import TypedAdapter from './TypedAdapter.svelte';
import TypedHost from './TypedHost.svelte';

const defaultRenderer = createRenderer();
const { registry, runtime } = defaultRenderer;
const onError: RendererErrorListener = diagnostic => {
  const phase: 'event' | 'render' = diagnostic.phase;
  const code: string = diagnostic.error.code;
  void [phase, code, diagnostic.node?.status];
};
const renderer: Renderer = createRenderer({ runtime, onError });
const emptyOptions: RendererOptions = {};
createRenderer(emptyOptions);
createRenderer({ registry, onError });
const requestExecutor: RequestExecutor = async (_plan, { signal }) => ({ status: signal.aborted ? 499 : 200, headers: {}, body: null });
createRenderer({ requestExecutor, stateStore: runtime.stateStore, resourceResolver: async (_kind, id) => ({ kind: 'View', id, spec: { render: { id: 'root', componentRef: 'Explicit' } } }) });
const contract: ComponentContract = { kind: 'Component', id: 'Explicit', spec: {} };
const definition: ViewSpec = { render: { id: 'root', componentRef: 'Explicit' } };
registry.registerComponentContract(contract);
const sharedRuntime: Runtime = renderer.runtime;
declare const state: StateHandle<number>;
void [definition, sharedRuntime, state];
const adapter: ComponentAdapter = TypedAdapter;
renderer.registerComponent('Explicit', adapter);
const registrations: readonly ComponentRegistration[] = [{ contract: { ...contract, id: 'Batched' }, component: adapter }];
renderer.registerComponents(registrations);
// @ts-expect-error Batch entries require Svelte implementations.
renderer.registerComponents([{ contract, component: '<div>' }]);
declare const view: View;
declare const target: Element;
declare const fallback: RenderFallback;
const props: ViewstemViewProps = { renderer, view, onError, fallback };
const host: Component<ViewstemViewProps, { whenRendered(): Promise<void> }> = TypedHost;
const publicHost: Component<ViewstemViewProps, { whenRendered(): Promise<void> }> = ViewstemView;
const attachment: RenderAttachment = renderer.attach(view, target, { context: new Map(), onError, fallback });
const pending: Promise<MountedView> = renderer.mount({ target, view: { render: { id: 'root', componentRef: 'Explicit' } }, context: new Map(), onError, fallback });
void pending.then(async rendered => {
  const report = await rendered.initialComplete;
  const generation: number = report.generation;
  const next = await rendered.update({ render: { id: 'next', componentRef: 'Explicit' } });
  await next.initialComplete;
  await (await rendered.replace({ viewRef: 'next' })).initialComplete;
  await rendered.whenRendered();
  await rendered.dispose();
  void generation;
});
void [props, host, publicHost, attachment];

// @ts-expect-error Injecting a Runtime cannot silently ignore creation options.
createRenderer({ runtime, registry });
// @ts-expect-error A supplied Runtime already has its own request executor.
createRenderer({ runtime, requestExecutor });
// @ts-expect-error Runtime cannot be replaced with a structurally unrelated object.
createRenderer({ runtime: {} });
// @ts-expect-error A renderer implementation has to be a Svelte Component.
renderer.registerComponent('bad', {});
// @ts-expect-error An implementation is bound to its explicit string ID.
renderer.registerComponent(TypedAdapter);
// @ts-expect-error A real DOM Element is required.
renderer.mount({ target: {}, viewRef: 'view' });
// @ts-expect-error View target is required.
renderer.mount({ target });
// @ts-expect-error Ref and inline View targets are mutually exclusive.
renderer.mount({ target, viewRef: 'view', view: { render: { id: 'root', componentRef: 'Explicit' } } });
// @ts-expect-error Context is an actual Map.
renderer.attach(view, target, { context: {} });
// @ts-expect-error Attach requires an actual core View.
renderer.attach({}, target);
// @ts-expect-error RenderFallback receives node and error, not a string.
const invalidFallback: RenderFallback = {} as Snippet<[value: string]>;
// @ts-expect-error Public host requires a View.
const invalidHost: ViewstemViewProps = { renderer };
declare const adapterProps: ComponentAdapterProps;
const result: Promise<unknown> = adapterProps.emit('change', false);
const slot: Snippet<[name: string]> = adapterProps.renderSlot;
// @ts-expect-error Slot snippet is not a DOM-string callback.
const stringSlot: (name: string) => string = adapterProps.renderSlot;
// @ts-expect-error Emit result remains unknown until narrowed by the caller.
const booleanResult: Promise<boolean> = adapterProps.emit('change', false);
void [invalidFallback, invalidHost, result, slot, stringSlot, booleanResult];

const sanitized: PublicError = transformError(new Proxy({}, {}));
const mountingErrorPolicy: (error: unknown) => unknown = transformError;
// @ts-expect-error Sanitization returns a PublicError DTO, not a raw Error.
const rawError: Error = transformError('failure');
void [sanitized, mountingErrorPolicy, rawError];
// Public framework entrypoints do not forward execution-engine internals.
// @ts-expect-error Query engine is internal to core.
import type { QueryEngine } from '@viewstem/svelte';
// @ts-expect-error CEL compilation options belong to the optional core/cel subpath.
import type { CelOptions } from '@viewstem/svelte';
// @ts-expect-error HTTP executor configuration belongs to core/http.
import type { HttpExecutorOptions } from '@viewstem/svelte';
// @ts-expect-error Type inference helpers are not public contracts.
import type { InputsFromPorts } from '@viewstem/svelte';

const scope: StateScope = runtime.stateStore.createScope();
const count = scope.registerState<number>('count', { schema: { type: 'number' }, initial: 0 });
runtime.stateStore.writeBatch([[count, 1]]);
runtime.stateStore.registerReaction(scope, { watch: [count], target: scope.registerState('selected', { schema: { type: 'number' }, initial: 1 }), value: 0 });
const stateSnapshot = count.getSnapshot();
const viewSnapshot = view.getSnapshot();
const diagnostics: readonly PublicError[] = runtime.stateStore.getDiagnostics();
const codeSpec: CodeActionSpec<{ count: StateHandle<number> }> = { ports: { count: { kind: 'State', schema: { type: 'number' }, required: true } } };
const action: CodeActionDefinition<{ count: StateHandle<number> }> = { kind: 'Action', id: 'typed', spec: codeSpec };
const actionHandler: ActionHandler<{ count: StateHandle<number> }> = (context: ActionContext<{ count: StateHandle<number> }>) => { context.inputs.count.reset(); };
registry.registerAction<{ count: StateHandle<number> }>(action, actionHandler);
registry.registerAction({ kind: 'Action', id: 'inferred', spec: { ports: { title: { kind: 'Value', required: true, schema: { type: 'string' } } }, output: { schema: { type: 'boolean' } } } } as const, ({ inputs }) => {
  const title: string = inputs.title;
  // @ts-expect-error Svelte consumers retain native Action input inference.
  const wrong: number = inputs.title;
  return title.length > 0;
});
declare const actionSnapshot: ActionSnapshot;
const celFunction: CelFunction<[number], number> = { name: 'double', inputs: [{ type: 'number' }], output: { type: 'number' }, run: n => n * 2 };
const celValue: CelValue = 1;
createRenderer({ functions: [celFunction] });
void [stateSnapshot, viewSnapshot, diagnostics, actionSnapshot, celValue];

// @ts-expect-error Previous adapter aliases are not exported.
import type { Adapter } from '@viewstem/svelte';
// @ts-expect-error Previous adapter-props aliases are not exported.
import type { AdapterProps } from '@viewstem/svelte';
// @ts-expect-error Previous mounted-view aliases are not exported.
import type { RenderedView } from '@viewstem/svelte';
// @ts-expect-error Previous error-listener aliases are not exported.
import type { ErrorListener } from '@viewstem/svelte';
// @ts-expect-error Previous fallback aliases are not exported.
import type { Fallback } from '@viewstem/svelte';
// @ts-expect-error Previous core Action snapshot aliases are not forwarded.
import type { ActionObservation } from '@viewstem/svelte';
// @ts-expect-error Previous core Action handler aliases are not forwarded.
import type { NativeAction } from '@viewstem/svelte';
// @ts-expect-error Previous core Action context aliases are not forwarded.
import type { NativeContext } from '@viewstem/svelte';
// @ts-expect-error Previous core code-Action spec aliases are not forwarded.
import type { NativeActionSpec } from '@viewstem/svelte';
// @ts-expect-error Previous core code-Action definition aliases are not forwarded.
import type { NativeActionDefinition } from '@viewstem/svelte';
// @ts-expect-error Previous core State scope aliases are not forwarded.
import type { Scope } from '@viewstem/svelte';
// @ts-expect-error View is the sole public core View type.
import type { ViewHandle } from '@viewstem/svelte';
// @ts-expect-error Registry registers a contract with an explicit name.
registry.registerComponent(contract);
// @ts-expect-error Core creates a View without mounting DOM.
runtime.mount({ view: definition });
// @ts-expect-error Renderer mounts DOM and does not expose core's creation method.
renderer.createView({ view: definition });
// @ts-expect-error Renderer implementation registration keeps its own name.
renderer.registerComponentContract('Explicit', adapter);
// @ts-expect-error View snapshots use getter naming.
view.snapshot();
// @ts-expect-error State snapshots use getter naming.
count.snapshot();
// @ts-expect-error Store writes use the explicit writeBatch name.
runtime.stateStore.batch([]);
// @ts-expect-error Store reaction registration uses its explicit name.
runtime.stateStore.reaction(scope, { watch: [count], target: count, value: 0 });
// @ts-expect-error Completion is named for the work it waits for.
pending.then(mounted => mounted.initial);
// @ts-expect-error DOM completion has no previous alias.
attachment.settled();
// @ts-expect-error Public Svelte component exposes only whenRendered.
publicHost({} as never, props).settled();
