# @viewstem/svelte

English | [한국어](README.ko.md)

Render Viewstem Views with Svelte components. Install `@viewstem/core` and `@viewstem/svelte` in a Svelte 5.57.3 or later 5.x app.

| Where the View belongs | Call |
| --- | --- |
| A new View in a separate DOM element | `renderer.mount({ target, source })` |
| An existing View in a separate DOM element | `renderer.attach(view, target)` |
| A standalone screen in an existing Svelte tree | `<ViewstemView {source} resourceSets={[ui]} />` |
| A new View in an existing Svelte tree | `<ViewstemView {renderer} {source} />` |
| An existing View in an existing Svelte tree | `<ViewstemView {renderer} {view} />` |

Place `ViewstemView` where the screen belongs in your Svelte app. The `source` form creates a View on the client and cleans it up on removal, including pending creation. Pass `inputs` for initial values and use `{#key}` to open a new screen. Supply `pending` and `prepareError` snippets for preparation states. The `view` form borrows an existing View.

For a standalone screen with `@viewstem/ui` installed, pass the set directly. The component owns client setup and cleanup.

```svelte
<script lang="ts">
  import { ViewstemView, type ViewSpec } from '@viewstem/svelte';
  import { ui } from '@viewstem/ui';

  const source: ViewSpec = {
    render: { id: 'save', componentRef: 'shadcn.Button', inputs: { text: 'Save' } },
  };
</script>

<ViewstemView {source} resourceSets={[ui]} />
```

See the [Svelte mounting guide](https://github.com/miinhlym/viewstem/blob/main/apps/docs/src/content/docs/docs/svelte/guides/mount-in-svelte.md#existing-app) for adding a page with a shared renderer to an existing app.

For the standalone example, add `<div id="panel"></div>` to your HTML and put this `Label.svelte` file next to your client entry point.

```svelte
<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  let { inputs, node }: ComponentAdapterProps = $props();
</script>

{#if node.status === 'ready' && typeof inputs.text === 'string'}
  <p>{inputs.text}</p>
{/if}
```

```ts
import { defineResourceSet } from '@viewstem/core';
import { createRenderer, svelteComponent, type ComponentContract, type ViewSpec } from '@viewstem/svelte';
import Label from './Label.svelte';

const contract = { kind: 'Component', id: 'Label', spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } } } satisfies ComponentContract;
const source = { states: { text: { kind: 'State', schema: { type: 'string' }, initial: 'Draft' } }, render: { id: 'label', componentRef: 'Label', inputs: { text: { '@path': '/states/text' } } } } satisfies ViewSpec;
const renderer = createRenderer();
renderer.runtime.registry.registerResourceSet(defineResourceSet({ id: 'labels', version: '1', components: [svelteComponent(contract, Label)] }));
const target = document.querySelector<HTMLElement>('#panel');
if (!target) throw new Error('Missing panel');
const screen = renderer.mount({ target, source });
const view = await screen.ready;
view.getState('text').write('Saved');
await screen.whenRendered();
console.log(target.textContent); // Saved
```

When the screen closes, call `await screen.unmount()`. When the app is done with the renderer, call `await renderer.dispose()`. If you also need the initial Query report, await `screen.whenSettled(view.initial)` and inspect `queryErrors`.

`createRenderer({ runtime })` borrows the Runtime. The app that owns it awaits `runtime.dispose()` after disposing the renderer. Create a binding with `svelteComponent(contract, Adapter)` and register the resource set with `renderer.runtime.registry.registerResourceSet(set)`. Call `detach()` to release a display.

## Svelte adapters

An adapter is a Svelte component that accepts the public `ComponentAdapterProps`.

| Prop | Meaning |
|---|---|
| `inputs` | Read-only inputs validated and evaluated by core. Includes Value inputs and explicitly passed State and Query handles. |
| `node` | The current `NodeSnapshot`, including address, generation, readiness status, errors, and named slots. |
| `emit(name, payload)` | Emits a core event for the current instance. Returns the actual Action result or rejects with a public error. |
| `renderSlot` | A `Snippet<[name: string]>`. Use `{@render renderSlot('body')}` to render a named slot. |
| `provideSlot(name, host)` | Register a DOM slot host. The returned callback withdraws the registration. |

The renderer passes `inputs` as a single prop without spreading the entries onto the DOM or mapping them to individual Svelte props. Write through an explicitly passed State handle or through `emit`. The renderer leaves button disabling based on external Action activity to the adapter.

A code-backed Component keeps the same adapter instance for its address and generation as readiness changes. Check `node.status` in the adapter to display pending, error, or missing states and to disable inputs as appropriate. Inputs may be incomplete in these states. `emit` checks the **core status at the moment of the call** and dispatches only when it is ready. Stale generations and detached connections reject with `CANCELLED`. The host adapter that implements an input is responsible for its IME handling, accessibility, and design.

Host adapters own layout and the DOM. Declarative `ViewstemView` and `renderSlot` use `display: contents` elements. Use `provideSlot` on a host element when you need direct DOM children. It renders the core-evaluated nodes for named slots in their original order and connects declarative Components to the subviews expanded by core. Keyed rendering preserves local Svelte state for visible repeated items with the same address and generation. Removing and recreating an item starts a new lifetime. If a declarative parent's unready inputs cause core to omit a child projection, the child Svelte view detaches and the internal state retained by core survives.

When hosting `ViewstemView` in your own Svelte root, configure `transformError` from this package on Svelte's `mount` or `hydrate`. It sanitizes arbitrary host-thrown values before they reach a boundary. A `fallback` snippet can render pending or failed nodes; a render failure rejects `screen.whenRendered()` and leaves the display connected. A live connection reports render failures to `onError` and can retry on a new projection.
