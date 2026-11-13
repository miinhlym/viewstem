---
title: "Registry"
description: "Register and validate reusable definitions and host implementations before creating a View."
sidebar:
  order: 10
---

Register and validate reusable definitions and host implementations before creating a View.

```ts
import { createRegistry } from '@viewstem/core';
import type { Registry, AnyResource, ComponentContract, CodeActionDefinition } from '@viewstem/core';
```

## createRegistry

`createRegistry(options?) → Registry` accepts either an `AnyResource[]` or `{ resources?: AnyResource[], componentContracts?: ComponentContract[], functions?: CelFunction[] }`. Both lists default to empty. Resources are JSON declarations; custom CEL functions are trusted synchronous functions registered separately. Resource identity is the pair `(kind, id)`, so different kinds can share an ID. IDs must be nonempty strings.

## Registration methods

| Method | Parameters and result | Behavior |
|---|---|---|
| `registerResources(resources)` | Readonly `AnyResource[]`; returns this Registry | Validate and register a batch atomically, including references within that batch. Duplicate identities reject the whole batch. |
| `registerComponentContract(contract)` | `ComponentContract`; returns this Registry | Register a code-backed Component's ports, slots and events. Does not supply rendering or accept a `render` tree. |
| `registerComponentContracts(contracts)` | Readonly `ComponentContract[]`; returns this Registry | Atomic batch form; does not overwrite an existing identity. |
| `registerAction(definition, implementation)` | Code Action contract and `ActionHandler`; returns this Registry | Register a host function under an Action ID. See below. |
| `updateResource(definition)` | `RegisteredResource`; returns this Registry | Validate the replacement and its dependencies before committing. Code Actions keep their registered input and output contracts. |

Registration rejects malformed fields, unsupported schemas and invalid references. Validation errors are public diagnostics such as `INVALID_DEFINITION`, `REFERENCE_NOT_FOUND` or `TYPE_CONTRACT_MISMATCH`; inspect `code` rather than parsing `message`. A failed update preserves the previous registry. Definitions are copied at entry: mutating the original object later has no effect.

## Read and export

| Method | Result | Semantics |
|---|---|---|
| `get(kind, id)` | Deeply readonly registered resource | Throws `REFERENCE_NOT_FOUND` for a missing identity. |
| `list(filter?)` | `RegisteredResource[]` copies | No filter lists all; a kind string selects that kind; a partial `{ kind, id, name }` matches fields; a predicate receives the readonly resource. |
| `exportResource(kind, id)` | Detached resource declaration | Suitable for editing or serialization. Does not include host implementation functions or live State. |
| `isCode(kind, id)` | `boolean` | Whether the identity was registered as a code Component or Action. |

An existing View uses the definitions injected into its current lifetime. Registering or updating a shared definition does not hot-swap it into that View. Use a new View or [View.replace](../view/#replace) to inject the current registry. Use `view.updateDefinition()` to change one executing View's own definition.

## Code Actions

```ts
registry.registerAction({
  kind: 'Action', id: 'greet',
  spec: {
    ports: { name: { kind: 'Value', schema: { type: 'string' }, required: true } },
    output: { schema: { type: 'string' } },
  },
}, ({ inputs, signal }) => `Hello, ${inputs.name}`);
```

TypeScript infers inputs from literal port declarations and the output from its schema. Declare `required: true` for inputs the handler expects on every call. Optional ports, including ports with a `default`, can be absent from `inputs`. The default applies only when the caller omits the key. A binding with a missing value leaves an optional input absent.

Use `registerAction<Inputs, Output>(definition, implementation)` for application types such as a referenced `Type` or a Query result. Each required property of `Inputs` must have a port of the right kind with `required: true`. Use named properties for the port list. Put dynamic keys inside a Value port. When specifying value types explicitly, make sure they match the actual schemas. The runtime validates against the registered schemas.

| Public type | Contract |
|---|---|
| `CodeActionDefinition<I, O = void>` | Resource envelope with `kind: 'Action'` and `CodeActionSpec<I, O>`. |
| `CodeActionSpec<I, O>` | A port map is required when `I` has required properties. Each of those ports must set `required: true`. Non-void output requires `schema` or `typeRef`. |
| `ActionHandler<I, O = void>` | Receives `ActionContext<I>`; returns `O` or `Promise<O>`, or `void`/`Promise<void>` for a void contract. |
| `ActionContext<I>` | Readonly `inputs`, cancellation `signal: AbortSignal`, and `invokeAction(request): Promise<unknown>`. |
| `ChildActionRequest` | Exactly one of `actionRef` and inline `action`, optional native `inputs`. Does not accept `owner` or `id`; inherits the parent's lifetime and recursion context. |

State and Query ports receive issued handles. A pure value input is isolated and deeply readonly. Child calls still pass permission checks. Return values are schema-checked; ending or cancelling the parent cancels unfinished child calls. Already completed effects are not rolled back.

For a complete runnable example, see [Connect HTTP and code Actions](../guides/http-and-actions/). Resource envelopes and declarative Actions are described in [DSL resources](../../dsl/resources/) and [DSL Actions](../../dsl/actions/).

### Updating a code Action

You can update the display name while keeping the Action ID. Changes to the ports, their order or defaults, or the resolved input or output schemas fail with `TYPE_CONTRACT_MISMATCH`. This also applies when updating a `Type` used by a code Action. Check `error.resource` for the affected Action and `error.location` for the path to the changed field.

To change the contract, register a new Action ID with its handler. If a shared Type needs a different schema, register it under a new Type ID first. Update the call inputs and `actionRef`, then create a new View or apply the configuration with `view.replace()`. If a code Action calls the old ID directly, register the updated caller under a new ID and update its references too.
