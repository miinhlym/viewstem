---
title: "URL adapters"
description: "Synchronize explicitly owned URL keys with State while preserving unrelated URL content."
sidebar:
  order: 14
---

Synchronize explicitly owned URL keys with State while preserving unrelated URL content.

## connectUrl(options)

Call `store.connectUrl(options)` after creating writable State handles. It returns a `UrlConnection`.

| Option | Default | Contract |
|---|---|---|
| `adapter` | Required | Implements the `UrlAdapter` methods below. |
| `bindings` | Required | Readonly array of `{ target: StateHandle, key?: string, history?: 'push' \| 'replace' }`. |
| binding `key` | `p.${target.address.name}` | Unique URL query key owned by this connection. |
| binding `history` | `'replace'` | A settlement containing any push binding requests push history. |
| `restore` | `true` | Initially read the current URL into State. |
| `limits` | Defaults below | Optional positive safe-integer overrides. |
| `onError` | No-op | `(error: PublicError) => void` for URL diagnostics. |

One store can have one active connection. A binding must reference a writable cell in that store. Targets and keys cannot repeat. Connections sharing an adapter cannot claim the same key concurrently.

Values are encoded as JSON and then URL-encoded; a string therefore keeps its JSON quotes. Sets use their supported array representation. Supported State shapes are string, number, boolean, and arrays/Sets of strings or numbers; a nullable scalar follows its schema. Objects, Maps, tuple arrays and ambiguous unions are not URL profiles. A missing key restores the baseline. Invalid input is reported through connection diagnostics; inspect the resulting State snapshot rather than assuming a URL value was accepted.

## UrlAdapter

```ts
interface UrlAdapter {
  read(): string;
  subscribe(listener: () => void): () => void;
  writeOwned(
    patch: Readonly<Record<string, string | null>>,
    context: { readonly mode: 'push' | 'replace'; readonly isCurrent: () => boolean },
  ): void | { readonly applied?: boolean } | PromiseLike<void | { readonly applied?: boolean }>;
}
```

`null` removes a query key. Apply only the supplied keys. Subscribe to external navigation and return cleanup. If writing asynchronously, check `isCurrent()` immediately before the actual URL mutation; return `{ applied: false }` when skipping an obsolete write. Returning `void` or an object without `applied: false` indicates an accepted write.

## UrlConnection

| Member | Behavior |
|---|---|
| `ready: Promise<void>` | Resolves after initial synchronization can proceed; pending initial values may delay it. |
| `isReady(): boolean` | Whether initialization has completed. |
| `restore(): void` | Re-read the current URL into bound State. |
| `getDiagnostics(): readonly PublicError[]` | URL parsing, limit, restore or write diagnostics. |
| `removeOwned(selected?): Promise<void \| { applied?: boolean }>` | Remove all owned keys, or keys for selected bound State handles; requests replace history. |
| `dispose(): void` | Stop observation and release key ownership. Does not implicitly remove URL keys. |

## Limits

| Field | Default | Measures |
|---|---:|---|
| `maxOwnedBytes` | 8192 | Encoded owned query content in UTF-8 bytes |
| `maxValueBytes` | 4096 | One encoded query value in UTF-8 bytes |
| `maxItems` | 1000 | Items of an array or Set |
| `maxKeys` | 128 | Number of bindings |

## mergeOwnedUrl(href, patch)

Import from `@viewstem/core`. Returns a URL string after replacing/removing exactly the patched query keys. Unrelated query segments retain their encoding; hash content is preserved. Prefer an absolute `href`; relative input is resolved against the implementation's placeholder base, not the current browser location.

```js title="merge-url.mjs"
import { mergeOwnedUrl } from '@viewstem/core';
const result = mergeOwnedUrl('https://example.test/?campaign=a%20b&filter=all#list', {
  filter: 'active',
});
console.log(result); // https://example.test/?campaign=a%20b&filter=active#list
```

See [State and URL guide](../guides/state-and-url/) and [ViewTarget URL convenience options](../runtime/#viewtarget).
