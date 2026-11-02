import { compileCel } from '@viewstem/core/cel';
import { createHttpExecutor } from '@viewstem/core/http';
import { createRegistry, createStateStore, createRuntime, mergeOwnedUrl } from '@viewstem/core';
import type { QuerySpec, QuerySource, ComponentNode, Step, DatasourceSpec, AnyResource, QueryHandle } from '@viewstem/core';
import { createHttpExecutor as fromHttp } from '@viewstem/core/http';

const registry = createRegistry();
registry.registerAction({ kind: 'Action', id: 'inferred-void', spec: {
  ports: {
    count: { kind: 'State', required: true, schema: { type: 'integer' } },
    rows: { kind: 'Query', required: true },
    title: { kind: 'Value', required: true, schema: { type: 'string' } },
    optional: { kind: 'Value', schema: { type: 'number' } },
    defaulted: { kind: 'Value', default: 'value', schema: { type: 'string' } },
    structured: { kind: 'Value', required: true, schema: { type: 'object', properties: { title: { type: 'string' }, count: { type: 'number' } }, required: ['title'] } },
  },
} } as const, async ({ inputs, invokeAction }) => {
  const title: string = inputs.title;
  const optional: number | undefined = inputs.optional;
  const defaulted: string = inputs.defaulted;
  const structuredTitle: string = inputs.structured.title;
  const structuredCount: number | undefined = inputs.structured.count;
  inputs.count.write(title.length);
  await inputs.rows.refresh();
  const output: unknown = await invokeAction({ actionRef: 'child', inputs: { count: inputs.count } });
  void optional; void defaulted; void structuredTitle; void structuredCount; void output;
  // @ts-expect-error inferred State schema controls writes.
  inputs.count.write('wrong');
  // @ts-expect-error required Value is string, not number.
  const bad: number = inputs.title;
  // @ts-expect-error optional Value needs preparation/narrowing before use.
  const absent: number = inputs.optional;
  // @ts-expect-error Query handle exposes no write capability.
  inputs.rows.write([]);
  // @ts-expect-error captured nested object is readonly.
  inputs.structured.title = 'changed';
});
registry.registerAction({ kind: 'Action', id: 'inferred-result', spec: { output: { schema: { type: 'boolean' } } } } as const, () => true);
registry.registerAction({ kind: 'Action', id: 'inferred-nullable', spec: { output: { schema: { type: ['string', 'null'] } } } } as const, () => null);
// @ts-expect-error inferred no-output action cannot return data.
registry.registerAction({ kind: 'Action', id: 'void-return', spec: {} } as const, () => 123);
// @ts-expect-error inferred no-output action cannot return async data.
registry.registerAction({ kind: 'Action', id: 'void-return-async', spec: {} } as const, async () => 123);
// @ts-expect-error default is forbidden on required Value ports.
registry.registerAction({ kind: 'Action', id: 'required-default', spec: { ports: { x: { kind: 'Value', required: true, default: 1, schema: { type: 'number' } } } } } as const, () => undefined);
// @ts-expect-error schema declarations do not belong on Query ports.
registry.registerComponentContract({ kind: 'Component', id: 'query-schema', spec: { ports: { q: { kind: 'Query', schema: true } } } });
// @ts-expect-error declarative registration requires steps.
registry.registerResources([{ kind: 'Action', id: 'native-as-json', spec: {} }]);
// @ts-expect-error Query sources have one target family.
const bothSources: QuerySource = { queryRef: 'a', datasourceRef: 'b', request: { method: 'GET', path: '/' } };
// @ts-expect-error Query source inputs are not HTTP request fields.
const requestOnQuery: QuerySource = { queryRef: 'a', request: { method: 'GET', path: '/' } };
// @ts-expect-error transform.input is mandatory.
const noInput: QuerySpec = { sources: {}, transform: {} };
// @ts-expect-error explicit null is not omitted steps.
const nullSteps: QuerySpec = { sources: {}, transform: { input: [], steps: null } };
// @ts-expect-error Query port kinds are Value only.
const stateQuery: QuerySpec = { ports: { state: { kind: 'State', schema: true } }, sources: {}, transform: { input: [] } };
// @ts-expect-error Join on must have at least one key pair.
const emptyJoin: QuerySpec = { sources: {}, transform: { input: [], steps: [{ kind: 'Join', right: [], on: [] }] } };
// @ts-expect-error If branches are arrays of explicit supported steps.
const malformedIf: Step = { kind: 'If', condition: true, then: null };
// @ts-expect-error unsupported declaration recovery is unavailable.
const tryStep: Step = { kind: 'Try', then: [] };
// @ts-expect-error Action handler emit is exclusive with action targets.
const bothHandlers: ComponentNode = { id: 'bad', componentRef: 'Text', on: { change: { emit: 'change', actionRef: 'save', payload: null } } };
// @ts-expect-error Datasource requires a base URL.
const missingBase: DatasourceSpec = { kind: 'Http' };
// @ts-expect-error only seven independent kinds are supported.
const stateResource: AnyResource = { kind: 'State', id: 'x', spec: {} };

