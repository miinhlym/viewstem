---
title: Quick Start
description: Run your first Viewstem View and render a button in the browser.
---

Render a **Hello, Viewstem** button from a JSON View. Complete [Installation](../installation/) before running the example locally, or try the [same example in your browser](../../examples/first-view/).

## 1. Add a mount target

In the Vite starter’s `index.html`, replace `<div id="app"></div>` with the element below. In an existing app, add an empty element where the View should appear.

```html
<div id="viewstem" data-viewstem-ui></div>
```

## 2. Mount the View

Replace the Vite starter’s `src/main.js` with the code below. In an existing app, run it on the client once the mount target is in the document. Register the `ui` set to use catalog components such as `shadcn.Button`.

```js
import { createRuntime } from '@viewstem/core';
import { createRenderer } from '@viewstem/dom';
import { ui } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const runtime = createRuntime();
runtime.registry.registerResourceSet(ui);
const renderer = createRenderer({ runtime });
const screen = renderer.mount({
  target: document.getElementById('viewstem'),
  source: {
    render: {
      id: 'hello',
      componentRef: 'shadcn.Button',
      inputs: { text: 'Hello, Viewstem' },
    },
  },
});
await screen.whenRendered();
```

## 3. Open the app

```sh
npm run dev
```

Open the URL printed in the terminal. You should see a **Hello, Viewstem** button. Change `inputs.text` in the View definition to update the label. Use `await screen.ready` to get the prepared View and `await screen.whenRendered()` to wait for the DOM. Await `screen.unmount()` when the screen closes. On app shutdown, await `renderer.dispose()` and call `runtime.dispose()`.

## Next steps

Read [View and Component](../concepts/view-and-component/) to see how the definition works, or [change State on click](../../examples/set-state/) to connect the next button to an Action.

To use your own Svelte components, start with the [Svelte integration guide](../svelte/guides/mount-in-svelte/).
