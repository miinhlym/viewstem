import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  createRegistry,
  createRuntime,
  createStateStore,
  defineResourceSet,
  mergeOwnedUrl,
  computeGridLayout,
} from '@viewstem/core';
import { compileCel, evaluateCel } from '@viewstem/core/cel';
import { createHttpExecutor } from '@viewstem/core/http';
import { createStateStore as createInternalStateStore } from '../packages/core/src/state.mjs';
import { joinRows } from '../packages/core/src/query/index.mjs';
import { FakeClock, flush } from '../packages/core/test/query-fixtures.mjs';
import { sampleQueryProjection } from './query-projection.mjs';
import { borrowedQuery, crossView, fanOut, queryBurst, storeSubscribers } from './follow-up.mjs';

const integer = { type: 'integer' };
const path = (value) => ({ '@path': value });
const component = {
  kind: 'Component',
  id: 'Leaf',
  spec: { ports: { value: { kind: 'Value', schema: true } } },
};
const container = { kind: 'Component', id: 'Container', spec: { slots: { default: {} } } };
function registry() {
  return createRegistry().registerResourceSet(
    defineResourceSet({
      id: 'bench',
      version: '1',
      components: [component, container].map((contract) => ({
        contract,
        connectorId: 'bench',
        implementation: {},
      })),
    }),
  );
}
function timed(fn) {
  const start = performance.now();
  const value = fn();
  return [performance.now() - start, value];
}
async function timedAsync(fn) {
  const start = performance.now();
  const value = await fn();
  return [performance.now() - start, value];
}
const definition = (count) => ({
  states: {
    items: {
      kind: 'State',
      schema: { type: 'array', items: integer },
      initial: Array.from({ length: count }, (_, i) => i),
    },
    show: { kind: 'State', schema: { type: 'boolean' }, initial: true },
  },
  render: {
    id: 'root',
    componentRef: 'Container',
    slots: {
      default: [
        {
          id: 'item',
          componentRef: 'Leaf',
          repeat: { items: path('/states/items'), as: 'item', key: path('/repeat/item') },
          when: path('/states/show'),
          inputs: { value: path('/repeat/item') },
        },
      ],
    },
  },
});

