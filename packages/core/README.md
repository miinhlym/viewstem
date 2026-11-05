# @viewstem/core

English | [한국어](README.ko.md)

Viewstem is [MIT licensed](LICENSE). Vendored CEL attribution and license text
are shipped in [THIRD-PARTY-NOTICES.txt](dist/THIRD-PARTY-NOTICES.txt).

This ESM library validates declarative UI definitions and runs their values, state, queries, actions, and view lifecycles. It is independent of the DOM, Svelte, and any business domain. Version `0.1.0` has been built and installation-tested in this repository. This does not establish publication on npm.

```ts
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
const stop = view.subscribe(snapshot => {
  console.log(snapshot.roots[0]?.inputs.text);
});
view.getState('title').write('Updated');
stop();
runtime.dispose();
```

`initialComplete` settles once the initial queries eligible to run for this application of the view have succeeded or failed. The UI can observe parts of the view as they become ready. Unready inputs and closed gates do not delay completion, and query errors appear in `(await initialComplete).queryErrors`. DOM paint is outside the scope of this signal.

## Public API

- `createRegistry` registers and validates resources by `(kind, id)`, registers code-backed Components and Actions, lists and describes resources, and exports and explicitly replaces definitions.
- `createStateStore` manages scopes and State, provides `writeBatch` and synchronous `transaction`, exposes stable read snapshots, and supports `registerReaction` and clock and URL integration. Declare Derived values in the `states` of a View or Component. Disposing the runtime preserves an injected store.
- `createRuntime` exposes `createView`, `invokeAction`, `listResources`, `exportResource`, and `dispose`. A `view` exposes `update`, `replace`, `emit`, `getSnapshot`, `subscribe`, `getState`, `getQuery`, and `exportDefinition`.
- `mergeOwnedUrl` lets a host URL adapter merge only the keys it owns.
- `computeGridLayout` calculates a 12-column layout. Grid UI requires separate registration.

The root entry point has these five runtime exports. Import optional executors from their own entry points.

```ts
import { createHttpExecutor } from '@viewstem/core/http';
import { compileCel, evaluateCel, defaultCelLimits } from '@viewstem/core/cel';
```

`Registry`, `StateStore`, `Runtime`, and `View` are type-only exports. The factories return objects containing public methods only. Use resource declarations to execute `@path`, `@call`, Query, and Variable. If you used the former constructors or engine exports, follow the [public API migration guide (Korean)](../../docs/handoff/public-api-refactor-2026-11-02.md) for the same revision.

For exact types and fields, see `dist/index.d.ts`, `dist/http.d.ts`, and `dist/cel.d.ts` in the package. Use the Registry, Store, View, State, and Query handles issued by the library directly. Serializing them as JSON or recreating them as plain objects is unsupported. The runtime isolates Value inputs from their originals and delivers them as read-only values. Sets and maps retain native identity and equality semantics. Conversion to arrays or entry pairs happens only in HTTP plan inputs.

## Host integration

Render the `roots` from `view.getSnapshot()` or `subscribe()`. Each node includes `instanceId`, `generation`, `status`, `inputs`, `children`, and named `slots`. Pass only the declared payload to `view.emit(node, event, payload)`. Keep DOM event objects in the host. Setting `when:false` or removing a node ends its lifetime. A temporary wait for inputs preserves existing state and execution connections.

An existing view keeps the resource definitions it received when it was applied. `registry.updateResource` changes the shared definition, which `view.replace` or a new `createView` call can then apply. `view.update` changes only the current view configuration. An update that changes a retained cell between State and Derived fails because the write contracts differ. Changing or exporting State, the current view, and shared definitions is separate from database persistence.

If a subscriber writes State while the View is computing or publishing a projection, the runtime queues a follow-up projection. Listeners finish receiving the current immutable snapshot before the new projection is published. Several writes in that interval are combined into one follow-up; writing the same value does not create another State change. Inspect a subsequent snapshot for the resulting node inputs and use the renderer's completion mechanism for DOM updates.

`authorize({operation, owner, definition})` checks permission to execute Actions or modify an existing view through `view.update` or `replace`. It grants permission only when it returns `true`. The host configures resource-list visibility, user identity, and persistence permissions. Execution requires its own authorization even when a resource appears in a list.

For `update`, the owner is the same public View object returned by `createView`. For `invoke`, the owner is an opaque identity object used only for comparisons within a lifetime. It exposes no execution methods. Authorization callbacks receive definitions without the implementation functions of registered code-backed Actions.

