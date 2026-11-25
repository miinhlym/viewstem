import { withDeadline } from './deadline.mjs';

const path = (value) => ({ '@path': value });
const label = { kind: 'Value', required: true, schema: { type: 'string' } };
const deferred = () => {
  let resolve;
  const promise = new Promise((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
};
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const query = (pathname) => ({
  query: {
    sources: {
      value: {
        datasource: { kind: 'Http', baseUrl: 'https://fixture.invalid' },
        request: { method: 'GET', path: pathname },
      },
    },
    transform: { input: path('/sources/value') },
  },
});

export async function sampleQueryProjection({
  createRuntime,
  defineResourceSet,
  size,
  adapters,
  attach,
  instrument,
  timeoutMs = 30_000,
}) {
  const wait = (value, phase) => withDeadline(value, phase, timeoutMs);
  const rows = Array.from({ length: size }, (_, id) => ({ id, label: `Option ${id}` }));
  const entered = deferred();
  const response = deferred();
  const calls = [];
  let refreshing = false;
  const runtime = createRuntime({
    requestExecutor({ request }) {
      calls.push(request.path);
      if (request.path === '/catalog') return { status: 200, headers: {}, body: rows };
      if (request.path === '/summary') {
        if (!refreshing) return { status: 200, headers: {}, body: 'Before' };
        entered.resolve();
        return response.promise;
      }
      throw new Error('Unexpected fixture request');
    },
  });
  const components = [
    ['Group', { slots: { default: {} } }],
    ['Option', { ports: { label } }],
    ['Summary', { ports: { label } }],
  ].map(([id, spec]) => ({
    contract: { kind: 'Component', id, spec },
    connectorId: 'dom',
    implementation: adapters?.[id] ?? {},
  }));
  const source = {
    queries: { catalog: query('/catalog'), summary: query('/summary') },
    render: {
      id: 'group',
      componentRef: 'Group',
      slots: {
        default: [
          {
            id: 'option',
            componentRef: 'Option',
            repeat: { items: path('/queries/catalog/data'), as: 'item', key: path('/repeat/item/id') },
            inputs: { label: path('/repeat/item/label') },
          },
          {
            id: 'summary',
            componentRef: 'Summary',
            inputs: { label: path('/queries/summary/data') },
          },
        ],
      },
    },
  };
  let connection, stop;
  try {
    runtime.registry.registerResourceSet(
      defineResourceSet({ id: 'bench-query-projection', version: '1', components }),
    );
    const view = await wait(runtime.createView(source), 'Query fixture View creation');
    await wait(view.whenSettled(view.initial), 'Query fixture initial completion');
    connection = await wait(attach?.(runtime, view), 'Query fixture renderer attachment');
    const initial = view.getSnapshot().roots[0].children;
    check(
      initial.length === size + 1 && initial.at(-1).inputs.label === 'Before',
      'Initial projection is wrong',
    );
    check(calls.length === 2, 'Initial fixture must execute its two queries once');

    refreshing = true;
    const running = deferred();
    const projected = deferred();
    stop = view.subscribe((snapshot) => {
      if (snapshot.queries.summary.status === 'running') running.resolve();
      if (snapshot.queries.summary.data === 'After') projected.resolve(snapshot.roots[0].children);
    });
    const ticket = view.getQuery('summary').refresh();
    // A failed publication check must still observe the refresh ticket rejection
    // when the fixture closes its View in the cleanup path.
    void ticket.catch(() => {});
    await wait(
      Promise.all([entered.promise, running.promise]),
      'summary request and running publication',
    );
    await wait(connection?.whenRendered(), 'running projection render');
    const endProbe = instrument?.(view);
    const started = performance.now();
    response.resolve({ status: 200, headers: {}, body: 'After' });
    const [, final] = await wait(
      Promise.all([ticket, projected.promise]),
      'summary completion and result publication',
    );
    await wait(connection?.whenRendered(), 'summary result render');

    const elapsed = performance.now() - started;
    endProbe?.(elapsed);

    check(calls.length === 3 && calls.at(-1) === '/summary', 'Unrelated catalog query restarted');
    check(final.length === size + 1 && final.at(-1).inputs.label === 'After', 'Summary projection is wrong');
    for (let index = 0; index < size; index++) {
      const node = final[index];
      check(
        node.generation === initial[index].generation && node.inputs.label === rows[index].label,
        'Unrelated leaf lost its value or identity',
      );
    }
    connection?.verify(size);
    return elapsed;
  } finally {
    stop?.();
    await wait(Promise.all([connection?.dispose(), runtime.dispose()]), 'Query fixture cleanup');
  }
}
