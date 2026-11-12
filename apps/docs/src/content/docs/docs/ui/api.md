---
title: Browser UI API
description: Register the catalog, attach an existing View, and import styles and support metadata.
---

The root package exports `registerShadcn`, `attach`, and the TypeScript types `Attachment` and `AttachOptions`.

## Register the catalog

```ts
registerShadcn(registry: Registry): void
```

Pass a [Core Registry](../../core/registry/) before creating a View that uses the catalog. Registration adds all 357 Component contracts as one batch. A duplicate Component ID fails registration and leaves the Registry as it was. Call this once per Registry. Use separate Registries to run the browser and Svelte catalogs together because they share Component IDs.

## Attach a View

```ts
interface AttachOptions {
  onError?: (error: unknown) => void;
}

interface Attachment {
  dispose(): void;
}

attach(view: View, target: HTMLElement, options?: AttachOptions): Attachment
```

Pass an existing [Core View](../../core/view/) and a connected element. Only one active attachment is allowed per element. The attachment subscribes to the View and applies each projection synchronously. Nodes that are pending or failed are omitted until they are ready.

`attach()` throws if the element is disconnected, already attached, or initial attachment fails. Pass `onError` to observe later rendering and event errors. Await the `initialComplete` promise returned by `runtime.createView()` to observe initial execution and its Query diagnostics.

`attachment.dispose()` unsubscribes the attachment and removes the DOM subtree and listeners it owns. Call it before removing the container. The element can be attached again. The host manages the lifetime of the View and Runtime separately.

## Styles and metadata

| Import path | Content |
|---|---|
| `@viewstem/ui/styles.css` | Scoped Basecoat Vega styles with the Neutral palette |
| `@viewstem/ui/support.json` | Component IDs and their supported input ports, slots, and events |

Import the stylesheet in the browser entry point. Set `.dark` or `data-theme="dark"` on an ancestor of the mount container to use the dark palette. See [Components and JSON support](../components/) for the metadata structure and catalog limits.
