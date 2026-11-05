---
title: Queries
description: Look up Query sources, transforms, use settings, snapshots, and refresh behavior.
sidebar:
  order: 5
---

## QuerySpec

| Field | Contract |
| --- | --- |
| `ports` | Optional map of Value ports. |
| `sources` | Required map of named QuerySource objects. Use `{}` when the transform needs no sources. |
| `transform` | Required object with an `input` expression and optional ordered `steps` array. The last transform result becomes the Query result. Without steps it is `input`. |

## QuerySource

| Source | Fields | Value under `/sources/<name>` |
| --- | --- | --- |
| Nested Query | One of `queryRef` or `query`, plus optional `inputs` that read the outer Query’s `/ports`. | Nested Query’s transformed result. |
| HTTP | One of `datasourceRef` or `datasource`, plus required `request`. The request reads the current Query’s ports. | Response body. |

A nested Query also accepts an input expression that yields the entire input object. Null is invalid. Sources cannot read sibling results. Combine the results in the transform. The registry rejects cycles among nested Query definitions. Each required source and transform step must succeed. Failures carry the source or transform location, and nested errors can retain their original location in `cause`. A successful empty array is a result. See [HTTP Datasources](/docs/dsl/datasources/).

## TransformStep

Expressions in `input`, `Concat.with`, and `Join.right` can read `/ports` and `/sources`. The preceding result becomes the left operand for each step.

| Kind | Fields | Behavior |
| --- | --- | --- |
| `Concat` | Required `with`, an array of expressions that each yield an array. | Appends all extra elements in order to the current array. Preserves duplicates. An empty `with` preserves the current array. |
| `Join` | Required `right` and nonempty `on` array of `{ "left": "field", "right": "field" }` pairs. Optional `mode` is `left` (default), `right`, or `inner`. | Joins arrays of object rows by top-level own fields. All pairs must match by value and type. Missing fields are errors, and null keys never match. |

Join keys can be strings, finite numbers, booleans, or null. Field names are literal, so a dot in a name stays a dot. A left or inner join follows left row order, with ties in right row order. A right join reverses that priority. On a field collision the right value wins. An unmatched row is copied without adding fields from the other side.

This QuerySpec produces `[{"id":"a","projectId":"a","open":true},{"id":"b"}]`. It needs no request executor because it has no HTTP sources.

```json title="join-query.json"
{
  "sources": {},
  "transform": {
    "input": [{ "id": "a" }, { "id": "b" }],
    "steps": [
      {
        "kind": "Join",
        "right": [{ "projectId": "a", "open": true }],
        "on": [{ "left": "id", "right": "projectId" }]
      }
    ]
  }
}
```

## QueryUse and QueryDefaults

A QueryUse belongs to a View or Component’s `queries` map. Use one of `queryRef` and `query`, and optionally supply `inputs`. Each map entry has its own lifetime even when another entry uses the same definition.

| Field | Default and scope |
| --- | --- |
| `refresh` | Boolean, default true for a new use. False excludes the use from polling and ordinary manual refresh. Initial execution and changes in valid inputs still run. |
| `intervalMs` | A new use with no interval has no polling. When present, use a positive safe integer number of milliseconds. |
| `executeWhen` | Strict boolean expression, default true. Gates automatic execution and explicit refresh or retry. |
| `autoRefreshWhen` | Strict boolean expression, default true. Gates polling only. |

`queryDefaults` allows only the static `refresh` and `intervalMs` fields. Use settings override the nearest Component defaults and then the View defaults field by field. The timer runs from completion, so polling does not stack concurrent runs. Reopening an eligible polling gate schedules a fresh run. `RefreshQuery` waits for a fresh run. If an execution is already active, refresh callers can share a single next execution for the latest inputs. The refresh may fail with `QUERY_REFRESH_DISABLED`, `EXECUTION_BLOCKED`, or an input or request error.

A retained Query use currently keeps its prior `refresh` or `intervalMs` when a View update omits that field and no inherited setting supplies it. A new View lifetime starts with the defaults described above.

## QuerySnapshot

Read the snapshot fields at `/queries/<name>/<field>`, or `/ports/<name>/<field>` on a connected Query port.

| Field | Meaning |
| --- | --- |
| `status` | `idle`, `waiting`, `running`, `success`, or `error`. |
| `data`, `dataInputs` | Last complete successful result and the Value input snapshot that produced it. Both are missing before the first success. |
| `error` | Public error from the current failure, or null. |
| `stale` | True when retained data is older than the current execution conditions, including after a failed refresh. |
| `waitingReason` | `INPUT_NOT_READY` or `EXECUTION_BLOCKED` while waiting, otherwise null. |

See [Queries and data](/docs/concepts/queries-and-data/) for a rendered example, [Action steps](/docs/dsl/actions/#steps) to invoke a Query explicitly, and [View API](/docs/core/view/) to refresh or retry from host code.
