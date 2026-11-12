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

## 2. Register the button and run the View

Replace the Vite starter’s `src/main.js` with the code below. In an existing app, run it on the client once the mount target is in the document. `registerShadcn` makes `shadcn.Button` available to the View’s `componentRef`.

```js
import { createRegistry, createRuntime } from '@viewstem/core';
import { attach, registerShadcn } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const target = document.querySelector('#viewstem');
const registry = createRegistry();
registerShadcn(registry);
const runtime = createRuntime({ registry });

const mounted = await runtime.createView({
  view: {
    render: {
      id: 'hello',
      componentRef: 'shadcn.Button',
      inputs: { text: 'Hello, Viewstem' },
    },
  },
});
const attachment = attach(mounted.view, target);
await mounted.initialComplete;
```

## 3. Open the app

```sh
npm run dev
```

Open the URL printed in the terminal. You should see a **Hello, Viewstem** button. Change `inputs.text` to confirm the View controls its label. Call `attachment.dispose()` and `runtime.dispose()` when the owning screen closes.

## Next steps

Read [View and Component](../concepts/view-and-component/) to see how the definition works, or [change State on click](../../examples/set-state/) to connect the next button to an Action.
