# Review target · Viewstem public callable APIs

Baseline `f5c0785` on `codex/viewstem-resource-sets`. The inventory includes public callable exports, methods and callback contracts exposed by package entry points. Core ships root, `/renderer`, `/http`, `/cel` and its CEL support catalog. DOM and Svelte ship their root. UI ships a resource set, styles, and catalog. Opaque binding implementation values are used through the connector contract. The catalog supplies declarative definitions for UI nodes.

## Consumer entry points in published documentation

A headless caller creates a Runtime, supplies or registers resources and invokes a named Action. A browser app creates or receives a Runtime, registers its set and creates or attaches a View. A Svelte app can mount into a target or use `ViewstemView` in its markup. Its source mode owns the View and borrows the renderer. The injected-Runtime renderer path borrows Runtime. DOM accepts an explicit Runtime and Svelte can construct one.

```ts
const renderer = createRenderer();
renderer.runtime.registry.registerResourceSet(ui);
const source: ViewSpec = {
  render: { id: 'save', componentRef: 'shadcn.Button', inputs: { text: 'Save' } },
};
onMount(() => () => { void renderer.dispose().catch(console.error); });
```

```svelte
<div data-viewstem-ui>
  <ViewstemView {renderer} {source} />
</div>
```

Use cases include loading trusted application modules, mixing official Svelte and DOM with a third-party connector, explicit application of compatible sets to already-open Views, headless Action runs, and independent packaged authors. The code below is the recorded contract input for review. Relative paths name the workspace sources. The DOM and Svelte sections show public signatures without implementation bodies.

## Published entry point declarations and signatures

### Core root

`packages/core/src/index.d.ts`

