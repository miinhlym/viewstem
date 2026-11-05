---
title: Derived values
description: Calculate reactive values with Derived and Variable.
---

Some values can be calculated from others: a formatted title, a total, or whether a form is valid. A **Variable** defines a pure calculation. **Derived** uses that calculation as a reactive, read-only value in a View or Component.

## Declare a calculation

This View adds an exclamation mark to the current title.


```json
{
  "states": {
    "title": {
      "kind": "State",
      "schema": {
        "type": "string"
      },
      "initial": "Draft"
    },
    "label": {
      "kind": "Derived",
      "schema": {
        "type": "string"
      },
      "variable": {
        "ports": {
          "title": {
            "kind": "Value",
            "schema": {
              "type": "string"
            },
            "required": true
          }
        },
        "expression": "title + \"!\""
      },
      "inputs": {
        "title": {
          "@path": "/states/title"
        }
      }
    }
  },
  "render": {
    "id": "label",
    "componentRef": "shadcn.Badge",
    "inputs": {
      "text": {
        "@path": "/states/label"
      }
    }
  }
}
```


The badge initially displays **Draft!**. Writing **Saved** to `title` makes it display **Saved!** without a second write to `label`.

## Pass dependencies explicitly

The `inputs` beside `variable` read in the View’s scope. They pass `/states/title` into the Variable’s `title` port. Inside `expression`, the CEL name `title` refers to that port. The Variable does not capture the surrounding View’s State.

CEL expressions can combine declared inputs with supported operators and functions, such as `size(title) > 5`. They do not run arbitrary JavaScript, make network requests, or write State.

## Choose State or Derived

| Need | Use |
|---|---|
| Remember a value that a user or Action can change | `State` |
| Keep a value synchronized with a calculation | `Derived` |
| Reuse the same calculation in several places | A registered `Variable`, referenced by `variableRef` |

A Derived value is read through `/states/name`, but it cannot be the writable target of `SetState`. If an input is not ready, the calculation waits; if evaluation fails, that failure is exposed rather than replaced with an invented value.

Try editing a title in the [Derived example](../../../examples/derived/).

CEL is an expression language for calculating values. See [VariableSpec](../../dsl/state-and-ports/#variablespec) for inputs and calculations, and [CEL](../../core/cel/) for supported syntax and functions.
