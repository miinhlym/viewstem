---
title: Registration API
description: The package root exports registerComponents and the ComponentSet type.
sidebar:
  order: 4
---

Import `registerComponents` and `ComponentSet` from `@viewstem/svelte-ui`.

```ts
import type { ComponentRegistration, Renderer } from '@viewstem/svelte';

interface ComponentSet {
  readonly id: string;
  readonly components: readonly ComponentRegistration[];
}

declare function registerComponents(renderer: Renderer, sets: readonly ComponentSet[]): void;
```

## `registerComponents(renderer, sets)`

Flattens the component registrations from the given sets and calls the renderer's batch registration method once. Each registration pairs a Component resource contract with its Svelte adapter. The method returns `void` and throws on invalid set shape, invalid contracts or adapters, conflicting Component IDs, or a disposed renderer. Failed validation leaves the batch unregistered.

Register the required IDs before the View captures its definitions at mount. Importing a set is sufficient to access its metadata. To render the IDs in a View, register it with that View's renderer.

## `ComponentSet`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Name for the set. Built-in sets use `shadcn/<family>`. |
| `components` | `readonly ComponentRegistration[]` | The pairs to register. Each has a `contract` and a `component`. |

Component IDs come from each registration's `contract.id`. The set ID does not prefix or rename them. This lets you group registrations under an application name.

```ts
import { createRenderer } from '@viewstem/svelte';
import { registerComponents, type ComponentSet } from '@viewstem/svelte-ui';
import { button } from '@viewstem/svelte-ui/shadcn/button';
import { dialog } from '@viewstem/svelte-ui/shadcn/dialog';

const settings: ComponentSet = {
  id: 'settings-ui',
  components: [...button.components, ...dialog.components],
};

const renderer = createRenderer();
registerComponents(renderer, [settings]);
```

For individual adapter definitions and the renderer's own registration methods, see [Svelte adapters](/docs/svelte/adapters/) and the [renderer API](/docs/svelte/renderer/).
