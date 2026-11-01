// Compile-only experimental contracts. No runtime implementation or public SDK.
export type Awaitable<T> = T | Promise<T>;
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [name: string]: JsonValue };
// This fixture checks container shape and XOR, not the complete Schema vocabulary.
export type Schema = boolean | { readonly [keyword: string]: JsonValue };
export type TypeContract =
  | { readonly schema: Schema; readonly typeRef?: never }
  | { readonly typeRef: string; readonly schema?: never };
export type ReferenceOrInline<Ref extends string, Inline extends string, Body> =
  | ({ readonly [K in Ref]: string } & { readonly [K in Inline]?: never })
  | ({ readonly [K in Inline]: Body } & { readonly [K in Ref]?: never });

export type ResourceKind = 'Datasource' | 'Query' | 'Variable' | 'Action' | 'Component' | 'View' | 'Type';
export interface Resource<K extends ResourceKind = ResourceKind, S = Readonly<Record<string, unknown>>> {
  readonly kind: K; readonly id: string; readonly name?: string; readonly spec: S;
}
export interface PublicError {
  readonly code: string; readonly message: string;
  readonly resource?: { readonly kind: ResourceKind; readonly id: string };
  readonly instanceId?: string; readonly location?: string; readonly input?: string; readonly cause?: PublicError;
}

declare const stateBrand: unique symbol;
declare const queryBrand: unique symbol;
declare const storeBrand: unique symbol;
declare const registryBrand: unique symbol;
declare const viewBrand: unique symbol;
export type DeepReadonly<T> = T extends StateHandle<infer V> ? StateHandle<V>
  : T extends QueryHandle<infer V> ? QueryHandle<V>
  : T extends ReadonlyMap<infer K, infer V> ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends ReadonlySet<infer V> ? ReadonlySet<DeepReadonly<V>>
  : T extends readonly unknown[] ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

export type ValueSnapshot<T> =
  | { readonly status: 'missing' }
  | { readonly status: 'pending' }
  | { readonly status: 'ready'; readonly value: DeepReadonly<T> }
  | { readonly status: 'error'; readonly error: PublicError };
export interface StateAddress { readonly scopeId: string; readonly name: string }
export interface StateHandle<T> {
  readonly [stateBrand]: true; readonly address: StateAddress; readonly generation: number;
  readonly read: () => DeepReadonly<T> | undefined;
  readonly snapshot: () => ValueSnapshot<T>;
  readonly write: (value: Exclude<T, undefined>) => void;
  readonly reset: () => void;
}
export interface QuerySnapshot<T> {
  readonly status: 'idle' | 'waiting' | 'running' | 'success' | 'error';
  readonly data?: DeepReadonly<T>; readonly dataInputs?: DeepReadonly<Record<string, unknown>>;
  readonly error: PublicError | null; readonly stale: boolean;
  readonly waitingReason: 'INPUT_NOT_READY' | 'EXECUTION_BLOCKED' | null;
}
export interface QueryHandle<T> {
  readonly [queryBrand]: true;
  readonly snapshot: () => QuerySnapshot<T>;
  readonly refresh: () => Promise<void>;
  readonly retry: () => Promise<void>;
}
export type StateDeclaration<T> = TypeContract & { readonly initial?: Exclude<T, undefined> };
export interface Scope {
  readonly scopeId: string;
  registerState<T>(name: string, declaration: StateDeclaration<T>): StateHandle<T>;
  getState(name: string): StateHandle<unknown>;
  replaceState<T>(name: string, declaration: StateDeclaration<T>): StateHandle<T>;
  removeState(name: string): void;
  dispose(): void;
}
export interface StoreObservation {
  readonly values: DeepReadonly<Record<string, unknown>>;
  readonly states: Readonly<Record<string, ValueSnapshot<unknown>>>;
  readonly changes: readonly { readonly kind: 'added' | 'updated' | 'removed' | 'replaced'; readonly target: StateAddress; readonly generation: number }[];
}
export interface StateStore {
  readonly [storeBrand]: true;
  createScope(): Scope;
  subscribe(selector: 'all' | StateAddress | readonly StateAddress[], listener: (observation: StoreObservation) => void): () => void;
}
export interface Clock { now(): number; subscribe(listener: (epochMilliseconds: number) => void): () => void }

