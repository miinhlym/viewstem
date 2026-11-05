---
title: "Share State and synchronize a URL"
description: "Keep host-owned State and synchronize selected cells with a URL adapter."
sidebar:
  order: 2
---

Keep host-owned State and synchronize selected cells with a URL adapter.

## Create cells and connect an adapter

Run the following `.mjs` file after installing Core. The in-memory adapter makes the example runnable in Node; it does not navigate a browser.

```js title="state-url.mjs"
import { createStateStore, mergeOwnedUrl } from '@viewstem/core';

const store = createStateStore();
const scope = store.createScope();
const filter = scope.registerState('filter', { schema: { type: 'string' }, initial: 'all' });
const selected = scope.registerState('selected', { schema: { type: 'string' }, initial: '' });
store.registerReaction(scope, { watch: [filter], target: selected, value: '' });
selected.write('row-1');
filter.write('active');
console.log(selected.read()); // ''

let href = 'https://example.test/customers?campaign=a%20b';
const listeners = new Set();
const adapter = {
  read: () => href,
  subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  writeOwned(patch, { isCurrent }) {
    if (!isCurrent()) return { applied: false };
    href = mergeOwnedUrl(href, patch);
  },
};
const connection = store.connectUrl({ adapter, bindings: [{ target: filter, key: 'filter' }] });
await connection.ready;
filter.write('archived');
console.log(JSON.parse(new URL(href).searchParams.get('filter'))); // archived
console.log(href.includes('campaign=a%20b')); // true
connection.dispose();
store.dispose();
```

Changing the filter clears the selected row. The URL receives the JSON string `"archived"` as its encoded filter value while retaining the original encoding of the unrelated campaign parameter. The listener set represents external URL changes: after changing `href` outside `writeOwned`, call each listener to restore bound State from that URL.

## Use browser history

In a browser adapter, implement `read` with `location.href`, subscribe to `popstate`, and apply `mergeOwnedUrl(location.href, patch)` with `history.pushState` or `history.replaceState` according to `context.mode`. Check `context.isCurrent()` immediately before the write, including after any asynchronous work. Native history writes do not emit `popstate`; do not create a restore loop by treating your own writes as external navigation.

## Pass State to a View

Declare a `kind: 'State'` port and pass the issued handle in `createView({ inputs: { filter } })`. The View uses the handle; the host remains responsible for the injected store. Stop the URL connection and dispose the store when that host lifetime ends. For View-owned State, use the convenience `url` option on [ViewTarget](../../runtime/#viewtarget) instead of attaching a second connection to the same store.

## Troubleshooting

A store supports one active URL connection. Duplicate keys, duplicate targets or unsupported schema shapes reject the connection. Prefer `getSnapshot()` when a State may be missing or pending. `write(undefined)` does not clear a State; use `reset()` to restore its initial baseline.

See [StateStore](../../state-store/) for transactions and [URL](../../url/) for supported value shapes, default keys and limits.
