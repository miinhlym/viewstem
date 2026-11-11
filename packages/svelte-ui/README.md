# @viewstem/svelte-ui

English | [한국어](README.ko.md)

Viewstem is [MIT licensed](LICENSE). Third-party UI sources retain their
[original notices](upstream/NOTICE.txt) and bundled licenses.

This Viewstem UI package for Svelte 5 provides 66 component families from a pinned shadcn-svelte catalog. Register the UI explicitly with `@viewstem/svelte`.

```ts
import { createRenderer } from '@viewstem/svelte';
import { registerComponents } from '@viewstem/svelte-ui';
import { shadcn } from '@viewstem/svelte-ui/shadcn';
import '@viewstem/svelte-ui/shadcn/styles.css';

const renderer = createRenderer();
registerComponents(renderer, shadcn);
const mounted = await renderer.mount({
  target: document.querySelector('#app')!,
  view: { render: { id: 'save', componentRef: 'shadcn.Button', inputs: { text: '저장', variant: 'outline' } } },
});
await mounted.initialComplete;
// When the owning screen closes:
await mounted.dispose();
await renderer.dispose();
```

You can also register just the families you need. Registration validates the contracts and Svelte implementations together. A conflict, invalid contract, or disposed renderer leaves no partial registration. Registering the same set twice raises a conflict.

```ts
import { registerComponents } from '@viewstem/svelte-ui';
import { button } from '@viewstem/svelte-ui/shadcn/button';
import { dialog } from '@viewstem/svelte-ui/shadcn/dialog';
registerComponents(renderer, [button, dialog]);
```

The public API includes `registerComponents(renderer, sets)` and the `ComponentSet` type at the package root, `shadcn` at `/shadcn`, and explicit sets at the 66 family subpaths. Set names use the camelCase form of the slug, with `switchSet` for the reserved word `switch`. Families with upstream components also export a `components` namespace. `/shadcn/sonner` exports `toast` from the same private Sonner runtime. Internal adapter and vendor paths are private.

## JSON inputs, slots, and events

Standalone parts use IDs such as `shadcn.Button`. Composite parts use IDs such as `shadcn.Dialog.Root` and `shadcn.Dialog.Trigger`. JSON supports 351 upstream parts and six additional compositions under the `shadcn` prefix. They are Combobox, DatePicker, DataTable, Typography, Chart, and Notifications. The full set registers these 357 contracts and implementations.

Only `inputs` that pass the public schema reach native props. Use `inputs.text` for text and `slots.default` for children. Children take precedence over text. Empty slots preserve upstream icons, selected values, and placeholders. Core rejects unsupported inputs and events.

DOM events such as `click`, `input`, `change`, and `keyDown` carry `{ type, value?, checked?, key?, code?, button?, buttons?, altKey?, ctrlKey?, metaKey?, shiftKey? }`. The input `value` is a DOM string. Convert it in the Action input when you need a number. Native value callbacks such as `valueChange`, `checkedChange`, and `openChange` carry `{ value: ... }`. Submit prevents page navigation and invokes the Action. Korean IME composition keeps provisional values in the input and emits the committed value.

`NativeSelect.Root` supports `multiple` and an array `value` for display and external control. Its DOM `change.value` reports the browser's first selected value as a string. To round-trip an array of selections through JSON events, use `Select.Root` with `type: "multiple"` and `valueChange`. Supply value/label pairs in `Root.items` if you need labels when changing the selection externally while the Select is closed.

When a Command item's `value` differs from its display label, put the searchable label in `keywords`. For example, `{ "value": "settings", "text": "환경 설정", "keywords": ["환경 설정"] }` supports searching in Korean while writing `settings` to State.

This JSON writes an Input change to State.

```json
{
  "states": { "name": { "kind": "State", "schema": { "type": "string" }, "initial": "" } },
  "render": {
    "id": "name", "componentRef": "shadcn.Input",
    "inputs": { "value": { "@path": "/states/name" }, "aria-label": "이름" },
    "on": {
      "input": {
        "action": {
          "ports": {
            "target": { "kind": "State", "schema": { "type": "string" }, "required": true },
            "next": { "kind": "Value", "schema": { "type": "string" }, "required": true }
          },
          "steps": [{ "kind": "SetState", "target": { "@path": "/ports/target" }, "value": { "@path": "/ports/next" } }]
        },
        "inputs": { "target": { "@path": "/states/name" }, "next": { "@path": "/event/value" } }
      }
    }
  }
}
```

Put one DOM part from this set in a Trigger's `slots.child`. The trigger forwards props, events, and the Svelte attachment to that part without creating a wrapper or nested button. Multiple children and arbitrary composite or host adapters are outside this slot contract. Use the namespace below for Svelte composition.

## Native composition and support reference

All 386 upstream parts have native Svelte exports. The 17 child parts each of Calendar and RangeCalendar, plus Chart.Tooltip, need a scoped snippet or LayerChart context. These 35 parts are native-only and have no JSON IDs. Compose them in host Svelte code through the public `components` namespace. The JSON adapters for Calendar.Root and RangeCalendar.Root render the complete date UI. Declare `@internationalized/date` as a direct app dependency when creating DateValue in host code.

