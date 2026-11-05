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
| `readonly phase` | `'render' \| 'event'` | Distinguishes a render failure from an adapter `emit` rejection. |
| `readonly error` | `PublicError` | The public error DTO. A render diagnostic can include the Component reference and instance ID. |
| `readonly node?` | `NodeSnapshot` | The projection associated with the failure when available. |

See [PublicError](/docs/core/runtime/#authorization) for error fields and [NodeSnapshot](/docs/core/view/#viewsnapshot) for rendered node data.

## RendererErrorListener

**Type** · `(diagnostic: RendererDiagnostic) => void`

Provide an `onError` callback when creating a renderer, setting up `mount` or `attach`, or rendering `ViewstemView`. Renderer-level and connection-level callbacks can both observe a failure. Synchronous exceptions from these observers are isolated from rendering and event dispatch.

## RenderFallback

**Type** · `Snippet<[node: NodeSnapshot, error: PublicError | null]>`

Supply a fallback snippet through `RenderOptions` or `ViewstemViewProps`. It receives the relevant node and a sanitized render error, the node's core error, or `null` for a placeholder without an error. The renderer calls it for a failed adapter boundary, a projection without an address, or an unready node rendered without an adapter. A code-backed adapter with a concrete address handles its own input readiness. With no snippet supplied, those fallback positions are empty.

## Failure and recovery

| Failure | Where it appears |
| --- | --- |
| Invalid options, registration, target, or View definition | The setup call throws or the mount or application promise rejects. |
| Eligible initial Query fails | The initial report contains an entry in `queryErrors`. |
| A code-backed Component has no registered Svelte implementation | Its render boundary reports `REFERENCE_NOT_FOUND`. |
| Adapter throws while Svelte renders the node | Its boundary reports a sanitized `INTERNAL_ERROR` and can render fallback content. Siblings remain rendered. A new core projection can retry the failed boundary. |
| Adapter `emit` fails | The original event promise rejects. Live connections also report an `event` diagnostic. |
| Renderer wait is cancelled by teardown or an obsolete generation | The affected wait rejects with `CANCELLED`. |

An active adapter render failure can reject both `whenRendered()` and renderer-aware `initialComplete` even if a fallback is visible. Core changes that completed before the failure remain applied.
