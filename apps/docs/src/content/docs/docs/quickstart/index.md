---
title: Quick Start
description: Run your first Viewstem View and render a button in the browser.
---

Render a **Hello, Viewstem** button from a JSON View. Complete [Installation](../installation/) before running the example locally, or try the [same example in your browser](../../examples/first-view/).

## 1. Add a mount target

In the Vite starter’s `index.html`, replace `<div id="app"></div>` with the element below. In an existing app, add an empty element where the View should appear.

```html
<div id="viewstem"></div>
```

## 2. Mount the View

Replace the Vite starter’s `src/main.js` with the code below. In an existing app, run it on the client once the mount target is in the document. `createRenderer()` includes the default catalog, including `shadcn.Button`.

```js
import { createRenderer } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const renderer = createRenderer();
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
await screen.ready;
```

## 3. Open the app

```sh
npm run dev
```

Open the URL printed in the terminal. You should see a **Hello, Viewstem** button. Change `inputs.text` in the View definition to update the label. `screen.ready` waits for the first DOM update. Call `await screen.unmount()` when the screen closes and `await renderer.dispose()` when the app is done with the renderer.

## Next steps

Read [View and Component](../concepts/view-and-component/) to see how the definition works, or [change State on click](../../examples/set-state/) to connect the next button to an Action.

To use your own Svelte components, start with the [Svelte integration guide](../svelte/guides/mount-in-svelte/).
