---
title: Resources and types
description: Register reusable resources and validate values with shared Types.
---

A **resource** is a named definition that the host registers for reuse. You have already used Component references; the same idea applies to queries, calculations, actions, and types. A resource definition is separate from the instances created when a screen runs.

## Know the resource kinds

| Kind | Defines |
|---|---|
| `View` | A screen entry point and its configuration. |
| `Component` | A reusable UI unit. |
| `Query` | Requests and result transformations. |
| `Datasource` | Connection settings and credential references. |
| `Variable` | A pure CEL calculation. |
| `Action` | An explicitly invoked operation. |
| `Type` | A reusable data schema. |

State and Derived belong to running View or Component instances. They are not additional independent resource kinds.

## Register a shared Type

A standalone resource has `kind`, `id`, and `spec`. Register this Type using `renderer.runtime.registry.registerResources([definition])` before mounting:


```json
{
  "kind": "Type",
  "id": "project-status",
  "spec": {
    "schema": {
      "type": "string",
      "enum": [
        "Draft",
        "Saved"
      ]
    }
  }
}
```


`project-status` is the reference ID. The schema accepts only **Draft** or **Saved**. An optional top-level `name` is a display label, not a reference key.

## Use a typeRef

This View applies the Type to two inputs. Mount it with `inputs: { title: "Saved", next: "Draft" }`.


```json
{
  "ports": {
    "title": {
      "kind": "Value",
      "typeRef": "project-status",
      "required": true
    },
    "next": {
      "kind": "Value",
      "typeRef": "project-status",
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


The badge shows **Saved**. Passing **Archived** to either port fails validation. A Type shares validation rules; it does not share the input values, convert them automatically, or choose a UI Component.

Use exactly one of `schema` and `typeRef` for a type contract. The `required` flag on a port controls whether that input is mandatory; JSON Schema’s own `required` array names required properties of an object value.

## Choose a reference or inline definition

Use `componentRef`, `queryRef`, `variableRef`, `actionRef`, `datasourceRef`, or `typeRef` to select the matching resource kind by ID. Registration uses `(kind, id)`: a Component and a Query may share an ID, but two Components may not.

For a definition used once, supply its inline body at the supported field, such as a render node’s `component` or a Query use’s `query`. Choose the reference or the inline definition, not both. Inline definitions still declare inputs explicitly.

## Separate definitions, instances, and storage

An existing View keeps the resource definitions supplied when it was applied. Updating the registry does not silently replace every running instance. The host explicitly applies updated definitions, and also decides when to persist them. Updating runtime State, editing a View, changing a shared resource, and saving to a database are different operations.

Try the accepted and rejected values in the [shared Type example](../../../examples/shared-type/).
