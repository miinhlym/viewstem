---
title: ViewstemView
description: Create or borrow a View in an existing Svelte component tree.
sidebar:
  order: 4
---

## ViewstemView

Import `ViewstemView` from `@viewstem/svelte`. Pass a `source` to create a View with its own Runtime, or supply a `renderer` to use a shared Runtime. To borrow a View, pass both `renderer` and `view`. These forms inherit the parent Svelte context. See the [mounting guide](../guides/mount-in-svelte/) for a runnable example.

```svelte
<ViewstemView {source} resourceSets={[ui]} />
<ViewstemView {renderer} source={{ ref: 'settings' }} inputs={{ accountId }} />
<ViewstemView {renderer} view={sharedView} />
```

## ViewstemViewProps

`ViewstemViewProps` names the borrowed-View props. `ViewstemSourceProps` describes creation with a supplied renderer. `ViewstemViewComponentProps` and `ComponentProps<typeof ViewstemView>` cover all forms, including standalone screens.

Supply exactly one of `view` and `source`. A borrowed `view` requires a `renderer`. `resourceSets` is available for `source` without a supplied renderer. Invalid combinations produce `INVALID_DEFINITION`. `onError` observes diagnostics and `fallback` displays an individual failed node.

## Create from a source

Creation starts after the component mounts in the browser. The server and initial hydration render an empty region. Pass an inline `ViewSpec` or `{ ref }` as the `source`. Inline definitions created with Svelte `$state` are supported.

The component captures `renderer`, `source`, `inputs`, and `resourceSets` at initialization. A standalone screen creates its Runtime and renderer after browser mount and registers its initial sets in order before preparing the View. Use `{#key}` to start a new screen with changed configuration or ownership.

The optional `pending` snippet shows preparation, and `prepareError(error)` shows failure. A preparation failure also sends a `prepare` diagnostic to `onError`. Removing the component or disposing the renderer cancels preparation and disposes the owned View. The host manages the shared renderer and any injected Runtime.

Closing before a Query reaches the request executor prevents it from starting. A request that has already started receives an abort signal. Normal cancellation ends the pending wait without calling `prepareError` or `onError`.

## whenRendered

Call `whenRendered()` on the instance obtained through `bind:this` to wait for the DOM update. During `source` preparation, it waits for creation and the first DOM update. Preparation failure rejects with its public error. Cleanup rejects with `CANCELLED`. A later projection can recover from an individual node render error.

For initial Query reports or direct View control, create and pass a View from the host. Call `whenSettled(view.initial)` on the instance to wait for the Query report and its DOM update. A pending wait on the old connection rejects with `CANCELLED` when the connection changes or closes. After changing `view`, pass the new View’s application token. A token from a different View produces `INVALID_DEFINITION`. A closed connection also rejects attempts to read a previously successful report.

## Borrowing a View

Changing a borrowed `view` or its `renderer` replaces the connection. Removing the component releases the connection and subscription. The host disposes the View and injected Runtime.

When the View and renderer use the same Runtime, their registrations come from the same Registry. To share a Runtime the host already owns, create the renderer with `createRenderer({ runtime })`.

For a View from a different Runtime, register the components in the Runtime that creates the View. The renderer uses the implementations already bound to that View and supplies the connectors. For example, if the View uses a component bound with `svelteComponent()`, the renderer's built-in Svelte connector can display it. Supply any custom connectors when creating the renderer.

The same borrowing rules apply to [`renderer.attach`](../renderer/#attach). Use `ViewstemView` for a child of your Svelte app and `attach` for a renderer-managed root on a DOM Element.

See [errors and fallbacks](../errors/) for the Svelte root error policy.
