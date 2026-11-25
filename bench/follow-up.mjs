import { withDeadline } from './deadline.mjs';

const path = (value) => ({ '@path': value });
const value = { kind: 'Value', schema: { type: 'integer' }, required: true };
const state = (initial) => ({ kind: 'State', schema: value.schema, initial });
const button = (input) => ({
  id: 'number',
  componentRef: 'PerfNumber',
  inputs: { number: path(input) },
});
const group = (children) => ({
  id: 'group',
  componentRef: 'PerfGroup',
  slots: { default: children },
});
const response = (body) => ({ status: 200, headers: {}, body });
const query = (requestPath) => ({
  sources: {
    source: {
      datasource: { kind: 'Http', baseUrl: 'https://fixture.invalid' },
      request: { method: 'GET', path: requestPath },
    },
  },
  transform: { input: path('/sources/source') },
});
const deferred = () => Promise.withResolvers();
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function resources(runtime, defineResourceSet, implementations = {}) {
  runtime.registry.registerResourceSet(
    defineResourceSet({
      id: 'followup-probe',
      version: '1',
      components: [
        ['PerfGroup', { slots: { default: {} } }],
        ['PerfNumber', { ports: { number: value } }],
      ].map(([id, spec]) => ({
        contract: { kind: 'Component', id, spec },
        connectorId: 'dom',
        implementation: implementations[id] ?? {},
      })),
    }),
  );
}
const yieldTurn = () => new Promise((resolve) => setTimeout(resolve, 0));
const buildView = async (runtime, spec, options) => {
  const view = await runtime.createView(spec, options);
  await withDeadline(view.whenSettled(view.initial), 'initial View projection', 15000);
  await yieldTurn();
  return view;
};
const repeat = (count, input) => ({
  ...button(input),
  id: 'repeat',
  repeat: {
    items: Array.from({ length: count }, (_, index) => index),
    as: 'item',
    key: path('/repeat/item'),
  },
});
export async function crossView({ createRuntime, defineResourceSet }, count) {
  const runtime = createRuntime();
  resources(runtime, defineResourceSet);
  try {
    const edited = await buildView(runtime, {
      states: { number: state(0) },
      render: button('/states/number'),
    });
    const source = edited.getState('number');
    const shared = await buildView(
      runtime,
      {
        ports: {
          number: { kind: 'State', schema: value.schema, required: true },
        },
        render: button('/ports/number'),
      },
      { inputs: { number: source } },
    );
    const unrelated = [];
    const observed = Array(count).fill(0);
    let editing = false;
    for (let index = 0; index < count; index++) {
      const view = await buildView(runtime, {
        states: { number: state(index + 10) },
        render: group([repeat(500, '/states/number')]),
      });
      unrelated.push(view);
      view.subscribe(() => {
        if (editing) observed[index]++;
      });
    }
    let changed = 0,
      linked = 0;
    edited.subscribe(() => {
      if (editing) changed++;
    });
    shared.subscribe(() => {
      if (editing) linked++;
    });
    editing = true;
    const start = performance.now();
    source.write(1);
    const ms = performance.now() - start;
    editing = false;
    check(edited.getSnapshot().roots[0].inputs.number === 1, 'Local source failed to update');
    check(shared.getSnapshot().roots[0].inputs.number === 1, 'Explicit cross-View State failed to update');
    for (const [index, view] of unrelated.entries()) {
      const nodes = view.getSnapshot().roots[0].children;
      check(
        nodes.length === 500 && nodes.every((node) => node.inputs.number === index + 10),
        'Unrelated View changed',
      );
    }
    return {
      ms,
      changed,
      linked,
      unrelated: observed.reduce((sum, n) => sum + n, 0),
    };
  } finally {
    await runtime.dispose();
  }
}
export async function queryBurst({ createRuntime, defineResourceSet }, stagger, fromState = false) {
  const gates = Array.from({ length: 6 }, () => ({
    arrived: deferred(),
    body: deferred(),
  }));
  const starts = [];
  let refreshing = false;
  const runtime = createRuntime({
    requestExecutor({ request }) {
      starts.push(request.path);
      if (!refreshing) return response(0);
      const gate = gates[Number(request.path.slice(1))];
      gate.arrived.resolve();
      return gate.body.promise;
    },
  });
  resources(runtime, defineResourceSet);
  try {
    const options = repeat(1000, '/repeat/item');
    const states = fromState
      ? {
          catalog: {
            kind: 'State',
            schema: { type: 'array', items: value.schema },
            initial: options.repeat.items,
          },
        }
      : {};
    if (fromState) options.repeat.items = path('/states/catalog');
    const view = await buildView(runtime, {
      states,
      queries: Object.fromEntries(gates.map((_, index) => ['q' + index, { query: query('/' + index) }])),
      render: group([
        options,
        ...gates.map((_, index) => ({
          ...button('/queries/q' + index + '/data'),
          id: 'summary' + index,
        })),
      ]),
    });
    check(starts.length === gates.length, 'Unexpected initial requests');
    const old = view.getSnapshot().roots[0].children;
    let measuring = false,
      publications = 0;
    view.subscribe(() => {
      if (measuring) publications++;
    });
    refreshing = true;
    const tickets = gates.map((_, index) => view.getQuery('q' + index).refresh());
    await withDeadline(Promise.all(gates.map((gate) => gate.arrived.promise)), 'all refresh requests', 15000);
    await yieldTurn();
    measuring = true;
    let ms = 0;
    if (stagger) {
      for (const [index, gate] of gates.entries()) {
        const start = performance.now();
        gate.body.resolve(response(index + 10));
        await withDeadline(tickets[index], 'Query ' + index + ' response', 15000);
        ms += performance.now() - start;
      }
    } else {
      const start = performance.now();
      for (const [index, gate] of gates.entries()) gate.body.resolve(response(index + 10));
      await withDeadline(Promise.all(tickets), 'Query burst responses', 15000);
      ms = performance.now() - start;
    }
    measuring = false;
    const nodes = view.getSnapshot().roots[0].children;
    check(starts.length === gates.length * 2, 'Unexpected refresh requests');
    check(
      nodes.length === 1006 &&
        nodes
          .slice(0, 1000)
          .every((node, i) => node.inputs.number === i && node.generation === old[i].generation),
      'Unrelated repeat changed',
    );
    check(
      nodes.slice(1000).every((node, i) => node.inputs.number === i + 10),
      'Missing Query completion',
    );
    return { ms, publications, requests: starts.length - gates.length };
  } finally {
    await runtime.dispose();
  }
}
export async function fanOut({ createRuntime, defineResourceSet }, mode) {
  let requests = 0;
  const runtime = createRuntime({
    requestExecutor() {
      requests++;
      return response(42);
    },
  });
  resources(runtime, defineResourceSet);
  const shared = mode !== 'own';
  const count = mode === 'shared50' ? 50 : mode === 'shared500' ? 500 : 8;
  try {
    runtime.registry.registerResources([
      { kind: 'Query', id: 'Common', spec: query('/common') },
      {
        kind: 'Component',
        id: 'Consumer',
        spec: shared
          ? {
              ports: { result: { kind: 'Query', required: true } },
              render: button('/ports/result/data'),
            }
          : {
              queries: { result: { queryRef: 'Common' } },
              render: button('/queries/result/data'),
            },
      },
    ]);
    const initialStarted = performance.now();
    const view = await buildView(runtime, {
      queries: shared ? { common: { queryRef: 'Common' } } : {},
      render: group([
        {
          id: 'consumer',
          componentRef: 'Consumer',
          repeat: {
            items: Array.from({ length: count }, (_, index) => index),
            as: 'item',
            key: path('/repeat/item'),
          },
          inputs: shared ? { result: path('/queries/common') } : {},
        },
      ]),
    });
    const data = () => view.getSnapshot().roots[0].children.map((node) => node.children[0]?.inputs.number);
    check(data().length === count && data().every((n) => n === 42), 'Consumer values not loaded');
    const initialRequests = requests;
    let ms = performance.now() - initialStarted,
      publications = 0,
      active = false;
    view.subscribe(() => {
      if (active) publications++;
    });
    if (shared) {
      active = true;
      const start = performance.now();
      await withDeadline(view.getQuery('common').refresh(), 'shared Query refresh', 15000);
      ms = performance.now() - start;
      active = false;
      check(
        data().every((n) => n === 42),
        'Consumer values not preserved',
      );
    }
    check(initialRequests === (shared ? 1 : count), 'Request fan-out differs');
    check(requests - initialRequests === Number(shared), 'Unexpected refresh count');
    return {
      ms,
      initialRequests,
      refreshRequests: requests - initialRequests,
      publications,
    };
  } finally {
    await runtime.dispose();
  }
}
export async function tableUpdate({ createRuntime, defineResourceSet, createRenderer, ui }, tables) {
  const arrivals = deferred(),
    summary = deferred();
  let refreshing = false;
  const requests = [];
  const data = Array.from({ length: 1000 }, (_, id) => ({
    id,
    name: 'Row ' + id,
    count: id,
    target: id + 1,
  }));
  const columns = [
    { id: 'name', accessorKey: 'name', label: 'Name', filterable: true },
    { id: 'count', accessorKey: 'count', label: 'Count', sortable: true },
    { id: 'target', accessorKey: 'target', label: 'Target', sortable: true },
  ];
  const runtime = createRuntime({
    requestExecutor({ request }) {
      requests.push(request.path);
      if (request.path === '/data') return response(data);
      if (!refreshing) return response(0);
      arrivals.resolve();
      return summary.promise;
    },
  });
  runtime.registry.registerResourceSet(ui);
  resources(runtime, defineResourceSet, {
    PerfGroup: {
      mount(context) {
        const element = document.createElement('section');
        context.parent.insertBefore(element, context.anchor);
        context.provideSlot('default', element);
        return {
          update() {},
          dispose() {
            element.remove();
          },
        };
      },
    },
    PerfNumber: {
      mount(context) {
        const element = document.createElement('output');
        context.parent.insertBefore(element, context.anchor);
        const update = (node) => {
          element.textContent = String(node.inputs.number);
        };
        update(context.node);
        return {
          update,
          dispose() {
            element.remove();
          },
        };
      },
    },
  });
  const target = document.body.appendChild(document.createElement('main'));
  const renderer = createRenderer({ runtime });
  try {
    const view = await buildView(runtime, {
      queries: {
        data: { query: query('/data') },
        summary: { query: query('/summary') },
      },
      render: group([
        ...Array.from({ length: tables }, (_, index) => ({
          id: 'table' + index,
          componentRef: 'shadcn.DataTable',
          inputs: { data: path('/queries/data/data'), columns, pageSize: 100 },
        })),
        button('/queries/summary/data'),
      ]),
    });
    const attached = renderer.attach(view, target);
    await attached.whenRendered();
    const rows = () => [...target.querySelectorAll('tbody tr')];
    check(rows().length === tables * 100, 'Initial table rows missing');
    refreshing = true;
    const refresh = view.getQuery('summary').refresh();
    await withDeadline(arrivals.promise, 'summary refresh request', 15000);
    await attached.whenRendered();
    const before = rows();
    const snapshot = view.getSnapshot().roots[0].children[0];
    const start = performance.now();
    summary.resolve(response(7));
    await withDeadline(refresh, 'summary response', 15000);
    await attached.whenRendered();
    const ms = performance.now() - start;
    const after = rows();
    check(requests.join() === '/data,/summary,/summary', 'Unrelated data requested again');
    check(target.querySelector('output')?.textContent === '7', 'Summary not rendered');
    check(
      after.length === before.length &&
        after.every((row, index) => row.textContent === before[index].textContent),
      'Table content differs',
    );
    const next = view.getSnapshot().roots[0].children[0];
    const retainedRows = after.filter((row, index) => row === before[index]).length;
    return {
      ms,
      tableRows: after.length,
      retainedRows,
      sameData: snapshot.inputs.data === next.inputs.data,
    };
  } finally {
    await renderer.dispose();
    await runtime.dispose();
    target.remove();
  }
}