```ts
export type Awaitable<T> = T | PromiseLike<T>;
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
/** Supported schema vocabulary is checked at registration; arbitrary schema truth is runtime validation. */
export type Schema = boolean | { readonly [keyword: string]: JsonValue };
export type TypeContract = { readonly schema: Schema; readonly typeRef?: never } | { readonly typeRef: string; readonly schema?: never };
type ReferenceOrInline<R extends string, I extends string, B> =
  | ({ readonly [K in R]: string } & { readonly [K in I]?: never })
  | ({ readonly [K in I]: B } & { readonly [K in R]?: never });
export type ResourceKind = 'Datasource' | 'Query' | 'Variable' | 'Action' | 'Component' | 'View' | 'Type';
export interface Resource<K extends ResourceKind = ResourceKind, S = unknown> { readonly kind: K; readonly id: string; readonly name?: string; readonly spec: S }
export interface PublicError { readonly code: string; readonly message: string; readonly resource?: { readonly kind: ResourceKind; readonly id: string }; readonly instanceId?: string; readonly location?: string; readonly input?: string; readonly cause?: PublicError }

declare const stateBrand: unique symbol;
declare const queryBrand: unique symbol;
declare const registryBrand: unique symbol;
declare const stateStoreBrand: unique symbol;
declare const runtimeBrand: unique symbol;
declare const viewBrand: unique symbol;
export type DeepReadonly<T> = T extends StateHandle<infer V> ? StateHandle<V> : T extends QueryHandle<infer V> ? QueryHandle<V>
  : T extends ReadonlyMap<infer K, infer V> ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends ReadonlySet<infer V> ? ReadonlySet<DeepReadonly<V>>
  : T extends readonly unknown[] ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type ValueSnapshot<T> = { readonly status: 'missing' } | { readonly status: 'pending' } | { readonly status: 'ready'; readonly value: DeepReadonly<T> } | { readonly status: 'error'; readonly error: PublicError };
export interface StateAddress { readonly scopeId: string; readonly name: string }
export interface StateHandle<T = unknown> {
  readonly [stateBrand]: true; readonly address: StateAddress; readonly generation: number;
  readonly read: () => DeepReadonly<T> | undefined; readonly getSnapshot: () => ValueSnapshot<T>;
  readonly write: (value: Exclude<T, undefined>) => void; readonly reset: () => void;
}
export interface QuerySnapshot<T = unknown> {
  readonly status: 'idle' | 'waiting' | 'running' | 'success' | 'error'; readonly data?: DeepReadonly<T> | undefined;
  readonly dataInputs?: DeepReadonly<Record<string, unknown>> | undefined; readonly error: PublicError | null;
  readonly stale: boolean; readonly waitingReason: 'INPUT_NOT_READY' | 'EXECUTION_BLOCKED' | null;
}
export interface QueryHandle<T = unknown> { readonly [queryBrand]: true; readonly getSnapshot: () => QuerySnapshot<T>; readonly refresh: (signal?: AbortSignal) => Promise<void>; readonly retry: (signal?: AbortSignal) => Promise<void> }
/** Host-owned cells take an inline schema; resource declarations may use typeRef. */
export interface StateDeclaration<T = unknown> { readonly schema: Schema; readonly initial?: Exclude<T, undefined> }
export interface StateScope {
  readonly scopeId: string;
  registerState<T = unknown>(name: string, declaration: StateDeclaration<T>): StateHandle<T>;
  replaceState<T = unknown>(name: string, declaration: StateDeclaration<T>): StateHandle<T>;
  getState(name: string): StateHandle<unknown>; connectClock(target: StateHandle<number>, clock: Clock): () => void; removeState(name: string): void; dispose(): void;
}
export interface StoreObservation {
  readonly values: DeepReadonly<Record<string, unknown>>; readonly states: Readonly<Record<string, ValueSnapshot<unknown>>>;
  readonly changes: readonly { readonly kind: 'added' | 'updated' | 'removed' | 'replaced'; readonly target: StateAddress; readonly generation: number }[];
}
export interface UrlAdapter {
  read(): string; subscribe(listener: () => void): () => void;
  writeOwned(patch: Readonly<Record<string, string | null>>, context: { readonly mode: 'push' | 'replace'; readonly isCurrent: () => boolean }): Awaitable<void | { readonly applied?: boolean }>;
}
export interface UrlConnection {
  readonly ready: Promise<void>; isReady(): boolean;
  restore(): void; getDiagnostics(): readonly PublicError[];
  removeOwned(selected?: readonly StateHandle<any>[]): Promise<void | { readonly applied?: boolean }>;
  dispose(): void;
}
export interface StateStore {
  readonly [stateStoreBrand]: true;
  createScope(): StateScope;
  /** Synchronous atomic changes; an exception restores values, structure and scope lifetimes. */
  transaction<T>(run: () => T & (T extends PromiseLike<unknown> ? never : unknown)): T;
  subscribe(selector: null | StateAddress | readonly StateAddress[], listener: (observation: StoreObservation) => void): () => void;
  writeBatch(changes: readonly (readonly [StateHandle<any>, unknown])[]): void;
  registerReaction(owner: StateScope, reaction: { readonly watch: readonly StateHandle<any>[]; readonly target: StateHandle<any>; readonly value: unknown }): () => void;
  connectUrl(options: { readonly adapter: UrlAdapter; readonly bindings: readonly { readonly target: StateHandle<any>; readonly key?: string; readonly history?: 'push' | 'replace' }[]; readonly restore?: boolean; readonly limits?: Partial<{ readonly maxOwnedBytes: number; readonly maxValueBytes: number; readonly maxItems: number; readonly maxKeys: number }>; readonly onError?: (error: PublicError) => void }): UrlConnection;
  getDiagnostics(): readonly PublicError[]; dispose(): void;
}
export function createStateStore(): StateStore;
/** Explicit time values for application State/Value inputs. */
export interface Clock { now(): number; subscribe(listener: (epochMilliseconds: number) => void): () => void }
/** Scheduling clock used by Query lifetimes, independent from application time inputs. */
export interface TimerClock { readonly now: number | (() => number); setTimeout(callback: () => void, milliseconds: number): unknown; clearTimeout(token: unknown): void }

export type ValuePort = TypeContract & { readonly kind: 'Value' } & ({ readonly required: true; readonly default?: never } | { readonly required?: false; readonly default?: JsonValue });
export type StatePort = TypeContract & { readonly kind: 'State'; readonly required?: boolean; readonly default?: never };
export interface QueryPort { readonly kind: 'Query'; readonly required?: boolean; readonly default?: never; readonly schema?: never; readonly typeRef?: never }
export type Port = ValuePort | StatePort | QueryPort;
type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T];
// An open index signature does not guarantee that any specific key exists.
type NamedJsonKey<K> = K extends string | number ? {} extends Record<K, never> ? never : K : never;
type HasDistinctInputShapes<I, Whole = I> = I extends unknown ? [Whole] extends [I] ? false : true : never;
type FixedActionInputs<I> = [I] extends [object]
  ? true extends HasDistinctInputShapes<I> ? never
  : [keyof I] extends [NamedJsonKey<keyof I>] ? unknown : never
  : never;
type PortFor<V> = [NonNullable<V>] extends [never] ? ValuePort
  : NonNullable<V> extends StateHandle<infer _V> ? StatePort
  : NonNullable<V> extends QueryHandle<infer _V> ? QueryPort : ValuePort;
type PortsFor<I> = {
  readonly [K in keyof I]: K extends RequiredKeys<I> ? PortFor<I[K]> & { readonly required: true } : PortFor<I[K]>
};
type ActionPorts<I> = FixedActionInputs<I> & (
  [RequiredKeys<I>] extends [never] ? { readonly ports?: PortsFor<I> } : { readonly ports: PortsFor<I> }
);
type SchemaValue<S> = S extends { readonly const: infer C } ? C : S extends { readonly enum: readonly (infer E)[] } ? E
  : S extends { readonly anyOf: readonly (infer U)[] } | { readonly oneOf: readonly (infer U)[] } ? SchemaValue<U>
  : S extends { readonly 'x-viewstem-type': 'set'; readonly items: infer V } ? Set<SchemaValue<V>>
  : S extends { readonly 'x-viewstem-type': 'map'; readonly keys: infer K; readonly values: infer V } ? Map<SchemaValue<K>, SchemaValue<V>>
  : S extends { readonly 'x-viewstem-type': 'date' | 'time' | 'datetime' } ? string
  : S extends { readonly type: infer T } ? TypeValue<T, S> : unknown;
type TypeValue<T, S> = T extends readonly unknown[] ? TypeValue<T[number], S> : T extends 'string' ? string : T extends 'number' | 'integer' ? number
  : T extends 'boolean' ? boolean : T extends 'null' ? null : T extends 'array' ? S extends { readonly items: infer I } ? SchemaValue<I>[] : unknown[]
  : T extends 'object' ? S extends { readonly properties: infer P } ? { [K in keyof P as K extends (S extends { readonly required: readonly (infer R)[] } ? R : never) ? K : never]: SchemaValue<P[K]> } & { [K in keyof P as K extends (S extends { readonly required: readonly (infer R)[] } ? R : never) ? never : K]?: SchemaValue<P[K]> } : Record<string, unknown> : unknown;
type ContractValue<C> = C extends { readonly schema: infer S } ? SchemaValue<S> : unknown;
type PortValue<P> = P extends { readonly kind: 'State' } ? StateHandle<ContractValue<P>> : P extends { readonly kind: 'Query' } ? QueryHandle<unknown> : ContractValue<P>;
type GuaranteedInputKeys<P> = {
  [K in keyof P]-?: K extends NamedJsonKey<K> ? P[K] extends { readonly required: true } ? K : never : never
}[keyof P];
type InputsFromPorts<P> = {
  readonly [K in keyof P as K extends GuaranteedInputKeys<P> ? K : never]: PortValue<P[K]>
} & {
  readonly [K in keyof P as K extends GuaranteedInputKeys<P> ? never : K]?: PortValue<NonNullable<P[K]>>
};
export type ChildActionRequest = ReferenceOrInline<'actionRef', 'action', ActionSpec> & { readonly inputs?: Readonly<Record<string, unknown>>; readonly owner?: never; readonly id?: never };
export interface ActionContext<I> { readonly inputs: DeepReadonly<I>; readonly signal: AbortSignal; readonly invokeAction: (request: ChildActionRequest) => Promise<unknown>; readonly capabilities: Readonly<Record<string, unknown>> }
export type ActionHandler<I, O = void> = (context: ActionContext<I>) => [O] extends [void] ? void | Promise<void> : O | Promise<O>;
export type CodeActionSpec<I, O = void> = ActionPorts<I> & { readonly steps?: never } & ([O] extends [void] ? { readonly output?: never } : { readonly output: TypeContract & { readonly value?: never } });
export type CodeActionDefinition<I = {}, O = void> = Resource<'Action', CodeActionSpec<I, O>>;
export interface ActionSnapshot<O = unknown> { readonly status: 'idle' | 'running' | 'success' | 'error'; readonly running: boolean; readonly data: [O] extends [void] ? null : DeepReadonly<O> | null; readonly error: PublicError | null }

export type ValueExpression = JsonValue;
export type InputExpressions = Readonly<Record<string, ValueExpression>>;
export interface PathExpression { readonly '@path': string }
export type ActionSpec = { readonly ports?: Readonly<Record<string, Port>>; readonly steps: readonly Step[]; readonly output?: TypeContract & { readonly value: ValueExpression } };
export type ActionCall = ReferenceOrInline<'actionRef', 'action', ActionSpec> & { readonly id?: string; readonly inputs?: InputExpressions; readonly emit?: never };
export type Step =
  | (ReferenceOrInline<'actionRef', 'spec', ActionSpec> & { readonly kind: 'Action'; readonly id?: string; readonly inputs?: InputExpressions })
  | (ReferenceOrInline<'queryRef', 'spec', QuerySpec> & { readonly kind: 'Query'; readonly id?: string; readonly inputs?: InputExpressions })
  | (ReferenceOrInline<'variableRef', 'spec', VariableSpec> & { readonly kind: 'Variable'; readonly id?: string; readonly inputs?: InputExpressions })
  | { readonly kind: 'SetState'; readonly id?: string; readonly target: PathExpression; readonly value: ValueExpression }
  | { readonly kind: 'RefreshQuery'; readonly id?: string; readonly target: PathExpression }
  | { readonly kind: 'If'; readonly id?: string; readonly condition: ValueExpression; readonly then: readonly Step[]; readonly else?: readonly Step[] }
  | { readonly kind: 'Assert'; readonly id?: string; readonly condition: ValueExpression; readonly message?: ValueExpression };
export interface HttpRequest { readonly method: ValueExpression; readonly path: ValueExpression; readonly baseUrl?: ValueExpression; readonly headers?: ValueExpression; readonly params?: ValueExpression; readonly body?: ValueExpression }
export interface DatasourceSpec { readonly kind: 'Http'; readonly baseUrl: ValueExpression; readonly headers?: ValueExpression; readonly params?: ValueExpression; readonly secrets?: Readonly<Record<string, string>>; readonly auth?: { readonly kind: 'Login'; readonly request: HttpRequest | PathExpression; readonly token: ValueExpression } }
export type QuerySource = (ReferenceOrInline<'queryRef', 'query', QuerySpec> & { readonly inputs?: InputExpressions; readonly request?: never; readonly datasourceRef?: never; readonly datasource?: never })
  | (ReferenceOrInline<'datasourceRef', 'datasource', DatasourceSpec> & { readonly request: HttpRequest; readonly inputs?: never; readonly queryRef?: never; readonly query?: never });
export type TransformStep = { readonly kind: 'Concat'; readonly with: readonly ValueExpression[] } | { readonly kind: 'Join'; readonly right: ValueExpression; readonly mode?: 'left' | 'right' | 'inner'; readonly on: readonly [{ readonly left: string; readonly right: string }, ...{ readonly left: string; readonly right: string }[]] };
export interface QuerySpec { readonly ports?: Readonly<Record<string, ValuePort>>; readonly sources: Readonly<Record<string, QuerySource>>; readonly transform: { readonly input: ValueExpression; readonly steps?: readonly TransformStep[] } }
export interface VariableSpec { readonly ports?: Readonly<Record<string, ValuePort>>; readonly expression: string }
export type QueryUse = ReferenceOrInline<'queryRef', 'query', QuerySpec> & { readonly inputs?: InputExpressions; readonly refresh?: boolean; readonly intervalMs?: number; readonly executeWhen?: ValueExpression; readonly autoRefreshWhen?: ValueExpression };
export interface QueryDefaults { readonly refresh?: boolean; readonly intervalMs?: number }
export type ResourceStateDeclaration = (TypeContract & { readonly kind: 'State'; readonly initial?: ValueExpression }) | (TypeContract & ReferenceOrInline<'variableRef', 'variable', VariableSpec> & { readonly kind: 'Derived'; readonly inputs?: InputExpressions });
export interface Reaction { readonly watch: readonly [PathExpression, ...PathExpression[]]; readonly target: PathExpression; readonly value: JsonValue }
export interface ComponentPublicContract { readonly ports?: Readonly<Record<string, Port>>; readonly slots?: Readonly<Record<string, { readonly required?: boolean }>>; readonly events?: Readonly<Record<string, TypeContract>> }
export type ComponentContract = Resource<'Component', ComponentPublicContract>;
/** Readonly inputs for a ready code Component, inferred from its declared ports. */
export type ComponentInputs<C extends ComponentContract> = C extends unknown
  ? C['spec'] extends { readonly ports: infer P }
    ? DeepReadonly<InputsFromPorts<P>>
    : 'ports' extends keyof C['spec']
      ? DeepReadonly<Partial<InputsFromPorts<NonNullable<C['spec']['ports']>>>>
      : Readonly<Record<never, never>>
  : never;
export interface ComponentSpec extends ComponentPublicContract { readonly states?: Readonly<Record<string, ResourceStateDeclaration>>; readonly queries?: Readonly<Record<string, QueryUse>>; readonly queryDefaults?: QueryDefaults; readonly reactions?: readonly Reaction[]; readonly render: ComponentNode }
export type ViewSpec = Omit<ComponentSpec, 'slots' | 'events'> & { readonly slots?: never; readonly events?: never };
export type ComponentNode = ReferenceOrInline<'componentRef', 'component', ComponentSpec> & {
  readonly id: string; readonly inputs?: InputExpressions; readonly slots?: Readonly<Record<string, readonly ComponentNode[] | PathExpression>>;
  readonly on?: Readonly<Record<string, ActionCall | { readonly emit: string; readonly payload: ValueExpression; readonly actionRef?: never; readonly action?: never; readonly id?: never }>>;
  readonly when?: ValueExpression; readonly repeat?: { readonly items: ValueExpression; readonly as: string; readonly key: ValueExpression };
};
export interface ResourceSpecs { readonly Datasource: DatasourceSpec; readonly Query: QuerySpec; readonly Variable: VariableSpec; readonly Action: ActionSpec; readonly Component: ComponentSpec; readonly View: ViewSpec; readonly Type: { readonly schema: Schema } }
export type AnyResource = { [K in ResourceKind]: Resource<K, ResourceSpecs[K]> }[ResourceKind];
type NativeActionResource = Resource<'Action', {
  readonly ports?: Readonly<Record<string, Port>>;
  readonly output?: TypeContract & { readonly value?: never };
  readonly steps?: never;
}>;
export type RegisteredResource = AnyResource | Resource<'Component', ComponentPublicContract> | NativeActionResource;
type ExtraFields<T, Shape> = T extends unknown ? Exclude<keyof T, keyof Shape> : never;
type ExactActionFields<D extends NativeActionResource> = Record<ExtraFields<D, NativeActionResource>, never> & {
  readonly spec: Record<ExtraFields<D['spec'], NativeActionResource['spec']>, never>
};
type InferredActionInputs<S extends NativeActionResource['spec']> = S extends unknown
  ? 'ports' extends keyof S
    ? S extends { readonly ports: Readonly<Record<string, Port>> }
      ? InputsFromPorts<NonNullable<S['ports']>>
      : Partial<InputsFromPorts<NonNullable<S['ports']>>>
    : {}
  : never;
type InferredActionOutput<S> = S extends { readonly output: infer C } ? ContractValue<C> : void;
export type CodeActionEntry<D extends NativeActionResource = NativeActionResource> = {
  readonly definition: D & NoInfer<ExactActionFields<D>>;
  readonly implementation: ActionHandler<NoInfer<InferredActionInputs<D['spec']>>, NoInfer<InferredActionOutput<D['spec']>>>;
  readonly requires?: readonly string[];
};
// Only implement() provides this proof. Spreading an entry drops the private member.
declare class AuthoredCodeAction {
  private readonly authoredCodeAction;
}
type CodeActionContractInput<D> = { readonly definition: D; readonly requires?: readonly string[] };
export type ImplementedCodeAction<D, I, O> = AuthoredCodeAction & {
  readonly definition: D;
  readonly implementation: ActionHandler<I, O>;
  readonly requires: readonly string[];
};
export type CodeActionContract<D, I, O> = {
  readonly implement: (handler: ActionHandler<I, O>) => ImplementedCodeAction<D, I, O>;
};
export function defineCodeAction<const D extends NativeActionResource>(
  input: CodeActionContractInput<D & NoInfer<ExactActionFields<D>>>,
): CodeActionContract<D, InferredActionInputs<D['spec']>, InferredActionOutput<D['spec']>>;
export function defineCodeAction<I = never, O = void>(
  input: [I] extends [never] ? never : CodeActionContractInput<NoInfer<CodeActionDefinition<I, O>>>,
): CodeActionContract<CodeActionDefinition<I, O>, I, O>;
export interface ComponentBinding<T = unknown> {
  readonly contract: ComponentContract;
  readonly connectorId: string;
  readonly implementation: T;
}
declare const resourceSetBrand: unique symbol;
export interface ResourceSet {
  readonly [resourceSetBrand]: true;
  readonly id: string;
  readonly version: string;
  readonly dependencies: readonly ResourceSet[];
  readonly resources: readonly AnyResource[];
  readonly actions: readonly { readonly definition: NativeActionResource; readonly implementation: ActionHandler<never, unknown>; readonly requires: readonly string[] }[];
  readonly components: readonly ComponentBinding[];
}
type ResourceSetInput = Pick<ResourceSet, 'id' | 'version'> & Partial<Pick<ResourceSet, 'dependencies' | 'resources' | 'components'>>;
export function defineResourceSet<const Actions extends readonly NativeActionResource[] = readonly []>(input: ResourceSetInput & {
  readonly actions?: { readonly [K in keyof Actions]: CodeActionEntry<Actions[K]> | AuthoredCodeAction };
}): ResourceSet;
export type ReplaceResourceInput<D extends NativeActionResource = NativeActionResource> =
  | { readonly resource: AnyResource; readonly action?: never; readonly component?: never }
  | { readonly action: CodeActionEntry<D> | AuthoredCodeAction; readonly resource?: never; readonly component?: never }
  | { readonly component: ComponentBinding; readonly resource?: never; readonly action?: never };
export interface Registry {
  readonly [registryBrand]: true;
  registerResources(resources: readonly AnyResource[]): this;
  registerResourceSet(set: ResourceSet): this;
  updateResource(definition: RegisteredResource): this;
  replaceResource<const D extends NativeActionResource>(entry: ReplaceResourceInput<D>): this;
  registerAction<const D extends NativeActionResource>(
    definition: D & NoInfer<ExactActionFields<D>>,
    implementation: ActionHandler<NoInfer<InferredActionInputs<D['spec']>>, NoInfer<InferredActionOutput<D['spec']>>>,
  ): this;
  registerAction<I = never, O = void>(
    definition: [I] extends [never] ? never : NoInfer<CodeActionDefinition<I, O>>,
    implementation: ActionHandler<NoInfer<I>, O>,
  ): this;
  registerComponentContract(contract: ComponentContract): this;
  registerComponentContracts(contracts: readonly ComponentContract[]): this;
  get<K extends ResourceKind>(kind: K, id: string): DeepReadonly<Extract<RegisteredResource, { kind: K }>>;
  list(filter?: ResourceKind | Partial<Pick<RegisteredResource, 'kind' | 'id' | 'name'>> | ((resource: DeepReadonly<RegisteredResource>) => boolean)): RegisteredResource[];
  exportResource<K extends ResourceKind>(kind: K, id: string): Extract<RegisteredResource, { kind: K }>;
  isCode(kind: ResourceKind, id: string): boolean;
}
export interface RegistryOptions { readonly resources?: readonly AnyResource[]; readonly componentContracts?: readonly ComponentContract[]; readonly functions?: readonly CelFunction[] }
export function createRegistry(options?: readonly AnyResource[] | RegistryOptions): Registry;
export type ViewSource = (ViewSpec & { readonly ref?: never }) | { readonly ref: string; readonly render?: never };
export interface ViewOptions {
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly url?: { readonly adapter: UrlAdapter; readonly bindings: readonly { readonly state: string; readonly key?: string; readonly history?: 'push' | 'replace' }[]; readonly limits?: Partial<{ readonly maxOwnedBytes: number; readonly maxValueBytes: number; readonly maxItems: number; readonly maxKeys: number }> };
  readonly signal?: AbortSignal;
}
export interface InitialReport { readonly generation: number; readonly queryErrors: readonly { readonly instanceId: string; readonly query: string; readonly error: PublicError }[] }
declare const applicationBrand: unique symbol;
export interface ViewApplication { readonly [applicationBrand]: true }
export interface NodeSnapshot { readonly id: string; readonly instanceId?: string | undefined; readonly address?: string | undefined; readonly generation?: number | undefined; readonly componentRef?: string | undefined; readonly status: 'ready' | 'pending' | 'error' | 'missing'; readonly error: PublicError | null; readonly inputs: DeepReadonly<Record<string, unknown>>; readonly children: readonly NodeSnapshot[]; readonly slots: Readonly<Record<string, readonly NodeSnapshot[]>> }
export interface ViewSnapshot { readonly generation: number; readonly lifetime?: string | undefined; readonly roots: readonly NodeSnapshot[]; readonly states: Readonly<Record<string, ValueSnapshot<unknown>>>; readonly queries: Readonly<Record<string, QuerySnapshot<unknown>>>; readonly actions: Readonly<Record<string, ActionSnapshot>>; readonly errors: readonly PublicError[] }
export interface RuntimeSettings {
  readonly stateStore?: StateStore;
  readonly requestExecutor?: RequestExecutor;
  readonly hostCapabilities?: Readonly<Record<string, unknown>>;
  readonly resourceResolver?: (kind: ResourceKind, id: string, context: { readonly signal: AbortSignal }) => Awaitable<AnyResource>;
  readonly authorize?: (context:
    | { readonly operation: 'invoke'; readonly owner: unknown; readonly definition: unknown; readonly resource: { readonly kind: 'Action'; readonly id: string } | null }
    | { readonly operation: 'update'; readonly owner: View; readonly definition: ViewSpec }
  ) => boolean;
  readonly requestTimeoutMs?: number;
  readonly urlCleanupTimeoutMs?: number;
  readonly clock?: TimerClock;
}
export type RuntimeOptions = RuntimeSettings & (
  | ({ readonly registry?: never } & RegistryOptions)
  | ({ readonly registry: Registry } & { readonly [K in keyof RegistryOptions]?: never })
);
export interface Runtime {
  readonly [runtimeBrand]: true;
  readonly registry: Registry; readonly stateStore: StateStore;
  createView(source: ViewSource, options?: ViewOptions): Promise<View>;
  invokeAction(request: ActionRequest): Promise<unknown>;
  dispose(): void;
}
export function createRuntime(options?: RuntimeOptions): Runtime;
export type ActionRequest = ReferenceOrInline<'actionRef', 'action', ActionSpec> & {
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
};
export interface View {
  readonly [viewBrand]: true;
  readonly initial: ViewApplication;
  setInputs(inputs: Readonly<Record<string, unknown>>): Promise<ViewApplication>;
  updateDefinition(spec: ViewSpec, options?: { readonly inputs?: Readonly<Record<string, unknown>>; readonly states?: Readonly<Record<string, unknown>> }): Promise<ViewApplication>;
  applyResourceSets(options: { readonly setIds: readonly string[]; readonly definition?: ViewSpec; readonly inputs?: Readonly<Record<string, unknown>>; readonly states?: Readonly<Record<string, unknown>>; readonly signal?: AbortSignal }): Promise<ViewApplication>;
  replace(source: ViewSource, options?: ViewOptions): Promise<ViewApplication>;
  whenSettled(application: ViewApplication): Promise<InitialReport>;
  invokeAction(request: ActionRequest): Promise<unknown>;
  exportDefinition(): ViewSpec;
  getState(name: string, instanceId?: string): StateHandle<unknown>; getQuery(name: string, instanceId?: string): QueryHandle<unknown>;
  getSnapshot(): ViewSnapshot;
  /** State writes during an active projection queue a follow-up; the delivered snapshot stays unchanged. */
  subscribe(listener: (snapshot: ViewSnapshot) => void): () => void;
  emit(target: string | NodeSnapshot | { readonly address: string; readonly generation: number }, event: string, payload: unknown): Promise<unknown>;
  dispose(): void;
}

export type CelValue = null | boolean | number | string | readonly CelValue[] | { readonly [key: string]: CelValue | undefined } | ReadonlySet<CelValue> | ReadonlyMap<string | number, CelValue>;
/** Pure callbacks are synchronous. Explicit input tuples receive deeply readonly values. */
export interface CelFunction<I extends readonly unknown[] = readonly any[], O extends CelValue = CelValue> { readonly name: string; readonly inputs: readonly Schema[]; readonly output: Schema; readonly run: (...args: { [K in keyof I]: DeepReadonly<I[K]> }) => O }
export interface HttpExecutionPlan { readonly version: 1; readonly requestId: string; readonly datasource: DatasourceSpec; readonly request: HttpRequest; readonly inputs: Readonly<Record<string, JsonValue>> }
export interface HttpResponse { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly body: JsonValue }
export type RequestExecutor = (plan: HttpExecutionPlan, context: { readonly signal: AbortSignal }) => Awaitable<HttpResponse>;
export function mergeOwnedUrl(href: string, patch: Readonly<Record<string, string | null>>): string;
export type GridConfig = { readonly rowSpan?: number; readonly columnSpan?: number } & ({ readonly row: number; readonly column: number } | { readonly row?: never; readonly column?: never });
export interface GridPlacement { readonly row: number; readonly column: number; readonly rowSpan: number; readonly columnSpan: number }
export function computeGridLayout<A>(declarations: readonly { readonly id: string; readonly repeat?: unknown }[], expanded: readonly { readonly id: string; readonly address: A }[], layout?: Readonly<Record<string, GridConfig>>): Map<A, GridPlacement>;

// Keep helper declarations and opaque brands private to this module.
export {};
```

