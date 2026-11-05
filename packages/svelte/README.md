# @viewstem/svelte

English | [한국어](README.ko.md)

Viewstem is [MIT licensed](LICENSE).

This client-side renderer connects Viewstem core's view projection to Svelte 5. **It registers no default Components, Actions, themes, or CSS.** The app registers each code-backed Component's public contract in the core Registry and associates the Svelte implementation with the same ID in the renderer. Core executes State, Query, Action, `when` and `repeat`, and evaluates slots in their author's context.

Version `0.1.0` is built and installation-tested in this repository. It is awaiting public release on npm. `@viewstem/core@0.1.0` is a direct dependency and Svelte `^5.57.3` is a peer dependency. Apps import the API and shared types from `@viewstem/svelte`, which provides everything they need from core. See the repository's verification records for the exact tested versions and limits.

## Registration and setup

```ts
import { createRenderer } from '@viewstem/svelte';
import Label from './Label.svelte';

const renderer = createRenderer();
renderer.registry.registerComponentContract({
  kind: 'Component', id: 'Label',
  spec: { ports: { text: { kind: 'Value', schema: { type: 'string' }, required: true } } },
});
renderer.registerComponent('Label', Label);

const rendered = await renderer.mount({
  target: document.querySelector('main')!,
  view: { render: { id: 'greeting', componentRef: 'Label', inputs: { text: 'Hello Viewstem' } } },
});
await rendered.initialComplete;
// rendered.view exposes core State/Query handles and the public View API.
await rendered.dispose();
await renderer.dispose();
```

`registry.registerComponentContract(contract)` registers a code-backed Component's public contract. `renderer.registerComponent(id, implementation)` associates the Svelte implementation with that ID. Register the core contract before registering the implementation. The renderer rejects unknown IDs, code overrides of declarative Components, and duplicate adapters for the same ID. A newly registered Svelte implementation takes effect on the next `mount`, `attach`, or a View's new lifetime after `replace`. `update` keeps the definitions and adapters already in use.

To register multiple code-backed Components together, pass a `readonly ComponentRegistration[]` to `renderer.registerComponents(entries)`. Each entry has the shape `{ contract, component }`. A duplicate ID in the batch, a conflict with an existing contract, or an invalid entry leaves both contract and implementation registrations untouched. To register only contracts in a batch, use `renderer.registry.registerComponentContracts(contracts)`.

`createRenderer()` creates an empty Registry and a Runtime. `renderer.registry` is the same object as `renderer.runtime.registry`. Use it to register resources and code-backed Actions. You can also use `import type` from `@viewstem/svelte` for core's public types, including `ViewSpec`, `ComponentContract`, `StateHandle`, `QueryHandle`, and `Runtime`. The renderer uses the core engine and its types and state directly.

The three runtime exports are `createRenderer`, `ViewstemView`, and `transformError`. The package explicitly re-exports only the shared types needed to author resources and integrate with a host. Engine internals, type inference helpers, and optional executor configuration types stay outside this API. The returned Registry, Runtime, and View are core's public handles and expose only public methods. See the [API verification record](../../docs/handoff/public-api-verification-results.json) at the same revision for the results after this refactor.

Creation options include `registry`, `stateStore`, `requestExecutor`, `resourceResolver`, `authorize`, `functions`, `requestTimeoutMs`, `clock`, and the render error observer `onError`. To share an existing Runtime, use `createRenderer({ runtime, onError })`. Supplying both `runtime` and Runtime creation options fails type checking and produces `INVALID_DEFINITION` at runtime.

When you omit `registry`, the renderer uses `functions` for both definition validation in its Registry and execution in the Runtime. If you supply a Registry, configure it with the same function contract.

```ts
const renderer = createRenderer({ requestExecutor, resourceResolver });
// Or borrow an existing Runtime: const renderer = createRenderer({ runtime });
```

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

## Use in an existing Svelte app

Pass `{renderer, view}` to the public `ViewstemView` component. Use a core View the app created with `runtime.createView`. The example [App.svelte](../../packages/svelte/example/App.svelte) and its adapters show how to connect them. Read the example in the source repository at the same revision. The tarball excludes the example.

You can also borrow a View from another Runtime. Explicitly register the same public contract and Svelte implementation in the renderer for every code-backed Component the View uses. For every referenced Component ID, its code-backed or declarative kind must agree with the renderer's Registry. The renderer neither copies contracts from other Registries nor performs a full compatibility comparison. Inject a Runtime that shares the Registry to keep the registrations in sync.

