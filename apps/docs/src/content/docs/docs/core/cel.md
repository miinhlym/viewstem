---
title: "CEL evaluation"
description: "Compile or evaluate pure synchronous CEL expressions through the optional CEL entry point."
sidebar:
  order: 16
---

Compile or evaluate pure synchronous CEL expressions through the optional CEL entry point.

```ts
import { compileCel, evaluateCel, defaultCelLimits } from '@viewstem/core/cel';
import type { CelOptions, CelLimits, CelFunction, CelValue } from '@viewstem/core/cel';
```

## Functions

- `compileCel(expression: string, options?: CelOptions): (bindings?: Record<string, unknown>) => unknown` validates schemas and compiles once; call the returned function repeatedly with new bindings.
- `evaluateCel(expression: string, bindings: Record<string, unknown>, options?: CelOptions): unknown` compiles and evaluates in one call.
- `defaultCelLimits: CelLimits` is a frozen object of default limits below.

```js title="cel-evaluation.mjs"
import { compileCel, evaluateCel } from '@viewstem/core/cel';
const options = { inputs: { count: { type: 'integer' } }, output: { type: 'integer' } };
const increment = compileCel('count + 1', options);
console.log(increment({ count: 2 })); // 3
console.log(evaluateCel('count + 1', { count: 4 }, options)); // 5
```

## CelOptions

| Field | Default | Contract |
|---|---|---|
| `inputs` | `{}` | Binding name → supported `Schema`. Evaluation must supply exactly these binding names. |
| `output` | `true` | Schema validating the returned value. |
| `functions` | `[]` | Readonly list of trusted `CelFunction` definitions. |
| `limits` | Defaults below | Partial positive safe-integer overrides of `CelLimits`. |
| `cost` | 100000 | Positive safe-integer evaluation cost budget. |

The compiler also enforces an AST node ceiling of 10000. Compile/evaluation errors are thrown synchronously. Invalid budgets use `INVALID_LIMIT`; exceeding graph/string limits uses `LIMIT_EXCEEDED`. CEL's own expression/type diagnostics can also be thrown; when invoked through a View, the runtime converts them to public diagnostics.

## CelLimits

| Field | Default | Meaning |
|---|---:|---|
| `expressionChars` | 65536 | Maximum expression string length |
| `inputNodes` | 20000 | Traversed input graph nodes |
| `outputNodes` | 20000 | Traversed output graph nodes |
| `valueBytes` | 262144 | UTF-8 value/key string bytes |
| `depth` | 64 | Maximum nested value/expression depth |

## CelFunction and CelValue

A function is `{ name, inputs: Schema[], output: Schema, run }`. Names match `[A-Za-z_][A-Za-z0-9_]*` and must not collide with built-ins or other registered functions. `run(...args)` is synchronous and pure, receives deeply readonly schema-validated arguments, and returns a schema-validated `CelValue`. Explicit generic argument tuples let TypeScript type each argument. Promises are not allowed. Limits do not sandbox arbitrary host callbacks or impose an execution-time limit on their JavaScript.

`CelValue` includes null, booleans, finite numbers, strings, readonly arrays/objects, readonly Sets and readonly Maps with string/number keys. Core schema profiles determine the admitted forms. A general `number` is CEL double; an `integer` must be a safe integer at the JavaScript boundary. Explicit date/time schemas use declared strings and timezone rules.

## Supported language

The package ships `@viewstem/core/cel-support.json`, containing its exact supported signatures. It does not claim all CEL features: bytes, uint, type, optional and cel.bind are not supported. Resource expressions run CEL through Variable definitions; do not import internal expression engines to bypass validation. See [DSL values](../../dsl/values/) and [types](../../dsl/types/).
