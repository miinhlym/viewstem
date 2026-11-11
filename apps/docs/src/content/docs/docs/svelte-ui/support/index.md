---
title: Support metadata and stylesheet
description: Read the machine-readable support catalog and the bundled stylesheet contract.
sidebar:
  order: 6
---

## `@viewstem/svelte-ui/shadcn/support.json`

This JSON export describes the pinned catalog. Use it to inspect contracts or populate authoring tools. Read `mode` before offering an ID as a `componentRef`.

```ts
import support from '@viewstem/svelte-ui/shadcn/support.json' with { type: 'json' };

const entry = support.components.find((part) => part.id === 'shadcn.Button');
if (entry?.mode === 'json') {
  console.log(Reflect.get(support.properties, entry.propertiesRef).variant);
  console.log(Reflect.get(support.callbacks, entry.callbacksRef).click);
}
```

| Field | Contents |
| --- | --- |
| `formatVersion` | Catalog data format version. The current value is `1`. |
| `upstreamCommit` | Pinned upstream shadcn-svelte source commit. |
| `families`, `upstreamComponents`, `recipes` | Counts of families, native parts, and JSON compositions. |
| `components[]` | Entries with `id`, `family`, `mode`, `recipe`, `slots`, and references into the three dictionaries. Native-context entries have a `limitation`. |
| `properties[propertiesRef]` | Input names and value schemas, plus required flags, codecs, or limitations where present. |
| `callbacks[callbacksRef]` | Event names with argument schemas and any payload codec. |
| `unsupported[unsupportedRef]` | Native features outside the JSON contract, with their reasons. |

A `mode: "json"` entry has a registered adapter. For a `mode: "native-context"` entry, the catalog ID identifies a part in this file. Use the named native export in Svelte. Keys such as `p16` are dictionary references within this snapshot. Look them up from the component entry.


## Event payloads

For events with the `dom` codec, the schema describes the direct payload. The adapter copies the available fields from the DOM event or its target.

| Field | Type |
| --- | --- |
| `type` | `string` |
| `value`, `key`, `code` | Optional `string` |
| `checked`, `altKey`, `ctrlKey`, `metaKey`, `shiftKey` | Optional `boolean` |
| `button`, `buttons` | Optional `number` |

For other codecs and native callbacks, the schema describes the value inside `{ "value": ... }`. An absent callback argument becomes `null`. The date codecs translate date-only strings, arrays of dates, and `{ start, end }` ranges to and from native date values. When the input schema allows `null`, a date codec decodes it as an unset value. Check the schema for each input's required fields and exact shape.

The adapter prevents navigation on supported DOM `submit` events. For an input of HTML type `number`, DOM `value` still arrives as a string. Convert it when supplying a numeric Action input.

<a id="stylesheet"></a>

## `@viewstem/svelte-ui/shadcn/styles.css`

Import this stylesheet for the complete kit. It contains the prebuilt theme, component utilities, and scoped base styles. The kit uses Vega styles with the Neutral palette. CSS custom properties prefixed with `--viewstem-` can override theme tokens. See [style the kit](../guides/style-and-native/) for a theme that also reaches portals.

Package consumer verification uses Node 22 and 24, Svelte 5, a browser client, and TypeScript Bundler resolution. The renderer's integration target is the browser client. The full set's mode watcher needs an origin with access to local storage.
