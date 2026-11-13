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
| A new View inside an existing Svelte tree | [`<ViewstemView {renderer} {source} />`](../../viewstem-view/) |
| An existing View inside an existing Svelte tree | [`<ViewstemView {renderer} {view} />`](../../viewstem-view/#borrowing-a-view) |

This guide uses `ViewstemView` to display a greeting in an existing Svelte tree. Use a Svelte-aware bundler and the packages from [Installation](/docs/installation/#build-and-install-the-svelte-packages).

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
import type { ComponentRegistration } from '@viewstem/svelte';
import Label from './Label.svelte';

export const label: ComponentRegistration = {
  contract: {
    kind: 'Component',
    id: 'Label',
    spec: {
      ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } },
    },
  },
  component: Label,
};
```

## 2. Create and display the View

In `App.svelte`, register the adapter and pass a `source`. The component creates the View in the browser. Removing the component cancels preparation or disposes the View it created. The app disposes its own renderer when it closes.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createRenderer, ViewstemView, type ViewSpec } from '@viewstem/svelte';
  import { label } from './label.js';

  const renderer = createRenderer({ components: [label] });
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
  import { createRenderer } from '@viewstem/svelte';
  import SettingsPage from './SettingsPage.svelte';
  import { label } from './label.js';

  let { showSettings }: { showSettings: boolean } = $props();
  const renderer = createRenderer({ components: [label] });
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
