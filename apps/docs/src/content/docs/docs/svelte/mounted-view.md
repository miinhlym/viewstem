---
title: MountedView and RenderAttachment
description: Use View handles to wait for rendering, apply definition changes, and clean up.
sidebar:
  order: 2
---

Import both types from `@viewstem/svelte`. Get a `MountedView` from [`renderer.mount`](../renderer/#mount), or a `RenderAttachment` from [`renderer.attach`](../renderer/#attach).

## RenderAttachment

| Member | Signature | Behavior |
| --- | --- | --- |
| `view` | `readonly view: View` | The attached core View. Use its core API for State, Queries, snapshots, and definition changes. |
| `whenRendered` | `whenRendered(): Promise<void>` | Wait for Svelte to apply the current projection. Rejects on an active render error or when the attachment is disposed. |
| `dispose` | `dispose(): Promise<void>` | Detach the Svelte root and its subscriptions. A View supplied to `attach` remains owned by its creator. |

Await `dispose()` before reusing the target. Repeated calls return the same promise. The target is released when cleanup settles, including when teardown rejects. See the [core View type](/docs/core/view/) for the shared handle.

## MountedView

Extends `RenderAttachment`. `mount` creates and owns its View, so `mounted.dispose()` also disposes the core View and its execution. Disposal of the individual attachment leaves the renderer available for other Views.

### initialComplete

**Type** · `readonly initialComplete: Promise<InitialReport>`

Waits for core's eligible initial Queries and the Svelte DOM update for the mount generation. The report is `{ generation, queryErrors }`. Query errors are entries in `queryErrors` with `instanceId`, `query`, and `error`. Gated Queries and Queries waiting on unavailable inputs do not hold the promise open.

A render error rejects the promise. Disposal or replacement by a later applied generation before completion rejects with `CANCELLED` when the wait is cancelled. The handle's original promise always describes its mount; use the result of a subsequent operation to wait for that operation.

### update

**Signature** · `update(spec: ViewSpec, options?: Parameters<View['update']>[1]): Promise<ApplicationResult>`

Apply a complete `ViewSpec` to the current lifetime. Core validates and authorizes the change and retains compatible State and existing connections. Nodes that keep their address and generation can keep their local Svelte state.

- `options.inputs` supplies the root input map. Omitting it keeps the current inputs.
- `options.states` supplies explicit writes to declared root State cells. The values are validated as part of the update.

The returned `{ initialComplete }` uses the same Query and DOM wait as mount, for the newly applied generation. Invalid core updates reject before application. An adapter failure after application can reject `initialComplete` while the core change remains applied. Updating this View edits its running definition. Change the registered definition separately with `registry.updateResource` when that is the intended target.

### replace

**Signature** · `replace(target: ViewTarget): Promise<ApplicationResult>`

Start a new lifetime inside the same View handle and attachment. Pass an inline `view` or a registered `viewRef`, with optional `inputs` and `url`. Core uses the current Registry and the Svelte connection captures the current adapters. The previous lifetime's internal State and execution are disposed. Obtain new State and Query handles after replacement.

The returned `{ initialComplete }` waits for the new generation. An invalid replacement leaves the existing View in place. The [lifecycle guide](../guides/manage-view-lifecycle/) shows the difference between retaining State with `update` and initializing it with `replace`.

## whenRendered

Choose the wait that matches the work.

| Wait | Completion point |
| --- | --- |
| `await renderer.mount(options)` | The View structure is ready and the renderer has attached its Svelte root. |
| `await mounted.initialComplete` | Eligible initial Queries and the DOM update for the mount generation. |
| `await applied.initialComplete` | Eligible initial Queries and the DOM update for the applied update or replacement generation. |
| `await attachment.whenRendered()` | Svelte has applied its pending DOM work for the current projection. Query completion, browser paint, and asynchronous host component work run independently. |
| Core `initialComplete` from `runtime.createView` or a direct View operation | The core report for that generation, before any separate Svelte wait. |

`whenRendered()` is available on both handle types and [the `ViewstemView` instance](../viewstem-view/#whenrendered). Call it after the core write or operation that drives the DOM change. It reports active renderer failures even when a fallback is visible.