When the app hosts `ViewstemView` directly, configure the Svelte root's error transformation policy.

```ts
import { mount } from 'svelte';
import { transformError } from '@viewstem/svelte';
import App from './App.svelte';

mount(App, { target: document.querySelector('main')!, transformError });
```

Svelte's root `transformError` processes thrown values before they reach a boundary. The supplied function returns a sanitized error DTO without reading proxies, getters, or the original message or stack. The root policy applies to the whole app. The host is responsible for combining it with any other Svelte error policy. `renderer.mount` and `renderer.attach` apply the policy automatically to their Svelte roots. Direct hosting requires this policy for the renderer's guarantee of safe handling of arbitrary thrown Proxy values.

`ViewstemView` passes `{phase: 'render' | 'event', error, node?}` to `onError`. An optional `fallback: Snippet<[NodeSnapshot, PublicError | null]>` can display failed nodes and pending projections without an address. Supply your own fallback UI. A render error stays within its boundary and rendering retries on the next core projection. Core event errors still reject the `emit` call. Exceptions thrown by observers do not interrupt other execution.

## Completion and lifecycles

| API | Completion and ownership |
|---|---|
| `renderer.mount({...ViewTarget, target, context?, onError?, fallback?})` | Creates and owns the View. Returns `{view, initialComplete, update, replace, whenRendered, dispose}` when the structure is ready. |
| `rendered.initialComplete` | Waits for the eligible initial queries in core and the Svelte DOM update for that generation. Query errors remain in the core report. Render errors, disposal, or a change of generation reject the promise. |
| `rendered.update(spec, options?)` / `replace(target)` | Preserves core's atomic application, authorization, and lifecycle contracts. The returned `{initialComplete}` also waits for the DOM update. |
| `renderer.attach(view, target, options?)` | Borrows an existing View and returns `{view, whenRendered, dispose}`. Detaching preserves the core View. |
| `<ViewstemView {renderer} {view}>` | Borrows an existing View. Svelte unmounting cleans up only subscriptions and rendering. The instance exposed by `bind:this` provides `whenRendered()`. |
| `whenRendered()` | Waits for Svelte to apply the current DOM update. Query completion, browser paint, and asynchronous work in host components run independently. |
| `renderer.dispose()` | Cleans up attached views and disposes Views it mounted. Also disposes an internally created Runtime, including Views created directly on it. Preserves injected Runtimes, external stores, and borrowed Views from other Runtimes. |

An Element can have only one renderer attachment. Ready parts of the view render while initial queries are still running. Invalid core updates or replacements preserve the existing View. Host adapter rendering can fail after core applies a change, and successful core State writes persist.

Disposing an internally created Runtime immediately cancels in-flight Queries and Actions. With an injected store, the Runtime disposes only its own Views and preserves State in other StateScopes. An asynchronous `resourceResolver` is a host callback, so the renderer cannot forcibly interrupt it. `dispose()` waits until cleanup of pending `renderer.mount` calls is complete. If a View becomes ready during disposal, it is disposed before it can attach to the screen. The host manages network cancellation and timeout policies for the resolver.

## Run and verify

Run these commands from the repository root.

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run check:svelte
npm run example:svelte
```

The example runs at `http://127.0.0.1:4174`. The app supplies and registers the four example adapters. `check:svelte` builds core and Svelte, checks strict consumer types and the example, runs conformance checks in Chromium, and verifies installation, types, and DOM behavior for a standalone tarball consumer. Skipped and todo browser tests fail the check. Use a Svelte-aware bundler to compile the distributed `.svelte` files for client-side DOM rendering.

The supported scope is the Svelte 5 client-side renderer. This verification excludes Svelte 4, passing a runtime through SSR and hydration, other browser engines, real mobile IMEs, Grid and chart UI, a default design system, and public release. See the [implementation handoff (Korean)](../../docs/handoff/svelte-implementation-2026-11-02.md) and [verification results](../../docs/handoff/svelte-verification-results.json) at the same source revision. The tarball excludes source documentation. When publishing, link to the public documentation for the verified tag or commit.

## Optional UI package

Register shadcn-svelte components explicitly, either all at once or by family, through the separate [@viewstem/svelte-ui](../svelte-ui/README.md) package. The renderer ships without default UI components. The [UI verification record](../../docs/handoff/svelte-ui-shadcn-verification-results.json) contains the latest U44 regression evidence for registration and callback lifetimes.
