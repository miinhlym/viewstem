# Viewstem core playground

English | [한국어](README.ko.md)

This local development tool uses vanilla JS to edit and run JSON and inspect the rendered view, State, Query, and Action. It uses the public `@viewstem/core` entry points for State and Query execution. The DOM components and HTTP examples are host code in this directory.

## Run locally

Use Node 22 or later and the existing lockfile from the repository root.

```sh
npm ci --ignore-scripts
npm run playground
```

The default address is `http://127.0.0.1:4173`. To use a different port, run `PORT=4174 npm run playground`. The server builds core, then creates the browser bundle in memory. Restart the server after changing source files. JSON edits take effect without a restart. Press Ctrl+C to stop the server.

## Workflow

1. Load **Query와 Action**, **State와 Derived**, or **Component와 반복**. The first example runs on the initial visit.
2. Edit the JSON and select **실행** (Run) or press Cmd/Ctrl+Enter. Each run creates a new Registry and runtime, resetting State and Query. A parsing, registration, or mount validation failure preserves the last successful run. Once a configuration is applied, individual Query errors appear in the Query panel.
3. Use the inputs and buttons in the preview. Inspect State changes, Query running/success/error status, stale status and last result, and Action running/success/error status and actual return value.
4. Select **중지** (Stop) to clean up active requests, executions, and subscriptions. Late results from an earlier generation cannot update the new view.

The editor, preview, and inspector fill the page. Drag the vertical or horizontal divider, or focus it and use the arrow keys, to resize. Double-click a divider to reset it. Switch among the **State / Query / Action / Snapshot / Log** tabs with the arrow, Home, or End keys. On narrow screens, **JSON / 미리보기 / 상태** selects a single full-height pane.

The draft is saved to localStorage for the current origin. Reloading restores the draft and waits for you to run it. Editing and execution still work if storage is unavailable. **가져오기** (Import) changes the draft. Run it separately when ready. **내보내기** (Export) saves the editor contents as-is, including invalid JSON. The JSON input limit is 1 MB in UTF-8.

If you edit, load an example, or select another file while a file is being read, the earlier file result is discarded. Query and Action error banners clear when the Query recovers or the same event binding runs successfully. Failures remain in Log. A preview rendering error also appears in the execution status.

## JSON input

```json
{
  "resources": [],
  "view": {
    "states": {
      "message": { "kind": "State", "schema": { "type": "string" }, "initial": "Hello Viewstem" }
    },
    "render": {
      "id": "message",
      "componentRef": "Text",
      "inputs": { "text": { "@path": "/states/message" } }
    }
  },
  "inputs": {}
}
```

`resources` and `inputs` are optional. Provide either `view` or a `viewRef` for a View registered in `resources`. The playground uses core's resource, expression, and schema syntax. JavaScript functions are defined in host code. [Core contract (Korean)](../docs/VIEWSTEM-SPEC.md)

## Preview components

The playground explicitly registers the contracts below. Core rejects duplicate IDs. See the source and the **도움말** (Help) panel for exact defaults and schemas. [components.mjs](components.mjs)

| Component | Inputs | Slots and events |
|---|---|---|
| Stack | gap | Default slot, vertical layout |
| Row | gap | Default slot, horizontal layout with wrapping |
| Card | title | Header, default, and footer slots |
| Text | text, tone: normal/muted/title | Displays plain text |
| TextInput | value, label, placeholder | `change` carries a string |
| NumberInput | value, label | `change` carries a number. Empty or partial values are held during editing. Moving focus away restores the current State value. |
| Checkbox | value, label | `change` carries a boolean |
| Button | label, disabled | `click` carries an empty object |
| Json | value, label | Displays structured values |

Add declarative Components in JSON to compose these parts. The host reconciles the DOM using the `when`, `repeat`, and slots expanded by core, along with node addresses and generations. A new code-backed element needs a registration contract and a DOM adapter in this host. The playground's UI scope is the registered preview components. General-purpose DOM and Svelte renderers, Grid, and chart UI are outside this scope.

During IME composition in text inputs, snapshot updates from Query and other sources preserve the input value. The input emits one change event when composition commits. Canceling without a value change emits no event.

When reordering repeated items with the same keys, the preview moves siblings around the focused DOM subtree to preserve input and IME composition. Removing and re-adding an item starts a new lifetime under the core contract.

## Inspector coverage

- **State** shows the View's top-level State and Derived values from `view.getSnapshot().states`. It distinguishes missing, pending, and error from actual null and false values.
- **Query** shows status, data, dataInputs, error, stale, and waitingReason for top-level View Queries. Refresh and retry call the actual Query handles.
- **Action** shows observation IDs for event bindings owned by the View, such as the ID in `on.click: { "id": "saved", "actionRef": "save" }`. Its scope is the View's event bindings.
- **Snapshot** shows Component inputs and state, child nodes, named slots, and view diagnostics. Internal Component cells, Queries, and Actions are outside its inspection scope.
- **Log** shows the latest 100 events, Query and Action status transitions, and execution errors. JSON display is limited to 40,000 characters and 20 levels of nesting. The preview limit is 3,000 nodes. The UI displays a message when a limit is exceeded. Use a truncated snapshot for on-screen diagnostics and Export for the editor contents.

## HTTP example and external APIs

The example Datasource specifies the current local server address in JSON. `/api/concepts` searches with `search`, delays responses with `delay=0..3000`, and returns HTTP 503 with `fail=true`. This fixture uses real HTTP to verify that a failed request preserves the previous Query result and that requests can be canceled. When importing a draft saved on another port, update the Datasource address or load the example again.

The browser fetches general Datasources directly, subject to browser constraints such as CORS. External API proxies, secret resolvers, and login stores are outside the local server's scope. The preview renders `text` and JSON values as plain text through DOM textContent.

## Verification

```sh
npx playwright install chromium
npm run test:playground
```

The browser tests bundle the actual package and manage the local server and Chromium automatically. [Basic browser tests](test/playground.test.mjs), [Edge cases](test/edge-cases.test.mjs)

The records document the verification scope, environment, and limits. Svelte, Dart/Flutter, optional charts, and public distribution are tracked separately. [Verification results](../docs/handoff/playground-verification-results.json), [Implementation handoff (Korean)](../docs/handoff/playground-implementation-2026-11-02.md), [Feature checklist (Korean)](../docs/handoff/playground-audit-2026-11-02.md)
