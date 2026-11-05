---
title: Value expressions
description: Look up literals, @path, @call, and the roots each field can read.
sidebar:
  order: 2
---

## ValueExpression and PathExpression

A `ValueExpression` is a JSON value in a field that supports evaluation. The evaluator visits arrays and plain objects recursively. Strings, numbers, booleans, and null are literals. Write a path or call using the exact object shape below.

| Form | Result |
| --- | --- |
| `{"@path":"/ports/title"}` | The referenced value in its original type. The object has only the `@path` key. |
| `{"@call":"concat","args":["A","B"]}` | The result of an available function. The object has exactly `@call` and `args`. |
| `{"@@path":"/ports/title"}` | A data object with the literal key `@path` and a string value. |
| `{"path":"/ports/title"}` | An ordinary data object. The `path` key has no expression meaning. |

In dynamic fields, prefix an actual `@` data key with one extra `@`. The evaluator removes one leading `@` and leaves returned data alone. Unrecognized single-`@` keys, including `@literal`, and expressions mixed with extra keys fail with `INVALID_EXPRESSION`. Schema objects, port defaults, reaction values, reference IDs, and CEL source strings are taken as authored.

`InputExpressions` describes a name-to-expression object. The receiving [port](/docs/dsl/state-and-ports/#ports) determines whether a direct path reads a value or connects a State or Query handle. Host JS inputs are already evaluated values or handles.

## Reading paths

Paths start with `/`. Use JSON Pointer escapes `~0` for `~` and `~1` for `/`. Traversal reads only own data properties and present array elements. Array indices use decimal digits with no leading zero except `0`. Array length, inherited properties, and entries in native Set or Map are outside this path syntax.

| Where the expression runs | Roots |
| --- | --- |
| Node inputs, `when`, `repeat.items` and `repeat.key` | `/ports`, `/states`, `/queries`, `/actions`, and the in-scope aliases under `/repeat` |
| Node `on` inputs and `emit.payload` | The author’s roots above, plus `/event` for the payload |
| State `initial` and Derived `inputs` | `/ports`, `/states` |
| Query use inputs and gates | `/ports`, `/states`, `/queries` |
| Nested Query source inputs | `/ports` of the parent Query |
| Query transforms | `/ports`, `/sources` |
| Action step inputs, conditions, values, messages and output | `/ports`, `/steps` for visible completed results |
| HTTP templates | Context-specific `/ports`, `/secrets`, `/auth/token` or `/response`. See [HTTP expression scope](/docs/dsl/datasources/#expression-scope). |

Slot projection uses a separate structural path such as `{"@path":"/slots/content"}`. In a Variable, CEL refers directly to the declared port names. See [VariableSpec](/docs/dsl/state-and-ports/#variablespec).

## Calling value functions

| Function | Args and result |
| --- | --- |
| `concat` | Array of string expressions. Concatenates them in order. An empty array returns the empty string. |
| `formatString` | An object with one `value` field that evaluates to a string. Interpolates `${/absolute/path}` for strings, finite numbers, booleans, and null. `$$` yields a literal dollar sign. |
| Registered pure function | An argument array checked against the function’s input schemas. Its synchronous return value is checked against its output schema. See [CEL functions](/docs/core/cel/). |

This expression yields `Project A costs $12` when `title` and `cost` are `"A"` and `12`.

```json title="format-title.json"
{
  "@call": "formatString",
  "args": { "value": "Project ${/ports/title} costs $$${/ports/cost}" }
}
```

## Missing, pending, and invalid

An undeclared name or invalid array index is a reference error. Reading a missing data property can produce `INPUT_NOT_READY`, and traversing a scalar or null can produce `TYPE_MISMATCH`. A pending dependency remains pending in automatic evaluation. A ready null, false, or zero remains a value. A call or string interpolation propagates a failed or unready dependency rather than inserting empty text. See [Values and inputs](/docs/concepts/values-and-inputs/) and [Core types](/docs/core/types/).