### Core renderer

`packages/core/src/renderer.d.ts`

```ts
import type { ComponentBinding, InitialReport, PublicError, Runtime, View, ViewApplication, ViewOptions, ViewSnapshot, ViewSource } from './index.js';

export interface RendererDiagnostic {
  readonly phase: 'prepare' | 'node' | 'query' | 'action' | 'url' | 'render';
  readonly error: PublicError;
  readonly application?: ViewApplication;
  readonly nodeId?: string;
}
export type RendererErrorListener = (diagnostic: RendererDiagnostic) => void;

/** Shared diagnostics for renderer implementations. */
export function createDiagnostic(phase: RendererDiagnostic['phase'], cause: unknown, details?: {
  application?: ViewApplication;
  nodeId?: string | undefined;
}): RendererDiagnostic;
export function notifyDiagnostic(diagnostic: RendererDiagnostic, ...observers: {
  listener: RendererErrorListener | undefined;
  isOpen?: () => boolean;
}[]): void;
export function createRenderError(missing: boolean, details?: {
  componentId?: string | undefined;
  instanceId?: string | undefined;
}): PublicError;
export function createPreparationError(message: string): PublicError;

export interface RenderAttachment {
  whenRendered(): Promise<void>;
  whenSettled(application: ViewApplication): Promise<InitialReport>;
  detach(): Promise<void>;
}
export interface MountedView extends Omit<RenderAttachment, 'detach'> {
  readonly ready: Promise<View>;
  unmount(): Promise<void>;
}

type OptionsWithDiagnostics<Options> = Options & { readonly onError?: RendererErrorListener };
export type RenderEmission = (...args: [...Parameters<View['emit']>, current?: () => boolean]) => Promise<unknown>;
export interface RenderProjection {
  readonly generation: number;
  readonly sequence: number;
  readonly snapshot: ViewSnapshot;
  componentBinding(id: string): ComponentBinding | undefined;
  isCodeComponent(id: string): boolean;
}
export function subscribeRenderProjection(view: View, listener: (projection: RenderProjection) => void): () => void;
export interface Renderer<Options extends object = {}, Target extends object = object> {
  readonly runtime: Runtime;
  mount(options: Omit<ViewOptions, 'signal'> & OptionsWithDiagnostics<Options> & {
    readonly target: Target;
    readonly source: ViewSource;
  }): MountedView;
  attach(view: View, target: Target, options?: OptionsWithDiagnostics<Options>): RenderAttachment;
  dispose(): Promise<void>;
}
export interface RendererHostOptions<Options extends object, Target extends object = object> {
  readonly ownsRuntime: boolean;
  readonly onError?: RendererErrorListener;
  readonly validateTarget: (target: Target) => boolean;
  /** Clean up framework-owned views after the host has stopped accepting new work. */
  readonly disposeOwned?: () => Promise<void>;
  readonly connect: (view: View, target: Target, options: OptionsWithDiagnostics<Options>,
    onRenderError: (error: unknown, nodeId?: string) => void,
    connection: { readonly isOpen: () => boolean; readonly emit: RenderEmission }) => {
      dispose(): void | Promise<void>;
      whenRendered(generation: number, sequence: number): void | Promise<void>;
    };
}
export function createRendererHost<Options extends object = {}, Target extends object = object>(
  runtime: Runtime, options: RendererHostOptions<Options, Target>,
): Renderer<Options, Target>;

/** Capture creation settings for a framework-owned View before starting it. Its signal owns the View until disposal. */
export function prepareOwnedView(runtime: Runtime, source: ViewSource, options?: Pick<ViewOptions, 'inputs'>): (
  signal: AbortSignal, owner?: { isOpen?: () => boolean; onCreate?: (close: () => Promise<void>) => void },
) => Promise<View>;

/** For connections hosted inside a framework's existing component tree. */
export function createRenderWaiter(view: View, render: (generation: number, sequence: number) => void | Promise<void>, options?: {
  onError?: RendererErrorListener;
  getErrorListener?: () => RendererErrorListener | undefined;
  deliverDiagnostic?: (diagnostic: RendererDiagnostic) => void;
  onClose?: () => void;
  isOpen?: () => boolean;
}): Pick<RenderAttachment, 'whenRendered' | 'whenSettled'> & { emit: View['emit']; dispose(): void };
```

