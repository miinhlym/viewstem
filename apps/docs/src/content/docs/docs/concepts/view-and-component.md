---
title: View and Component
description: Describe a screen with a View and build its tree from Components.
---

A **View** describes a screen to run. A **Component** is a reusable part of that screen, such as a button, a card, or a panel with its own state. A View starts with one `render` node.

## Describe a screen

This is a complete View definition. Pass it as `view` to `renderer.mount`, using the renderer from Quick Start.


```json
{
  "render": {
    "id": "hello",
    "componentRef": "shadcn.Button",
    "inputs": {
      "text": "Hello, Viewstem"
    }
  }
}
```


The screen shows a button labeled **Hello, Viewstem**. Changing `inputs.text` in the definition changes the label the next time you apply that definition.

## Read a render node

| Field | Meaning |
|---|---|
| `id` | Identifies this use of a Component within its owner. |
| `componentRef` | Selects a registered Component definition. |
| `inputs` | Supplies values or connections to that Component’s ports. |

`hello` is the node ID; `shadcn.Button` is the definition ID. Several nodes can use the same definition with different inputs. Viewstem does not infer a Component from its name: the host must register its contract and rendering implementation.

The examples in this chapter use the optional shadcn UI set. Register each family used by an example—such as `button`, `badge`, or `card`—before mounting, just as Quick Start registers `button`. The JSON describes the screen; the registered UI set determines its appearance.

## Nest nodes with slots

A Component can accept child nodes through named `slots`. This View puts a badge inside a card.


```json
{
  "render": {
    "id": "card",
    "componentRef": "shadcn.Card.Root",
    "slots": {
      "default": [
        {
          "id": "content",
          "componentRef": "shadcn.Card.Content",
          "slots": {
            "default": [
              {
                "id": "status",
                "componentRef": "shadcn.Badge",
                "inputs": {
                  "text": "Draft"
                }
              }
            ]
          }
        }
      ]
    }
  }
}
```


The `default` slot contains an array of nodes. The card is still the single root; its slots form the rest of the tree. Slot names belong to the receiving Component’s contract.

Try changing the child nodes in the [slots example](../../../examples/slots/).
