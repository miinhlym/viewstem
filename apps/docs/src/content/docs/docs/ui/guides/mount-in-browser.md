---
title: Mount a View in the browser
description: Install the local Core and UI packages and mount the same View JSON in a browser host.
---

## Build and install

From the root of a Viewstem checkout, install the workspace dependencies and build both packages.

```sh
npm ci
npm run build:ui
mkdir -p ../viewstem-packages
npm pack -w @viewstem/core -w @viewstem/ui --pack-destination ../viewstem-packages
```

Install both tarballs in your app. This example assumes your app is next to the `viewstem-packages` directory.

```sh
npm install ../viewstem-packages/viewstem-core-0.1.0.tgz ../viewstem-packages/viewstem-ui-0.1.0.tgz
```

## Render a button

Use a browser build that resolves package imports and handles CSS imports. Add the container and the client entry to your app's HTML.

```html
<div id="app"></div>
<script type="module" src="/main.js"></script>
```

Put this code in `main.js`. A button labeled **Save** appears in the container.

```js
import { createRegistry, createRuntime } from '@viewstem/core';
import { attach, registerShadcn } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const target = document.querySelector('#app');
if (!(target instanceof HTMLElement)) throw new Error('Missing Viewstem container');

const registry = createRegistry();
registerShadcn(registry);
const runtime = createRuntime({ registry });

const { view, initialComplete } = await runtime.createView({
  view: {
    render: {
      id: 'save',
      componentRef: 'shadcn.Button',
      inputs: { text: 'Save', variant: 'outline' },
    },
  },
});

const attachment = attach(view, target, { onError: console.error });
await initialComplete;

export function unmount() {
  attachment.dispose();
  runtime.dispose();
}
```

## Connect to your host's lifecycle

In a framework app, attach the View in the client mount lifecycle after the framework has inserted the container. Give Viewstem ownership of the rendered subtree and call the returned attachment's `dispose()` during cleanup. The example's `unmount()` also disposes the runtime it created. With a shared runtime, dispose the View when its owner is finished and leave runtime disposal to the runtime owner.

See the [browser UI API](../../api/) for attachment errors and the [component catalog](../../components/) for supported JSON.