```svelte
<script lang="ts">
  import { components as Calendar } from '@viewstem/svelte-ui/shadcn/calendar';
  import { parseDate } from '@internationalized/date';
</script>
<Calendar.Calendar type="single" value={parseDate('2026-11-03')} />
```

See [RawComposition.svelte](test/fixtures/RawComposition.svelte) for native composition with the required context and [samples.mjs](test/fixtures/samples.mjs) for the 66 JSON examples. Use function props, DOM refs, FileList, scoped formatter and cell snippets, and Svelte `bind:` in host code. JSON has no syntax for serializing functions or DOM objects.

```ts
import support from '@viewstem/svelte-ui/shadcn/support.json' with { type: 'json' };
const entry = support.components.find(component => component.id === 'shadcn.Button')!;
const inputs = Reflect.get(support.properties, entry.propertiesRef);
const events = Reflect.get(support.callbacks, entry.callbacksRef);
const hostOnly = Reflect.get(support.unsupported, entry.unsupportedRef);
```

The support reference lists the upstream commit, each part's `json` or `native-context` status, input schemas and required values, conversion codecs, callback schemas, slots, and reasons for host-only features. Shared schema sets use reference keys. Callback schemas describe the argument value. Events with `codec: "dom"` deliver it directly as the payload. Other callbacks wrap it in `{ value: argument }`.

## Scope of composite components

| Composition | JSON contract |
|---|---|
| Combobox | String value, `{value,label,disabled?}` options, search and selection, and `valueChange`. |
| DatePicker | Date-only ISO string or null, `{start,end}` range, locale, min/max, disabled, and `valueChange`/`rangeChange`. Native Calendar dates use the same string codec. |
| DataTable | TanStack Table with JSON columns and data, controlled values and events for sorting, filtering, pagination, and row selection. `rowId` must be a unique non-empty string. Cells display strings, numbers, and booleans. Custom cells use host code. |
| Chart | LayerChart line, area, bar, and pie charts. Each x value is a unique string or finite number. Series have unique IDs and keys. Each y value is a finite number or explicit null. Pie takes one nonnegative series. Colors accept hex, CSS names, and `var(--chart-1)` through `var(--chart-5)`. Invalid data displays an error. The optional ECharts/Canvas contract has a separate scope. |
| Notifications | Sonner creates, updates, and removes notifications by ID. The first entry wins on duplicate IDs. Dismiss emits `{value:{id,reason}}`. Each instance is isolated and clears its notifications and timers on unmount. |
| Typography | Semantic elements such as headings, paragraphs, blockquotes, and code, with variants. Strings render as text. |

If data or filter changes put DataTable's `pageIndex` outside the available range, it displays the last valid page. Input State stays under host control. The next user page change starts from the page actually displayed. The host also owns `selectedIds`, so IDs stay selected when they disappear from the list.

To send notifications from a code Action, use `toast` from `/shadcn/sonner`. It uses a separate store from the global `svelte-sonner` toast. JSON `Notifications` isolates notifications across renderers automatically. Hosts using raw `Sonner` and `toast` manage their own toasterId and cleanup.

## Styling, environments, and reproducibility

The package pins Vega, neutral, and Lucide. Prebuilt CSS works in hosts without a Tailwind configuration. Selective imports reduce the JS bundle. All families share the package's npm dependencies and the same stylesheet. Use host CSS or the host's Tailwind build for additional Tailwind classes.

CSS is scoped to `data-viewstem-shadcn` and adds no host-wide reset. Switch to dark mode with `html.dark` or `data-theme="dark"`. Customize colors with variables such as `--viewstem-primary`. Set the theme and variables on html or body to apply them to body portals as well. A subtree theme applies only within that subtree.

Verification covers Node 22 and 24, Svelte 5.57.3, browser clients, and TypeScript Bundler resolution. SSR and hydration integration are outside the renderer's current scope. The full set's mode-watcher uses an origin with localStorage access. Consumer type checks use `strict: true, skipLibCheck: true` because of errors in upstream LayerChart and TanStack declarations. Package source must pass its own type checks.

The upstream shadcn commit is `fe4b0ad3b8b30c6745346db008c3307b5afeabb1`, and the CLI version is 1.7.2. The repository keeps the pinned source archive and hash, vendor conversion scripts, the pinned Sonner runtime and license, and the lockfile. [NOTICE](upstream/NOTICE.txt)

```sh
npm run check:svelte-ui         # Build, types, reproducibility, browser, isolated tarball
npm run generate -w @viewstem/svelte-ui # Regenerate from pinned sources and dependencies
npm run audit:matrix -w @viewstem/svelte-ui # Regenerate the 66-family behavior matrix
```

The audit covers inputs, events, State, nesting, and keyboard behavior for the 66 component families. `npm test` runs the existing tests and these behavior cases and saves the results in `test/results/current.json`. The check fails if any required case is skipped or fails. The documented coverage is limited to the tested attribute combinations and browser environment. Other browser engines and physical mobile touch are outside this coverage. [Audit matrix (Korean)](../../docs/handoff/svelte-ui-audit-matrix.md), [Audit handoff (Korean)](../../docs/handoff/svelte-ui-audit-2026-11-03.md)