export type ValuePort = TypeContract & { readonly kind: 'Value' } & (
  | { readonly required: true; readonly default?: never }
  | { readonly required?: false; readonly default?: JsonValue });
export type StatePort = TypeContract & { readonly kind: 'State'; readonly required?: boolean; readonly default?: never };
export interface QueryPort { readonly kind: 'Query'; readonly required?: boolean; readonly default?: never }
export type Port = ValuePort | StatePort | QueryPort;
export type PortsFor<I> = { readonly [K in keyof I]: I[K] extends StateHandle<infer _V> ? StatePort : I[K] extends QueryHandle<infer _V> ? QueryPort : ValuePort };

export type ChildActionRequest = ReferenceOrInline<'actionRef', 'action', ActionSpec> & {
  readonly inputs?: Readonly<Record<string, unknown>>; readonly owner?: never; readonly id?: never;
};
export interface NativeContext<I> {
  readonly inputs: DeepReadonly<I>; readonly signal: AbortSignal;
  readonly invokeAction: (request: ChildActionRequest) => Promise<unknown>;
}
// The union avoids the special assignability of an exact () => void target,
// while accepting both synchronous and asynchronous return omission.
export type NativeAction<I, O = void> = (context: NativeContext<I>) =>
  [O] extends [void] ? void | Promise<void> : O | Promise<O>;
export type NativeActionSpec<I, O> = { readonly ports?: PortsFor<I>; readonly steps?: never } & (
  [O] extends [void] ? { readonly output?: never } : { readonly output: TypeContract & { readonly value?: never } });
export type NativeActionDefinition<I, O = void> = Resource<'Action', NativeActionSpec<I, O>>;
export interface ActionObservation<O> {
  readonly status: 'idle' | 'running' | 'success' | 'error'; readonly running: boolean;
  readonly data: [O] extends [void] ? null : DeepReadonly<O> | null; readonly error: PublicError | null;
}

export type ValueExpression = JsonValue;
export type InputExpressions = Readonly<Record<string, ValueExpression>>;
export type ActionSpec = {
  readonly ports?: Readonly<Record<string, Port>>; readonly steps: readonly Step[];
  readonly output?: TypeContract & { readonly value: ValueExpression };
};
export type ActionCall = ReferenceOrInline<'actionRef', 'action', ActionSpec> & { readonly id?: string; readonly inputs?: InputExpressions };
export type QuerySpec = { readonly ports?: Readonly<Record<string, ValuePort>>; readonly sources: Readonly<Record<string, unknown>> };
export type QueryUse = ReferenceOrInline<'queryRef', 'query', QuerySpec> & { readonly inputs?: InputExpressions; readonly executeWhen?: ValueExpression };
export type Step =
  | (ReferenceOrInline<'actionRef', 'spec', ActionSpec> & { readonly kind: 'Action'; readonly id?: string; readonly inputs?: InputExpressions })
  | (ReferenceOrInline<'queryRef', 'spec', QuerySpec> & { readonly kind: 'Query'; readonly id?: string; readonly inputs?: InputExpressions })
  | { readonly kind: 'SetState'; readonly target: { readonly '@path': string }; readonly value: ValueExpression }
  | { readonly kind: 'RefreshQuery'; readonly target: { readonly '@path': string } }
  | { readonly kind: 'If'; readonly condition: ValueExpression; readonly then: readonly Step[]; readonly else?: readonly Step[] }
  | { readonly kind: 'Assert'; readonly condition: ValueExpression; readonly message?: ValueExpression };
