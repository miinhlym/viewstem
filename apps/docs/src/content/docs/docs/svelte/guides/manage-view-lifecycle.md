---
title: Update, replace, and dispose a View
description: Choose between editing a running View, starting a new lifetime, and releasing an attachment.
sidebar:
  order: 3
---

Mount a View with an internal State, change the definition while retaining that State, then replace the View to start with fresh State. This guide uses `Label.svelte` and `label.ts` from [Mount a View in a Svelte app](../mount-in-svelte/#define-label) and an HTML entry containing `<main id="app"></main>`.

Add the three blocks below to `main.ts` in order. Open the browser console to follow each DOM change.

First [prepare the example entry point](../mount-in-svelte/#prepare-entry) so `index.html` loads `/src/main.ts` and contains `id="app"`. The example below replaces your existing `src/main.ts`.

## 1. Mount and wait for the DOM

```ts
import { createRenderer, type ViewSpec } from '@viewstem/svelte';
import { label } from './label.js';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element.');

const renderer = createRenderer({ components: [label] });

const spec: ViewSpec = {
  states: {
    message: { kind: 'State', schema: { type: 'string' }, initial: 'New draft' },
  },
  render: {
    id: 'message',
    componentRef: 'Label',
    inputs: { text: { '@path': '/states/message' } },
  },
};
const mounted = renderer.mount({ target, source: spec });
const view = await mounted.ready;
console.log(target.textContent?.trim()); // New draft

view.getState('message').write('Saved draft');
await mounted.whenRendered();
console.log(target.textContent?.trim()); // Saved draft
```

`ready` returns the View after the first DOM update. Use `whenSettled(view.initial)` if you also need the eligible initial Query report and its DOM update. After a State write, `whenRendered()` waits for the DOM update. Query execution and browser paint run independently of that DOM wait.

## 2. Update the current View, then replace its lifetime

```ts
const editedSpec: ViewSpec = {
  ...spec,
  states: {
    message: { kind: 'State', schema: { type: 'string' }, initial: 'Fresh draft' },
  },
};

const updated = await view.updateDefinition(editedSpec);
await mounted.whenSettled(updated);
console.log(target.textContent?.trim()); // Saved draft

const replaced = await view.replace(editedSpec);
await mounted.whenSettled(replaced);
console.log(target.textContent?.trim()); // Fresh draft
```

Here `update` retains the compatible existing State. `replace` starts a new lifetime and initializes `message` from the new definition. After replacement, obtain State or Query handles again from `view`.

An invalid update or replacement rejects before core applies it. If the definition applies and a Svelte adapter then fails to render, the `whenSettled(application)` can reject after the core change. Handle these two awaits separately when your UI needs to distinguish these outcomes.

## 3. Release the DOM and the owned View

```ts
await mounted.unmount();
console.log(target.textContent?.trim()); // Empty string
await renderer.dispose();
```

Await attachment disposal before reusing the same target. If you render an existing View with [`renderer.attach`](../../renderer/#attach) or [`ViewstemView`](../../viewstem-view/), the host that created the View handles its disposal. See [the handle reference](../../mounted-view/) for generation-specific completion and the lifetime of borrowed and owned Views.