### Core HTTP

`packages/core/src/http.d.ts`

```ts
import type { Awaitable, HttpExecutionPlan, HttpResponse } from './index.js';
export type { HttpExecutionPlan, HttpResponse, RequestExecutor } from './index.js';

export interface HttpExecutorOptions {
  readonly transport?: typeof fetch; readonly requestTimeoutMs?: number; readonly caller?: unknown;
  readonly clock?: { readonly now: () => number; readonly set: (callback: () => void, milliseconds: number) => unknown; readonly clear: (token: unknown) => void };
  readonly authorize?: (context: { readonly caller: unknown; readonly destination: string }) => Awaitable<boolean>;
  readonly resolveSecret?: (reference: string, context: { readonly caller: unknown; readonly destination: string; readonly signal: AbortSignal }) => Awaitable<string>;
}
export function createHttpExecutor(options?: HttpExecutorOptions): (plan: HttpExecutionPlan, context?: { readonly signal?: AbortSignal }) => Promise<HttpResponse>;

export {};
```

### Core CEL

`packages/core/src/cel.d.ts`

```ts
import type { CelFunction, Schema } from './index.js';
export type { CelFunction, CelValue } from './index.js';

export interface CelLimits { readonly expressionChars: number; readonly inputNodes: number; readonly outputNodes: number; readonly valueBytes: number; readonly depth: number }
export const defaultCelLimits: CelLimits;
export interface CelOptions { readonly inputs?: Readonly<Record<string, Schema>>; readonly output?: Schema; readonly functions?: readonly CelFunction[]; readonly limits?: Partial<CelLimits>; readonly cost?: number }
export function compileCel(expression: string, options?: CelOptions): (bindings?: Readonly<Record<string, unknown>>) => unknown;
export function evaluateCel(expression: string, bindings: Readonly<Record<string, unknown>>, options?: CelOptions): unknown;

export {};
```

