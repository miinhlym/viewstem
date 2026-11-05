---
title: Events and Actions
description: Connect UI events to explicit steps that change State or call services.
---

An **event** reports something that happened, such as a click or a text change. An **Action** defines what to do in response. Connect them with a render node’s `on` field.

## Change State on click

This complete View starts with a button labeled **Draft**.


```json
{
  "states": {
    "title": {
      "kind": "State",
      "schema": {
        "type": "string"
      },
      "initial": "Draft"
    }
  },
  "render": {
    "id": "save",
    "componentRef": "shadcn.Button",
    "inputs": {
      "text": {
        "@path": "/states/title"
      }
    },
    "on": {
      "click": {
        "id": "save-title",
        "action": {
          "ports": {
            "title": {
              "kind": "State",
              "schema": {
                "type": "string"
              },
              "required": true
            }
          },
          "steps": [
            {
              "kind": "SetState",
              "target": {
                "@path": "/ports/title"
              },
              "value": "Saved"
            }
          ]
        },
        "inputs": {
          "title": {
            "@path": "/states/title"
          }
        }
      }
    }
  }
}
```


Clicking the button changes its label to **Saved**. The connection’s `inputs` finds the View’s `title` State. The Action’s State port connects that existing State, and `SetState` writes through `/ports/title`. A Value port would only receive its current value.

## Read event data

An input Component can publish a payload such as `{ "value": "New title" }`. Read `/event/value` in the event connection’s `inputs` and pass it to an Action Value port. Inside the Action, read that port with `/ports/next`. The Action receives declared data, not a browser DOM event.

Value inputs are captured when a call begins. Editing the form while the Action runs does not silently change those captured inputs.

## Run steps in order

`steps` run in order. They can execute a Query, call another Action, calculate a Variable, write State, refresh a Query, branch with `If`, or stop with `Assert`. A result-producing step with an `id` makes its validated result available to later steps at `/steps/id`.

To return a result from a declarative Action, declare `output` with a type contract and `value`. Without `output`, the Action returns no value; it does not return the last step implicitly.

If a step fails, later steps stop. Earlier State writes and successful external requests remain applied. An Action is not an automatic rollback transaction.

## Observe an invocation

The connection ID `save-title` exposes `/actions/save-title/status`, with `idle`, `running`, `success`, or `error`. It also exposes `running`, `data`, and `error`. This ID identifies the call connection, not a reusable Action definition. Calls on the same connection are ignored while it is already running.

Removing the connection or its owning instance cancels its remaining work. It does not undo external effects that already happened.

Run the [State change example](../../../examples/set-state/) to follow the click through to the updated UI.
