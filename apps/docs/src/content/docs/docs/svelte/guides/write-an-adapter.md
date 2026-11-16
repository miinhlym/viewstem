---
title: Write an adapter with a slot and an event
description: Give a Svelte adapter a named slot and let its button trigger an Action declared in the View.
sidebar:
  order: 2
---

Build a small panel with a `body` slot and a **Show details** button. The panel owns the markup. A View supplies the slot content and decides what happens when the button is pressed.

Use `Label.svelte` and `label.ts` from [Mount a View in a Svelte app](../mount-in-svelte/#define-label). Use an HTML entry containing `<main id="app"></main>` for this example.

First [prepare the example entry point](../mount-in-svelte/#prepare-entry) so `index.html` loads `/src/main.ts` and contains `id="app"`. The example below replaces your existing `src/main.ts`.

## 1. Connect the button and slot

Add `Panel.svelte`. Call `emit` with the declared event name and payload. Disable the button while the adapter has incomplete inputs, and handle rejection in the interaction that triggered it.

```svelte
<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';

  let { node, emit, renderSlot }: ComponentAdapterProps = $props();
  let eventError = $state(false);

  async function reveal() {
    eventError = false;
    try {
      await emit('reveal', null);
    } catch {
      eventError = true;
    }
  }
</script>

<section aria-label="Details">
  <button type="button" disabled={node.status !== 'ready'} onclick={reveal}>
    Show details
  </button>
  {#if eventError}
    <p role="alert">Details could not be shown.</p>
  {/if}
  {@render renderSlot('body')}
</section>
```

## 2. Register the panel and mount a View

Use this as `main.ts`. The `Panel` contract declares `body` and the `reveal` event with a `null` payload. The View provides a `Label` in `body` and uses its own State to control the label's visibility.

```ts
import { createRenderer } from '@viewstem/svelte';
import Panel from './Panel.svelte';
import { label } from './label.js';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element.');

const renderer = createRenderer({ components: [
  label,
  {
    contract: {
      kind: 'Component',
      id: 'Panel',
      spec: {
        slots: { body: {} },
        events: { reveal: { schema: { type: 'null' } } },
      },
    },
    component: Panel,
  },
] });

const mounted = renderer.mount({
  target,
  source: {
    states: {
      showDetails: { kind: 'State', schema: { type: 'boolean' }, initial: false },
    },
    render: {
      id: 'details-panel',
      componentRef: 'Panel',
      slots: {
        body: [
          {
            id: 'details-text',
            componentRef: 'Label',
            inputs: { text: 'These details come from the View.' },
            when: { '@path': '/states/showDetails' },
          },
        ],
      },
      on: {
        reveal: {
          action: {
            ports: { shown: { kind: 'State', schema: { type: 'boolean' }, required: true } },
            steps: [{ kind: 'SetState', target: { '@path': '/ports/shown' }, value: true }],
          },
          inputs: { shown: { '@path': '/states/showDetails' } },
        },
      },
    },
  },
});
const view = await mounted.ready;
await mounted.whenSettled(view.initial);
```

The button is visible on load. Click **Show details** to display **These details come from the View.** The adapter forwards `reveal`; core validates the payload, dispatches the Action, and reevaluates the slot after the State write. The slot's `when` reads the View's State because the View authored that content.

When the host removes this screen, call `await renderer.dispose()` to release the attachment and its owned Runtime. See the [adapter reference](../../adapters/) for input readiness, slot order, and retained event callbacks.
