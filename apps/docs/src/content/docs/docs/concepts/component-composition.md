---
title: Reusing Components
description: Compose reusable definitions while keeping inputs and instance ownership explicit.
---

A reusable **Component** packages a render tree with the ports it needs. It can also own State, Derived values, Queries, slots, and events. Start with only the features that the Component needs.

## Define a Component

Register this resource with `renderer.registry.registerResources([definition])` before mounting the View. It also requires the `badge` UI family to be registered.


```json
{
  "kind": "Component",
  "id": "project-label",
  "spec": {
    "ports": {
      "name": {
        "kind": "Value",
        "schema": {
          "type": "string"
        },
        "required": true
      }
    },
    "render": {
      "id": "label",
      "componentRef": "shadcn.Badge",
      "inputs": {
        "text": {
          "@path": "/ports/name"
        }
      }
    }
  }
}
```


The Component accepts a `name` and displays it as a badge. Its internal node reads `/ports/name`, so it works without knowing which View will use it.

## Use the same definition twice

With the `card` family registered too, mount this View:


```json
{
  "render": {
    "id": "card",
    "componentRef": "shadcn.Card.Root",
    "slots": {
      "default": [
        {
          "id": "onboarding",
          "componentRef": "project-label",
          "inputs": {
            "name": "Onboarding"
          }
        },
        {
          "id": "billing",
          "componentRef": "project-label",
          "inputs": {
            "name": "Billing"
          }
        }
      ]
    }
  }
}
```


The card shows **Onboarding** and **Billing**. Both nodes use `project-label`, but each has its own node ID and inputs. If the Component declares local State, each instance gets its own State as well.

## Share a State intentionally

When two Components must edit the same value, declare a State port instead of a Value port. In the parent View, connect each instance’s `inputs` to the same `/states/title`. Both then operate on that existing State. Giving two local States the same initial value does not connect them.

## Expose slots and events

Declare named slots in the Component’s `slots` contract, and place their content with a path such as `/slots/body`. The caller supplies the nodes. Expressions in those supplied nodes keep the caller’s scope; they do not gain access to the receiving Component’s private State.

To notify the caller, declare an event schema in `events` and forward an internal event with `on: { click: { emit: "select", payload: ... } }`. The caller can attach an Action to `on.select`. This keeps the Component’s internal UI separate from the caller’s response.

Inspect both instances in the [reusable Component example](../../../examples/reusable-component/).

See the [Component reference](../../dsl/view-and-component/) for exact slot declaration, forwarding, and event fields.
