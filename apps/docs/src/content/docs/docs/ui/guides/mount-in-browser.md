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
import { createRenderer } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

const renderer = createRenderer();
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
await screen.ready;

export async function unmount() {
  await screen.unmount();
  await renderer.dispose();
}
```

## Connect to your host's lifecycle

In a framework app, call `mount()` after the target is connected and call `screen.unmount()` when the screen closes. Viewstem manages the rendered subtree. This example's cleanup also disposes the renderer and its Runtime. When screens share the renderer, call `renderer.dispose()` when the app is done with it.

To display an existing View, use [a borrowed attachment](../../api/#attach). See the [browser UI API](../../api/) for attachment errors and the [component catalog](../../components/) for supported JSON.
