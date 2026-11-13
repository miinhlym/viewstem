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
export interface ActionContext<I> { readonly inputs: DeepReadonly<I>; readonly signal: AbortSignal; readonly invokeAction: (request: ChildActionRequest) => Promise<unknown> }
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
export interface Registry {
  readonly [registryBrand]: true;
  registerResources(resources: readonly AnyResource[]): this;
  updateResource(definition: RegisteredResource): this;
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
  readonly resourceResolver?: (kind: ResourceKind, id: string, context: { readonly signal: AbortSignal }) => Awaitable<AnyResource>;
  readonly authorize?: (context: { readonly operation: 'invoke'; readonly owner: unknown; readonly definition: unknown } | { readonly operation: 'update'; readonly owner: View; readonly definition: ViewSpec }) => boolean;
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
  dispose(): void;
}
export function createRuntime(options?: RuntimeOptions): Runtime;
export type ActionRequest = ReferenceOrInline<'actionRef', 'action', ActionSpec> & { readonly inputs?: Readonly<Record<string, unknown>> };
export interface View {
  readonly [viewBrand]: true;
  readonly initial: ViewApplication;
  setInputs(inputs: Readonly<Record<string, unknown>>): Promise<ViewApplication>;
  updateDefinition(spec: ViewSpec, options?: { readonly inputs?: Readonly<Record<string, unknown>>; readonly states?: Readonly<Record<string, unknown>> }): Promise<ViewApplication>;
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