export async function benchmarkCore(measure) {
  const api = { createRuntime, createStateStore, defineResourceSet };
  for (const count of [0, 6]) {
    await measure({
      id: `core.state.cross-view.${count}`,
      workload: `Write one State shared with a second View beside ${count} unrelated Views with 500 nodes each`,
      sample: () => crossView(api, count),
    });
  }
  for (const count of [0, 256]) {
    await measure({
      id: `core.state.scoped-subscribers.${count}`,
      workload: `Write one of 1,200 States beside ${count} unrelated address subscriptions`,
      sample: () => storeSubscribers(api, count),
    });
  }
  for (const fromState of [false, true]) {
    for (const stagger of [false, true]) {
      await measure({
        id: `core.query.burst.${fromState ? 'state.' : ''}${stagger ? 'separated' : 'same-turn'}`,
        workload: `Apply six mock Query responses ${stagger ? 'in separate projections' : 'in one turn'} beside 1,000 ${fromState ? 'State' : 'literal'} repeat items`,
        sample: () => queryBurst(api, stagger, fromState),
      });
    }
  }
  for (const [mode, count] of [['own', 8], ['shared', 8], ['shared50', 50], ['shared500', 500]]) {
    const own = mode === 'own';
    await measure({
      id: `core.query.component.${own ? 'own' : 'shared'}.${count}`,
      workload: own ? `Settle ${count} independent Query usages` : `Refresh the same value for ${count} Query port consumers`,
      sample: () => fanOut(api, mode),
    });
  }
  await measure({
    id: 'core.query.borrowed-view',
    workload: 'Close a Query gate and observe waiting in a second View connected by a Query port',
    sample: () => borrowedQuery(api),
  });
  for (const size of [50, 1000]) {
    await measure({
      id: `core.view.query-projection.${size}`,
      workload: `Project one HTTP Query response alongside ${size} unchanged keyed options`,
      sample: () => sampleQueryProjection({ createRuntime, defineResourceSet, size }),
    });
  }
  for (const size of [10, 100]) {
    await measure({
      id: `core.registry.register-update.${size}`,
      workload: `Register and update ${size} Type resources`,
      sample: async () => {
        const r = createRegistry();
        const resources = Array.from({ length: size }, (_, i) => ({
          kind: 'Type',
          id: `T${i}`,
          spec: { schema: integer },
        }));
        const [ms] = timed(() => {
          r.registerResources(resources);
          for (const resource of resources) r.updateResource(resource);
        });
        assert.equal(r.list('Type').length, size);
        return ms;
      },
    });
    await measure({
      id: `core.state.batch-derived.${size}`,
      workload: `Batch ${size} State writes with derived values and snapshot reads`,
      sample: async () => {
        const store = createInternalStateStore(),
          scope = store.createScope();
        const cells = Array.from({ length: size }, (_, i) =>
          scope.registerState(`v${i}`, { schema: integer, initial: 0 }),
        );
        const derived = cells.map((cell, i) =>
          scope.registerState(`d${i}`, { schema: integer, dependencies: [cell], derived: (n) => n + 1 }),
        );
        const [ms] = timed(() => {
          store.writeBatch(cells.map((cell) => [cell, 2]));
          for (const cell of derived) cell.getSnapshot();
        });
        assert.equal(derived.at(-1).read(), 3);
        store.dispose();
        return ms;
      },
    });
    await measure({
      id: `core.grid.auto.${size}`,
      workload: `Lay out ${size} automatic grid items`,
      sample: async () => {
        const nodes = Array.from({ length: size }, (_, i) => ({ id: `n${i}` }));
        const items = nodes.map(({ id }) => ({ id, address: id }));
        const [ms, result] = timed(() => computeGridLayout(nodes, items));
        assert.equal(result.size, size);
        return ms;
      },
    });
    await measure({
      id: `core.view.mount-repeat.${size}`,
      workload: `Mount View with ${size} repeated nodes`,
      sample: async () => {
        const runtime = createRuntime({ registry: registry() });
        const spec = definition(size);
        const [ms, view] = await timedAsync(async () => {
          const v = await runtime.createView(spec);
          await v.whenSettled(v.initial);
          return v;
        });
        assert.equal(view.getSnapshot().roots[0].children.length, size);
        await view.dispose();
        runtime.dispose();
        return ms;
      },
    });
    await measure({
      id: `core.view.update-repeat.${size}`,
      workload: `Update inputs, conditional visibility and replace View with ${size} repeated nodes`,
      sample: async () => {
        const runtime = createRuntime({ registry: registry() }),
          spec = definition(size),
          view = await runtime.createView(spec);
        await view.whenSettled(view.initial);
        const before = view.getSnapshot().lifetime;
        const [ms] = await timedAsync(async () => {
          view.getState('show').write(false);
          assert.equal(view.getSnapshot().roots[0].children.length, 0);
          await view.setInputs({});
          await view.whenSettled(await view.replace(spec));
        });
        assert.notEqual(view.getSnapshot().lifetime, before);
        assert.equal(view.getSnapshot().roots[0].children.length, size);
        await view.dispose();
        runtime.dispose();
        return ms;
      },
    });
  }
  await measure({
    id: 'core.registry.references',
    workload: 'Register ResourceSet and resolve 100 type references',
    sample: async () => {
      const r = registry(),
        type = { kind: 'Type', id: 'NumberType', spec: { schema: integer } };
      const resources = [
        type,
        ...Array.from({ length: 100 }, (_, i) => ({
          kind: 'Component',
          id: `C${i}`,
          spec: { ports: { value: { kind: 'Value', typeRef: 'NumberType' } } },
        })),
      ];
      const [ms] = timed(() => {
        r.registerResources([type]);
        r.registerComponentContracts(resources.slice(1));
        for (let i = 0; i < 100; i++) r.get('Component', `C${i}`);
      });
      assert.equal(r.list('Component').length, 102);
      return ms;
    },
  });
  await measure({
    id: 'core.state.native-values',
    workload: 'Normalize and snapshot 100 nested native Set values',
    sample: async () => {
      const store = createStateStore(),
        scope = store.createScope(),
        schema = { 'x-viewstem-type': 'set', items: { type: 'array', items: integer } };
      const values = Array.from({ length: 100 }, (_, i) => [i, i + 1]);
      let cell;
      const [ms] = timed(() => {
        cell = scope.registerState('native', { schema, initial: new Set(values) });
        cell.write(new Set(values));
        cell.getSnapshot();
      });
      assert.equal(cell.read().size, 100);
      store.dispose();
      return ms;
    },
  });
  await measure({
    id: 'core.url.merge-restore',
    workload: 'Merge URL parameters and restore bound State',
    sample: async () => {
      const store = createStateStore(),
        cell = store.createScope().registerState('count', { schema: integer, initial: 0 });
      let href = 'https://example.test/?outside=keep&count=42';
      const adapter = {
        read: () => href,
        subscribe: () => () => {},
        writeOwned: (patch) => {
          href = mergeOwnedUrl(href, patch);
        },
      };
      const [ms, connection] = await timedAsync(async () => {
        const c = store.connectUrl({ adapter, bindings: [{ target: cell, key: 'count' }] });
        await c.ready;
        await c.restore();
        href = mergeOwnedUrl(href, { count: '43' });
        return c;
      });
      assert.equal(cell.read(), 42);
      assert.equal(new URL(href).searchParams.get('count'), '43');
      connection.dispose();
      store.dispose();
      return ms;
    },
  });
  await measure({
    id: 'core.cel.compile',
    workload: 'Compile 20 typed CEL expressions',
    sample: async () => {
      const [ms, programs] = timed(() =>
        Array.from({ length: 20 }, (_, i) => compileCel(`x * 2 + ${i}`, { inputs: { x: integer } })),
      );
      assert.equal(programs[19]({ x: 2 }), 23);
      return ms;
    },
  });
  await measure({
    id: 'core.cel.evaluate',
    workload: 'Evaluate a compiled CEL expression 1000 times',
    sample: async () => {
      const program = compileCel('x * 2 + 1', { inputs: { x: integer } });
      let result;
      const [ms] = timed(() => {
        for (let i = 0; i < 1000; i++) result = program({ x: i });
      });
      assert.equal(result, 1999);
      assert.equal(evaluateCel('true', {}), true);
      return ms;
    },
  });
  await measure({
    id: 'core.action.code-declarative',
    workload: 'Invoke 50 code and declarative Actions',
    sample: async () => {
      const r = registry();
      r.registerAction({ kind: 'Action', id: 'code', spec: { output: { schema: integer } } }, () => 7);
      r.registerResources([
        { kind: 'Action', id: 'declarative', spec: { steps: [{ kind: 'Action', actionRef: 'code' }] } },
      ]);
      const runtime = createRuntime({ registry: r }),
        view = await runtime.createView({ render: { id: 'leaf', componentRef: 'Leaf' } });
      const [ms, answer] = await timedAsync(async () => {
        let value;
        for (let i = 0; i < 50; i++) {
          value = await view.invokeAction({ actionRef: 'code' });
          await view.invokeAction({ actionRef: 'declarative' });
        }
        return value;
      });
      assert.equal(answer, 7);
      await view.dispose();
      runtime.dispose();
      return ms;
    },
  });
  await measure({
    id: 'core.http.prepare-transport',
    workload: 'Prepare and execute 50 authorized mock HTTP requests',
    sample: async () => {
      let calls = 0;
      const execute = createHttpExecutor({
        authorize: () => true,
        transport: async () => {
          calls++;
          return new Response('{"ok":true}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        },
      });
      const plan = {
        version: 1,
        requestId: 'bench',
        datasource: { kind: 'Http', baseUrl: 'https://example.test', headers: { 'X-Bench': 'yes' } },
        request: { method: 'GET', path: '/items', params: { limit: '10' } },
        inputs: {},
      };
      const [ms, response] = await timedAsync(async () => {
        let value;
        for (let i = 0; i < 50; i++) value = await execute(plan);
        return value;
      });
      assert.equal(calls, 50);
      assert.equal(response.body.ok, true);
      return ms;
    },
  });
  await measure({
    id: 'core.query.refresh',
    workload: 'Mount and refresh a local composite Query 30 times',
    sample: async () => {
      const runtime = createRuntime({ registry: registry() }),
        view = await runtime.createView({
          queries: { rows: { query: { sources: {}, transform: { input: [1, 2, 3] } } } },
          render: { id: 'leaf', componentRef: 'Leaf', inputs: { value: path('/queries/rows/data') } },
        });
      await view.whenSettled(view.initial);
      const [ms] = await timedAsync(async () => {
        for (let i = 0; i < 30; i++) await view.getQuery('rows').refresh();
      });
      assert.equal(view.getQuery('rows').getSnapshot().data.length, 3);
      await view.dispose();
      runtime.dispose();
      return ms;
    },
  });
  await measure({
    id: 'core.action.cancel',
    workload: 'Cancel 50 Action invocations before execution',
    sample: async () => {
      const r = registry();
      r.registerAction({ kind: 'Action', id: 'code', spec: {} }, () => {});
      const runtime = createRuntime({ registry: r }),
        view = await runtime.createView({ render: { id: 'leaf', componentRef: 'Leaf' } }),
        signal = AbortSignal.abort();
      let cancelled = 0;
      const [ms] = await timedAsync(async () => {
        for (let i = 0; i < 50; i++)
          try {
            await view.invokeAction({ actionRef: 'code', signal });
          } catch (error) {
            if (error.code === 'CANCELLED') cancelled++;
            else throw error;
          }
      });
      assert.equal(cancelled, 50);
      await view.dispose();
      runtime.dispose();
      return ms;
    },
  });
  await measure({
    id: 'core.http.login-auth',
    workload: 'Resolve secret and execute mock login plus authenticated request',
    sample: async () => {
      let calls = 0;
      const execute = createHttpExecutor({
        authorize: () => true,
        resolveSecret: async () => 'secret',
        transport: async (url) => {
          calls++;
          return new Response(
            JSON.stringify(String(url).endsWith('/login') ? { token: 'token' } : { ok: true }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        },
      });
      const plan = {
        version: 1,
        requestId: 'bench-auth',
        datasource: {
          kind: 'Http',
          baseUrl: 'https://example.test',
          secrets: { password: 'secret-ref' },
          auth: {
            kind: 'Login',
            request: { method: 'POST', path: '/login', body: { password: path('/secrets/password') } },
            token: path('/response/body/token'),
          },
          headers: { Authorization: { '@call': 'concat', args: ['Bearer ', path('/auth/token')] } },
        },
        request: { method: 'GET', path: '/data' },
        inputs: {},
      };
      const [ms, response] = await timedAsync(() => execute(plan));
      assert.equal(calls, 2);
      assert.equal(response.body.ok, true);
      return ms;
    },
  });
  await measure({
    id: 'core.query.mock-io',
    workload: 'Execute and refresh HTTP-backed Query with mock transport',
    sample: async () => {
      let calls = 0;
      const r = registry();
      r.registerResources([
        {
          kind: 'Query',
          id: 'remote',
          spec: {
            sources: {
              main: {
                datasource: { kind: 'Http', baseUrl: 'https://example.test' },
                request: { method: 'GET', path: '/items' },
              },
            },
            transform: { input: path('/sources/main') },
          },
        },
      ]);
      const runtime = createRuntime({
        registry: r,
        requestExecutor: async () => {
          calls++;
          return { status: 200, headers: {}, body: [1, 2, 3] };
        },
      });
      let view;
      const [ms] = await timedAsync(async () => {
        view = await runtime.createView({
          queries: { rows: { queryRef: 'remote' } },
          render: { id: 'leaf', componentRef: 'Leaf', inputs: { value: path('/queries/rows/data') } },
        });
        await view.whenSettled(view.initial);
        await view.getQuery('rows').refresh();
      });
      assert.equal(calls, 2);
      assert.equal(view.getQuery('rows').getSnapshot().data.length, 3);
      await view.dispose();
      runtime.dispose();
      return ms;
    },
  });

  await measure({
    id: 'core.view.retained-state-owners.200',
    workload: 'Write shared State three times with 200 retained repeated owners and Derived cells',
    sample: async () => {
      const r = registry(),
        value = { kind: 'Value', schema: integer, required: true },
        state = { kind: 'State', schema: integer, required: true };
      r.registerResources([
        {
          kind: 'Component',
          id: 'Stateful',
          spec: {
            ports: { source: state },
            states: {
              local: { kind: 'State', schema: integer, initial: 1 },
              computed: {
                kind: 'Derived',
                schema: integer,
                variable: { ports: { n: value }, expression: 'n * 2' },
                inputs: { n: path('/ports/source') },
              },
            },
            render: { id: 'result', componentRef: 'Leaf', inputs: { value: path('/states/computed') } },
          },
        },
      ]);
      const spec = {
        states: { source: { kind: 'State', schema: integer, initial: 1 } },
        render: {
          id: 'root',
          componentRef: 'Container',
          slots: {
            default: [
              {
                id: 'owner',
                componentRef: 'Stateful',
                repeat: {
                  items: Array.from({ length: 200 }, (_, i) => i),
                  as: 'item',
                  key: path('/repeat/item'),
                },
                inputs: { source: path('/states/source') },
              },
            ],
          },
        },
      };
      const runtime = createRuntime({ registry: r }),
        view = await runtime.createView(spec);
      await view.whenSettled(view.initial);
      const [ms] = timed(() => {
        for (let i = 2; i <= 4; i++) view.getState('source').write(i);
      });
      const children = view.getSnapshot().roots[0].children;
      assert.equal(children.length, 200);
      for (const child of children) assert.equal(child.children[0].inputs.value, 8);
      await view.dispose();
      runtime.dispose();
      return ms;
    },
  });

  for (const size of [1000, 3000]) {
    await measure({
      id: `core.query.join-left.${size}`,
      workload: `Left Join ${size} × ${size} rows with matched, unmatched and duplicate keys`,
      sample: async () => {
        // Even keys have two right matches, odd keys have none; preserve both left and right order.
        const left = Array.from({ length: size }, (_, i) => ({ key: i, left: i }));
        const right = Array.from({ length: size }, (_, i) => ({ key: Math.floor(i / 2) * 2, right: i }));
        const step = { mode: 'left', on: [{ left: 'key', right: 'key' }] };
        const [ms, result] = timed(() => joinRows(left, right, step));
        assert.equal(result.length, size * 1.5);
        for (let i = 0; i < size; i++) {
          const base = Math.floor(i / 2) * 3;
          if (i % 2 === 0) {
            assert.deepEqual(result[base], { key: i, left: i, right: i });
            assert.deepEqual(result[base + 1], { key: i, left: i, right: i + 1 });
          } else assert.deepEqual(result[base + 2], { key: i, left: i });
        }
        return ms;
      },
    });
  }
  await measure({
    id: 'core.query.composite-cache-update',
    workload: 'Update one input of a composite Query and reuse the unchanged child result',
    sample: async () => {
      const r = registry(),
        port = { kind: 'Value', schema: integer, required: true };
      const child = (id) => ({
        kind: 'Query',
        id,
        spec: {
          ports: { value: port },
          sources: {
            main: {
              datasource: { kind: 'Http', baseUrl: 'https://example.test' },
              request: { method: 'GET', path: `/${id}` },
            },
          },
          transform: { input: path('/sources/main') },
        },
      });
      r.registerResources([
        child('left'),
        child('right'),
        {
          kind: 'Query',
          id: 'composite',
          spec: {
            ports: { a: port, b: port },
            sources: {
              left: { queryRef: 'left', inputs: { value: path('/ports/a') } },
              right: { queryRef: 'right', inputs: { value: path('/ports/b') } },
            },
            transform: { input: { left: path('/sources/left'), right: path('/sources/right') } },
          },
        },
      ]);
      const calls = [];
      const runtime = createRuntime({
        registry: r,
        requestExecutor: async (plan) => {
          calls.push(plan.request.path);
          return { status: 200, headers: {}, body: plan.inputs.value };
        },
      });
      const view = await runtime.createView({
        states: {
          a: { kind: 'State', schema: integer, initial: 1 },
          b: { kind: 'State', schema: integer, initial: 2 },
        },
        queries: { q: { queryRef: 'composite', inputs: { a: path('/states/a'), b: path('/states/b') } } },
        render: { id: 'leaf', componentRef: 'Leaf' },
      });
      await view.whenSettled(view.initial);
      const [ms] = await timedAsync(async () => {
        view.getState('a').write(3);
        await flush();
      });
      assert.deepEqual(calls, ['/left', '/right', '/left']);
      const data = view.getQuery('q').getSnapshot().data;
      assert.equal(data.left, 3);
      assert.equal(data.right, 2);
      await view.dispose();
      runtime.dispose();
      return ms;
    },
  });
  await measure({
    id: 'core.query.poll-cancel',
    workload: 'Advance mock clock for polling, then cancel an in-flight Query on disposal',
    sample: async () => {
      const clock = new FakeClock();
      let calls = 0,
        abortSignal,
        release;
      const runtime = createRuntime({
        registry: registry(),
        clock,
        requestExecutor: async (_plan, { signal }) => {
          calls++;
          if (calls === 1) return { status: 200, headers: {}, body: 1 };
          abortSignal = signal;
          return await new Promise((resolve) => {
            release = resolve;
          });
        },
      });
      const view = await runtime.createView({
        queries: {
          q: {
            intervalMs: 100,
            query: {
              sources: {
                main: {
                  datasource: { kind: 'Http', baseUrl: 'https://example.test' },
                  request: { method: 'GET', path: '/data' },
                },
              },
              transform: { input: path('/sources/main') },
            },
          },
        },
        render: { id: 'leaf', componentRef: 'Leaf' },
      });
      await view.whenSettled(view.initial);
      const [ms] = await timedAsync(async () => {
        await clock.advance(100);
        await view.dispose();
      });
      assert.equal(calls, 2);
      assert.equal(abortSignal.aborted, true);
      release({ status: 200, headers: {}, body: 2 });
      await flush();
      assert.equal(clock.tasks.size, 0);
      runtime.dispose();
      return ms;
    },
  });
}
