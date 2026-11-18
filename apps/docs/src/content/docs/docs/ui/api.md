---
title: Browser UI API
description: Register the catalog, attach an existing View, and import styles and support metadata.
---

Register the `ui` set from `@viewstem/ui` with `runtime.registry.registerResourceSet(ui)` before creating the View. Import `createRenderer` from `@viewstem/dom` and pass `{ runtime }`. Set `data-viewstem-ui` on the mount target to apply the styles. A conflicting resource ID leaves the Registry as it was.

## Mount a new View

`renderer.mount({ target, source, inputs?, url?, onError? })` returns a screen immediately.

| Wait | Result |
|---|---|
| `await screen.ready` | The prepared View after the display connection is established |
| `await screen.whenRendered()` | DOM update on this display, including the first render or a State update |
| `await screen.whenSettled(application)` | Initial Query report for that application and DOM update on this display. Inspect `queryErrors`. |

Pass `view.initial` for the first application or use the handle returned by `setInputs()`, `updateDefinition()`, `applyResourceSets()`, or `replace()`. See [View operations](../../core/view/).

`await screen.unmount()` cancels pending work and waits for the owned View and DOM to be cleaned up. Closing before a Query reaches the request executor prevents that request. If the request has started, the executor receives an abort signal and its late result is discarded.

<a id="attach"></a>

## Attach an existing View

`renderer.attach(view, target, { onError }?)` returns an attachment with `whenRendered()`, `whenSettled(application)`, and `detach()`. `await attachment.detach()` releases the DOM and subscription. The original owner disposes the borrowed View.

Both paths require a connected, unreserved HTML element. Wait for cleanup before reusing it. `await renderer.dispose()` releases the renderer's screens and attachments. The Runtime's owner calls `runtime.dispose()`.

## Errors and diagnostics

| Situation | Where to handle it |
| --- | --- |
| Target is missing, disconnected, or already reserved | Synchronous exception from `mount()` or `attach()` |
| View preparation fails | `screen.ready` rejects after cleanup and `onError` receives a `prepare` diagnostic |
| A component fails during render | The display’s `whenRendered()` rejects and `onError` receives a `render` diagnostic |
| Later node, Query, UI event Action, URL, or render error | `onError` diagnostics. Initial Query failures also appear in the `whenSettled()` report's `queryErrors` |
| A direct `view.invokeAction()` or View change fails | The call's promise rejects |
| A wait is cancelled by cleanup or a new application | The waiting promise rejects with `CANCELLED` |

`onError` receives `{ phase, error, nodeId?, application? }`. The phases are `prepare`, `node`, `query`, `action`, `url`, and `render`. When a literal Component input fails schema validation, `error.input` identifies the port and `error.resource` identifies the referenced Component when present. The renderer callback runs before the screen or attachment callback. The same function receives a diagnostic occurrence once, even when multiple attachments observe the same View.

## Styles and metadata

| Import path | Content |
|---|---|
| `@viewstem/ui/styles.css` | Scoped Basecoat Vega styles with the Neutral palette |
| `@viewstem/ui/support.json` | Component IDs and their supported input ports, slots, and events |

Import the stylesheet in the browser entry point. Set `.dark` or `data-theme="dark"` on an ancestor of the mount container to use the dark palette. See [Components and JSON support](../components/) for the metadata structure and catalog limits.
