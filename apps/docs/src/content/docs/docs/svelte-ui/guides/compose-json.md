---
title: Compose components in JSON
description: Supply component inputs and slots, and wire browser events to Viewstem Actions.
sidebar:
  order: 2
---

A node names a registered component with `componentRef`. Look up that ID in [component sets](../../component-sets/) for its inputs, slots, and events. Keep the node's `id` stable across updates. Use a separate `inputs.id` when you need an HTML ID and the component supports it.

## Place a button inside a dialog trigger

Register `dialog` and `button`, then pass this View to `renderer.mount`. The Button renders the trigger's DOM element. Dialog parts receive their context from `Dialog.Root` through its default slot.

```json
{
  "render": {
    "id": "settings",
    "componentRef": "shadcn.Dialog.Root",
    "slots": {
      "default": [
        {
          "id": "open",
          "componentRef": "shadcn.Dialog.Trigger",
          "slots": {
            "child": [
              {
                "id": "settings-button",
                "componentRef": "shadcn.Button",
                "inputs": { "text": "Open settings", "variant": "outline" }
              }
            ]
          }
        },
        {
          "id": "settings-content",
          "componentRef": "shadcn.Dialog.Content",
          "slots": {
            "default": [
              {
                "id": "settings-title",
                "componentRef": "shadcn.Dialog.Title",
                "inputs": { "text": "Settings" }
              },
              {
                "id": "settings-help",
                "componentRef": "shadcn.Dialog.Description",
                "inputs": { "text": "Manage your workspace preferences." }
              },
              {
                "id": "close",
                "componentRef": "shadcn.Dialog.Close",
                "inputs": { "text": "Close" }
              }
            ]
          }
        }
      ]
    }
  }
}
```

Use `inputs.text` for plain text where the part lists it. A nonempty `slots.default` takes precedence. When you omit both, the widget can retain its own icon, selected label, or placeholder.

Where a part supports `slots.child`, supply one concrete DOM-rendering part from this kit. The bridge forwards props, handlers, and the Svelte attachment to that element. A custom adapter, a composite root, or a list of children falls outside this contract.

## Write user edits to State

Register `input` for this View. The displayed value reads from State. The `input` handler writes the browser's string back through a State port. Korean IME input stays local during composition and sends its committed value.

```json
{
  "states": {
    "name": { "kind": "State", "schema": { "type": "string" }, "initial": "" }
  },
  "render": {
    "id": "name",
    "componentRef": "shadcn.Input",
    "inputs": { "value": { "@path": "/states/name" }, "aria-label": "Name" },
    "on": {
      "input": {
        "id": "write-name",
        "action": {
          "ports": {
            "target": { "kind": "State", "schema": { "type": "string" }, "required": true },
            "next": { "kind": "Value", "schema": { "type": "string" }, "required": true }
          },
          "steps": [
            { "kind": "SetState", "target": { "@path": "/ports/target" }, "value": { "@path": "/ports/next" } }
          ]
        },
        "inputs": {
          "target": { "@path": "/states/name" },
          "next": { "@path": "/event/value" }
        }
      }
    }
  }
}
```

For callbacks such as `Switch.checkedChange` or `Dialog.Root.openChange`, `/event/value` contains the native argument, such as a boolean. A DOM `change` on a multiple `NativeSelect.Root` reports only the first selected string. Use `Select.Root` with `type: "multiple"` and `valueChange` for an array.

See [event payloads](../../support/#event-payloads) for the DOM shape and the [DSL reference](/docs/dsl/) for View nodes, slots, and event Actions.
