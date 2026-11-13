---
title: Errors and fallbacks
description: Sanitize Svelte boundary errors, observe diagnostics, and render fallback content.
sidebar:
  order: 5
---

## transformError

**Signature** · `transformError(error: unknown): PublicError`

Import from `@viewstem/svelte`. Use it as Svelte's root `transformError` when hosting `ViewstemView` yourself, as shown in [the mounting guide](../guides/mount-in-svelte/). The renderer configures the policy for roots it creates through `mount` and `attach`.

The function maps arbitrary thrown values to a fixed `INTERNAL_ERROR` DTO without inspecting their properties, message, or stack. It preserves the renderer's own missing-adapter error as `REFERENCE_NOT_FOUND`. Safe handling of thrown Proxy values in a directly hosted tree depends on applying the transformation at the Svelte root. The root-wide policy also covers other Svelte components in the app. If the app combines error policies, the host owns that integration.

## RendererDiagnostic

| Field | Type | Meaning |
| --- | --- | --- |
| `readonly phase` | `'prepare' \| 'node' \| 'query' \| 'action' \| 'url' \| 'render'` | The phase that reported the failure. |
| `readonly error` | `PublicError` | The public error. A render error can include the Component reference and instance ID. |
| `readonly nodeId?` | `string` | Identifies the affected node when available. |
| `readonly application?` | `ViewApplication` | The associated application handle when available. |

See [PublicError](/docs/core/runtime/#authorization) for error fields and [NodeSnapshot](/docs/core/view/#viewsnapshot) for rendered node data.

## RendererErrorListener

**Type** · `(diagnostic: RendererDiagnostic) => void`

`mount`, `attach`, and `ViewstemView` call the renderer's `onError` before the screen's `onError`. The same function receives a diagnostic occurrence once, even when multiple connections observe the same View. A new connection receives active node and Query errors and URL diagnostics for the current application. It shares those diagnostic occurrences with existing observers. Each failed Query execution can produce a new occurrence, including a retry with the same error code.

If an observer closes the connection, the remaining callbacks for that connection are skipped. Disposing a renderer stops its observer. A directly hosted borrowed View can continue delivering to its screen callback while its View and Svelte connection are alive. Observer exceptions and rejected promises are isolated. Normal cancellation produces no diagnostic.

## RenderFallback

**Type** · `Snippet<[node: NodeSnapshot, error: PublicError | null]>`

Supply a fallback snippet through `RenderOptions` or `ViewstemViewProps`. It receives the relevant node and a sanitized render error, the node's core error, or `null` for a placeholder without an error. The renderer calls it for a failed adapter boundary, a projection without an address, or an unready node rendered without an adapter. A code-backed adapter with a concrete address handles its own input readiness. With no snippet supplied, those fallback positions are empty.

## Failure and recovery

| Failure | Where it appears |
| --- | --- |
| Invalid options, registration, or target | The relevant setup call throws synchronously. |
| View preparation or first render fails during mount | `screen.ready` rejects and the target reservation is released. Fix the issue before mounting again. |
| `ViewstemView` source preparation fails | `prepareError` receives the public error and `onError` receives one `prepare` diagnostic. `whenRendered()` rejects with the same error. |
| Eligible initial Query fails | The completion report contains an entry in `queryErrors`. |
| Svelte implementation is missing or an adapter render fails | The boundary reports `REFERENCE_NOT_FOUND` or `INTERNAL_ERROR`, respectively. A live connection can show a fallback and retry on the next projection. |
| Adapter `emit()` fails | The call's promise rejects. Action failures from events handled by Core also produce an `action` diagnostic. Handle adapter readiness failures (`INPUT_NOT_READY`) and stale connections (`CANCELLED`) through the `emit()` rejection. |
| A direct `view.invokeAction()` or View change fails | The call's promise rejects. |
| A wait is cancelled by teardown or a new application | The waiting promise rejects with `CANCELLED`. |

An active render failure can reject `whenRendered()` and renderer-aware `whenSettled(application)` even if a fallback is visible. Core changes that completed before the failure remain applied.
