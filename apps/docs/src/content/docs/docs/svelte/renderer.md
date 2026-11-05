---
title: createRenderer and Renderer
description: Configure a renderer, register adapters, and connect a View to a DOM element.
sidebar:
  order: 1
---

## createRenderer

Creates a Svelte renderer and returns its `Renderer` handle. Call it before registering adapters or connecting a View.

```ts
import { createRenderer } from '@viewstem/svelte';
import type { Renderer, RendererOptions } from '@viewstem/svelte';
```

**Signature** · `createRenderer(options?: RendererOptions): Renderer`

`createRenderer()` creates and owns a core Runtime with an empty Registry. Each renderer keeps its own Svelte adapters. [Mount a View in a Svelte app](../guides/mount-in-svelte/) shows how to register the first adapter and use the Runtime.

## RendererOptions

Choose Runtime creation or Runtime injection. Both accept `onError`. Providing `runtime` together with any Runtime creation option is a TypeScript error and throws `INVALID_DEFINITION` at runtime.

| Field | Mode | Meaning |
| --- | --- | --- |
| `runtime?: Runtime` | Inject | Borrow an existing Runtime and use its Registry. The host owns this Runtime. |
| `registry?: Registry` | Create | Use an existing core Registry. Defaults to a new Registry configured with `functions`. |
| `stateStore?: StateStore` | Create | Use a host-owned StateStore. Defaults to a store owned by the new Runtime. |
| `requestExecutor?: RequestExecutor` | Create | Execute HTTP request plans from Queries using the supplied callback and its abort signal. Defaults to core's HTTP executor. |
| `resourceResolver?: RuntimeOptions['resourceResolver']` | Create | Supply a missing resource definition during View creation or replacement. Return the requested kind and ID. The callback may return a value or a promise. Its timeout policy is independent of `requestTimeoutMs`. |
| `authorize?: RuntimeOptions['authorize']` | Create | Synchronously authorize Action invocation and changes to an existing View. Return `true` to allow the operation. |
| `functions?: readonly CelFunction[]` | Create | Configure custom CEL functions for execution and for validation in a renderer-created Registry. With an existing Registry, execution uses that Registry’s functions by default. Keep their contracts aligned if you also pass `functions`. |
| `requestTimeoutMs?: number` | Create | Core HTTP request timeout in milliseconds. Accepts a positive safe integer and defaults to `30000`. |
| `clock?: TimerClock` | Create | Supply the clock and timers for Query timeouts and polling. Defaults to core's built-in timers. |
| `onError?: RendererErrorListener` | Both | Observe render and event diagnostics for this renderer's connections. |

The Runtime fields use [core's types](/docs/core/types/). See [diagnostics](../errors/#rendererdiagnostic) for `onError`.

## Renderer

### runtime and registry

| Property | Type | Meaning |
| --- | --- | --- |
| `readonly runtime` | `Runtime` | The core Runtime for View creation and Action execution. |
| `readonly registry` | `Registry` | The same Registry as `renderer.runtime.registry`. Register resources, code Component contracts, and code Actions through this handle. |

### registerComponent

**Signature** · `registerComponent(id: string, component: ComponentAdapter): void`

Bind one Svelte component to an existing code-backed Component ID. Register its public contract first with `registry.registerComponentContract` or `registry.registerComponentContracts`. An unknown ID fails registry lookup with `REFERENCE_NOT_FOUND`. A declarative Component ID, a duplicate adapter, or a non-function implementation causes `INVALID_DEFINITION`.

### registerComponents

**Signature** · `registerComponents(entries: readonly ComponentRegistration[]): void`

Register new code-backed contracts and Svelte implementations together. Each entry contains a `contract` and a `component`. Duplicate IDs, conflicts with existing contracts, and malformed entries produce `INVALID_DEFINITION`. A contract that fails core validation can surface a more specific core error. A failed batch leaves the contracts and adapters unchanged. Use [`registerComponent`](#registercomponent) for a contract already registered in core.

New adapter registrations are captured by new connections and by an existing connection on a new View lifetime after `replace`. `update` keeps the current adapter set. See the [adapter reference](../adapters/#componentregistration) and [registration example](../guides/write-an-adapter/).

### mount

**Signature** · `mount(target: ViewTarget & RenderOptions & { readonly target: Element }): Promise<MountedView>`

Create an owned View and render it into the supplied DOM Element. Provide either a registered `viewRef` or an inline `view`. The remaining core target fields are optional `inputs` for root ports and optional `url` bindings for State. See [core's `ViewTarget`](/docs/core/runtime/#viewtarget) and [`RenderOptions`](#renderoptions).

The promise resolves to a [`MountedView`](../mounted-view/#mountedview) after structure creation and Svelte attachment. Ready nodes can render while initial Queries run. For initial Query completion and its DOM update, await `mounted.initialComplete` separately.

Creation or attachment failure rejects the mount and releases the target. An invalid target or one already claimed by any renderer attachment produces `INVALID_DEFINITION`. If a View becomes ready after renderer disposal, the pending mount rejects with `CANCELLED` and the View is disposed before attachment. See [the lifecycle guide](../guides/manage-view-lifecycle/).

### attach

**Signature** · `attach(view: View, target: Element, options?: RenderOptions): RenderAttachment`

Render an existing core View into a DOM Element and return a [`RenderAttachment`](../mounted-view/#renderattachment) synchronously. The target has the same exclusivity rule as `mount`. This attachment borrows the View. A setup failure throws synchronously. Use the existing core completion promise for Query execution and `attachment.whenRendered()` for the DOM.

Use a View from the renderer's Runtime to share the same Registry. For Views from another Runtime, match the referenced Component kinds, code contracts, and implementations explicitly. See [borrowing a View](../viewstem-view/#borrowing-a-view).

### dispose

**Signature** · `dispose(): Promise<void>`

Stops renderer connections, detaches its managed DOM roots, and disposes Views created by `mount`. An internally created Runtime is also disposed, including Views created directly on it. An injected Runtime and a host-owned StateStore remain available to the host. Borrowed Views from other Runtimes stay alive.

The promise waits for detachments and pending `mount` cleanup. A pending host `resourceResolver` callback can delay completion until it settles. The host owns any resolver cancellation and timeout policy. Repeated calls return the same disposal promise. Disposal can reject if a teardown fails. Subsequent registration and attachment attempts fail with `CANCELLED`.

## RenderOptions

These options apply to `mount` and `attach`. Pass them as fields of the `mount` argument or as the third argument to `attach`.

| Field | Meaning |
| --- | --- |
| `context?: Map<unknown, unknown>` | Svelte context for the root the renderer creates. Adapters can read its values through Svelte context APIs. |
| `onError?: RendererErrorListener` | Observe diagnostics from this connection, in addition to the renderer's observer. |
| `fallback?: RenderFallback` | Supply a Svelte snippet for render failures and placeholder projections. |

For a component already inside an app tree, use [`ViewstemView`](../viewstem-view/) and the app's Svelte context.
