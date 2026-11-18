---
title: Component adapters
description: Reference for adapter props, code Component registration, slots, readiness, and event dispatch.
sidebar:
  order: 3
---

Import `ComponentAdapter` and `ComponentAdapterProps` from `@viewstem/svelte` and `ComponentBinding` from `@viewstem/core`. [Write an adapter with a slot and an event](../guides/write-an-adapter/) has a complete Svelte example.

## ComponentAdapter

**Type** · `Component<ComponentAdapterProps<Contract>>` with an optional contract type

An adapter is a Svelte component that renders one code-backed Component instance. Use `ComponentAdapterProps` to type its `$props()`. The host adapter owns its elements, layout, accessibility, input interactions, and IME behavior. The renderer supplies the node and preserves core's order of slot content.

For a specific contract, declare it with `as const satisfies ComponentContract`, use `ComponentAdapterProps<typeof contract>` in the adapter, and pass that same contract to `svelteComponent(contract, Adapter)`. TypeScript checks that the adapter accepts the inputs described by the registration contract. A reusable adapter can use `ComponentAdapterProps` without a type argument. [Mixed counter example](../guides/mount-in-svelte/#mix-default-ui)

## ComponentAdapterProps

| Prop | Type | Meaning |
| --- | --- | --- |
| `inputs` | `NodeSnapshot['inputs']` | Read-only, evaluated inputs. Includes Value inputs and explicitly passed State and Query handles. Read inputs by name from this one object. |
| `node` | `NodeSnapshot`, with contract-specific inputs when typed | The current core projection with status, errors, identity, and named slots. Read `node.inputs` to narrow inputs by status. |
| `emit` | `(event: string, payload: unknown) => Promise<unknown>` | Send an event from this node and receive the actual Action result. |
| `renderSlot` | `Snippet<[name: string]>` | Render the ordered children for a named slot. |

The props are read-only. Write through an explicitly passed State handle or dispatch an event. Choose which inputs, if any, to use as DOM attributes.

### Readiness and identity

`node.status` can be `ready`, `pending`, `error`, or `missing`. Inputs can be incomplete outside `ready`. Render the status and disable controls as appropriate. The adapter also controls whether Action activity should disable interaction.

In a typed adapter, a required `Value` is available in the `ready` branch. Optional values can still be absent. While `pending`, the input can be absent on first display or retain the last displayed value on an existing instance. Use `node.status` to determine readiness. State and Query ports carry handles, and a State handle's `read()` can return `undefined`. Inline literal schemas supply the inferred types. Registry-resolved `typeRef` values have type `unknown` and are validated at runtime.

A visible code-backed node keeps its Svelte adapter instance across readiness changes when address and generation stay the same. Keyed repeats preserve Svelte state across reordering. Removing and recreating a node starts a new lifetime. If core temporarily omits a child projection while a declarative parent's inputs are unready, that child's Svelte instance detaches. Core can retain the child's internal State across that omission.

### emit

Call `emit('reveal', null)` when the contract declares `reveal` with a null payload. Core validates the event and payload and dispatches the View's handler. The promise preserves the actual Action result, including `false`, `null`, or `undefined`. A valid event with no handler resolves to `undefined`.

The call checks current core readiness even if Svelte is still applying a DOM update. An existing unready node rejects with `INPUT_NOT_READY`. A detached connection, disposed View, removed node, or stale node generation rejects with `CANCELLED`. Core event and Action errors also reject the original promise. See [event diagnostics](../errors/#failure-and-recovery).

### renderSlot

Call the snippet with the contract's slot name, for example `{@render renderSlot('body')}`. An empty or absent slot renders no children. Core evaluates slot children in the context of the author that supplied them. The Svelte adapter decides where to render them in its markup.

## ComponentBinding

The binding created by `svelteComponent()` has the connector ID `svelte`.

| Field | Type | Meaning |
| --- | --- | --- |
| `readonly contract` | `ComponentContract` | A core resource with `kind: 'Component'`, an `id`, and a public `spec` declaring ports, slots, and events. |
| `readonly implementation` | `ComponentAdapter<Contract>` | The Svelte implementation checked against the supplied contract. |

Create a binding with `svelteComponent(contract, Adapter)` and register the resource set with `renderer.runtime.registry.registerResourceSet(set)`.
