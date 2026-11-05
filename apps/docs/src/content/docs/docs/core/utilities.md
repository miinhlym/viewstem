---
title: "Grid layout utility"
description: "Calculate 12-column placements for a renderer without registering or drawing a Grid component."
sidebar:
  order: 17
---

Calculate 12-column placements for a renderer without registering or drawing a Grid component.

## computeGridLayout

```ts
computeGridLayout<A>(
  declarations: readonly { id: string; repeat?: unknown }[],
  expanded: readonly { id: string; address: A }[],
  layout?: Readonly<Record<string, GridConfig>>,
): Map<A, GridPlacement>;
```

`declarations` contains declared child nodes; `expanded` contains currently visible/expanded instances in rendering order. A repeated declaration can produce several addresses. `layout` maps declaration IDs to placement settings and defaults to `{}`. The returned Map uses each expanded address as its key.

| GridConfig field | Default / constraint |
|---|---|
| `row`, `column` | Omit both for flow placement or provide both as positive safe integers. Columns are 1–12. |
| `rowSpan` | 1; positive safe integer |
| `columnSpan` | 12; positive safe integer up to 12 |

`GridPlacement` always has `row`, `column`, `rowSpan` and `columnSpan`. Fixed rectangles reserve their space first. Flow items then search forward for an available rectangle in expanded order. Hidden declarations still validate their settings but occupy no space.

```js title="grid-layout.mjs"
import { computeGridLayout } from '@viewstem/core';
const placements = computeGridLayout(
  [{ id: 'left' }, { id: 'right' }],
  [{ id: 'left', address: 'left-1' }, { id: 'right', address: 'right-1' }],
  { left: { columnSpan: 6 }, right: { columnSpan: 6 } },
);
console.log(placements.get('right-1')); // { rowSpan: 1, columnSpan: 6, row: 1, column: 7 }
```

Unknown layout IDs, partial fixed coordinates, out-of-range spans, overlaps, and fixed coordinates for a repeated declaration throw `INVALID_DEFINITION`. Overlaps are rejected rather than silently moving fixed items. No CSS, DOM, drag behavior or content-height measurement is supplied. Build a custom [Svelte adapter](../../svelte/adapters/) to apply the resulting placements. For the other root utility, see [mergeOwnedUrl](../url/#mergeownedurlhref-patch).