const store = createStateStore(), scope = store.createScope();
const count = scope.registerState<number>('count', { schema: { type: 'number' }, initial: 0 });
store.writeBatch([[count, 1]]);
store.registerReaction(scope, { watch: [count], target: count, value: 0 });
// @ts-expect-error capability inspection belongs to the engine.
store.contract(count);
store.connectUrl({ adapter: { read: () => 'https://example.test', subscribe: () => () => {}, writeOwned: async (_patch, context) => ({ applied: context.isCurrent() }) }, bindings: [{ target: count }] });
// @ts-expect-error standalone Store has no registry for resolving Type resources.
scope.registerState<string>('unsupported-host-ref', { typeRef: 'string' });
const runtime = createRuntime({ registry, stateStore: store });
const mounted = await runtime.createView({ view: { render: { id: 'text', componentRef: 'Text' } } });
const state = mounted.view.getState('count'); const unknown: unknown = state.read(); void unknown;
const query: QueryHandle = mounted.view.getQuery('data'); await query.refresh();
mounted.view.subscribe(snapshot => { const generation: number = snapshot.generation; void generation; });
await mounted.view.emit({ address: 'address', generation: 1 }, 'change', null);
await mounted.view.update(mounted.view.exportDefinition(), { states: { count: 2 } });
const cel = compileCel('size(items)', { inputs: { items: { type: 'array' } } }); const computed: unknown = cel({ items: [] }); void computed;
const requestExecutor = createHttpExecutor({ authorize: () => true }); fromHttp({ transport: fetch });
const href: string = mergeOwnedUrl('https://example.test?a=1', { a: null }); void href;
const stopClock = scope.connectClock(count, { now: () => 123, subscribe: listener => { listener(124); return () => {}; } }); stopClock();
// @ts-expect-error clocks supply numeric State cells.
scope.connectClock(scope.registerState<string>('text', { schema: { type: 'string' } }), { now: () => 1, subscribe: () => () => {} });
const pureRegistry = createRegistry({ functions: [{ name: 'double', inputs: [{ type: 'number' }], output: { type: 'number' }, run: (...args) => Number(args[0]) * 2 }] });
pureRegistry.registerResources([{ kind: 'Variable', id: 'double', spec: { ports: { n: { kind: 'Value', required: true, schema: { type: 'number' } } }, expression: 'double(n)' } }]);
pureRegistry.updateResource({ kind: 'Variable', id: 'double', spec: { expression: '1' } });
// @ts-expect-error trusted functions are a readonly registry snapshot.
pureRegistry.functions.push({ name: 'x', inputs: [], output: true, run: () => 1 });
createRegistry({ functions: [{ name: 'annotated', inputs: [{ type: 'number' }], output: { type: 'number' }, run: (number: number) => number * 2 }] });
createHttpExecutor({ authorize: ({ destination }) => { const href: string = destination; return href.startsWith('https:'); }, resolveSecret: (_ref, { destination, signal }) => { const href: string = destination; void href; void signal; return 'server-only'; } });
const { computeGridLayout } = await import('@viewstem/core');
const placements = computeGridLayout([{ id: 'x' }], [{ id: 'x', address: 'address' }], { x: { columnSpan: 6 } });
const column: number | undefined = placements.get('address')?.column; void column;
// @ts-expect-error fixed grid placement requires both row and column.
computeGridLayout([{ id: 'x' }], [{ id: 'x', address: 'address' }], { x: { row: 1 } });
createRuntime({ registry, authorize: context => {
  if (context.operation === 'update') { const owner = context.owner; const spec = context.definition; void owner.exportDefinition(); void spec.render.id; }
  return false;
} });
const connectedUrl = store.connectUrl({ adapter: { read: () => 'https://example.test', subscribe: () => () => {}, writeOwned: () => ({ applied: true }) }, bindings: [] });
const ready: Promise<void> = connectedUrl.ready; const isReady: boolean = connectedUrl.isReady(); void ready; void isReady;
// @ts-expect-error CEL functions cannot return asynchronous results.
createRegistry({ functions: [{ name: 'async', inputs: [], output: true, run: async () => 1 }] });
// @ts-expect-error functions and promises are not CEL data values.
createRegistry({ functions: [{ name: 'functionResult', inputs: [], output: true, run: () => () => 1 }] });
const protectedFunction: import('@viewstem/core').CelFunction<[{ names: string[]; map: Map<string, { count: number }>; selected: Set<string> }], number> = {
  name: 'readonly', inputs: [true], output: { type: 'number' }, run: value => {
    // @ts-expect-error callback arrays are protected readonly values.
    value.names.push('bad');
    // @ts-expect-error callback maps have no mutation surface.
    value.map.set('bad', { count: 1 });
    // @ts-expect-error nested callback map values are readonly.
    value.map.get('a')!.count = 1;
    // @ts-expect-error callback native sets are readonly.
    value.selected.add('bad');
    return value.names.length;
  },
};
createRegistry({ functions: [protectedFunction] });
