---
title: Register component families
description: Import a family, register it with a renderer, and mount a View.
sidebar:
  order: 1
---

Use this in a Svelte 5 app with `@viewstem/svelte` and `@viewstem/svelte-ui` available to your bundler. Add `<div id="app"></div>` to the page and run the entry point in the browser.

## Mount a button

Import the `button` set from its family entry point and pass it to `registerComponents` before mounting. The value of `componentRef` is the component ID from the family reference.

```ts
import { createRenderer } from '@viewstem/svelte';
import { registerComponents } from '@viewstem/svelte-ui';
import { button } from '@viewstem/svelte-ui/shadcn/button';
import '@viewstem/svelte-ui/shadcn/styles.css';

const target = document.querySelector('#app');
if (!target) throw new Error('Missing #app');

const renderer = createRenderer();
registerComponents(renderer, [button]);

const mounted = await renderer.mount({
  target,
  view: {
    render: {
      id: 'save',
      componentRef: 'shadcn.Button',
      inputs: { text: 'Save', variant: 'outline' },
    },
  },
});
await mounted.initialComplete;
```

As you add more components, import their sets and register them in the same call. For example, a View with a `shadcn.Button` in a `shadcn.Dialog.Trigger` needs both `button` and `dialog`. Find import names and IDs in the [component sets](../../component-sets/).

## Register the full kit

Use this in place of the selected-family registration when the host needs every family, such as when it receives View definitions at runtime.

```ts
import { shadcn } from '@viewstem/svelte-ui/shadcn';

registerComponents(renderer, shadcn);
```

Keep registration in the renderer's setup code. Registering overlapping sets on the same renderer raises a conflict. Selective family imports let the bundler omit unused JavaScript. Both approaches use the same stylesheet.

## Dispose when the screen closes

Dispose the mounted View when its screen closes. If the screen owns the renderer, dispose the renderer as well.

```ts
await mounted.dispose();
await renderer.dispose();
```

See the [renderer lifecycle](/docs/svelte/renderer/) and [registration API](../../registration/) for the method contracts.
