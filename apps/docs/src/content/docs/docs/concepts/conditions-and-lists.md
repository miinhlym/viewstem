---
title: Conditions and lists
description: Control which nodes exist with when and keyed repeat.
---

A screen often needs to show a section only when it is relevant, or render the same Component for several items. Use **when** to control whether a node exists and **repeat** to create one instance per item.

## Show a node conditionally

This is a render node to place in a View whose `states.enabled` is boolean. It exists only while that State is `true`.


```json
{
  "id": "details",
  "componentRef": "shadcn.Badge",
  "inputs": {
    "text": "Details"
  },
  "when": {
    "@path": "/states/enabled"
  }
}
```


`when` expects a boolean. A string such as `"true"` is not a boolean condition. Omitting `when` leaves the node unconditional.

## Render a list

This complete View combines `repeat` and `when`. Only **Onboarding** is displayed because Billing’s `visible` value is `false`.


```json
{
  "render": {
    "id": "card",
    "componentRef": "shadcn.Card.Root",
    "slots": {
      "default": [
        {
          "id": "project",
          "componentRef": "shadcn.Badge",
          "repeat": {
            "items": [
              {
                "id": "onboarding",
                "name": "Onboarding",
                "visible": true
              },
              {
                "id": "billing",
                "name": "Billing",
                "visible": false
              }
            ],
            "as": "project",
            "key": {
              "@path": "/repeat/project/id"
            }
          },
          "when": {
            "@path": "/repeat/project/visible"
          },
          "inputs": {
            "text": {
              "@path": "/repeat/project/name"
            }
          }
        }
      ]
    }
  }
}
```


`items` supplies the collection. `as: "project"` makes each item available under `/repeat/project`. The runtime expands the items before evaluating each item’s `when`, so the condition can read that item. The repeated node still has one declaration ID, `project`. Place `repeat` on a node in a slot array; the single `render` root cannot repeat.

## Choose a stable key

`key` identifies an item across updates. Use a unique, stable string or finite number, such as a record ID. Keeping the same key lets the runtime retain the item’s instance and local State when the list is reordered. Duplicate or missing keys are errors.

## Removing a node ends its lifetime

Setting `when` to `false` or removing a repeated item disposes that instance, including its local State and unfinished owned Actions. Showing it again creates a new instance. This differs from visually hiding a DOM element while keeping its runtime instance alive.

Try changing item order in the [repeat example](../../../examples/repeat/).
