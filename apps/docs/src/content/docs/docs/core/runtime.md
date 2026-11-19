---
title: "Runtime"
description: "Create and own headless Views and independent Action calls."
sidebar:
  order: 11
---

Create and own headless Views and independent Action calls.

```ts
import { createRuntime } from '@viewstem/core';
import type { Runtime, RuntimeOptions, ViewSource, ViewOptions, InitialReport } from '@viewstem/core';
```

## createRuntime(options)

Returns a `Runtime`. `options.registry`, when provided, must be a Registry issued by `createRegistry`. Alternatively supply registry creation options such as `resources` and `componentContracts`.

| RuntimeOptions field | Type / default | Meaning |
|---|---|---|
| `registry` | `Registry`, optional | Shared source of validated definitions. |
| `stateStore` | `StateStore`, new store if omitted | Inject host State; caller owns an injected store's cleanup. |
| `requestExecutor` | `RequestExecutor`, fetch-backed HTTP executor | Execute a versioned plan with an AbortSignal; return `HttpResponse`. |
| `resourceResolver` | `(kind, id, { signal }) => Awaitable<AnyResource \| undefined>`, absent | Finds missing declarations for `createView()` and `replace()`. Return `undefined` when absent, or a declaration with the requested kind and ID. |
| `authorize` | Synchronous callback, absent | Approve Action invocation or View updates/replacement. Only an explicit `true` allows an operation when supplied. |
| `functions` | Readonly `CelFunction[]`, Registry functions | CEL functions used for execution. Keep registration and execution environments compatible. |
| `hostCapabilities` | Readonly name-to-value map, empty | Supplies required capabilities to registered code Actions at invocation. |
| `requestTimeoutMs` | Positive safe integer, 30000ms | Query/HTTP request deadline. A custom executor must honor cancellation. |
| `urlCleanupTimeoutMs` | Positive safe integer, 30000ms | Deadline for removing previous URL keys during View replacement. |
| `clock` | `TimerClock`, system scheduling | Schedules Queries. Supply an advancing `now` value or function on the same time base as `setTimeout` and `clearTimeout`. |

Resolved declarations are validated and published together. `updateDefinition()`, `applyResourceSets()`, and independent Action calls resolve against the Registry selected for the operation.

## createView(source, options?)

`await runtime.createView(source, options)` returns a View after preparation and validation. Await `view.whenSettled(view.initial)` for the initial Query report; supersession or disposal may reject it with `CANCELLED`.

`InitialReport` contains `generation: number` and `queryErrors: { instanceId, query, error: PublicError }[]`. A successful resolution with nonempty `queryErrors` is not full Query success. It is never a DOM paint signal.

## ViewSource and ViewOptions

| Field | Meaning |
|---|---|
| `source` | An inline `ViewSpec` or `{ ref: id }` for a registered View. |
| `inputs` | Optional readonly record of native values and issued State/Query handles, default `{}`. This host boundary is not JSON expression evaluation. |
| `signal` | Optional AbortSignal for preparation until the synchronous commit. Use `view.dispose()` to stop a committed View. |
| `url.adapter` | Explicit `UrlAdapter`. |
| `url.bindings` | Array of `{ state: string, key?: string, history?: 'push' \| 'replace' }` selecting View-owned State. |
| `url.limits` | Optional byte/item/key limits; see [URL](../url/). |

The first URL connection restores incoming URL state. A subsequent replacement removes old owned keys before connecting new State; it does not reapply leftover old URL values over the new initial state. Do not combine View convenience URL wiring with a separate active connection on the same StateStore.

## invokeAction(request)

`runtime.invokeAction({ actionRef?, action?, inputs?, signal? }): Promise<unknown>` starts an independent Action without creating a View. It uses the Registry configuration at the start of the call. The request takes exactly one Action reference or inline spec. `inputs` defaults to `{}`. The promise resolves to the declared output, or `undefined` for a void Action, and rejects with a public error.

`view.invokeAction(request)` has the same request shape and executes in the View's lifetime and resource configuration. Use `ActionContext.invokeAction()` from a running code Action for a call owned by that parent.

Pass an `AbortSignal` in the request to cancel that invocation and its child calls. For example, a server can pass the incoming request's signal.

```ts
await runtime.invokeAction({ actionRef: 'saveDraft', inputs, signal: request.signal });
```

An already aborted signal rejects with `CANCELLED` before authorization. Aborting a running call rejects it with `CANCELLED` while other independent invocations continue. The runtime discards late results and preserves effects that already occurred.

## Inspect and dispose

- `runtime.registry` and `runtime.stateStore`: readonly references to the public handles.
- `runtime.registry.list(filter?)`: detached resource declarations, optionally filtered by `ResourceKind`.
- `runtime.registry.exportResource(kind, id)`: detached declaration for one resource; does not export live State or implementation functions.
- `dispose(): Promise<void>` stops execution in owned Views and waits for cleanup or reports its failure. The caller owns an injected store. Repeated calls return the same promise.

<a id="authorization"></a>
## Authorization and diagnostics

`authorize` receives `{ operation: 'update', owner, definition }` for View changes and `{ operation: 'invoke', owner, definition, resource }` for Action calls. The update owner is the public View. The invoke owner identifies the lifetime and `definition` contains the Action spec. The readonly `resource` contains `{ kind: 'Action', id }` from the Registry snapshot used by the invocation, or `null` for an inline Action. Each child call carries its own target.

For example, this policy allows only calls to the registered `saveDraft` Action.

```ts
const runtime = createRuntime({
  authorize: context => context.operation === 'invoke' && context.resource?.id === 'saveDraft',
});
```

A `PublicError` has required string `code` and `message`, and optional `resource: { kind, id }`, `instanceId`, `location`, `input` and nested `cause`. Errors may be plain readonly objects, so do not require `instanceof Error`. Common codes include `INVALID_DEFINITION`, `REFERENCE_NOT_FOUND`, `TYPE_MISMATCH`, `EXECUTION_BLOCKED`, `CANCELLED`, `TIMEOUT` and `HTTP_ERROR`. Query errors are also available in snapshots; rendering failures belong to the [Svelte diagnostics API](../../svelte/errors/).

Start with [Run and observe a View](../guides/runtime/); see [View](../view/) for mutation and observation methods.
