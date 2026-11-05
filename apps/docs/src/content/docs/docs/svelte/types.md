---
title: Svelte renderer types
description: Find every renderer-owned public type and the shared core contracts re-exported by the Svelte package.
sidebar:
  order: 6
---

Use `import type` from `@viewstem/svelte` for renderer-owned contracts and the shared core types exposed by the package.

## Renderer-owned types

| Type | Reference |
| --- | --- |
| `Renderer` | [Runtime and registration handle](../renderer/#renderer) |
| `RendererOptions` | [Creation and injection options](../renderer/#rendereroptions) |
| `RenderOptions` | [Options for DOM connections](../renderer/#renderoptions) |
| `MountedView` | [Owned View and application methods](../mounted-view/#mountedview) |
| `RenderAttachment` | [DOM connection handle](../mounted-view/#renderattachment) |
| `ComponentAdapter` | [Svelte component type](../adapters/#componentadapter) |
| `ComponentAdapterProps` | [Adapter inputs, node, events, and slots](../adapters/#componentadapterprops) |
| `ComponentRegistration` | [Contract and implementation pair](../adapters/#componentregistration) |
| `ViewstemViewProps` | [Props for direct Svelte hosting](../viewstem-view/#viewstemviewprops) |
| `RendererDiagnostic` | [Render or event diagnostic](../errors/#rendererdiagnostic) |
| `RendererErrorListener` | [Diagnostic callback](../errors/#renderererrorlistener) |
| `RenderFallback` | [Fallback snippet signature](../errors/#renderfallback) |

## Shared core types

The Svelte package re-exports core types used in resource definitions and host integration, including `ViewSpec`, `ComponentContract`, `ViewTarget`, `NodeSnapshot`, `View`, `Registry`, `Runtime`, `StateHandle`, `QueryHandle`, and `PublicError`. Their contracts are defined in the [core type reference](/docs/core/types/). The [Svelte package entry point](https://github.com/miinhlym/viewstem/blob/main/packages/svelte/src/lib/index.ts) lists the exact re-exports.
