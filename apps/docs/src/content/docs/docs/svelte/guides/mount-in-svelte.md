---
title: Mount a View in a Svelte app
description: Register a small adapter and render a core View inside an existing Svelte 5 component tree.
sidebar:
  order: 1
---

Choose the entry point for your host.

| Where the View belongs | Call |
| --- | --- |
| A new View in a separate DOM element | [`renderer.mount({ target, source })`](../manage-view-lifecycle/) |
| An existing View in a separate DOM element | [`renderer.attach(view, target)`](../../renderer/#mount-and-attach) |
| A standalone screen in an existing Svelte tree | [`<ViewstemView {source} resourceSets={[ui]} />`](../../viewstem-view/) |
| A new View inside an existing Svelte tree | [`<ViewstemView {renderer} {source} />`](../../viewstem-view/) |
| An existing View inside an existing Svelte tree | [`<ViewstemView {renderer} {view} />`](../../viewstem-view/#borrowing-a-view) |

This guide uses `ViewstemView` to display a greeting in an existing Svelte tree. Use a Svelte-aware bundler and [install the Svelte renderer and Core from npm](/docs/installation/#install-svelte).

<a id="prepare-entry"></a>

## Prepare the example entry point

If you followed Installation or Quick Start, use this guide's `src/main.ts` instead of `src/main.js`. Replace the existing mount element and module script in `index.html` with the following. Change Quick Start's `id="viewstem"` to `id="app"` too. Put all source files below in `src/`.

```html
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```

<a id="define-label"></a>

## 1. Define the adapter and its public contract

`Label.svelte` receives evaluated inputs in `inputs` and reads readiness from `node`. The label displays a string while the node is ready and a status message while it waits for valid input.

```svelte
<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';

  let { inputs, node }: ComponentAdapterProps = $props();
</script>

{#if node.status === 'ready' && typeof inputs.text === 'string'}
  <p>{inputs.text}</p>
{:else}
  <p role="status">{node.error?.message ?? 'Waiting for text…'}</p>
{/if}
```

In `label.ts`, give the adapter the ID `Label` and declare its required `text` port. A View can now refer to that ID when the registration is present.

```ts
import { svelteComponent } from '@viewstem/svelte';
import Label from './Label.svelte';

export const label = svelteComponent({
    kind: 'Component',
    id: 'Label',
    spec: {
      ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } },
    },
}, Label);
```

## 2. Create and display the View

In `App.svelte`, register the adapter and pass a `source`. The component creates the View in the browser. Removing the component cancels preparation or disposes the View it created. The app disposes its own renderer when it closes.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { defineResourceSet } from '@viewstem/core';
  import { createRenderer, ViewstemView, type ViewSpec } from '@viewstem/svelte';
  import { label } from './label.js';

  const renderer = createRenderer();

  renderer.runtime.registry.registerResourceSet(defineResourceSet({ id: 'labels', version: '1', components: [label] }));
  const source: ViewSpec = {
    render: {
      id: 'greeting',
      componentRef: 'Label',
      inputs: { text: 'Hello from Viewstem' },
    },
  };

  onMount(() => () => { void renderer.dispose().catch(console.error); });
</script>

{#snippet pending()}
  <p role="status">Loading the greeting…</p>
{/snippet}

{#snippet prepareError(error: import('@viewstem/svelte').PublicError)}
  <p role="alert">{error.message}</p>
{/snippet}

<main>
  <h1>My app</h1>
  <ViewstemView {renderer} {source} {pending} {prepareError} />
</main>
```

Use `prepareError` to show View creation failures and `fallback` for individual node failures after creation. The root policy below applies when an adapter render exception reaches a Svelte boundary.

## 3. Set the Svelte root error policy

Use `transformError` in your browser entry point, here `main.ts`. The HTML entry needs an element with `id="app"`. If the app already mounts a Svelte root, apply the policy to that existing `mount` call.

```ts
import { mount } from 'svelte';
import { transformError } from '@viewstem/svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element.');

mount(App, { target, transformError });
```

Run the app and confirm **Hello from Viewstem** appears below **My app**. The HTML around the greeting belongs to your Svelte app. [`ViewstemView`](../../viewstem-view/) inherits parent context at the point where you place it.

If the app needs to manage the View directly or wait for its initial Query report, [pass an existing View](../../viewstem-view/#borrowing-a-view). The `transformError` policy applies to the whole app root. See the [error reference](../../errors/) for its scope and fallback behavior.

<a id="existing-app"></a>

## Add Viewstem to an existing app

Use your app's current HTML and entry point. Add `Label.svelte` and `label.ts` from above, then create the renderer once in a shared layout. In this example the layout owns the renderer, and the conditionally rendered page owns its View.

```svelte
<!-- Layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { defineResourceSet } from '@viewstem/core';
  import { createRenderer } from '@viewstem/svelte';
  import SettingsPage from './SettingsPage.svelte';
  import { label } from './label.js';

  let { showSettings }: { showSettings: boolean } = $props();
  const renderer = createRenderer();
  renderer.runtime.registry.registerResourceSet(defineResourceSet({ id: 'labels', version: '1', components: [label] }));
  onMount(() => () => { void renderer.dispose().catch(console.error); });
</script>

{#if showSettings}
  <SettingsPage {renderer} />
{/if}
```

```svelte
<!-- SettingsPage.svelte -->
<script lang="ts">
  import { ViewstemView, type Renderer, type ViewSpec } from '@viewstem/svelte';

  let { renderer }: { renderer: Renderer } = $props();
  const source: ViewSpec = {
    render: {
      id: 'settings',
      componentRef: 'Label',
      inputs: { text: 'Settings' },
    },
  };
</script>

<ViewstemView {renderer} {source} />
```

Closing the page cancels pending creation or disposes its View. The layout can reuse the renderer for the next page. If your app calls Svelte's `mount` or `hydrate`, integrate [`transformError`](../../errors/#transformerror) with your existing root error policy. If a framework manages the root, consult its error configuration. The `main.ts` above is for the Vite example that mounts its own root.

<a id="mix-default-ui"></a>

## Mix a default UI button with a Svelte component

Use a Svelte TypeScript client build. After [installing Core and the Svelte renderer](/docs/installation/#install-svelte), run `npm install @viewstem/ui` to add the UI catalog. These files form a standalone example.

`index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Viewstem counter</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/counter-contract.ts`

```ts
import type { ComponentContract } from '@viewstem/core';

export const integer = { type: 'integer' } as const;
export const counterContract = {
  kind: 'Component',
  id: 'demo.Counter',
  spec: { ports: { count: { kind: 'Value', required: true, schema: integer } } },
} as const satisfies ComponentContract;
```

`src/Counter.svelte`

```svelte
<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  import type { counterContract } from './counter-contract.js';

  let { node }: ComponentAdapterProps<typeof counterContract> = $props();
</script>

<output aria-label="Count">
  {#if node.status === 'ready'}
    {node.inputs.count.toFixed(0)}
  {:else}
    {node.inputs.count ?? '—'}
  {/if}
</output>
```

`src/main.ts`

```ts
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
```

The renderer connects Svelte and DOM in one View. The demo set registers the default UI through `dependencies: [ui]`. Vite bundles the default UI styles with `@viewstem/ui`. The Card supplies a single root and its `default` slot holds both children.

The default `shadcn.Button` emits `click`. Its handler binds `/states/count` to a `State` port, so the Action gets a writable handle. The Svelte component binds the same path to a `Value` port and receives the evaluated number through its typed node.

Run the app. The count starts at 0. Click **+1** to get 1, then press Enter on the focused button to get 2. `screen.whenRendered()` waits for the first display. Use `await screen.ready` if your app also needs the View handle. Call `await screen.unmount()` when closing just this screen, or `await renderer.dispose()` when the app finishes with the renderer.

Change the counter’s input path to `/states/coutn`. The initial mount rejects with this diagnostic before displaying the View. [Error reference](../../errors/#failure-and-recovery)

```json
{
  "code": "REFERENCE_NOT_FOUND",
  "message": "Unknown State \"coutn\".",
  "location": "/render/slots/default/0/inputs/count/@path",
  "input": "count"
}
```
