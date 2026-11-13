---
title: Resources
description: Look up the seven resource kinds, registration envelope, and reference and inline forms.
sidebar:
  order: 1
---

## Resource envelope

`Resource<K, S>` pairs a resource kind with the spec for that kind. `ResourceSpecs` maps kinds to specs and `AnyResource` is the union of the seven complete declarative definitions.

| Field | Contract |
| --- | --- |
| `kind` | Required. One of the seven case-sensitive `ResourceKind` names below. |
| `id` | Required nonempty string. The registry identifies a definition by `(kind, id)`. |
| `name` | Optional string for display. Labels may repeat and can change. |
| `spec` | Required object. Each kind defines its own fields. |

The envelope accepts those four fields. Definitions are JSON data, so functions, accessors, cycles, sparse arrays, `undefined`, and native JS collections cannot be embedded. Native implementations are registered separately with their JSON contracts. `RegisteredResource` also includes those registered Component contracts and code Action definitions.

| Kind | Spec |
| --- | --- |
| `Datasource` | [DatasourceSpec](/docs/dsl/datasources/) |
| `Query` | [QuerySpec](/docs/dsl/queries/#queryspec) |
| `Variable` | [VariableSpec](/docs/dsl/state-and-ports/#variablespec) |
| `Action` | [ActionSpec](/docs/dsl/actions/#actionspec) |
| `Component` | [ComponentSpec](/docs/dsl/view-and-component/#viewspec-and-componentspec) |
| `View` | [ViewSpec](/docs/dsl/view-and-component/#viewspec-and-componentspec) |
| `Type` | [Type spec](/docs/dsl/types/#type-resource) |

## References and inline bodies

Each row takes one of the two forms. A reference is a string ID of the indicated kind. An inline object contains the spec body. Fields belonging to the usage, such as a node's `id` or a source's `request`, stay outside that body.

| Usage | Reference | Inline field | Other usage fields |
| --- | --- | --- | --- |
| Host View target | `{ ref: id }` | `ViewSpec` | Host `inputs`, optional `url` configuration |
| Render or slot node | `componentRef` | `component` | `id`, `inputs`, `slots`, `on`, `when`, `repeat` where allowed |
| Query use or nested Query source | `queryRef` | `query` | `inputs`. Scheduling fields are available on Query uses. |
| HTTP source | `datasourceRef` | `datasource` | Required `request` |
| Derived declaration | `variableRef` | `variable` | `inputs` and the result type contract |
| Event Action call | `actionRef` | `action` | `inputs` and optional connection `id` |
| Action step invoking Query, Variable, or Action | `queryRef`, `variableRef`, or `actionRef` | `spec` | Step `kind`, `inputs`, optional step `id` |
| Type contract | `typeRef` | `schema` | Fields depend on the declaration that uses the contract. |

In this resource batch, the registry resolves the later Type while validating the Action. The Action returns the string `draft` when invoked without inputs.

```json title="resources.json"
[
  {
    "kind": "Action",
    "id": "status",
    "spec": {
      "steps": [],
      "output": { "typeRef": "status", "value": "draft" }
    }
  },
  {
    "kind": "Type",
    "id": "status",
    "name": "Project status",
    "spec": { "schema": { "enum": ["draft", "saved"] } }
  }
]
```

## Registration and instances

Register dependencies before use or in the same batch. The registry validates the batch together, including nested inline definitions, and rejects missing or wrong-kind references, duplicate IDs within a kind, and recursive inclusion or calls in the static definition graph. Registration validates definitions without running their Queries. The host can also provide a resource resolver when applying a View. See [Registry](/docs/core/registry/) and [Runtime](/docs/core/runtime/).

A definition ID selects reusable configuration. A node ID identifies a declaration within its authoring scope. A key distinguishes expanded instances of a repeated node. Several instances can use the same definition while owning separate state and Query results. Running Views use the definitions captured when they were applied. See [Resources and types](/docs/concepts/resources-and-types/) and [node identity](/docs/dsl/view-and-component/#node-identity).
