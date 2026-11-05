---
title: DSL reference
description: Field definitions, value syntax, and execution rules for Viewstem resource authors.
sidebar:
  order: 0
---

Use this reference when writing or reviewing Viewstem JSON. The field names and defaults describe the shapes accepted by the current core. A complete resource has a registration envelope. An inline definition supplies just the body expected by its enclosing field.

| To look up | Reference |
| --- | --- |
| Resource kinds, IDs, and which fields take references | [Resources](/docs/dsl/resources/) |
| Literals, path expressions, calls, and evaluation scopes | [Value expressions](/docs/dsl/values/) |
| View and Component specs, nodes, slots, events, and repetition | [View and Component](/docs/dsl/view-and-component/) |
| State, Derived, Variable, reactions, and input ports | [State and ports](/docs/dsl/state-and-ports/) |
| Query definitions, sources, transforms, and scheduling | [Queries](/docs/dsl/queries/) |
| HTTP requests, shared settings, secrets, and Login | [HTTP Datasources](/docs/dsl/datasources/) |
| Action definitions, steps, outputs, and event connections | [Actions](/docs/dsl/actions/) |
| Schema keywords, Type references, and native values | [Types and schemas](/docs/dsl/types/) |

For a first View, follow the [Quickstart](/docs/quickstart/). For the TypeScript methods that register these definitions and run a screen, see the [Core API](/docs/core/).
