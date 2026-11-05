---
title: Svelte renderer
description: Render Viewstem Views in a Svelte app with explicitly registered adapters.
sidebar:
  order: 1
---

`@viewstem/svelte` renders Viewstem Views on the client with Svelte `^5.57.3`. Core validates definitions, evaluates inputs, and runs State, Queries, and Actions. The Svelte renderer subscribes to the resulting View and passes the evaluated nodes to components you register as adapters.

You provide the components, markup, and styling. Register your own adapters or use the [optional Svelte UI package](/docs/svelte-ui/). The renderer uses core as a dependency and re-exports shared core types for Svelte consumers. See [Installation](/docs/installation/) for the current package setup.

## Choose an integration

| If you want to | Use | View owner |
| --- | --- | --- |
| Include a View inside your Svelte component tree | [`<ViewstemView>`](./viewstem-view/) | The host that created the View |
| Render into a DOM element and let the renderer create the View | [`renderer.mount`](./renderer/#mount) | The renderer attachment |
| Render an existing View into a DOM element | [`renderer.attach`](./renderer/#attach) | The host that created the View |

## Guides

- [Mount a View in a Svelte app](./guides/mount-in-svelte/)
- [Write an adapter with a slot and an event](./guides/write-an-adapter/)
- [Update, replace, and dispose a View](./guides/manage-view-lifecycle/)

## API reference

| Topic | Public API |
| --- | --- |
| [Renderer setup and registration](./renderer/) | `createRenderer`, `Renderer`, `RendererOptions`, `RenderOptions` |
| [View handles and timing](./mounted-view/) | `MountedView`, `RenderAttachment` |
| [Adapter contract](./adapters/) | `ComponentAdapter`, `ComponentAdapterProps`, `ComponentRegistration` |
| [Svelte host component](./viewstem-view/) | `ViewstemView`, `ViewstemViewProps` |
| [Errors and fallback](./errors/) | `transformError`, `RendererDiagnostic`, `RendererErrorListener`, `RenderFallback` |
| [Type index](./types/) | Renderer-owned types and links to the shared core contracts |
