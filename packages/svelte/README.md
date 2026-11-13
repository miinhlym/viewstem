# @viewstem/svelte

Render Viewstem Views with Svelte components. Install `@viewstem/core` and `@viewstem/svelte` in a Svelte 5.57.3 or later 5.x app.

| Where the View belongs | Call |
| --- | --- |
| A new View in a separate DOM element | `renderer.mount({ target, source })` |
| An existing View in a separate DOM element | `renderer.attach(view, target)` |
| A new View in an existing Svelte tree | `<ViewstemView {renderer} {source} />` |
| An existing View in an existing Svelte tree | `<ViewstemView {renderer} {view} />` |

Place `ViewstemView` where the screen belongs in your Svelte app. The `source` form creates a View on the client and cleans it up on removal, including pending creation. Pass `inputs` for initial values and use `{#key}` to open a new screen. Supply `pending` and `prepareError` snippets for preparation states. The `view` form borrows an existing View.

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
import { createRenderer, type ComponentContract, type ViewSpec } from '@viewstem/svelte';
import Label from './Label.svelte';

const contract = { kind: 'Component', id: 'Label', spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } } } satisfies ComponentContract;
const source = { states: { text: { kind: 'State', schema: { type: 'string' }, initial: 'Draft' } }, render: { id: 'label', componentRef: 'Label', inputs: { text: { '@path': '/states/text' } } } } satisfies ViewSpec;
const renderer = createRenderer({ components: [{ contract, component: Label }] });
const target = document.querySelector<HTMLElement>('#panel');
if (!target) throw new Error('Missing panel');
const screen = renderer.mount({ target, source });
const view = await screen.ready;
view.getState('text').write('Saved');
await screen.whenRendered();
console.log(target.textContent); // Saved
```

When the screen closes, call `await screen.unmount()`. When the app is done with the renderer, call `await renderer.dispose()`. If you also need the initial Query report, await `screen.whenSettled(view.initial)` and inspect `queryErrors`.

`createRenderer({ runtime })` borrows a Runtime. Call `renderer.bindComponent(id, component)` to bind a Svelte implementation to an existing code Component. Use the attachment's `detach()` to release its DOM connection. Removing a directly hosted `ViewstemView` from the Svelte tree releases its connection. The original owner manages the borrowed View and any injected Runtime.

## Svelte adapters

An adapter is a Svelte component that accepts the public `ComponentAdapterProps`.

| Prop | Meaning |
|---|---|
| `inputs` | Read-only inputs validated and evaluated by core. Includes Value inputs and explicitly passed State and Query handles. |
| `node` | The current `NodeSnapshot`, including address, generation, readiness status, errors, and named slots. |
| `emit(name, payload)` | Emits a core event for the current instance. Returns the actual Action result or rejects with a public error. |
| `renderSlot` | A `Snippet<[name: string]>`. Use `{@render renderSlot('body')}` to render a named slot. |

The renderer passes `inputs` as a single prop without spreading the entries onto the DOM or mapping them to individual Svelte props. Write through an explicitly passed State handle or through `emit`. The renderer leaves button disabling based on external Action activity to the adapter.

A code-backed Component keeps the same adapter instance for its address and generation as readiness changes. Check `node.status` in the adapter to display pending, error, or missing states and to disable inputs as appropriate. Inputs may be incomplete in these states. `emit` checks the **core status at the moment of the call** and dispatches only when it is ready. Stale generations and detached connections reject with `CANCELLED`. The host adapter that implements an input is responsible for its IME handling, accessibility, and design.

Host adapters own layout and the DOM. The renderer adds no implicit Row or Column layouts or wrapper elements. It renders the core-evaluated nodes for named slots in their original order and connects declarative Components to the subviews expanded by core. Keyed rendering preserves local Svelte state for visible repeated items with the same address and generation. Removing and recreating an item starts a new lifetime. If a declarative parent's unready inputs cause core to omit a child projection, the child Svelte view detaches and the internal state retained by core survives.

When hosting `ViewstemView` in your own Svelte root, configure `transformError` from this package on Svelte's `mount` or `hydrate`. It sanitizes arbitrary host-thrown values before they reach a boundary. A `fallback` snippet can render pending or failed nodes; an initial `mount()` render failure rejects `screen.ready` and releases the target. A live connection reports render failures to `onError` and can retry on a new projection.
