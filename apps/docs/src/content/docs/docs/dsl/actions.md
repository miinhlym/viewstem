---
title: Actions
description: Define declarative steps and outputs, bind events, and distinguish registered code Actions.
sidebar:
  order: 7
---

## ActionSpec

| Field | Contract |
| --- | --- |
| `ports` | Optional map of Value, State, and Query ports. |
| `steps` | Required array of steps in execution order. It can be empty. |
| `output` | Optional object containing exactly one type contract field (`schema` or `typeRef`) and required `value` expression. |

Value inputs are snapshotted at invocation. State and Query inputs capture the connected targets. Input preparation failure executes zero steps. The runtime stops at the first failed step or output validation. Earlier State writes and external effects remain in place. Omit `output` for a void Action. A declared result may be null or false if the contract allows it.

## Steps

Every `Step` has a `kind` and can have a nonempty local `id`. IDs are unique within the step array. `/steps/<id>` reads the actual result of a prior Query, Variable, or Action step with output. The branch of an `If` can read completed outer results, and its own results stay in that branch. Future, absent, and void results are unavailable.

| Kind | Fields and result |
| --- | --- |
| `Query` | One of `queryRef` and inline `spec`, optional `inputs`. Returns the transformed result of an explicit execution. |
| `Variable` | One of `variableRef` and inline `spec`, optional `inputs`. Returns the CEL result. |
| `Action` | One of `actionRef` and inline `spec`, optional `inputs`. A child State or Query port is connected through the corresponding parent port. A declared child output supplies the result. |
| `SetState` | Required State `target` and `value`. Replaces the entire target value after validation. |
| `RefreshQuery` | Required Query `target`. Waits for a fresh execution of that existing Query use with its current inputs. |
| `If` | Required strict boolean `condition` and `then` step array. Optional `else` step array. Only the selected branch runs. |
| `Assert` | Required strict boolean `condition` and optional `message` expression. On false the message is evaluated as a string and the Action fails with `ASSERTION_FAILED`. The default message is `Assertion failed`. |

Targets are exact `{"@path":"/ports/<name>"}` objects. A SetState target must name a State port and a RefreshQuery target must name a Query port. For `Assert`, a nonstring message on the failure branch is a type error. `SetState`, `RefreshQuery`, `If`, and `Assert` do not produce step results.

This registered Action takes a required string, rejects the empty string, and returns a formatted result.

```json title="label-action.json"
{
  "kind": "Action",
  "id": "project-label",
  "spec": {
    "ports": { "project": { "kind": "Value", "required": true, "schema": { "type": "string" } } },
    "steps": [
      {
        "kind": "Variable",
        "id": "hasName",
        "spec": {
          "ports": { "name": { "kind": "Value", "required": true, "schema": { "type": "string" } } },
          "expression": "size(name) > 0"
        },
        "inputs": { "name": { "@path": "/ports/project" } }
      },
      { "kind": "Assert", "condition": { "@path": "/steps/hasName" }, "message": "Project is required" }
    ],
    "output": {
      "schema": { "type": "string" },
      "value": { "@call": "concat", "args": ["Project ", { "@path": "/ports/project" }] }
    }
  }
}
```

## ActionCall

Under a node’s `on.<event>`, an ActionCall has one of `actionRef` and inline `action`, plus optional `inputs` and `id`. Input expressions may read the event payload at `/event`. The Action itself reads only its ports and completed steps. The alternative `emit` and `payload` binding forwards a Component event. See [Slots and events](/docs/dsl/view-and-component/#slots-and-events).

If an ActionCall has an `id`, it must be unique among active call connections in the authoring instance. Read `/actions/<id>` for the ActionSnapshot.

| Field | Meaning |
| --- | --- |
| `status` | `idle`, `running`, `success`, or `error`. |
| `running` | True while the call is running. |
| `data` | Result on success with output, otherwise null. Cleared on a new execution. |
| `error` | Public error on failure, otherwise null. Cleared on a new execution. |

An active connection ignores extra invocations until it settles, even without an observation ID. Removing the connection or its owner cancels unfinished work and discards late results. A recreated connection has a new lifetime. See [Events and actions](/docs/concepts/events-and-actions/).

## Code Action definitions

A `CodeActionDefinition` uses the same Action envelope and a `CodeActionSpec` with optional `ports` and `output`. Its `output` declares the type only. The spec has no `steps` or `output.value`. The registered handler supplies the value, and a handler for a void definition returns undefined. A code Action is called through `actionRef`. Register its implementation with the [Registry](/docs/core/registry/) and see the [Runtime API](/docs/core/runtime/) for explicit host invocation and code handler context.
