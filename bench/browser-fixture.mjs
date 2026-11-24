import { createRuntime, defineResourceSet } from '@viewstem/core';
import { createRenderer as dom, DOM_CONNECTOR_ID } from '@viewstem/dom';
import { ui } from '@viewstem/ui';
import { createStyleScope } from '@viewstem/dom/styles';
import { samples } from '../packages/ui/test/fixtures/samples.mjs';
import * as F from '../packages/svelte/test/browser-fixture.mjs';
import { sampleQueryProjection } from './query-projection.mjs';

const target = () => {
  const el = document.createElement('main');
  document.body.append(el);
  return el;
};
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const time = async (fn) => {
  const start = performance.now();
  await fn();
  return performance.now() - start;
};
const path = (p) => ({ '@path': p });
const component = (id, spec, mount) => ({
  contract: { kind: 'Component', id, spec },
  connectorId: DOM_CONNECTOR_ID,
  implementation: { mount },
});
function domSetup(custom = false) {
  const runtime = createRuntime();
  let clicks = 0;
  runtime.registry.registerAction({ kind: 'Action', id: 'record', spec: {} }, () => {
    clicks++;
  });
  const components = [
    component('List', { slots: { default: {} } }, (ctx) => {
      const el = document.createElement('section');
      ctx.parent.insertBefore(el, ctx.anchor);
      ctx.provideSlot('default', el);
      return {
        update() {},
        dispose() {
          el.remove();
        },
      };
    }),
    component(
      'Item',
      {
        ports: { label: { kind: 'Value', schema: { type: 'string' }, required: true } },
        events: { click: { schema: true } },
      },
      (ctx) => {
        const el = document.createElement('button');
        el.textContent = ctx.node.inputs.label;
        el.onclick = () => ctx.emit('click', {});
        ctx.parent.insertBefore(el, ctx.anchor);
        return {
          update(next) {
            el.textContent = next.inputs.label;
          },
          dispose() {
            el.remove();
          },
        };
      },
    ),
  ];
  if (custom) for (const c of components) c.connectorId = 'bench-connector';
  runtime.registry.registerResourceSet(defineResourceSet({ id: 'bench', version: '1', components }));
  const connector = {
    id: 'bench-connector',
    accepts: (impl) => typeof impl?.mount === 'function',
    mount: (impl, context) => impl.mount(context),
  };
  const renderer = dom({ runtime, ...(custom ? { connectors: [connector] } : {}) }),
    host = target();
  const values = Array.from({ length: 100 }, (_, id) => ({ id, label: `item-${id}` }));
  const source = {
    states: {
      items: { kind: 'State', schema: { type: 'array', items: { type: 'object' } }, initial: values },
    },
    render: {
      id: 'list',
      componentRef: 'List',
      slots: {
        default: [
          {
            id: 'item',
            componentRef: 'Item',
            inputs: { label: path('/repeat/item/label') },
            repeat: { items: path('/states/items'), as: 'item', key: path('/repeat/item/id') },
            on: { click: { actionRef: 'record' } },
          },
        ],
      },
    },
  };
  return {
    runtime,
    renderer,
    host,
    source,
    values,
    get clicks() {
      return clicks;
    },
  };
}
window.bench = {
  slugs: samples.map((s) => s.slug),
  async queryProjection(size) {
    const text = (tag) => ({
      mount(context) {
        const node = document.createElement(tag);
        const update = (snapshot) => {
          if (node.textContent !== snapshot.inputs.label) node.textContent = snapshot.inputs.label;
        };
        update(context.node);
        context.parent.insertBefore(node, context.anchor);
        return { update, dispose: () => node.remove() };
      },
    });
    const adapters = {
      Group: {
        mount(context) {
          const group = document.createElement('section');
          context.parent.insertBefore(group, context.anchor);
          context.provideSlot('default', group);
          return { update() {}, dispose: () => group.remove() };
        },
      },
      Option: text('span'),
      Summary: text('output'),
    };
    return sampleQueryProjection({
      createRuntime,
      defineResourceSet,
      size,
      adapters,
      async attach(runtime, view) {
        const host = target();
        const renderer = dom({ runtime });
        const connection = renderer.attach(view, host);
        await connection.whenRendered();
        const first = host.querySelector('span');
        return {
          whenRendered: () => connection.whenRendered(),
          verify(count) {
            check(host.querySelector('output')?.textContent === 'After', 'Changed summary did not render');
            check(
              host.querySelectorAll('span').length === count && host.querySelector('span') === first,
              'Unrelated DOM changed identity',
            );
          },
          async dispose() {
            await renderer.dispose();
            host.remove();
          },
        };
      },
    });
  },
  async styleScope() {
    const scope = createStyleScope('bench-scope'),
      host = target();
    const ms = await time(() => {
      for (let i = 0; i < 1000; i++) host.append(scope.createElement(document, 'div'));
    });
    check(host.children.length === 1000, 'style scope count incorrect');
    host.remove();
    return ms;
  },
  async ui(slug, scale, interaction) {
    const sample = structuredClone(samples.find((s) => s.slug === slug));
    if (typeof scale === 'number') {
      const group = sample.view.render.slots.default.find(
        (n) => n.componentRef === 'shadcn.NativeSelect.Root',
      ).slots.default[0];
      const prototype = group.slots.default[0];
      group.slots.default = Array.from({ length: scale }, (_, i) => ({
        ...structuredClone(prototype),
        id: `option-${i}`,
        inputs: { value: `v${i}`, text: `Option ${i}` },
      }));
    }
    if (scale === 'rows') {
      sample.view.queries.metrics.query.transform.input = Array.from({ length: 1000 }, (_, i) => ({
        id: `row-${i}`,
        month: `Month ${i}`,
        count: i,
        target: i + 10,
      }));
      sample.view.render.inputs.pageSize = 100;
    }
    const runtime = createRuntime();
    runtime.registry.registerResourceSet(ui);
    const renderer = dom({ runtime }),
      host = target();
    let screen;
    let view;
    const mount = async () => {
      screen = renderer.mount({ target: host, source: sample.view });
      view = await screen.ready;
      await screen.whenSettled(view.initial);
      await screen.whenRendered();
    };
    let ms;
    if (!interaction) ms = await time(mount);
    else {
      await mount();
      const perform = () => {
        if (interaction === 'select') {
          const el = host.querySelector('select');
          el.value = 'v1';
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (interaction === 'sort')
          [...host.querySelectorAll('button')].find((el) => el.textContent.includes('처리량')).click();
        if (interaction === 'input') {
          const el = host.querySelector('input');
          el.value = 'Changed name';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (interaction === 'calendar') host.querySelector('[data-date="2026-11-09"]').click();
        if (interaction === 'menu') host.querySelector('button').click();
        if (interaction === 'filter') {
          const el = host.querySelector('input[type=search]');
          el.value = 'Month 999';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      };
      ms = await time(async () => {
        perform();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await screen.whenRendered();
      });
      if (interaction === 'input')
        check(view.getState('name').read() === 'Changed name', 'input change failed');
      if (interaction === 'calendar')
        check(view.getState('date').read() === '2026-11-09', 'calendar change failed');
      if (interaction === 'menu') {
        const trigger = host.querySelector('[data-vs-component="DropdownMenu.Trigger"]');
        const panel = document.querySelector('[data-vs-component="DropdownMenu.Content"]');
        check(
          trigger?.getAttribute('aria-expanded') === 'true' &&
            panel &&
            !panel.inert &&
            panel.getAttribute('aria-hidden') !== 'true',
          'menu open failed',
        );
      }
      if (interaction === 'select') check(view.getState('site').read() === 'v1', 'select change failed');
      if (interaction === 'sort') {
        const [order] = view.getState('sorting').read();
        const heading = host.querySelector('th[aria-sort]');
        const cells = [...host.querySelectorAll('tbody td:nth-child(3)')];
        check(
          order?.id === 'count' &&
            heading?.getAttribute('aria-sort') === (order.desc ? 'descending' : 'ascending'),
          'sort state and heading disagree',
        );
        check(
          cells.length === 100 &&
            cells.every((cell, index) => Number(cell.textContent) === (order.desc ? 999 - index : index)),
          'sort data order incorrect',
        );
      }
      if (interaction === 'filter') {
        const rows = host.querySelectorAll('tbody tr');
        check(
          view.getState('filter').read() === 'Month 999' &&
            rows.length === 1 &&
            rows[0].querySelector('td:nth-child(2)').textContent === 'Month 999',
          'filter result incorrect',
        );
      }
    }
    check(host.childNodes.length > 0, `UI ${slug} produced no content`);
    if (typeof scale === 'number')
      check(host.querySelectorAll('option').length === scale, 'option count incorrect');
    if (scale === 'rows' && interaction !== 'filter')
      check(host.querySelectorAll('tbody tr').length === 100, 'table page count incorrect');
    await screen.unmount();
    check(!host.hasChildNodes(), `UI ${slug} failed teardown`);
    await renderer.dispose();
    runtime.dispose();
    host.remove();
    return ms;
  },
  async dom(operation) {
    const f = domSetup(operation === 'custom');
    let screen, view, ms;
    const mount = async () => {
      screen = f.renderer.mount({ target: f.host, source: f.source });
      view = await screen.ready;
      await screen.whenRendered();
    };
    if (operation === 'mount' || operation === 'custom')
      ms = await time(async () => {
        await mount();
      });
    else {
      await mount();
      if (operation === 'reorder') {
        const before = f.host.querySelector('button');
        ms = await time(async () => {
          view.getState('items').write([...f.values].reverse());
          await screen.whenRendered();
        });
        check(f.host.querySelectorAll('button')[99] === before, 'keyed identity lost');
      }
      if (operation === 'update') {
        const before = f.host.querySelector('button');
        ms = await time(async () => {
          view.getState('items').write(f.values.map((row) => ({ ...row, label: row.label + '!' })));
          await screen.whenRendered();
        });
        check(
          f.host.querySelector('button') === before && before.textContent === 'item-0!',
          'keyed update failed',
        );
      }
      if (operation === 'event') {
        ms = await time(async () => {
          f.host.querySelector('button').click();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        check(f.clicks === 1, `event failed: ${f.clicks}`);
      }
      if (operation === 'unmount') {
        ms = await time(async () => {
          await screen.unmount();
        });
        check(!f.host.hasChildNodes(), 'unmount failed');
        screen = null;
      }
    }
    check(operation === 'unmount' || f.host.querySelectorAll('button').length === 100, 'DOM count incorrect');
    if (screen) await screen.unmount();
    await f.renderer.dispose();
    f.runtime.dispose();
    f.host.remove();
    return ms;
  },
  async svelteHost() {
    const set = F.defineResourceSet({
      id: 'host-bench',
      version: '1',
      components: [
        F.svelteComponent(F.resource('Component', 'Probe', { ports: { value: F.port() } }), F.Probe),
      ],
    });
    const source = { render: F.probe('first', 'before') },
      next = { render: F.probe('second', 'after') },
      hostTarget = target();
    const host = F.mount(F.SourceHost, {
      target: hostTarget,
      props: { initialSource: source, resourceSets: [set] },
    });
    await F.tick();
    await host.whenRendered();
    const ms = await time(async () => {
      host.changeSource(next);
      host.remount();
      await F.tick();
      await host.whenRendered();
    });
    check(hostTarget.textContent.includes('after'), 'host replacement failed');
    await F.unmount(host);
    check(!hostTarget.hasChildNodes(), 'host teardown failed');
    hostTarget.remove();
    return ms;
  },
  async svelte(operation) {
    const e = F.environment();
    if (operation === 'mixed')
      e.registry.registerResourceSet(
        F.defineResourceSet({
          id: 'bench-mixed',
          version: '1',
          components: [
            component('BenchDOM', {}, (ctx) => {
              const el = document.createElement('span');
              el.textContent = 'DOM';
              ctx.parent.insertBefore(el, ctx.anchor);
              return {
                update() {},
                dispose() {
                  el.remove();
                },
              };
            }),
          ],
        }),
      );
    const source = {
      states: { value: F.state('before') },
      render: F.layout(
        Array.from({ length: 50 }, (_, i) =>
          operation === 'mixed' && i % 2
            ? { id: `dom-${i}`, componentRef: 'BenchDOM' }
            : F.probe(`probe-${i}`, F.p('/states/value')),
        ),
      ),
    };
    let screen, ms;
    const mount = async () => {
      screen = e.renderer.mount({ target: e.target, view: source });
      screen = await screen;
      await screen.initialComplete;
      await screen.whenRendered();
    };
    if (operation === 'mount' || operation === 'mixed')
      ms = await time(async () => {
        await mount();
      });
    else {
      await mount();
      if (operation === 'update')
        ms = await time(async () => {
          screen.view.getState('value').write('after');
          await screen.whenRendered();
        });
      if (operation === 'replace')
        ms = await time(async () => {
          await (
            await screen.replace({ view: source })
          ).initialComplete;
          await screen.whenRendered();
        });
      if (operation === 'unmount') {
        ms = await time(async () => {
          await screen.dispose();
        });
        check(!e.target.hasChildNodes(), 'Svelte unmount failed');
        screen = null;
      }
    }
    if (operation === 'mixed')
      check(e.target.querySelectorAll('span').length >= 25, 'mixed DOM children missing');
    if (screen) {
      check(
        e.target.textContent.includes(operation === 'update' ? 'after' : 'before'),
        'Svelte render failed',
      );
      await screen.dispose();
    }
    await e.renderer.dispose();
    e.runtime.dispose();
    e.target.remove();
    return ms;
  },
};
