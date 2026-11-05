---
title: "View and snapshots"
description: "A View is one executing screen with its own State, Query and event lifetimes. Obtain it from `runtime.createView()`; a renderer builds a UI from its snapshots."
sidebar:
  order: 12
---

A View is one executing screen with its own State, Query and event lifetimes. Obtain it from `runtime.createView()`; a renderer builds a UI from its snapshots.

## Observe a View

| Method | Signature and behavior |
|---|---|
| `getSnapshot()` | Returns an immutable `ViewSnapshot` of the current projection. |
| `subscribe(listener)` | Calls `(snapshot: ViewSnapshot) => void` immediately, then on projection changes. Returns `() => void` to stop observing. |
| `getState(name, instanceId?)` | Returns `StateHandle<unknown>`; omit `instanceId` for the root View, supply a component owner's instance ID for local State. |
| `getQuery(name, instanceId?)` | Returns `QueryHandle<unknown>` with the same ownership selection. |
| `exportDefinition()` | Returns a detached `ViewSpec`; no current State values, in-flight work or functions. |

A declaration node's `id`, its runtime `address`, an owner's `instanceId` and its `generation` serve different purposes. Repeated nodes can share a declaration ID. Use the actual snapshot for event routing and use an owner's instance ID for State/Query lookup; do not invent a global ID from a declaration name.

<a id="update"></a>
## update(spec, options?)

`update(spec: ViewSpec, options?: { inputs?: Record<string, unknown>, states?: Record<string, unknown> }): Promise<ApplicationResult>` applies a complete next definition, not a JSON patch. Omitted `inputs` retain existing inputs. `states` atomically sets named root State values while applying the definition. A missing or Derived target is invalid.

Compatible retained nodes keep State and lifetimes. Removing nodes, changing their identity or making `when` false ends the corresponding lifetime. Changing a retained cell between State and Derived is rejected. The existing lifetime's resource snapshot remains in effect; use replacement to inject updated registered definitions.

In the current implementation, a retained Query use also retains `refresh` and `intervalMs` settings omitted from `update`. Omission does not restore their defaults. Set `refresh` explicitly; use `replace` when you need a new Query lifetime with fresh defaults. See [Query settings](../../dsl/queries/).

<a id="replace"></a>
## replace(target)

`replace(target: ViewTarget): Promise<ApplicationResult>` validates the target, injects current registry definitions and starts a new lifetime with fresh initial State. Inputs default to `{}`. Previous event capabilities, owned Query work and child Actions become stale. URL replacement also removes old owned keys. Permission checks apply to replacement of an existing View.

Both methods return `{ initialComplete: Promise<InitialReport> }`. Await the method for application, then await `initialComplete` for initial executable Queries. Read `queryErrors`; completion does not guarantee Query success. A newer application or disposal can cancel an earlier completion promise.

## emit(target, event, payload)

Returns `Promise<unknown>`. Target can be a runtime address/owner ID string, a `NodeSnapshot`, or `{ address: string, generation: number }`. Prefer the snapshot/address with generation so stale UI events are rejected. `event` must name an event in the Component contract and `payload` must match its schema; pass the declared data, not a DOM event object. A valid event without a handler resolves without running an Action. A stale target rejects with `CANCELLED`, missing events with `REFERENCE_NOT_FOUND`, invalid payloads with `TYPE_MISMATCH`.

## dispose()

Stops subscriptions, cancels owned Actions and Query work, removes owned State and URL connections, and invalidates old event capabilities. It is safe to call more than once. Dispose the whole Runtime when all its Views are finished.

## ViewSnapshot

| Field | Type / contents |
|---|---|
| `generation` | Number identifying the applied definition generation. |
| `lifetime?` | Root owner lifetime identifier. |
| `roots` | Readonly `NodeSnapshot[]` for rendering. |
| `states` | Root State name → `ValueSnapshot<unknown>`. |
| `queries` | Root Query name → `QuerySnapshot<unknown>`. |
| `actions` | Explicit event Action ID → `ActionSnapshot`; anonymous calls do not create named entries. |
| `errors` | Readonly `PublicError[]` diagnostics. |

`NodeSnapshot` has required `id`, `status`, `error`, `inputs`, `children`, `slots` and optional `instanceId`, `address`, `generation`, `componentRef`. Status is `ready`, `pending`, `error` or `missing`; `error` is `PublicError | null`. Inputs are deeply readonly. `slots` groups child snapshots by slot name; `children` provides the projected children. An unavailable input can temporarily suspend a node without ending its retained lifetime.

## QueryHandle and QuerySnapshot

`getSnapshot()` returns status `idle | waiting | running | success | error`, optional `data` and `dataInputs`, `error: PublicError | null`, `stale: boolean`, and `waitingReason: 'INPUT_NOT_READY' | 'EXECUTION_BLOCKED' | null`. Data can belong to an earlier successful input set; inspect `dataInputs` and `stale` when showing it.

`refresh(signal?): Promise<void>` explicitly reruns a refresh-enabled Query. `retry(signal?): Promise<void>` is for an eligible failed execution. Calls can reject with `QUERY_REFRESH_DISABLED`, `INVALID_RETRY_STATE` or cancellation errors. The methods return completion, not the data; read the next snapshot. Obtain handles from a View or a Query port rather than constructing one.

`ActionSnapshot<O>` contains `status: 'idle' | 'running' | 'success' | 'error'`, `running: boolean`, `data` (readonly output or `null`, always `null` for a void contract) and `error: PublicError | null`.

See [lifecycle guide](../guides/runtime/), [Runtime completion](../runtime/) and [StateHandle](../state-store/#statehandle).
