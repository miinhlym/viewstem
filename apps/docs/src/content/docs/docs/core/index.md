---
title: "@viewstem/core"
description: "Run Viewstem definitions without a browser or UI framework. Core validates resources, owns State and execution lifetimes, and produces snapshots for a renderer."
sidebar:
  order: 0
---

Run Viewstem definitions without a browser or UI framework. Core validates resources, owns State and execution lifetimes, and produces snapshots for a renderer.

## Choose an entry point

| Import | Use |
|---|---|
| `@viewstem/core` | Registry, StateStore, Runtime, View, URL merging, Grid placement |
| `@viewstem/core/http` | HTTP execution with transport, authorization and secret resolution |
| `@viewstem/core/cel` | Compile and evaluate synchronous CEL expressions |
| `@viewstem/core/cel-support.json` | Machine-readable supported CEL signatures |

Core is an ESM package and requires Node.js 22 or later when used in Node. See [Core installation](../installation/#install-core) for the npm command. Browser use is through an ESM-aware bundler. Core does not register UI components or draw a DOM tree.

## Use Core in an application

1. [Run and observe a View](./guides/runtime/): register a component contract, create a View, inspect its output, and release it.
2. [Share State and synchronize a URL](./guides/state-and-url/): create host-owned cells and connect an explicit URL adapter.
3. [Connect HTTP and code Actions](./guides/http-and-actions/): supply a request executor and invoke a host function through an Action contract.

For an application using Svelte, start with the [Svelte renderer](../svelte/). It creates or accepts the underlying Core runtime.

## Find an API

| Area | Reference |
|---|---|
| Definition registration and code Actions | [Registry](./registry/) |
| Host execution and permissions | [Runtime](./runtime/) |
| An executing screen and its snapshots | [View](./view/) |
| Host State, transactions, reactions and clocks | [StateStore](./state-store/) |
| URL adapters and ownership | [URL](./url/) |
| Network execution | [HTTP](./http/) |
| Expression evaluation | [CEL](./cel/) |
| Layout calculation | [Grid utility](./utilities/) |
| All public types and exports | [Public API index](./types/) |

`Registry`, `StateStore`, `Runtime` and `View` are types, not constructors. Obtain their objects from the factory functions. Keep issued handles intact; copying or fabricating an object does not create a valid capability. JSON definitions are documented in the [DSL reference](../dsl/).
