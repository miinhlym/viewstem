---
title: View and Component
description: Look up render nodes, Component contracts, slots, event bindings, and keyed expansion.
sidebar:
  order: 3
---

## ViewSpec and ComponentSpec

| Field | Contract |
| --- | --- |
| `render` | Required single [ComponentNode](#componentnode). The root supports `when` and has no `repeat`. |
| `ports` | Optional map of public inputs. |
| `states` | Optional map of owned State and Derived declarations. |
| `queries` | Optional map of owned Query uses. |
| `queryDefaults` | Optional inherited `refresh` and `intervalMs` settings. |
| `reactions` | Optional array of State reactions. |
| `slots` | Component only. Optional map of public slot names to `{ "required": true }` or an optional contract (`{}` or `{ "required": false }`). |
| `events` | Component only. Optional map of public event names to payload type contracts. |

A native Component registers a `ComponentContract`, a Component resource whose `ComponentPublicContract` spec has only `ports`, `slots`, and `events`. The renderer supplies the implementation. A declarative Component owns a `render` tree and can expose the same public fields. See [Registry](/docs/core/registry/) and [State and ports](/docs/dsl/state-and-ports/).

## ComponentNode

| Field | Contract |
| --- | --- |
| `id` | Required nonempty string. Unique across the node declarations of the authoring View or Component, including nested slot content. |
| `componentRef` / `component` | Exactly one. A registered Component ID or an inline declarative ComponentSpec. |
| `inputs` | Optional expressions that supply the target’s declared ports. Default is an empty object. |
| `slots` | Optional map from target slot name to a node array or a slot forwarding path. |
| `on` | Optional map from target event name to an [Action call](/docs/dsl/actions/#actioncall) or an emit binding. |
| `when` | Optional strict boolean expression, default true. |
| `repeat` | Optional keyed expansion. Allowed in node arrays passed to slots. |

### Slots and events

A slot receives a node array, including `[]`, or a forwarding path such as `{"@path":"/slots/content"}` into a declared slot of the authoring Component. Omit an optional slot for empty content. A required slot requires the key. Projected content retains its author’s State, ports, and event context. Its receiving Component controls placement.

An event payload is validated against the emitting Component’s public event contract before a binding runs. An Action binding can read `/event` or a property such as `/event/value` to build inputs. An emit binding has exactly `emit` and `payload`. It forwards a payload to a named public event on the authoring Component. There is no automatic event bubbling. See [Component composition](/docs/concepts/component-composition/) and [Events and actions](/docs/concepts/events-and-actions/).

### Conditions and keyed repeats

`repeat` requires `items` (an array expression), `as` (a nonempty alias), and `key` (a string or finite number expression). The runtime evaluates items, binds each to `/repeat/<alias>`, validates every key, and then evaluates each item’s `when`. Keys are unique within the repeat declaration and enclosing item. String `"1"` and number `1` differ. Nested repeats can read outer aliases and must use distinct active alias names.

A false `when` removes the node and its owned lifetime. The runtime skips its inputs and internal Queries, while registration still checks the definition’s static structure. Place a condition on a parent node to guard evaluation of a whole repeated slot.

This View body uses the `default` slot of a registered `shadcn.Card.Root`. Only **Open** renders. The keys are checked for both items.

```json title="repeated-view.json"
{
  "render": {
    "id": "list",
    "componentRef": "shadcn.Card.Root",
    "slots": {
      "default": [
        {
          "id": "item",
          "componentRef": "shadcn.Badge",
          "repeat": {
            "items": [
              { "id": "open", "text": "Open", "visible": true },
              { "id": "closed", "text": "Closed", "visible": false }
            ],
            "as": "item",
            "key": { "@path": "/repeat/item/id" }
          },
          "when": { "@path": "/repeat/item/visible" },
          "inputs": { "text": { "@path": "/repeat/item/text" } }
        }
      ]
    }
  }
}
```

## Node identity

Within the same authoring scope, reordering keyed items or changing a node’s inputs preserves its lifetime when the node ID and target identity stay the same. Changing the target or removing and later recreating the node creates a new lifetime. Repeat supplies an item context and key. To give each item its own state or Query, declare them inside the item’s Component. See [View API](/docs/core/view/) and the [keyed list guide](/docs/guides/keyed-list/).

## Grid placement

Grid placement belongs to a registered layout Component. A host can give it a layout input keyed by direct slot node IDs and use core’s `computeGridLayout` helper. In `GridConfig`, omit both `row` and `column` for automatic placement or supply both for a fixed position. Coordinates and spans are positive safe integers, with 1-based coordinates and default spans of 12 columns by 1 row. Fixed cells reserve space first, then automatic cells scan forward in expansion order across the 12 columns. A repeated declaration may set spans. Fixed positions for repeated declarations, unknown layout keys, overlap, and out-of-bounds rectangles are rejected by the helper. The result maps each expanded node address to its `GridPlacement`. See [Grid utilities](/docs/core/utilities/#computegridlayout).
