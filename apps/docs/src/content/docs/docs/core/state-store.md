---
title: "StateStore"
description: "Own typed State outside a View and coordinate changes atomically."
sidebar:
  order: 13
---

Own typed State outside a View and coordinate changes atomically.

```ts
import { createStateStore } from '@viewstem/core';
import type { StateStore, StateScope, StateHandle, ValueSnapshot, StoreObservation, Clock } from '@viewstem/core';
```

## createStateStore()

Returns a `StateStore` with no scopes. A host-created store can be injected into `createRuntime({ registry, stateStore })`; the host owns its disposal.

## Store methods

| Method | Arguments / result | Contract |
|---|---|---|
| `createScope()` | Returns `StateScope` | Creates an independent namespace and lifetime. |
| `transaction(run)` | Synchronous callback; returns its result | Atomic values, structure and scope lifetimes. A thrown exception rolls back. Returning a Promise/thenable is invalid. |
| `writeBatch(changes)` | Readonly `[StateHandle, unknown][]`; returns void | Validates every target and value before committing. Duplicate targets reject the batch. |
| `subscribe(selector, listener)` | `null`, one `StateAddress`, or address array; returns unsubscribe | Immediately delivers the current observation, then matching changes. `null` observes all State. |
| `registerReaction(owner, reaction)` | Issued `StateScope`; `{ watch: StateHandle[], target: StateHandle, value: unknown }`; returns unregister | Sets a fixed value when watched values change. Watch list must be nonempty; duplicate target reactions and cycles are rejected. |
| `connectUrl(options)` | Returns `UrlConnection` | One active connection per store; see [URL](../url/). |
| `getDiagnostics()` | `readonly PublicError[]` | Collected observer/cleanup/connection diagnostics; this is not an exception thrown by the caller's current operation. |
| `dispose()` | Returns void | Ends URL wiring, all scopes, clock subscriptions and observers. |

Reactions are part of the same change settlement. If the caller explicitly writes a reaction's target in that batch, the explicit write wins for that settlement. Listener-triggered writes are queued rather than changing the observation currently being delivered. Listener exceptions are recorded as diagnostics.

## StateScope

`scopeId` identifies the namespace. All names below are relative to that scope.

| Method | Contract |
|---|---|
| `registerState<T>(name, { schema, initial? })` | Creates a `StateHandle<T>`. Duplicate names reject. A host declaration accepts only inline `schema` and optional native `initial`; no `typeRef`, Derived or expression evaluation. |
| `replaceState<T>(name, declaration)` | Replaces an existing cell; requires the name to exist. Gives a new generation and invalidates the old handle. |
| `getState(name)` | Returns the existing `StateHandle<unknown>` or throws `REFERENCE_NOT_FOUND`. |
| `removeState(name)` | Removes the cell and affected reactions. |
| `connectClock(target, clock)` | Writes `clock.now()` immediately, subscribes to future epoch-millisecond values, returns unsubscribe. Values must be safe integers accepted by the target schema. |
| `dispose()` | Ends this scope, its cells, owned reactions and clock subscriptions; repeated calls are safe. |

`Clock` supplies `now(): number` and `subscribe(listener: (epochMilliseconds: number) => void): () => void`. It is an explicit application time input. Query timers instead use [TimerClock](../runtime/).

## StateHandle

| Member | Contract |
|---|---|
| `address` | Readonly `{ scopeId: string, name: string }` (`StateAddress`). |
| `generation` | Number identifying this cell incarnation. |
| `read()` | Readonly current value; `undefined` for missing, throws for pending/error. |
| `getSnapshot()` | Discriminated `ValueSnapshot<T>`; inspect this when values may not be ready. |
| `write(value)` | Schema-validated native value. `undefined` and writing a Derived cell are invalid. |
| `reset()` | Restore the initial baseline, including missing if no initial was supplied. It does not write `undefined`. |

`ValueSnapshot<T>` is `{ status: 'missing' }`, `{ status: 'pending' }`, `{ status: 'ready', value: DeepReadonly<T> }` or `{ status: 'error', error: PublicError }`. Native values are isolated and snapshots are readonly, including Set/Map contents. Removed/replaced/disposed handles cannot be reused; obtain the current handle after structural replacement.

## StoreObservation

`states` maps serialized address keys to value snapshots. `values` includes the ready values under those keys. Each key is `JSON.stringify([scopeId, name])`, not a bare State name. `changes` contains `{ kind: 'added' | 'updated' | 'removed' | 'replaced', target: StateAddress, generation: number }` entries. The immediate subscription delivery has an empty change list. A removal appears in `changes` even though its value is no longer present.

Follow [Share State and synchronize a URL](../guides/state-and-url/) for an executable example. Resource-level State and Derived declarations are in [DSL State and ports](../../dsl/state-and-ports/).
