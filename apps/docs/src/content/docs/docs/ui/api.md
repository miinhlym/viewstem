---
title: Browser UI API
description: Register the catalog, attach an existing View, and import styles and support metadata.
---

`@viewstem/ui` exports `createRenderer`, `registerShadcn`, and the public types `RendererOptions`, `Renderer`, `MountedView`, `RenderAttachment`, `RendererDiagnostic`, and `RendererErrorListener`.

## Create a renderer

`createRenderer()` creates and owns a Runtime with the default catalog. To configure that Runtime, pass options such as `createRenderer({ requestExecutor, onError })`. To borrow a Runtime, call `createRenderer({ runtime, onError })`.

If the injected Runtime needs the catalog, call `registerShadcn(runtime.registry)` once before creating the View. It registers 357 Component contracts as a batch. A duplicate ID leaves the Registry as it was.

## Mount a new View

`renderer.mount({ target, source, inputs?, url?, onError? })` returns a screen immediately. `await screen.ready` returns the View after the first DOM update. Use `await screen.whenRendered()` to inspect the DOM after a State write. To wait for the initial Query report and its DOM update, call `await screen.whenSettled(view.initial)` and inspect `queryErrors`. You can also pass the application handle returned by `setInputs()`, `updateDefinition()`, or `replace()` to `whenSettled()`. `setInputs()` replaces the entire input map. See [View operations](../../core/view/).

`await screen.unmount()` cancels pending work and waits for the owned View and DOM to be cleaned up. Closing before a Query reaches the request executor prevents that request. If the request has started, the executor receives an abort signal and its late result is discarded.

<a id="attach"></a>

## Attach an existing View

`renderer.attach(view, target, { onError }?)` returns an attachment with `whenRendered()`, `whenSettled(application)`, and `detach()`. `await attachment.detach()` releases the DOM and subscription. The original owner disposes the borrowed View.

Both paths require a connected, unreserved HTML element. Wait for cleanup before reusing it. `await renderer.dispose()` releases the renderer's screens, attachments, and internally created Runtime. The host manages an injected Runtime.

## Errors and diagnostics

| Situation | Where to handle it |
| --- | --- |
| Target is missing, disconnected, or already reserved | Synchronous exception from `mount()` or `attach()` |
| View preparation or first render fails | `screen.ready` rejects after automatic cleanup. `onError` receives a `prepare` or `render` diagnostic |
| Initial render of a borrowed View fails during `attach()` | `attach()` throws synchronously |
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
