---
title: ViewstemView
description: Render a borrowed core View in an existing Svelte component tree.
sidebar:
  order: 4
---

## ViewstemView

Use `ViewstemView` where a View belongs in your Svelte component tree. Import it from `@viewstem/svelte` and pass a renderer and a core View. The [mounting guide](../guides/mount-in-svelte/) shows the parent component and the Svelte root configuration.

**Type** · `Component<ViewstemViewProps, { whenRendered(): Promise<void> }>`

The component inherits Svelte context from its parent. Changing the `renderer` or `view` prop replaces the Svelte connection. Unmounting releases that connection and its subscription. The host owns disposal of the View and its Runtime.

## ViewstemViewProps

| Prop | Type | Meaning |
| --- | --- | --- |
| `readonly renderer` | `Renderer` | Supplies the Registry, adapters, and renderer-level diagnostics. |
| `readonly view` | `View` | An existing core View to render. |
| `readonly onError?` | `RendererErrorListener` | Observe diagnostics from this connection. |
| `readonly fallback?` | `RenderFallback` | Render a placeholder or failed node with a Svelte snippet. |

Use [`transformError`](../errors/#transformerror) as the Svelte root's error transformation policy for safe handling of arbitrary adapter exceptions. The policy applies to the entire Svelte root.

## whenRendered

The instance available through Svelte's `bind:this` has `whenRendered(): Promise<void>`. For a typed binding, declare `let rendered = $state.raw<ReturnType<typeof ViewstemView>>()` in the host script and use `bind:this={rendered}` on the component. Call the method once the instance exists. It waits for Svelte's current DOM update and rejects for an active render failure or a disposed connection. To wait for eligible Queries as well, await the core operation's `initialComplete` and then call the instance method.

## Borrowing a View

When the View and renderer use the same Runtime, their registrations come from the same Registry. To share a Runtime the host already owns, create the renderer with `createRenderer({ runtime })`.

For a View from a different Runtime, match the code-backed or declarative kind of each referenced Component ID in both Registries. Register the same public contract and its Svelte implementation for each code-backed Component. The renderer uses its own Registry and adapter registrations and does not compare the two Registries for compatibility.

The same borrowing rules apply to [`renderer.attach`](../renderer/#attach). Use `ViewstemView` for a child of your Svelte app and `attach` for a renderer-managed root on a DOM Element.
