---
title: "Connect HTTP and code Actions"
description: "Inject an HTTP executor and expose an application function as a typed Action."
sidebar:
  order: 3
---

Inject an HTTP executor and expose an application function as a typed Action.

## Run a deterministic example

This Node example uses a local mock transport, so it performs no network requests. Save it as `http-action.mjs` in a project with Core installed and run it with Node.

```js title="http-action.mjs"
import { createRegistry, createRuntime } from '@viewstem/core';
import { createHttpExecutor } from '@viewstem/core/http';

const registry = createRegistry();
registry.registerComponentContract({ kind: 'Component', id: 'Empty', spec: {} });
registry.registerAction({
  kind: 'Action', id: 'label',
  spec: {
    ports: { name: { kind: 'Value', schema: { type: 'string' }, required: true } },
    output: { schema: { type: 'string' } },
  },
}, ({ inputs }) => `Hello, ${inputs.name}`);
const execute = createHttpExecutor({
  authorize: ({ destination }) => new URL(destination).origin === 'https://api.example.test',
  transport: async () => new Response(JSON.stringify({ title: 'Project' }), {
    headers: { 'content-type': 'application/json' },
  }),
});
const runtime = createRuntime({ registry, requestExecutor: execute });
const { view, initialComplete } = await runtime.createView({ view: {
  queries: { project: { query: {
    sources: { main: {
      datasource: { kind: 'Http', baseUrl: 'https://api.example.test' },
      request: { method: 'GET', path: '/projects/1' },
    } },
    transform: { input: { '@path': '/sources/main/title' } },
  } } },
  render: { id: 'empty', componentRef: 'Empty' },
} });
const report = await initialComplete;
console.log(report.queryErrors.length); // 0
console.log(view.getQuery('project').getSnapshot().data); // Project
console.log(await runtime.invokeAction({ owner: view, actionRef: 'label', inputs: { name: 'Viewstem' } }));
// Hello, Viewstem
runtime.dispose();
```

The Query transforms the response body into `Project`. The code Action receives prepared inputs and returns a schema-checked string. A code Action has a contract and a separate function; do not add `steps` or `output.value` to its declaration.

## Connect a real transport

Omit `transport` to use `fetch`. For authenticated requests, run secret resolution on a trusted server and supply an explicit destination `authorize` callback. A browser can forward a serialized `HttpExecutionPlan` to that server through `requestExecutor(plan, { signal })`; validate the plan and the actual caller on the server. `caller` is host context, not a value that an untrusted browser should be allowed to assert.

## Handle cancellation and errors

Use the Action handler's `signal` for cancellable work. `context.invokeAction()` creates a child call with the parent's cancellation and recursion context. A separate `runtime.invokeAction({ owner: view, ... })` is an independent call owned by that View. Cancellation prevents later State writes and Query refreshes but does not undo external effects already completed.

Inspect `initialComplete.queryErrors` for initial Query failures; catch the promise returned by `invokeAction` for Action failures. An invalid result schema fails with `TYPE_MISMATCH`; a denied destination fails with `EXECUTION_BLOCKED`.

See [Registry code Actions](../../registry/#code-actions), [Runtime](../../runtime/) and [HTTP](../../http/).
