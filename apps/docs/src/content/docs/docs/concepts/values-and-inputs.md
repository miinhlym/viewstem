---
title: Values and inputs
description: Pass inputs through ports and read dynamic values with @path and @call.
---

Component inputs can be literal values or expressions that read the current execution context. **Ports** declare what a definition accepts; **inputs** supply those values where the definition is used.

## Declare an input

This View accepts a required string named `title` and displays it in a badge.


```json
{
  "ports": {
    "title": {
      "kind": "Value",
      "schema": {
        "type": "string"
      },
      "required": true
    }
  },
  "render": {
    "id": "title",
    "componentRef": "shadcn.Badge",
    "inputs": {
      "text": {
        "@path": "/ports/title"
      }
    }
  }
}
```


Mount it with `inputs: { title: "Projects" }` alongside `view`. The badge displays **Projects**. `schema` validates the value, and `required` makes the input mandatory. An optional Value port can declare `default` for an omitted input.

## Read a value with @path

`{ "@path": "/ports/title" }` reads the value of the `title` port. It preserves the value’s type: a boolean stays a boolean and an array stays an array. A plain string such as `"/ports/title"` is only text.

| Path | Available context |
|---|---|
| `/ports/title` | A declared input in the current definition. |
| `/states/title` | State or Derived owned by the current View or Component. |
| `/queries/projects/data` | A local Query’s result. |
| `/event/value` | An event payload while its connection evaluates inputs. |

A path is relative to an execution scope, not a way to reach every value in the app. A nested definition receives what it needs through ports. A value that is not ready does not silently become `null`.

## Compute an input with @call

Replace the badge’s `inputs.text` with this expression to display **Open Projects**.


```json
{
  "@call": "concat",
  "args": [
    "Open ",
    {
      "@path": "/ports/title"
    }
  ]
}
```


`@call` invokes an available value function. It does not run an Action or make a network request. Use a Variable when you need a reusable CEL calculation.

## Distinguish values from connections

| Port kind | What it receives |
|---|---|
| `Value` | A value to read; passing it does not grant write access. |
| `State` | An existing writable State, allowing explicit changes to that State. |
| `Query` | An existing Query instance, allowing observation and refresh. |

The receiving port decides whether a path supplies a value or connects an instance. For a State port, pass a path to an existing State, not a literal with the same current value.

Experiment with the input in the [View inputs example](../../../examples/view-inputs/).

See the [value expression reference](../../dsl/values/) for supported expressions and value-function calls.
