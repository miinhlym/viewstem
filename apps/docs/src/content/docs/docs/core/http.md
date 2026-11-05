---
title: "HTTP executor"
description: "Execute a versioned HTTP plan with explicit transport, timeout and host authorization."
sidebar:
  order: 15
---

Execute a versioned HTTP plan with explicit transport, timeout and host authorization.

```ts
import { createHttpExecutor } from '@viewstem/core/http';
import type { HttpExecutorOptions, HttpExecutionPlan, HttpResponse, RequestExecutor } from '@viewstem/core/http';
```

## createHttpExecutor(options?)

Returns `(plan: HttpExecutionPlan, context?: { signal?: AbortSignal }) => Promise<HttpResponse>`. It can be supplied as a Runtime `requestExecutor`.

| HttpExecutorOptions | Type / default | Behavior |
|---|---|---|
| `transport` | `typeof fetch`, global `fetch` | Receives evaluated URL and request options. |
| `requestTimeoutMs` | Positive safe integer, 30000 | One deadline covers authorization, secret resolution, Login and the request. |
| `caller` | `unknown`, undefined | Trusted host identity/context passed to authorization and secret resolution. |
| `authorize` | `({ caller, destination }) => Awaitable<boolean>`, public requests allowed if absent | Checks the destination before secret use and again after query parameter evaluation. Secret/Login plans require this callback. |
| `resolveSecret` | `(reference, { caller, destination, signal }) => Awaitable<string>` | Resolve a named secret reference; default rejects with `EXECUTION_BLOCKED`. Keep this on a trusted server. |
| `clock` | `{ now(): number, set(callback, milliseconds): unknown, clear(token): void }` | Deadline clock; defaults to performance time and system timers. Its method names differ from Runtime's `TimerClock`. |

The execution context's optional signal aborts the whole operation. Custom transports/resolvers receive cancellation signals; they should stop their own work. An abort or deadline rejects with `CANCELLED` or `TIMEOUT`.

## HttpExecutionPlan

| Field | Required value |
|---|---|
| `version` | Literal `1` |
| `requestId` | Request identifier string |
| `datasource` | `DatasourceSpec` with `kind: 'Http'` |
| `request` | `HttpRequest` with method/path and optional overrides |
| `inputs` | Readonly record of JSON-safe input values |

A `RequestExecutor` receives `(plan, { signal: AbortSignal })` and may return an `HttpResponse` synchronously or asynchronously. This is the host boundary for remote execution; do not treat a client-provided plan as permission to contact any destination. Runtime converts supported native collections into the transport representation before this boundary.

## Response and request behavior

`HttpResponse` contains `status: number`, `headers: Readonly<Record<string, string>>` and `body: JsonValue`. Query source expressions read the response body, while Login token extraction can read the response envelope.

The built-in executor accepts GET, HEAD, POST, PUT, PATCH, DELETE and OPTIONS. It sends `credentials: 'omit'` and `redirect: 'manual'`. Non-2xx status, invalid JSON, unsupported response content types or invalid Login tokens reject with `HTTP_ERROR`. JSON media types are parsed as JSON, `text/*` as text; HEAD/204/205 produce `null` bodies. Header and parameter merge rules, body expressions and Login fields are described in [DSL Datasources](../../dsl/datasources/).

## Example

```js title="http-executor.mjs"
import { createHttpExecutor } from '@viewstem/core/http';
const execute = createHttpExecutor({
  transport: async () => new Response('{"ok":true}', {
    headers: { 'content-type': 'application/json' },
  }),
});
const response = await execute({
  version: 1, requestId: 'example', inputs: {},
  datasource: { kind: 'Http', baseUrl: 'https://example.test' },
  request: { method: 'GET', path: '/health' },
});
console.log(response.body); // { ok: true }
```

This example mocks transport and does not make a network request. Follow [Connect HTTP and code Actions](../guides/http-and-actions/) to connect it to a Query.
