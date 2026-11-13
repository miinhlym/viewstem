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
| `components?: readonly ComponentRegistration[]` | Create | Register code Component contracts and Svelte implementations together. An injected Registry excludes this option. |
| `registry?: Registry` | Create | Use an existing core Registry. Defaults to a new Registry configured with `functions`. |
| `stateStore?: StateStore` | Create | Use a host-owned StateStore. Defaults to a store owned by the new Runtime. |
| `requestExecutor?: RequestExecutor` | Create | Execute HTTP request plans from Queries using the supplied callback and its abort signal. Defaults to core's HTTP executor. |
| `resourceResolver?: RuntimeOptions['resourceResolver']` | Create | Supply a missing resource definition during View creation or replacement. Return the requested kind and ID. The callback may return a value or a promise. Its timeout policy is independent of `requestTimeoutMs`. |
| `authorize?: RuntimeOptions['authorize']` | Create | Synchronously authorize Action invocation and changes to an existing View. Return `true` to allow the operation. |
| `functions?: readonly CelFunction[]` | Create | Configure custom CEL functions for execution and for validation in a renderer-created Registry. An injected Registry supplies its own functions. |
| `requestTimeoutMs?: number` | Create | Core HTTP request timeout in milliseconds. Accepts a positive safe integer and defaults to `30000`. |
| `clock?: TimerClock` | Create | Supply the clock and timers for Query timeouts and polling. Defaults to core's built-in timers. |
| `onError?: RendererErrorListener` | Both | Observe diagnostics from this renderer's connections. |

The Runtime fields use [core's types](/docs/core/types/). See [diagnostics](../errors/#rendererdiagnostic) for `onError`.

## Renderer

### runtime and component binding

`renderer.runtime.registry` exposes the Runtime registry. Supply `components: [{ contract, component }]` when creating the renderer, or call `renderer.bindComponent(id, component)` for an existing code Component contract.

<a id="mount"></a>
<a id="attach"></a>

### mount and attach

`renderer.mount({ target, source, inputs?, url?, onError? })` returns a screen synchronously. Await `screen.ready` for its View. `renderer.attach(view, target, options?)` borrows an existing View. See [screen and attachment lifetimes](../mounted-view/).

### dispose

`await renderer.dispose()` releases connections created through the renderer’s `mount()` and `attach()`, along with its internally created Runtime. The host manages an injected Runtime. It also stops work and releases Views owned by `ViewstemView` through `source`. Remove a borrowed `ViewstemView` connection from the Svelte tree to release it. Disposal is idempotent.

## RenderOptions

These options apply to `mount` and `attach`. Pass them as fields of the `mount` argument or as the third argument to `attach`.

| Field | Meaning |
| --- | --- |
| `context?: Map<unknown, unknown>` | Svelte context for the root the renderer creates. Adapters can read its values through Svelte context APIs. |
| `onError?: RendererErrorListener` | Observe diagnostics from this connection, in addition to the renderer's observer. |
| `fallback?: RenderFallback` | Supply a Svelte snippet for render failures and placeholder projections. |

For a component already inside an app tree, use [`ViewstemView`](../viewstem-view/) and the app's Svelte context.
