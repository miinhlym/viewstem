import { createRegistry, createRuntime, createStateStore } from '@viewstem/core';
import type { ActionSpec, Clock, ComponentNode, ActionHandler, CodeActionDefinition, QueryHandle, StateHandle, TypeContract } from '@viewstem/core';

const registry = createRegistry();
const store = createStateStore();
const scope = store.createScope();
const count = scope.registerState<number>('count', { schema: { type: 'number' }, initial: 0 });
const nullable = scope.registerState<string | null>('name', { schema: { type: ['string', 'null'] }, initial: null });
count.write(3); count.reset(); nullable.write(null);
const snapshot = count.getSnapshot();
if (snapshot.status === 'ready') { const actual: number = snapshot.value; void actual; }
if (snapshot.status === 'error') { const message: string = snapshot.error.message; void message; }
const missingPossible: number | undefined = count.read(); void missingPossible;
const untyped = scope.getState('dynamic-name'); const unknownValue: unknown = untyped.read(); void unknownValue;
const replacement = scope.replaceState<number>('count', { schema: { type: 'number' }, initial: 1 }); replacement.write(2);
const unsubscribe = store.subscribe([count.address, nullable.address], observation => {
  for (const change of observation.changes) { const name: string = change.target.name; void name; }
}); unsubscribe();

declare const query: QueryHandle<readonly { id: string }[]>;
const querySnapshot = query.getSnapshot();
if (querySnapshot.data) { const id: string | undefined = querySnapshot.data[0]?.id; void id; }
await query.refresh(); await query.retry();

type Inputs = { form: { title: string; tags: string[]; metadata: Map<string, { label: string }>; selected: Set<string> }; target: StateHandle<number>; list: QueryHandle<readonly string[]> };
const ports = {
  form: { kind: 'Value', required: true, schema: { type: 'object' } },
  target: { kind: 'State', required: true, schema: { type: 'number' } },
  list: { kind: 'Query', required: true },
} as const;
const typedDefinition: CodeActionDefinition<Inputs, boolean> = { kind: 'Action', id: 'confirm', spec: { ports, output: { schema: { type: 'boolean' } } } };
const confirm: ActionHandler<Inputs, boolean> = async ({ inputs, signal }) => {
  if (signal.aborted) throw Error('cancelled');
  const title: string = inputs.form.title;
  for (const entry of inputs.form.metadata.values()) { const label: string = entry.label; void label; }
  inputs.target.write(title.length); await inputs.list.refresh(); return title.length > 0;
};
registry.registerAction<Inputs, boolean>(typedDefinition, confirm);
registry.registerAction<Inputs>({ kind: 'Action', id: 'sync-void', spec: { ports } }, ({ inputs }) => { inputs.target.reset(); });
registry.registerAction<Inputs>({ kind: 'Action', id: 'async-void', spec: { ports } }, async ({ inputs }) => { await inputs.list.retry(); });
registry.registerAction<Inputs>({ kind: 'Action', id: 'explicit-undefined', spec: { ports } }, () => undefined);
registry.registerAction<Inputs, string | null>({ kind: 'Action', id: 'nullable', spec: { ports, output: { schema: { type: ['string', 'null'] } } } }, async ({ inputs }) => inputs.form.title || null);
registry.registerAction<Inputs, false>({ kind: 'Action', id: 'false-result', spec: { ports, output: { schema: { const: false } } } }, () => false);
registry.registerAction<Inputs>({ kind: 'Action', id: 'child-calls', spec: { ports } }, async ({ inputs, invokeAction }) => {
  const result: unknown = await invokeAction({ actionRef: 'confirm', inputs: { ...inputs } }); void result;
  await invokeAction({ action: { steps: [] } });
});

const viaRef: TypeContract = { typeRef: 'string-type' }; const viaSchema: TypeContract = { schema: { type: 'string' } }; void viaRef; void viaSchema;
const action: ActionSpec = { steps: [{ kind: 'SetState', target: { '@path': '/ports/count' }, value: 2 }, { kind: 'Assert', condition: true }], output: { schema: { type: 'number' }, value: 2 } };
const inlineRoot: ComponentNode = { id: 'inline', component: { render: { id: 'label', componentRef: 'Text', inputs: { text: 'hello' } } } };
registry.registerComponentContract({ kind: 'Component', id: 'Text', spec: {
  ports: { text: { kind: 'Value', schema: { type: 'string' } } },
  events: { clicked: { schema: { type: 'object' } } },
} });
registry.registerResources([{ kind: 'Type', id: 'number', spec: { schema: { type: 'number' } } }, { kind: 'Action', id: 'declarative', spec: action }]);
const runtime = createRuntime({ registry, stateStore: store, requestExecutor: async (plan, { signal }) => {
  const version: 1 = plan.version; const requestId: string = plan.requestId; void version; void requestId; void signal;
  return { status: 200, headers: { 'content-type': 'application/json' }, body: { ok: true } };
}, resourceResolver: async (kind, id) => {
  if (kind !== 'Type') throw Error('This fixture resolver only serves Type definitions');
  return { kind, id, spec: { schema: { type: 'string' } } };
} });
const view = await runtime.createView({ render: inlineRoot });
const first = await view.whenSettled(view.initial); const generation: number = first.generation; void generation;
for (const error of first.queryErrors) { const code: string = error.error.code; void code; }
await view.whenSettled(await view.updateDefinition(view.exportDefinition()));
await view.whenSettled(await view.replace({ ref: 'another-view' }, { inputs: { title: 'example' } }));
const unknownResult = await view.invokeAction({ actionRef: 'confirm', inputs: { target: count, list: query } });
if (typeof unknownResult === 'boolean') { const result: boolean = unknownResult; void result; }
await view.invokeAction({ action, inputs: { count } });
const clock: Clock = { now: () => 123, subscribe: listener => { listener(124); return () => {}; } }; clock.subscribe(value => { const epoch: number = value; void epoch; });
scope.removeState('count'); scope.dispose(); view.dispose();