### DOM entry point

`packages/dom/src/index.ts`

```ts
export { createRenderer } from './renderer.js';
export type { BrowserRenderer, RendererOptions, BrowserDisplayOptions, DisplayFallbackContext } from './renderer.js';
export { DOM_CONNECTOR_ID, domConnector } from './dom-connector.js';
export type { DomComponent } from './dom-connector.js';
export type { ComponentConnector, ComponentMountContext, MountedComponent } from './connector.js';
export type { MountedView, RenderAttachment, RendererDiagnostic } from '@viewstem/core/renderer';
```

### DOM renderer and fallbacks

`packages/dom/src/renderer.ts`

```ts
export interface DisplayFallbackContext {
  readonly parent: HTMLElement;
  readonly anchor: Node;
  readonly node: NodeSnapshot;
  readonly error: PublicError | null;
}
export interface MountedDisplayFallback {
  update?(context: DisplayFallbackContext): void;
  whenRendered?(): void | Promise<void>;
  dispose(): void | Promise<void>;
}
export interface BrowserDisplayOptions {
  readonly hostContext?: unknown;
  /** Insert before the anchor. Return a handle to update in place or clean up resources outside the DOM range. */
  readonly fallback?: (context: DisplayFallbackContext) => void | MountedDisplayFallback;
}
export type BrowserRenderer = Renderer<BrowserDisplayOptions, HTMLElement>;
export interface RendererOptions {
  readonly runtime: Runtime;
  readonly connectors?: readonly ComponentConnector[];
  readonly onError?: RendererErrorListener;
}
export function createRenderer(options: RendererOptions): BrowserRenderer;
```