export type ComponentContract = Resource<'Component', {
  readonly ports?: Readonly<Record<string, Port>>;
  readonly slots?: Readonly<Record<string, { readonly required?: boolean }>>;
  readonly events?: Readonly<Record<string, TypeContract>>;
}>;
export type ComponentNode = ReferenceOrInline<'componentRef', 'component', ComponentSpec> & {
  readonly id: string; readonly inputs?: InputExpressions;
  readonly slots?: Readonly<Record<string, readonly ComponentNode[] | { readonly '@path': string }>>;
  readonly on?: Readonly<Record<string, ActionCall | { readonly emit: string; readonly payload: ValueExpression }>>;
  readonly when?: ValueExpression;
};
export interface ComponentSpec {
  readonly ports?: Readonly<Record<string, Port>>;
  readonly states?: Readonly<Record<string, StateDeclaration<unknown> & { readonly kind: 'State' }>>;
  readonly queries?: Readonly<Record<string, QueryUse>>;
  readonly slots?: Readonly<Record<string, { readonly required?: boolean }>>;
  readonly events?: Readonly<Record<string, TypeContract>>;
  readonly render: ComponentNode;
}
export type ViewSpec = Omit<ComponentSpec, 'slots' | 'events'>;
// Deliberately small declaration vocabulary; detailed source/schema validation
// remains runtime work. Known nested contracts still retain their XOR checks.
export type AnyResource =
  | Resource<'View', ViewSpec>
  | Resource<'Component', ComponentSpec>
  | Resource<'Action', ActionSpec>
  | Resource<'Query', QuerySpec>
  | Resource<'Type', { readonly schema: Schema }>
  | Resource<'Variable', { readonly ports?: Readonly<Record<string, ValuePort>>; readonly expression: string }>
  | Resource<'Datasource', { readonly kind: 'Http'; readonly baseUrl?: ValueExpression; readonly [field: string]: unknown }>;
export type ViewTarget = ReferenceOrInline<'viewRef', 'view', ViewSpec> & { readonly inputs?: Readonly<Record<string, unknown>> };
export interface InitialReport { readonly generation: number; readonly queryErrors: readonly PublicError[] }
export interface ApplicationResult { readonly initial: Promise<InitialReport> }
export interface ViewHandle {
  readonly [viewBrand]: true;
  update(viewSpec: ViewSpec): Awaitable<ApplicationResult>;
  replace(target: ViewTarget): Awaitable<ApplicationResult>;
  exportDefinition(): ViewSpec;
  dispose(): void;
}
export interface Registry {
  readonly [registryBrand]: true;
  registerResources(resources: readonly AnyResource[]): void;
  registerAction<I, O = void>(definition: NativeActionDefinition<I, O>, implementation: NativeAction<I, O>): void;
  registerComponent(contract: ComponentContract): void;
}
export interface HttpExecutionPlan {
  readonly version: 1; readonly requestId: string;
  readonly datasource: Readonly<Record<string, unknown>>; readonly request: Readonly<Record<string, unknown>>;
  readonly inputs: Readonly<Record<string, JsonValue>>;
}
export interface HttpResponse { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly body: JsonValue }
export interface Runtime {
  mount(target: ViewTarget): Promise<{ readonly view: ViewHandle; readonly initial: Promise<InitialReport> }>;
  // A dynamic reference does not statically prove its output type.
  invokeAction(request: ReferenceOrInline<'actionRef', 'action', ActionSpec> & { readonly inputs?: Readonly<Record<string, unknown>>; readonly owner: ViewHandle }): Promise<unknown>;
}
export declare function createRegistry(): Registry;
export declare function createStateStore(): StateStore;
export declare function createRuntime(options: {
  readonly registry: Registry; readonly stateStore?: StateStore;
  readonly requestExecutor?: (plan: HttpExecutionPlan, context: { readonly signal: AbortSignal }) => Promise<HttpResponse>;
  readonly resourceResolver?: (kind: ResourceKind, id: string) => Awaitable<AnyResource>;
}): Runtime;
