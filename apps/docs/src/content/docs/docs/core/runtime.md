---
title: "Runtime"
description: "Create and own headless Views and independent Action calls."
sidebar:
  order: 11
---

Create and own headless Views and independent Action calls.

```ts
import { createRuntime } from '@viewstem/core';
import type { Runtime, RuntimeOptions, ViewTarget, InitialReport } from '@viewstem/core';
```

## createRuntime(options)

Returns a `Runtime`. `options.registry` must be a Registry issued by `createRegistry`; plain objects and copied handles are invalid.

| RuntimeOptions field | Type / default | Meaning |
|---|---|---|
| `registry` | `Registry`, required | Shared source of validated definitions. |
| `stateStore` | `StateStore`, new store if omitted | Inject host State; caller owns an injected store's cleanup. |
| `requestExecutor` | `RequestExecutor`, fetch-backed HTTP executor | Execute a versioned plan with an AbortSignal; return `HttpResponse`. |
| `resourceResolver` | `(kind, id) => Awaitable<AnyResource>`, absent | Resolve missing referenced resources while preparing a View; must return the requested kind and ID. Resolved definitions are registered as a batch. |
| `authorize` | Synchronous callback, absent | Approve Action invocation or View updates/replacement. Only an explicit `true` allows an operation when supplied. |
| `functions` | Readonly `CelFunction[]`, Registry functions | CEL functions used for execution. Keep registration and execution environments compatible. |
| `requestTimeoutMs` | Positive safe integer, 30000ms | Query/HTTP request deadline. A custom executor must honor cancellation. |
| `clock` | `TimerClock`, system scheduling | Query scheduling: `now` number or function, `setTimeout(callback, milliseconds)`, `clearTimeout(token)`. Not an application State clock. |

## createView(target)

`await runtime.createView(target)` returns `{ view, initialComplete }`. Preparation/validation failures reject this call. The separately returned `initialComplete: Promise<InitialReport>` waits for the initial executable Queries to settle, including their individual failures. Gates or inputs that are not ready do not block it. Disposing or superseding the application can reject it with `CANCELLED`.

`InitialReport` contains `generation: number` and `queryErrors: { instanceId, query, error: PublicError }[]`. A successful resolution with nonempty `queryErrors` is not full Query success. It is never a DOM paint signal.

## ViewTarget

| Field | Meaning |
|---|---|
| `viewRef` or `view` | Exactly one: registered View ID, or inline `ViewSpec` (without a resource envelope). |
| `inputs` | Optional readonly record of native values and issued State/Query handles, default `{}`. This host boundary is not JSON expression evaluation. |
| `url.adapter` | Explicit `UrlAdapter`. |
| `url.bindings` | Array of `{ state: string, key?: string, history?: 'push' \| 'replace' }` selecting View-owned State. |
| `url.limits` | Optional byte/item/key limits; see [URL](../url/). |

The first URL connection restores incoming URL state. A subsequent replacement removes old owned keys before connecting new State; it does not reapply leftover old URL values over the new initial state. Do not combine View convenience URL wiring with a separate active connection on the same StateStore.

## invokeAction(request)

`runtime.invokeAction({ owner, actionRef?, action?, inputs? }): Promise<unknown>` accepts a live `View` owned by this runtime and exactly one Action reference or inline spec. `inputs` defaults to `{}`. The promise resolves to the declared output, or `undefined` for a void Action, and rejects with a public error. A missing, foreign or disposed owner rejects with `CANCELLED`.

This is an independent View-owned execution. Use `ActionContext.invokeAction()` from a running code Action when the call should belong to that parent instead.

## Inspect and dispose

- `runtime.registry` and `runtime.stateStore`: readonly references to the public handles.
- `listResources(kind?)`: detached resource declarations, optionally filtered by `ResourceKind`.
- `exportResource(kind, id)`: detached declaration for one resource; does not export live State or implementation functions.
- `dispose(): void`: dispose all Views and cancel owned work. An internally created store is disposed; an injected store remains the caller's responsibility. Repeated disposal is safe.

<a id="authorization"></a>
## Authorization and diagnostics

`authorize` receives either `{ operation: 'update', owner: View, definition: ViewSpec }` or `{ operation: 'invoke', owner: unknown, definition: unknown }`. The update owner is the public View. The invoke owner is an opaque lifetime identity, not an executable View. Code Action implementation functions are not exposed to the callback. A missing callback imposes no host authorization policy; provide one where required. Listing a resource is not an authorization grant.

A `PublicError` has required string `code` and `message`, and optional `resource: { kind, id }`, `instanceId`, `location`, `input` and nested `cause`. Errors may be plain readonly objects, so do not require `instanceof Error`. Common codes include `INVALID_DEFINITION`, `REFERENCE_NOT_FOUND`, `TYPE_MISMATCH`, `EXECUTION_BLOCKED`, `CANCELLED`, `TIMEOUT` and `HTTP_ERROR`. Query errors are also available in snapshots; rendering failures belong to the [Svelte diagnostics API](../../svelte/errors/).

Start with [Run and observe a View](../guides/runtime/); see [View](../view/) for mutation and observation methods.
