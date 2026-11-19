import { defineCodeAction, defineResourceSet, type ViewSpec } from '@viewstem/core';
import { createRenderer, svelteComponent } from '@viewstem/svelte';
import { ui } from '@viewstem/ui';
import Counter from './Counter.svelte';
import { counterContract, integer } from './counter-contract.js';

const increment = defineCodeAction({
  definition: {
    kind: 'Action',
    id: 'increment',
    spec: { ports: { count: { kind: 'State', required: true, schema: integer } } },
  },
}).implement(({ inputs }) => {
  inputs.count.write((inputs.count.read() ?? 0) + 1);
});

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app');

export const renderer = createRenderer();
renderer.runtime.registry.registerResourceSet(defineResourceSet({
  id: 'counter-demo',
  version: '1',
  dependencies: [ui],
  components: [svelteComponent(counterContract, Counter)],
  actions: [increment],
}));

const count = { '@path': '/states/count' };
export const source: ViewSpec = {
  states: { count: { kind: 'State', schema: integer, initial: 0 } },
  render: {
    id: 'card',
    componentRef: 'shadcn.Card.Root',
    slots: { default: [
      { id: 'counter', componentRef: counterContract.id, inputs: { count } },
      {
        id: 'plus',
        componentRef: 'shadcn.Button',
        inputs: { text: '+1' },
        on: { click: { actionRef: 'increment', inputs: { count } } },
      },
    ] },
  },
};

export const screen = renderer.mount({ target, source });
await screen.whenRendered();
