---
title: Mount a View in the browser
description: Install Core, DOM, and UI and mount a View in a browser host.
---

## Build and install

Build and install the [Core, DOM, and UI tarballs](../../../installation/#build-the-browser-ui-packages) in your app.

## Render a button

Use a browser build that resolves package imports and handles CSS imports. Add the container and the client entry to your app's HTML.

```html
<div id="app" data-viewstem-ui></div>
<script type="module" src="/main.js"></script>
```

Put this code in `main.js`. A button labeled **Save** appears in the container.

```js
import { createRuntime } from '@viewstem/core';
import { createRenderer } from '@viewstem/dom';
import { ui } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

const runtime = createRuntime();
runtime.registry.registerResourceSet(ui);
const renderer = createRenderer({ runtime });
const screen = renderer.mount({
  target,
  source: {
    render: {
      id: 'save',
      componentRef: 'shadcn.Button',
      inputs: { text: 'Save', variant: 'outline' },
    },
  },
});
await screen.whenRendered();

export async function shutdown() {
  try {
    await renderer.dispose();
  } finally {
    runtime.dispose();
  }
}
```

## Connect to your host's lifecycle

Call `mount()` after the target is connected and await `screen.unmount()` when the screen closes. Viewstem manages the rendered subtree. On app shutdown, the example's `shutdown()` releases the renderer's connections and disposes the Runtime the app created.

To display an existing View, use [a borrowed attachment](../../api/#attach). See the [browser UI API](../../api/) for attachment errors and the [component catalog](../../components/) for supported JSON.