`context.invokeAction` in a registered code-backed Action inherits the parent's cancellation and recursion stack. Ending the parent also cancels unfinished child invocations. `runtime.invokeAction({owner:view,...})` starts an independent invocation owned by that View. A cancelled invocation cannot write State or refresh a Query. Effects that already succeeded persist.

## HTTP and URLs

The runtime uses native fetch for public HTTP unless you inject `requestExecutor(plan, {signal})`. Execute plans that require a secret or Login on a trusted server with `createHttpExecutor({authorize,resolveSecret,caller})`. Keep the secret resolver on the server. Destination authorization, headers, parameters, response parsing, and timeouts apply to each request. The package leaves service-specific authorization and storage to the host.

A URL adapter implements `read`, `subscribe`, and `writeOwned(patch,{mode,isCurrent})`. After asynchronous preparation, check `isCurrent()` **immediately before writing the URL**. `mergeOwnedUrl` changes only the keys it owns and preserves the original encoding of other query parameters. For view-level integration, pass `url:{adapter,bindings:[{state,key?,history?}],limits?}` to `createView` or `replace`. This integration and the store's direct `connectUrl` are mutually exclusive. If cleanup fails, the runtime finishes applying the new view and records the error. Late-arriving initial values take precedence over leftover URL values. An explicit State write while initial values are pending is reflected in the URL after initialization.

## CEL support and limits

`dist/cel-support.json` lists the supported public CEL surface. The build verifies SHA-256 hashes for upstream cel-js 8.0.0, the previously verified patches, and the production fixes. Use the support list shipped in the package for exact signatures. Support is limited to that profile, which excludes features such as bytes, uint, type, optional, and cel.bind. Dates follow the declared string format and explicit time zone contract. A general `number` is a CEL double, and an `integer` is a safe integer.

See `defaultCelLimits` for CEL AST, cost, and result size limits. Registered functions are synchronous, pure callbacks from a trusted host. They receive schema-validated, read-only inputs. The runtime provides no execution-time isolation or sandbox for malicious host callbacks.

## Detailed contracts and documentation versions

The package's [core types](dist/index.d.ts), [HTTP types](dist/http.d.ts), and [CEL types](dist/cel.d.ts) define the exact API. [CEL support JSON](dist/cel-support.json) lists the supported functions. The build and tarball include these files, and the examples above illustrate this public API.

Read the following links in the **source repository at the same revision**. The tarball omits detailed `docs/` files, so resolve these relative links from the source checkout.

- The [specification and documentation map](../../docs/README.md) points to resource contracts and verification procedures.
- [Schema profile (Korean)](../../docs/spec/03-variable-type.md) and [values, dates, and snapshots (Korean)](../../docs/spec/10-value-contracts.md).
- [Host integration, permissions, and initial completion (Korean)](../../docs/spec/07-host-integration.md) and [store, reactions, and URLs (Korean)](../../docs/spec/09-preserved-contracts.md).
- [CEL semantics and limits (Korean)](../../docs/handoff/core-cel-support.md) and [patches and reproducible builds](vendor/README.md).
- [Verification after the public API refactor](../../docs/handoff/public-api-verification-results.json), [initial product verification](../../docs/handoff/core-verification-results.json), and [remaining work (Korean)](../../docs/handoff/open-contracts.md#실제-남은-작업).

The [public repository](https://github.com/miinhlym/viewstem) and local unpublished changes are separate. The package is awaiting public release. When publishing, provide the documentation at the corresponding source tag or commit and point these source links to the public URLs for that revision. Use only release URLs and documents that are available remotely.

## Reproduce verification

Run these commands from the repository root.

```sh
npm ci --ignore-scripts
npm run check
npx playwright install chromium
npm run test:browser
npm run test:package
```

Verification uses Node 22.21.1 and 24.1.0 and Chromium from Playwright 1.62.1. Use [@viewstem/svelte](../svelte/README.md) to integrate with a Svelte app. Dart/Flutter and optional charts are follow-up packages. These checks cover the tested environment. Production HTTP policies, other browsers, and production performance are outside their scope.

The build prepares all three entry points, the required type declarations, and the shared module chunks before replacing `dist`. Replacing the directory clears obsolete build artifacts. `npm run check` treats `skip` and `todo` as failures. Acceptance comparisons require a report from an actual run.

See the [U42 migration table (Korean)](../../docs/handoff/public-api-naming-2026-11-02.md) for public naming changes. Use `registerComponentContract`, `exportResource`, `writeBatch`, `registerReaction`, `getSnapshot`, and `getDiagnostics`. Previous names have no aliases. JSON State declarations still use `initial`.
