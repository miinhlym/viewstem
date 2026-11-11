# @viewstem/ui

Browser prototype for rendering Viewstem JSON into a DOM container. The package depends on `@viewstem/core`. Its renderer uses Basecoat 1.1.0 Vega styles and selected Vanilla JS controllers without a React, Vue, or Svelte runtime. The host supplies a connected element.

```js
import { createRegistry, createRuntime } from '@viewstem/core';
import { attach, registerShadcn } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

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
const attachment = attach(view, document.querySelector('#app'));
await initialComplete;

// On host unmount
attachment.dispose();
runtime.dispose();
```

`registerShadcn` registers the shared catalog contracts as a batch. Use a separate Registry when running the Svelte catalog alongside this prototype because the catalogs share Component IDs.

`attach` subscribes to an existing View and applies each received projection synchronously. The attachment owns its DOM subtree, subscriptions, and listeners. The caller owns the View and Runtime. Dispose the attachment before removing its container. A container can hold one active attachment and can be reused after disposal. Pass `{ onError }` as the third argument to observe rendering and event errors after attachment. Pending or failed nodes are omitted from the DOM.

## Shared JSON catalog

The renderer covers 66 families and all 357 JSON Component IDs from the Svelte UI catalog. Use the generated `@viewstem/ui/support.json` export for the implemented port schemas, slots, and event payloads. The build derives this reference from the existing Svelte UI support metadata and the DOM adapters' supported inputs. The 35 native-context parts, including `Chart.Tooltip` and Calendar and Range Calendar grid parts, require the Svelte implementation.

Dropdown Menu, Context Menu, and Menubar share a Zag Vanilla menu adapter, including nested menus. Hover Card, Navigation Menu, Resizable, and Scroll Area also use Zag Vanilla. Carousel uses Embla 8.6.0, the same engine version used by the Svelte UI. Select scroll buttons extend the existing Select controller. The remaining components use browser DOM controls and CSS.

The DOM adapters support documented JSON input and event subsets. Portal slots are rendered in the owning subtree, so custom portal destinations are outside the catalog. The modal families use the browser dialog top layer. The Slider exposes one native range thumb. The Chart recipe uses an SVG rendering of the data. Sonner comparisons use the JSON `Notifications` component. The native Svelte helper APIs, full Svelte component parity, SSR, and hydration are outside this prototype.

Calendar, Range Calendar, and Date Picker use Zag Vanilla for date navigation and selection. They retain the date-only JSON strings, range objects, and event names from the Svelte UI. Calendar and Range Calendar render complete grids through their Root IDs. Their Svelte-only scoped grid parts and date predicate functions stay outside the JSON contract.

Data Table uses the same TanStack Table Core version as the Svelte UI. The JSON recipe keeps caller-owned sorting, filtering, pagination, and selection state. A page outside the available range is clamped for display, and selected IDs outside the current data remain in the selection state.

Basecoat styles are scoped to the renderer subtree. Set `.dark` or `data-theme="dark"` on an ancestor to switch themes. Basecoat controllers are registered locally and attached to individual DOM nodes. Their teardown is part of attachment disposal. The build includes the Basecoat license in `dist/BASECOAT-LICENSE.md`.

## Verify locally

From the workspace root, install the locked dependencies and Chromium, then run `npm run check:ui`. The test installs the core and UI tarballs in an isolated consumer and runs the same [View JSON](test/view.json) in plain JS, React, Vue, and Svelte. The vanilla dependency and bundle checks enforce the framework boundary. [Comparison fixtures](test/comparison-fixtures.mjs) include the original Svelte JSON for the 23 examples added or extended by the catalog expansion and the four date and table examples.
