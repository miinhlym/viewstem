---
title: "Run and observe a View"
description: "Create a headless View, change its State and observe its projected output."
sidebar:
  order: 1
---

Create a headless View, change its State and observe its projected output.

## Prepare

Install the local Core package using [Installation](../../../installation/). Save the following as `run-view.mjs` in the consuming project and run `node run-view.mjs`. No DOM or Svelte component is needed.

## Register, execute and observe

```js title="run-view.mjs"
import { createRegistry, createRuntime } from '@viewstem/core';

const registry = createRegistry();
registry.registerComponentContract({
  kind: 'Component', id: 'Label',
  spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } },
});
const runtime = createRuntime({ registry });
const { view, initialComplete } = await runtime.createView({ view: {
  states: { title: { kind: 'State', schema: { type: 'string' }, initial: 'Hello' } },
  render: { id: 'label', componentRef: 'Label', inputs: { text: { '@path': '/states/title' } } },
} });
await initialComplete;
console.log(view.getSnapshot().roots[0].inputs.text); // Hello
const observed = new Promise(resolve => {
  view.subscribe(snapshot => {
    if (snapshot.roots[0]?.inputs.text === 'Updated') resolve('Updated');
  });
});
view.getState('title').write('Updated');
console.log(await observed); // Updated
runtime.dispose();
```

The component contract tells Core that `Label` accepts a required string. A renderer supplies the actual UI implementation; this example inspects the projection instead. The `Hello` and `Updated` log entries confirm that the same State value reaches the node input. `view.subscribe()` emits the current snapshot immediately and returns an unsubscribe function. This short example ends all subscriptions by disposing the runtime; use that returned function to stop an individual observer earlier.

## Change an existing definition

Use `view.update(nextSpec)` for the current View while retaining compatible State and node lifetimes. Use `view.replace({ view: nextSpec })` to start a new lifetime and inject current registry definitions. Both return an object with a fresh `initialComplete` promise. Changing `registry.updateResource()` alone does not change existing Views.

## Diagnose a failure

- `REFERENCE_NOT_FOUND`: register each referenced contract or resource before creating the View.
- `TYPE_MISMATCH`: check the supplied value against the declared port or State schema.
- `initialComplete` resolves with `queryErrors`: inspect those entries; completion does not mean every Query succeeded and does not mean DOM paint finished.

See [Registry](../../registry/), [Runtime](../../runtime/) and [View](../../view/) for exact methods and ownership rules.
