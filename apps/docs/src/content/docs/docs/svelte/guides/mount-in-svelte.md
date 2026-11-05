---
title: Mount a View in a Svelte app
description: Register a small adapter and render a core View inside an existing Svelte 5 component tree.
sidebar:
  order: 1
---

Place a Viewstem greeting inside your Svelte app using `ViewstemView`. This guide assumes a client-side Svelte 5 app with a Svelte-aware bundler and the packages from [Installation](/docs/installation/). Put the following files alongside your app entry point.

<a id="prepare-entry"></a>

## Prepare the example entry point

If you followed Installation or Quick Start, use this guide's `src/main.ts` instead of `src/main.js`. Replace the existing mount element and module script in `index.html` with the following. Change Quick Start's `id="viewstem"` to `id="app"` too. Put all source files below in `src/`.

```html
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```

<a id="define-label"></a>

## 1. Define the adapter and its public contract

`Label.svelte` receives evaluated inputs as a single prop. The label displays a string while the node is ready and a status message while it waits for valid input.

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

In `App.svelte`, register the adapter, then create a core View when the app mounts in the browser. Pass that View to `ViewstemView` as soon as it is available. The teardown returned by `onMount` disposes the renderer and its owned Runtime, which also owns the View created here.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createRenderer, ViewstemView, type View } from '@viewstem/svelte';
  import { label } from './label.js';

  const renderer = createRenderer();
  renderer.registerComponents([label]);

  let view = $state.raw<View | null>(null);
  let issue = $state('');

  onMount(() => {
    let active = true;

    async function start() {
      const created = await renderer.runtime.createView({
        view: {
          render: {
            id: 'greeting',
            componentRef: 'Label',
            inputs: { text: 'Hello from Viewstem' },
          },
        },
      });
      if (active) view = created.view;
      await created.initialComplete;
    }

    void start().catch(() => {
      if (active) issue = 'The greeting could not be loaded.';
    });

    return () => {
      active = false;
      void renderer.dispose().catch(console.error);
    };
  });
</script>

<main>
  <h1>My app</h1>
  {#if issue}
    <p role="alert">{issue}</p>
  {/if}
  {#if view}
    <ViewstemView {renderer} {view} onError={({ error }) => (issue = error.message)} />
  {:else if !issue}
    <p role="status">Loading the greeting…</p>
  {/if}
</main>
```

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

Run the app and confirm **Hello from Viewstem** appears below **My app**. The HTML around the greeting belongs to your Svelte app. [`ViewstemView`](../../viewstem-view/) renders the borrowed View at the point where you place it.

The core `created.initialComplete` promise covers initial Query execution. When you also need to inspect the projected DOM, use [the component instance's `whenRendered()`](../../viewstem-view/#whenrendered). The [error reference](../../errors/) explains how the root policy, diagnostics, and fallbacks work together.