export async function storeSubscribers({ createStateStore }, count) {
  const store = createStateStore();
  const scope = store.createScope();
  try {
    const cells = Array.from({ length: 1200 }, (_, index) =>
      scope.registerState('cell' + index, { schema: value.schema, initial: 0 }),
    );
    const changed = cells[0];
    let unrelated = 0,
      relevant = 0;
    for (const handle of cells.slice(1, count + 1))
      store.subscribe(handle.address, (payload) => {
        if (payload.changes.length) unrelated++;
      });
    store.subscribe(changed.address, (payload) => {
      if (payload.changes.length) relevant++;
    });
    const start = performance.now();
    changed.write(1);
    const ms = performance.now() - start;
    check(relevant === 1 && unrelated === 0 && changed.read() === 1, 'Wrong StateStore notifications');
    return { ms, relevant, unrelated };
  } finally {
    await store.dispose();
  }
}

export async function borrowedQuery({ createRuntime, defineResourceSet }) {
  const runtime = createRuntime();
  const statusNode = (input) => ({
    id: 'status',
    componentRef: 'PerfStatus',
    inputs: { status: path(input) },
  });
  try {
    runtime.registry.registerResourceSet(
      defineResourceSet({
        id: 'borrowed-query',
        version: '1',
        components: [
          {
            contract: {
              kind: 'Component',
              id: 'PerfStatus',
              spec: { ports: { status: { kind: 'Value', schema: { type: 'string' }, required: true } } },
            },
            connectorId: 'bench',
            implementation: {},
          },
        ],
      }),
    );
    const owner = await buildView(runtime, {
      states: { open: { kind: 'State', schema: { type: 'boolean' }, initial: true } },
      queries: {
        summary: {
          query: { sources: {}, transform: { input: 7 } },
          executeWhen: path('/states/open'),
        },
      },
      render: statusNode('/queries/summary/status'),
    });
    const summary = owner.getQuery('summary');
    const consumer = await buildView(
      runtime,
      {
        ports: { summary: { kind: 'Query', required: true } },
        render: statusNode('/ports/summary/status'),
      },
      { inputs: { summary } },
    );
    check(
      consumer.getSnapshot().roots[0].inputs.status === 'success',
      'Borrowed Query must start successful',
    );
    const updated = deferred();
    const stop = consumer.subscribe((snapshot) => {
      if (snapshot.roots[0].inputs.status === 'waiting') updated.resolve();
    });
    try {
      const start = performance.now();
      owner.getState('open').write(false);
      check(consumer.getSnapshot().roots[0].inputs.status === 'waiting', 'Borrowed Query gate must update during the State write');
      await withDeadline(updated.promise, 'borrowed Query gate projection', 15000);
      const ms = performance.now() - start;
      check(summary.getSnapshot().status === 'waiting', 'Query gate did not close');
      return { ms, borrowerStatus: consumer.getSnapshot().roots[0].inputs.status };
    } finally {
      stop();
    }
  } finally {
    await runtime.dispose();
  }
}
