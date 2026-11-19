# @viewstem/dom

Register component contracts and implementations through `defineResourceSet` in `@viewstem/core`. For vanilla DOM, use `DOM_CONNECTOR_ID` and supply a `DomComponent`. Pass the Runtime to `createRenderer({ runtime })`. Additional connectors can be supplied through `connectors`.

`renderer.mount({ target, source })` owns its View. `await mounted.ready` returns the View when it is prepared and connected. `await mounted.whenRendered()` observes DOM completion on that connection. Use `renderer.attach(view, target)` to display an existing View and `detach()` to release the display.

A `fallback({ parent, anchor, node, error })` can insert static DOM before `anchor` in `parent`. The renderer clears that range before rendering the fallback again or replacing it with the ready component. Return a handle with `dispose()` to clean up resources such as timers. Optional `update(context)` and `whenRendered()` let a mounted fallback update in place and signal its completion.

A connector places its DOM before `context.anchor` in `context.parent`, then returns a `MountedComponent`. Register each named content host with `provideSlot`. Its cleanup callback withdraws that registration. The browser renderer places Viewstem children in registered hosts and handles movement and disposal. An implementation should stop its work when the supplied instance or update signal is aborted.

A synchronous DOM component returns `update()`, `setPending()`, and `dispose()`.

```ts
import type { DomComponent } from '@viewstem/dom';

export const label: DomComponent = {
  mount({ parent, anchor, node }) {
    const element = parent.ownerDocument.createElement('span');
    element.textContent = String(node.inputs.label);
    parent.insertBefore(element, anchor);
    return {
      update(next) { element.textContent = String(next.inputs.label); },
      setPending(pending) { element.toggleAttribute('aria-busy', pending); },
      dispose() { element.remove(); },
    };
  },
};
```

If the connector applies its DOM asynchronously, provide `whenRendered(signal)` to report when its own DOM and slots are ready. The renderer waits for that result, then renders children into the slots provided so far and runs `afterChildren` if supplied. The display's `whenRendered()` covers both the connector and those children.

## Styles for a component set

Use the same package-specific style ID for the CSS build and for the DOM your components create. The ID starts with a lowercase letter and uses lowercase letters, digits, and hyphens.

```js
import { createStyleScope } from '@viewstem/dom/styles';

const forms = createStyleScope('acme-forms');
const input = forms.createElement(document, 'input');
```

Use `createElementNS(document, namespace, tag)` for owned SVG and `mark(element)` for an element created by a library on your behalf. Keep the host and borrowed slot elements in their original scopes.

```js
import postcss from 'postcss';
import { scopeUiCss } from '@viewstem/dom/styles/postcss';

const result = await postcss([scopeUiCss('acme-forms')]).process(css, { from: 'styles.css' });
```

Resolve CSS imports before this step and publish the resulting stylesheet. The plugin scopes the final target of each selector and prefixes internal custom properties, layers, and animation names. Use `publicProperties` for custom properties the app can set by name.

To bundle styles with the set, make the package’s `browser` export import the generated CSS and re-export the set from its JavaScript entry. Put the `browser` condition before the normal JavaScript entry in `exports`, and include the browser entry and the CSS in `sideEffects`. Consumers register the set as usual. Export the stylesheet separately for hosts that load CSS explicitly.
