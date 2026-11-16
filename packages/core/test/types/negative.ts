import { createRegistry, createRuntime } from '@viewstem/core';
import type { ActionCall, ActionSnapshot, ActionSpec, ComponentNode, InitialReport, ActionHandler, CodeActionDefinition, ActionContext, QueryHandle, QuerySnapshot, QueryUse, StateDeclaration, StateHandle, StateStore, TypeContract, ValueSnapshot, View } from '@viewstem/core';

declare const state: StateHandle<number>;
declare const query: QueryHandle<readonly { id: string }[]>;
declare const view: View;
declare const querySnapshot: QuerySnapshot<readonly { id: string }[]>;
declare const actionObservation: ActionSnapshot<number>;
declare const initial: InitialReport;
declare const snapshot: ValueSnapshot<number>;
type Inputs = { form: { title: string; tags: string[]; metadata: Map<string, { label: string }>; selected: Set<string> }; target: StateHandle<number>; list: QueryHandle<readonly string[]> };
declare const context: ActionContext<Inputs>;
const registry = createRegistry();
const runtime = createRuntime({ registry });

// @ts-expect-error XOR_SCHEMA_BOTH - schema/typeRef cannot coexist.
const bothSchema: TypeContract = { schema: { type: 'number' }, typeRef: 'number' };
// @ts-expect-error XOR_SCHEMA_NEITHER - required type contract cannot be empty.
const neitherSchema: TypeContract = {};
// @ts-expect-error XOR_SCHEMA_UNDEFINED - explicit undefined does not satisfy XOR.
const explicitUndefined: TypeContract = { schema: undefined };
// @ts-expect-error RESOURCE_NESTED_SCHEMA_XOR - resource registration checks nested port contracts.
registry.registerResources([{ kind: 'View', id: 'both', spec: { ports: { value: { kind: 'Value', schema: { type: 'number' }, typeRef: 'number' } }, render: { id: 'text', componentRef: 'Text' } } }]);
// @ts-expect-error COMPONENT_EVENT_SCHEMA_XOR - code Component events keep type contract XOR.
registry.registerComponentContract({ kind: 'Component', id: 'event', spec: { events: { click: { schema: { type: 'object' }, typeRef: 'event' } } } });
// @ts-expect-error STATE_INITIAL_TYPE - the declared host value type controls initial.
const initialWrong: StateDeclaration<number> = { schema: { type: 'number' }, initial: 'wrong' };
// @ts-expect-error STATE_WRITE_TYPE - write uses the State value type.
state.write('wrong');
// @ts-expect-error STATE_WRITE_UNDEFINED - missing is not a stored value.
state.write(undefined);
// @ts-expect-error STATE_READ_MISSING - simple read may be missing.
const unguardedRead: number = state.read();
// @ts-expect-error STATE_SNAPSHOT_NARROW - ready must be selected before accessing value.
const unguardedSnapshot: number = snapshot.value;
// @ts-expect-error STATE_ADDRESS_READONLY - logical address is immutable.
state.address.name = 'renamed';
// @ts-expect-error QUERY_NO_WRITE - Query data is not a writable State.
query.write([]);
// @ts-expect-error QUERY_REFRESH_VOID - refresh completion is void, not Query data.
const refreshedRows: readonly string[] = await query.refresh();
// @ts-expect-error QUERY_STATUS_READONLY - runtime owns observation state.
querySnapshot.status = 'success';
// @ts-expect-error QUERY_DATA_READONLY - nested Query rows are readonly.
querySnapshot.data?.push({ id: 'new' });
// @ts-expect-error QUERY_NESTED_READONLY - row data is readonly after narrowing.
if (querySnapshot.data?.[0]) querySnapshot.data[0].id = 'changed';
// @ts-expect-error NATIVE_INPUT_RECORD_READONLY - callback cannot replace captured input.
context.inputs.form = { title: 'new', tags: [], metadata: new Map(), selected: new Set() };
// @ts-expect-error NATIVE_INPUT_OBJECT_READONLY - Value input objects are readonly.
context.inputs.form.title = 'changed';
// @ts-expect-error NATIVE_INPUT_ARRAY_READONLY - Value arrays are readonly.
context.inputs.form.tags.push('new');
// @ts-expect-error NATIVE_INPUT_MAP_READONLY - Value Map cannot be mutated.
context.inputs.form.metadata.set('x', { label: 'changed' });
// @ts-expect-error NATIVE_INPUT_MAP_VALUE_READONLY - Value Map nested items are readonly.
context.inputs.form.metadata.get('x')!.label = 'changed';
// @ts-expect-error NATIVE_INPUT_SET_READONLY - Value Set cannot be mutated.
context.inputs.form.selected.add('x');
// @ts-expect-error NATIVE_NO_RUNTIME - a bound child call does not grant the runtime.
context.runtime.createView({ viewRef: 'x' });
// @ts-expect-error NATIVE_NO_STORE - Store is not implicitly granted.
context.stateStore.createScope();
// @ts-expect-error NATIVE_NO_EVENT - event data must be explicit inputs.
const implicitEvent = context.event;
// @ts-expect-error NATIVE_SIGNAL_READONLY - context signal cannot be replaced.
context.signal = new AbortController().signal;
// @ts-expect-error NATIVE_VOID_SYNC_RESULT - no-output callback must not return a value.
registry.registerAction<{}>({ kind: 'Action', id: 'wrong-void-sync', spec: {} }, () => 42);
// @ts-expect-error NATIVE_VOID_ASYNC_RESULT - async no-output callback must not return data.
registry.registerAction<{}>({ kind: 'Action', id: 'wrong-void-async', spec: {} }, async () => 42);
// @ts-expect-error NATIVE_TYPED_WRONG_RESULT - typed output must match callback result.
registry.registerAction<{}, boolean>({ kind: 'Action', id: 'wrong-result', spec: { output: { schema: { type: 'boolean' } } } }, () => 'wrong');
// @ts-expect-error NATIVE_TYPED_UNDEFINED - typed output cannot be omitted.
registry.registerAction<{}, boolean>({ kind: 'Action', id: 'missing-result', spec: { output: { schema: { type: 'boolean' } } } }, () => undefined);
// @ts-expect-error NATIVE_NULL_NOT_DECLARED - null requires a nullable result type.
const nonNullable: ActionHandler<{}, string> = () => null;
// @ts-expect-error NATIVE_TYPED_OUTPUT_REQUIRED - typed definition needs output contract.
const noTypedOutput: CodeActionDefinition<{}, boolean> = { kind: 'Action', id: 'missing', spec: {} };
// @ts-expect-error NATIVE_VOID_OUTPUT_FORBIDDEN - a void definition has no output.
const voidWithOutput: CodeActionDefinition<{}> = { kind: 'Action', id: 'void', spec: { output: { schema: { type: 'number' } } } };
// @ts-expect-error NATIVE_OUTPUT_NO_VALUE - native implementation returns the value.
const nativeWithValue: CodeActionDefinition<{}, number> = { kind: 'Action', id: 'native', spec: { output: { schema: { type: 'number' }, value: 1 } } };
// @ts-expect-error DECLARATIVE_OUTPUT_NEEDS_VALUE - declarative output evaluates explicit value.
const declarativeMissingValue: ActionSpec = { steps: [], output: { schema: { type: 'number' } } };
// @ts-expect-error ACTION_CALL_BOTH - ref and inline are mutually exclusive.
const bothAction: ActionCall = { actionRef: 'a', action: { steps: [] } };
// @ts-expect-error ACTION_CALL_NEITHER - one target must be present.
const neitherAction: ActionCall = { inputs: {} };
// @ts-expect-error QUERY_CALL_BOTH - ref and inline Query are mutually exclusive.
const bothQuery: QueryUse = { queryRef: 'q', query: { sources: {} } };
// @ts-expect-error QUERY_CALL_NEITHER - missing Query target is invalid.
const neitherQuery: QueryUse = { inputs: {} };
// @ts-expect-error COMPONENT_CALL_BOTH - ref and inline Component are mutually exclusive.
const bothComponent: ComponentNode = { id: 'node', componentRef: 'Text', component: { render: { id: 'inner', componentRef: 'Text' } } };
// @ts-expect-error COMPONENT_CALL_NEITHER - a node requires a Component target.
const neitherComponent: ComponentNode = { id: 'node' };
// @ts-expect-error MOUNT_CALL_BOTH - View ref and inline View cannot coexist.
await runtime.createView({ ref: 'v', render: { id: 'label', componentRef: 'Text' } });
// @ts-expect-error MOUNT_CALL_NEITHER - a View target is required.
await runtime.createView({ inputs: {} });
// @ts-expect-error INVOKE_CALL_BOTH - explicit Action invocation keeps target XOR.
await view.invokeAction({ actionRef: 'a', action: { steps: [] } });
// @ts-expect-error INVOKE_OWNER_REQUIRED - lifetime owner is explicit.
await runtime.invokeAction({ actionRef: 'a' });
// @ts-expect-error RUNTIME_REGISTRY_XOR - an injected Registry owns its definitions.
createRuntime({ registry: runtime.registry, resources: [] });
// @ts-expect-error STORE_NOMINAL - matching methods do not grant the private Store brand.
const duckStore: StateStore = { createScope: () => { throw Error(); }, subscribe: () => () => {} };
// @ts-expect-error ACTION_OBSERVATION_READONLY - results are observation, not writable state.
actionObservation.data = 2;
// @ts-expect-error INITIAL_REPORT_READONLY - initial report arrays are readonly.
initial.queryErrors.push({ code: 'INTERNAL_ERROR', message: 'x' });
// @ts-expect-error ACTION_OBSERVATION_NO_REFRESH - Action results do not become Query handles.
actionObservation.refresh();
// @ts-expect-error CHILD_CALL_BOTH - child target retains reference/inline XOR.
context.invokeAction({ actionRef: 'a', action: { steps: [] } });
// @ts-expect-error CHILD_CALL_NEITHER - a child call needs a target.
context.invokeAction({ inputs: {} });
// @ts-expect-error CHILD_OWNER_FORBIDDEN - parent ownership cannot be replaced.
context.invokeAction({ actionRef: 'a', owner: view });
// @ts-expect-error CHILD_ID_FORBIDDEN - a child call is not a new observed UI binding.
context.invokeAction({ actionRef: 'a', id: 'alias' });
// @ts-expect-error CHILD_OUTPUT_UNKNOWN - a dynamic reference does not prove its result type.
const childBoolean: boolean = await context.invokeAction({ actionRef: 'a' });
// @ts-expect-error CHILD_CAPABILITY_READONLY - the bound child caller cannot be replaced.
context.invokeAction = async () => undefined;
