---
title: Types and schemas
description: Look up Type resources, the supported schema vocabulary, and native value contracts.
sidebar:
  order: 8
---

## Examples by form

Each link opens runnable JSON with its required resources, inputs, and expected result. This table locates forms; the reference below defines required fields and constraints.

| Form | Key fields | Runnable example |
| --- | --- | --- |
| Type reference | `typeRef`, `schema`, `enum` | [Open example](/examples/shared-type/) |

## Standalone resource example

This standalone resource can be reused as `typeRef: "project-name"` in a type contract.

```json title="type-resource.json"
{
  "kind": "Type",
  "id": "project-name",
  "spec": {
    "schema": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

## Type resource

A Type resource has `kind: "Type"` and a spec with one required field, `schema`. Reuse it through a `typeRef` string containing its resource ID. A `TypeContract` takes exactly one of `schema` and `typeRef`. It applies to Value and State ports, State and Derived declarations, event payloads, and Action outputs.

This Type accepts an object with a required name and an optional due date. A contract using `{ "typeRef": "project" }` accepts `{ "name": "Plan", "due": "2026-11-05" }`.

```json title="project-type.json"
{
  "kind": "Type",
  "id": "project",
  "spec": {
    "schema": {
      "$defs": { "dueDate": { "x-viewstem-type": "date" } },
      "type": "object",
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "due": { "$ref": "#/$defs/dueDate" }
      },
      "required": ["name"],
      "additionalProperties": false
    }
  }
}
```

## Schema field forms

These fields apply to `Type.spec.schema` and to other contracts accepting `schema`. Keywords apply to the relevant value type. A type contract cannot contain both `schema` and `typeRef`.

| Keyword | Value form | Meaning and constraints |
| --- | --- | --- |
| `$schema` | string | If supplied, only `https://json-schema.org/draft/2020-12/schema` is accepted. |
| `type` | string or string array | Accepted types among `null`, `boolean`, `object`, `array`, `number`, `integer`, and `string`. Cannot share an object with `x-viewstem-type`. |
| `enum`, `const` | array of JSON values / JSON value | Allowed values or one required value; arrays and objects are compared as values. |
| `allOf`, `anyOf`, `oneOf` | non-empty schema array | Require all, at least one, or exactly one branch respectively. |
| `not`, `if`, `then`, `else` | schema | Reject a match for `not`; apply `then` or `else` according to `if`. |
| `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` | number | Inclusive or exclusive numeric bounds. |
| `minLength`, `maxLength`, `pattern` | non-negative integer / regular-expression string | Bound string length or match a valid Unicode regular expression. |
| `properties`, `required`, `additionalProperties` | map of schemas / string array / schema | Define object properties, required names, and the contract for other properties. A boolean is also a schema. |
| `minProperties`, `maxProperties` | non-negative integer | Bounds on object property count. |
| `items`, `prefixItems`, `minItems`, `maxItems`, `uniqueItems` | schema / non-empty schema array / non-negative integer / boolean | Define array items and positional contracts, length, and uniqueness. |
| `$defs`, `$ref` | map of schemas / local pointer string | Reuse a definition within the same schema; external and cyclic references are unsupported. |
| `title`, `description`, `default`, `examples`, `readOnly`, `writeOnly`, `deprecated`, `$comment` | JSON Schema annotations | Metadata. `default` does not set a port default or State initial value. |
| `x-viewstem-type`, `keys`, `values` | native type name / schemas | Follow the native value rules below. `keys` and `values` are only allowed for Map schemas. |

The schema `true` accepts every value; `false` accepts none. Registration rejects unsupported keywords and invalid schemas. Size and nesting limits apply to schema validation.

## Schema vocabulary

`Schema` is a boolean or an object. Core uses this subset of JSON Schema 2020-12. If you specify `$schema`, the accepted URI is `https://json-schema.org/draft/2020-12/schema`.

| Area | Supported keywords |
| --- | --- |
| Base and composition | `type`, `enum`, `const`, `allOf`, `anyOf`, `oneOf`, `not`, `if`, `then`, `else` |
| Numbers | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` |
| Strings | `minLength`, `maxLength`, `pattern` |
| Objects | `properties`, `required`, `additionalProperties`, `minProperties`, `maxProperties` |
| Arrays | `items`, `prefixItems`, `minItems`, `maxItems`, `uniqueItems` |
| Local reuse | `$defs` and acyclic `$ref` pointers beginning with `#/` in the same schema |
| Annotations | `title`, `description`, `default`, `examples`, `readOnly`, `writeOnly`, `deprecated`, `$comment` |
| Native extensions | `x-viewstem-type` and the `keys`, `values` fields for Map |

Registration rejects unsupported keywords such as `format`, `multipleOf`, and `contains`, along with remote and recursive references. Validation checks input types without coercion or property removal. Schema annotations supply metadata. To initialize State use `initial`, and to default an omitted Value input use the port’s `default`. A schema’s `required` lists object properties. A port’s `required` governs input presence.

## Native values

Use `x-viewstem-type` without `type` in the same schema object. To allow null, combine with `{ "type": "null" }` using `anyOf`.

| Type | Accepted value and schema fields |
| --- | --- |
| `set` | Native JS Set. Requires `items`; accepts `minItems` and `maxItems`. |
| `map` | Native JS Map with string or finite number keys. Requires `keys` and `values`; accepts `minItems` and `maxItems`. |
| `date` | Calendar string `YYYY-MM-DD`, validated without a time zone. |
| `time` | Local time string `HH:mm` with optional seconds and 1–3 fractional digits after the seconds. Normalized to `HH:mm:ss.SSS`. |
| `datetime` | Instant string with `YYYY-MM-DDTHH:mm:ss`, optional 1–3 fractional digits, and required `Z` or `±HH:mm`. Normalized to UTC with millisecond precision. |

Dates use Gregorian years 0001–9999. The datetime form rejects unknown offset `-00:00`, and date and time forms reject invalid calendar and clock values. For example, `2026-11-05T09:30:00+09:00` normalizes to `2026-11-05T00:30:00.000Z`. At a single value location, all schema branches that accept strings must agree on date normalization. Author date constants and enum values in canonical form. A Map is rejected if normalization would collapse distinct keys.

Native Set and Map values can enter through host inputs and typed calculations. Arrays in JSON stay arrays. The HTTP plan encodes Sets as arrays and Maps as arrays of pairs. State and port values require finite numbers and `integer` uses the safe JS integer range. Core normalizes negative zero to zero and omits undefined object properties. Top-level undefined, sparse arrays, undefined collection entries, cycles, and unsupported object types fail at the value boundary.

See [Core types](/docs/core/types/) for JS declarations and [Resources and types](/docs/concepts/resources-and-types/) for an example of sharing a Type across ports.