### DOM connector

`packages/dom/src/connector.ts`

```ts
import type { NodeSnapshot } from '@viewstem/core';

export interface ComponentMountContext {
  readonly parent: HTMLElement;
  readonly anchor: Node;
  readonly node: NodeSnapshot;
  readonly signal: AbortSignal;
  readonly hostContext?: unknown;
  readonly invalidate: () => void;
  readonly emit: (event: string, payload: unknown) => Promise<unknown>;
  readonly provideSlot: (name: string, host: HTMLElement, before?: Node | null) => () => void;
}

export interface MountedComponent {
  update(node: NodeSnapshot, signal: AbortSignal): void;
  setPending(pending: boolean): void;
  /** Report completion when the connector updates its own DOM asynchronously. */
  whenRendered?(signal: AbortSignal): void | Promise<void>;
  afterChildren?(node: NodeSnapshot): void;
  dispose(): void | Promise<void>;
}

export interface ComponentConnector {
  readonly id: string;
  readonly renderUnready?: boolean;
  accepts(implementation: unknown): boolean;
  mount(implementation: unknown, context: ComponentMountContext): MountedComponent;
}
```

### DOM mount implementation

`packages/dom/src/dom-connector.ts`

```ts
export const DOM_CONNECTOR_ID = 'dom';
export interface DomComponent {
  mount(context: ComponentMountContext): MountedComponent;
}
export declare const domConnector: ComponentConnector;
```

