import { createRenderer } from '@viewstem/svelte';
import type { StateHandle } from '@viewstem/core';
import { registerComponents } from '@viewstem/svelte-ui';
import { button } from '@viewstem/svelte-ui/shadcn/button';
import { input } from '@viewstem/svelte-ui/shadcn/input';
import { card } from '@viewstem/svelte-ui/shadcn/card';
import { label } from '@viewstem/svelte-ui/shadcn/label';

export async function mountApp(target: HTMLElement, services: { save: (name: string) => Promise<void>; load: () => Promise<string> }) {
  const renderer = createRenderer();
  registerComponents(renderer, [button, input, card, label]);
  renderer.registry.registerAction<{ name: string; status: StateHandle<string> }>({
    kind: 'Action', id: 'saveName', spec: { ports: {
      name: { kind: 'Value', schema: { type: 'string' }, required: true },
      status: { kind: 'State', schema: { type: 'string' }, required: true },
    } },
  }, async ({ inputs }) => { await services.save(inputs.name); inputs.status.write(`Saved: ${inputs.name}`); });
  const mounted = await renderer.mount({ target, view: {
    states: {
      name: { kind: 'State', schema: { type: 'string' }, initial: '' },
      status: { kind: 'State', schema: { type: 'string' }, initial: '' },
    },
    render: { id: 'root', componentRef: 'shadcn.Card.Root', slots: { default: [
      { id: 'name', componentRef: 'shadcn.Input', inputs: { value: { '@path': '/states/name' }, 'aria-label': 'Name' }, on: { input: {
        action: { ports: {
          target: { kind: 'State', schema: { type: 'string' }, required: true },
          next: { kind: 'Value', schema: { type: 'string' }, required: true },
        }, steps: [{ kind: 'SetState', target: { '@path': '/ports/target' }, value: { '@path': '/ports/next' } }] },
        inputs: { target: { '@path': '/states/name' }, next: { '@path': '/event/value' } },
      } } },
      { id: 'save', componentRef: 'shadcn.Button', inputs: { text: 'Save' }, on: { click: { actionRef: 'saveName', inputs: { name: { '@path': '/states/name' }, status: { '@path': '/states/status' } } } } },
      { id: 'status', componentRef: 'shadcn.Label', inputs: { text: { '@path': '/states/status' } } },
    ] } },
  } });
  await mounted.initialComplete;
  return { dispose: () => renderer.dispose() };
}
