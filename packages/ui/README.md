# @viewstem/ui

English | [한국어](README.ko.md)

Default browser UI for rendering Viewstem JSON into a DOM container. The package depends on `@viewstem/core`. Its renderer uses Basecoat 1.1.0 Vega styles and selected Vanilla JS controllers without a React, Vue, or Svelte runtime. The host supplies a connected element.

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

`registerShadcn` registers the shared catalog contracts as a batch.

`attach` subscribes to an existing View and applies each received projection synchronously. The attachment owns its DOM subtree, subscriptions, and listeners. The caller owns the View and Runtime. Dispose the attachment before removing its container. A container can hold one active attachment and can be reused after disposal. Pass `{ onError }` as the third argument to observe rendering and event errors after attachment. Pending or failed nodes are omitted from the DOM.

## Shared JSON catalog

The renderer registers 66 families and 357 JSON Component IDs. Use the generated `@viewstem/ui/support.json` export for the implemented port schemas, slots, and event payloads. The build derives this reference from the package’s `catalog/shadcn-contracts.json` and the supported inputs, slots, and events of the DOM adapters.

Dropdown Menu, Context Menu, and Menubar share a Zag Vanilla menu adapter, including nested menus. Hover Card, Navigation Menu, Resizable, and Scroll Area also use Zag Vanilla. Carousel uses Embla 8.6.0. Select scroll buttons extend the existing Select controller. The remaining components use browser DOM controls and CSS.

The DOM adapters support documented JSON input and event subsets. Portal slots are rendered in the owning subtree, so custom portal destinations are outside the catalog. The modal families use the browser dialog top layer. The Chart recipe uses an SVG rendering of the data. Sonner comparisons use the JSON `Notifications` component. Rendering takes place in a connected client-side DOM container.

Slider uses a native range input for `type: "single"` and Zag Vanilla for `type: "multiple"`. In multiple mode, each number in `value` creates a thumb. The thumbs stay in ascending order, and `thumbLabels` can give them distinct accessible names. `valueChange` carries the current values during interaction, and `valueCommit` carries the final values when the drag ends or a keyboard adjustment takes effect. The payload is `{ value: number[] }` in multiple mode and `{ value: number }` in single mode.

A numeric Slider `step` sets a regular interval. A non-empty array defines discrete values for pointer and keyboard input. When `min` or `max` is omitted, its default comes from the lowest or highest stop. An explicit `value: []` in multiple mode removes all thumbs.

`Command.Dialog` emits `openChange` with `{ value: false }` when dismissed with Escape. Use the event to update a bound `open` State. An existing view without this handler can still dismiss the dialog. It reopens when the supplied `open` value changes to `true` again. `Popover.Root` and `Tooltip.Root` emit `openChange` to request a transition when `open` is supplied. They emit `openChangeComplete` after the supplied value is reflected and the transition finishes.

Calendar, Range Calendar, and Date Picker use Zag Vanilla for date navigation and selection. Their JSON contracts use date-only strings and range objects. Calendar and Range Calendar render complete grids through their Root IDs. Date Picker clamps the date shown in its trigger and grid to `min` and `max` while keeping the caller's State value.

Data Table uses TanStack Table Core. The JSON recipe keeps caller-owned sorting, filtering, pagination, and selection state. A page outside the available range is clamped for display, and a page size change starts from the first displayed row. Row IDs may be strings or numbers and must be unique after conversion to strings. `selectedIds` and `selectedIdsChange` use the string form. Selected IDs outside the current data remain in the selection state.

Basecoat styles are scoped to the renderer subtree. Set `.dark` or `data-theme="dark"` on an ancestor to switch themes. Basecoat controllers are registered locally and attached to individual DOM nodes. Their teardown is part of attachment disposal. The build includes the Basecoat license in `dist/BASECOAT-LICENSE.md`.

## Verify locally

From the workspace root, install the locked dependencies and Chromium, then run `npm run check:ui`. The test installs the core and UI tarballs in an isolated consumer and runs the same [View JSON](test/view.json) in plain JS, React, Vue, and Svelte. The vanilla dependency and bundle checks enforce the framework boundary. The browser suite also mounts the [66 original catalog ViewSpecs](test/fixtures/samples.mjs) and verifies State and Action behavior for the date and table recipes.
