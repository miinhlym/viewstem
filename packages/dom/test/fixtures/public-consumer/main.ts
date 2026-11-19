import { createRuntime, defineResourceSet, type ViewSpec } from '@viewstem/core';
import { createRenderer } from '@viewstem/dom';
import { svelteComponent, svelteConnector } from '@viewstem/svelte';
import { commonSet } from 'viewstem-test-author/common-set';
import { externalSet } from 'viewstem-test-author/external-set';
import { disposals, externalConnector, mounts } from 'viewstem-test-author/external-connector';
import Layout from './Layout.svelte';

const registrySetup = defineResourceSet({ id: 'mixed', version: '1', dependencies: [externalSet], components: [
  svelteComponent({ kind: 'Component', id: 'Layout', spec: {
    ports: { compact: { kind: 'Value', schema: { type: 'boolean' }, required: true } }, slots: { default: {} },
  } }, Layout),
] });

const string = { type: 'string' } as const;
const expression = (path: string) => ({ '@path': path });
const source: ViewSpec = {
  states: {
    title: { kind: 'State', schema: string, initial: 'Before' },
    rows: { kind: 'State', schema: { type: 'array', items: string }, initial: ['alpha', 'beta'] },
    compact: { kind: 'State', schema: { type: 'boolean' }, initial: false },
  },
  render: { id: 'card', componentRef: 'shadcn.Card.Root', slots: { default: [
    { id: 'layout', componentRef: 'Layout', inputs: { compact: expression('/states/compact') }, slots: { default: [
      { id: 'official', componentRef: 'shadcn.Button', inputs: { text: expression('/states/title') } },
      { id: 'custom', componentRef: 'External', inputs: { key: expression('/repeat/item'), label: expression('/states/title') },
        repeat: { items: expression('/states/rows'), as: 'item', key: expression('/repeat/item') }, on: { click: {
          action: { ports: { title: { kind: 'State', schema: string, required: true } }, steps: [
            { kind: 'SetState', target: expression('/ports/title'), value: 'After' },
          ] }, inputs: { title: expression('/states/title') },
        } } },
    ] } },
  ] } },
};

const browser = window as Window & { testRun?: () => Promise<unknown> };
browser.testRun = async () => {
  const runtime = createRuntime();
  runtime.registry.registerResourceSet(commonSet).registerResourceSet(registrySetup);
  const first = createRuntime();
  first.registry.registerResourceSet(registrySetup);
  const answer = await first.invokeAction({ actionRef: 'answer' });
  first.dispose();
  const view = await runtime.createView(source);
  const renderer = createRenderer({ runtime, connectors: [svelteConnector, externalConnector] });
  const target = document.querySelector('main')!;
  const display = renderer.attach(view, target);
  await display.whenRendered();
  const slot = () => target.querySelector('[data-vs-part=card] [data-layout] [data-slot]')!;
  const external = () => [...slot().querySelectorAll<HTMLButtonElement>('[data-external]')];
  const original = external();
  let stop = () => {};
  const titleChanged = new Promise<void>(resolve => { stop = view.subscribe(snapshot => {
    const title = snapshot.states.title;
    if (title?.status === 'ready' && title.value === 'After') resolve();
  }); });
  original[0]!.click();
  await titleChanged;
  stop();
  await display.whenRendered();
  const title = slot().querySelector('[data-vs-component=Button]')?.textContent;
  const labels = external().map(node => node.textContent);
  view.getState('rows').write(['beta', 'alpha']);
  await display.whenRendered();
  const kept = external()[0] === original[1] && external()[1] === original[0];
  const generations = () => view.getSnapshot().roots[0]?.slots.default?.[0]?.slots.default?.map(node => node.generation);
  const before = JSON.stringify(generations());
  view.getState('compact').write(true);
  await display.whenRendered();
  const result = { answer, title, labels, kept, moved: slot().getAttribute('data-slot'),
    restored: external().map(node => node.dataset.external), preserved: JSON.stringify(generations()) === before,
    mounts: [...mounts].sort(), disposals: [...disposals].sort() };
  await display.detach();
  await renderer.dispose();
  runtime.dispose();
  return { ...result, empty: target.childNodes.length === 0 };
};
