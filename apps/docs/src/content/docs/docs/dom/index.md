---
title: "@viewstem/dom"
description: Mount a View with your own DOM component and scope the component set's CSS.
---

[Install Core and DOM](../installation/#install-dom) to mount a View with browser components you provide. This example uses a browser bundler and an HTML element with `id="app"`.

## Mount with a custom component

```ts
import { createRuntime, defineResourceSet } from '@viewstem/core';
import { createRenderer, DOM_CONNECTOR_ID, type DomComponent } from '@viewstem/dom';

const label: DomComponent = {
  mount({ parent, anchor, node }) {
    const element = parent.ownerDocument.createElement('span');
    element.textContent = String(node.inputs.text);
    parent.insertBefore(element, anchor);
    return {
      update(next) { element.textContent = String(next.inputs.text); },
      setPending(pending) { element.toggleAttribute('aria-busy', pending); },
      dispose() { element.remove(); },
    };
  },
};

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app.');
const runtime = createRuntime();
runtime.registry.registerResourceSet(defineResourceSet({
  id: 'app-labels',
  version: '1',
  components: [{
    contract: {
      kind: 'Component',
      id: 'Label',
      spec: { ports: { text: { kind: 'Value', schema: { type: 'string' } } } },
    },
    connectorId: DOM_CONNECTOR_ID,
    implementation: label,
  }],
}));

const renderer = createRenderer({ runtime });
const mounted = renderer.mount({
  target,
  source: { render: { id: 'label', componentRef: 'Label', inputs: { text: 'Hello from DOM' } } },
});
await mounted.whenRendered();

export async function shutdown() {
  try {
    await renderer.dispose();
  } finally {
    await runtime.dispose();
  }
}
```

## Renderer and connector reference

| API | Behavior |
| --- | --- |
| `createRenderer({ runtime, connectors })` | Uses the supplied Runtime. Additional connectors are optional. |
| `renderer.mount({ target, source, fallback })` | Creates a View owned by the mount. `fallback` is optional. |
| `renderer.attach(view, target)` | Borrows an existing View. Call `detach()` to release the attachment. |
| `renderer.dispose()` | Releases the renderer's connections. Dispose the app-owned Runtime separately. |
| `DomComponent.mount(context)` | Inserts component-owned DOM before `context.anchor` in `context.parent` and returns a `MountedComponent`. |

A mounted component implements `update(node, signal)`, `setPending(pending)` and `dispose()`. Observe the supplied abort signals for work that may outlive a mount or update. Call `context.provideSlot(name, host, before?)` to register a named child host, and call the returned cleanup when withdrawing that registration. The renderer places and disposes registered Viewstem children.

For asynchronous DOM updates, implement `whenRendered(signal)`. The renderer waits for the connector and the children in the slots it supplies. Follow the [shared runtime and rendering contract](../guides/runtime-and-rendering/) for ownership, readiness and failures. For ready-made components, see [@viewstem/ui](../ui/).

## Scope CSS to your component set

Use the same package-specific ID on both sides. To mark owned elements, import `createStyleScope` from `@viewstem/dom/styles` and use its `createElement`, `createElementNS` or `mark` methods. Keep borrowed slot and host elements in their original scopes.

In the CSS build, import `scopeUiCss` from `@viewstem/dom/styles/postcss` and pass `scopeUiCss(id)` to PostCSS after resolving imports. The plugin scopes the final selector target and prefixes private custom properties, layers and animation names. Use `publicProperties` for variables the host sets by name. In JavaScript, use the style scope's `localProperty(name)` for a private property.

Publish the generated CSS with the component set. Keep document-wide assets such as font definitions in the host stylesheet.