### Svelte entry point

`packages/svelte/src/lib/index.ts`

```ts
export { createRenderer, svelteComponent, svelteConnector, SVELTE_CONNECTOR_ID } from './renderer.js';
export { transformError } from './lifecycle.js';
import type { Component } from 'svelte';
import type { ViewApplication, InitialReport } from '@viewstem/core';
import type { ViewstemViewComponentProps } from './types.js';
import ViewstemViewComponent from './ViewstemView.svelte';
// An explicit package-boundary type also resolves in NodeNext consumers, where
// generated .svelte.d.ts files otherwise fall back to Svelte's ambient wildcard.
export const ViewstemView: Component<ViewstemViewComponentProps, { whenRendered(): Promise<void>; whenSettled(application: ViewApplication): Promise<InitialReport> }> = ViewstemViewComponent;
export type { ComponentAdapterProps, ComponentAdapter, RendererDiagnostic, RendererErrorListener, RenderFallback, ViewstemViewProps, ViewstemSourceProps, ViewstemViewComponentProps, RenderAttachment, MountedView, RenderOptions, Renderer, RendererOptions } from './types.js';
// Shared contracts remain core's types; consumers do not need a second import.
export type {
  ActionCall, ActionSnapshot, ActionSpec, AnyResource,
  CelFunction, CelValue, ChildActionRequest, Clock, ComponentContract, ComponentNode,
  ComponentPublicContract, ComponentSpec, DatasourceSpec, DeepReadonly,
  GridConfig, GridPlacement, HttpExecutionPlan, HttpRequest, HttpResponse,
  InitialReport, InputExpressions, JsonValue, ActionHandler,
  CodeActionDefinition, CodeActionSpec, ActionContext, NodeSnapshot,
  PathExpression, Port, PublicError, QueryDefaults, QueryHandle, QueryPort,
  QuerySnapshot, QuerySource, QuerySpec, QueryUse, Reaction, RegisteredResource,
  Registry, RequestExecutor, Resource, ResourceKind, ResourceSpecs,
  ResourceStateDeclaration, Runtime, RuntimeOptions, Schema, StateScope, StateAddress,
  StateDeclaration, StateHandle, StatePort, StateStore, Step, StoreObservation,
  TimerClock, TransformStep, TypeContract, UrlAdapter, UrlConnection,
  ValueExpression, ValuePort, ValueSnapshot, VariableSpec, View,
  ViewSnapshot, ViewSpec, ViewSource, ViewApplication, ViewOptions,
} from '@viewstem/core';
```

