---
title: State and ports
description: Declare owned State, Derived values, Variable calculations, reactions, and public inputs.
sidebar:
  order: 4
---

## State declarations

`ResourceStateDeclaration` is an entry in a View or Component’s `states` map. Read the entry’s current value at `/states/<name>`. Each entry requires exactly one `schema` or `typeRef`.

| `kind` | Additional fields | Behavior |
| --- | --- | --- |
| `State` | Optional `initial` expression. | Writable cell owned by the instance. With no initial expression it starts missing. |
| `Derived` | Exactly one `variableRef` or inline `variable`, plus optional `inputs`. | Read-only computed cell. Input changes re-evaluate the Variable. The result is checked against the Derived contract. |

The current core accepts `/ports` and `/states` in `initial` and Derived inputs. The runtime orders local State dependencies independently of JSON key order and rejects cycles. A State’s initial value is established once for its lifetime. If it is still pending, a write can establish the current value without being overwritten by the late initial result. Reset restores the established initial snapshot. See [StateStore](/docs/core/state-store/).

## VariableSpec

A Variable has a required, nonempty CEL `expression` string and an optional `ports` map of Value ports. The CEL expression names ports directly, for example `size(items)`. Call a Variable through a Derived declaration or a Variable step in an Action. Supply clocks, dates, or other changing inputs through ports. For supported functions and limits see the [CEL API](/docs/core/cel/).

The following View body renders **Selected**. Change the `items` State to an empty array to remove the badge through its condition.

```json title="derived-view.json"
{
  "states": {
    "hasItems": {
      "kind": "Derived",
      "schema": { "type": "boolean" },
      "variable": {
        "ports": {
          "items": { "kind": "Value", "required": true, "schema": { "type": "array" } }
        },
        "expression": "size(items) > 0"
      },
      "inputs": { "items": { "@path": "/states/items" } }
    },
    "items": { "kind": "State", "schema": { "type": "array" }, "initial": ["A"] }
  },
  "render": {
    "id": "selection",
    "componentRef": "shadcn.Badge",
    "when": { "@path": "/states/hasItems" },
    "inputs": { "text": "Selected" }
  }
}
```

## Ports

| Port | Declaration | Input and read behavior |
| --- | --- | --- |
| `Value` | `kind: "Value"` and exactly one `schema` or `typeRef`. Optional `default` with `required` omitted or false. | Accepts a literal or evaluated value. `/ports/<name>` reads the value. |
| `State` | `kind: "State"` and exactly one `schema` or `typeRef`. | Connects an existing writable cell through a direct `/states/<name>` or State `/ports/<name>` path. A value read dereferences the cell. |
| `Query` | `kind: "Query"` with optional `required`. | Connects a Query use through a direct `/queries/<name>` or Query `/ports/<name>` path. Read fields such as `/ports/<name>/data`. |

`required` is a boolean and defaults to false for all ports. State and Query ports have no default. Query ports have no schema. Component, View, and Action accept all three port kinds. Query and Variable accept Value only. Datasource and Type have no ports.

A Value default is validated at registration and applies only when the input key is omitted. Explicit null is validated as a value. An input whose evaluation is missing, pending, or failed keeps that status. A declared required port without an input key and an input for an undeclared port both fail structural validation. An automatic consumer can wait for a required value. An explicit call with a required value still unready fails with `INPUT_NOT_READY`.

A State port compares resolved schema contracts with the source cell. It ignores annotation and irrelevant ordering differences and rejects incompatible constraints with `TYPE_CONTRACT_MISMATCH`. A currently integral value cannot make a `number` cell compatible with an `integer` State port. Connecting compatible State or Query ports preserves the target identity.

## Reactions

`Reaction` has three required fields. Each path targets a whole entry, using `/states/<name>` or `/ports/<name>`.

| Field | Contract |
| --- | --- |
| `watch` | Nonempty array of direct paths to local State, local Derived, or connected State ports. |
| `target` | A direct path to one writable local State or connected State port. |
| `value` | Fixed JSON validated against the target schema. Keys are used as written. |

A reaction writes on a watched value change after initialization. The store rejects duplicate reaction targets and dependency cycles, including cycles through Derived. If a transaction also explicitly writes the target, that write wins. The owning View or Component controls reaction lifetime. See [State](/docs/concepts/state/) and [Derived values](/docs/concepts/derived-values/).