### Svelte renderer and component binding

`packages/svelte/src/lib/renderer.ts`

```ts
export const SVELTE_CONNECTOR_ID = 'svelte';
export function svelteComponent<const C extends ComponentContract>(contract: C, implementation: ComponentAdapter<NoInfer<C>>): ComponentBinding<ComponentAdapter<C>>;
export declare const svelteConnector: ComponentConnector;
export function createRenderer(options?: RendererOptions): Renderer;
```

### Svelte types

`packages/svelte/src/lib/types.ts`

```ts
import type { Component, Snippet } from 'svelte';
import type { ComponentContract, ComponentInputs, NodeSnapshot, PublicError, Runtime, RuntimeOptions, View, ViewOptions, ViewSource } from '@viewstem/core';
import type { ComponentConnector, ComponentMountContext } from '@viewstem/dom';
import type { Renderer as CoreRenderer, RendererDiagnostic, MountedView, RenderAttachment } from '@viewstem/core/renderer';
type AdapterNode<C extends ComponentContract> = ComponentContract extends C ? NodeSnapshot
  : Omit<NodeSnapshot, 'status' | 'inputs'> & (
    | { readonly status: 'ready'; readonly inputs: ComponentInputs<C> }
    | { readonly status: Exclude<NodeSnapshot['status'], 'ready'>; readonly inputs: Partial<ComponentInputs<C>> }
  );
interface AdapterProps<Node> {
  readonly inputs: NodeSnapshot['inputs'];
  readonly node: Node;
  readonly emit: ComponentMountContext['emit'];
  readonly renderSlot: Snippet<[name: string]>;
  readonly provideSlot: ComponentMountContext['provideSlot'];
}
export type ComponentAdapterProps<C extends ComponentContract = ComponentContract> = AdapterProps<AdapterNode<C>>;
export type ComponentAdapter<C extends ComponentContract = ComponentContract> = Component<ComponentAdapterProps<C>>;
export type { RendererDiagnostic, MountedView, RenderAttachment };
export type RendererErrorListener = (diagnostic: RendererDiagnostic) => void;
export type RenderFallback = Snippet<[node: NodeSnapshot, error: PublicError | null]>;
export interface ViewstemViewProps { readonly renderer: Renderer; readonly view: View; readonly onError?: RendererErrorListener; readonly fallback?: RenderFallback; }
export type ViewstemSourceProps = Omit<ViewstemViewProps, 'view'> & Pick<ViewOptions, 'inputs'> & {
  readonly source: ViewSource;
  readonly view?: never;
  readonly pending?: Snippet;
  readonly prepareError?: Snippet<[error: PublicError]>;
};
export type ViewstemViewComponentProps = ViewstemSourceProps | (ViewstemViewProps & {
  readonly source?: never;
  readonly inputs?: never;
  readonly pending?: never;
  readonly prepareError?: never;
});
export interface RenderOptions { readonly context?: Map<unknown, unknown>; readonly onError?: RendererErrorListener; readonly fallback?: RenderFallback; }
export type Renderer = CoreRenderer<RenderOptions, HTMLElement>;
export type RendererOptions = { readonly onError?: RendererErrorListener; readonly connectors?: readonly ComponentConnector[] } & ((RuntimeOptions & { readonly runtime?: never }) | ({ readonly runtime: Runtime } & { readonly [K in keyof RuntimeOptions]?: never }));
```

### Svelte error handler

`packages/svelte/src/lib/lifecycle.ts`

```ts
export function transformError(cause: unknown): PublicError;
```

### UI entry point

`packages/ui/src/index.ts`

```ts
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
```
