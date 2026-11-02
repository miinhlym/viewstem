# Viewstem shadcn gallery

English | [한국어](README.ko.md)

Build core, the Svelte renderer, and the Svelte UI package, then run this from the repository root.

```sh
node packages/svelte-ui/example/server.mjs
```

The default address is `http://127.0.0.1:4175`. Set the `PORT` environment variable to change the port. Select a component family with a parameter such as `?family=dialog`.

Select **화면 예제** (Screen examples) at the top to run five screens that combine multiple components. The URL reflects the selected example.

| Example | URL parameter | What to try |
|---|---|---|
| 계정 설정 (Account settings) | `?example=profile` | Edit profile and notification settings in one form, validate name and email, preserve the values at the time of applying, and discard changes. |
| 고객 목록 (Customer list) | `?example=customers` | Populate the table with a Query, filter by status and search in Korean, sort, page, select rows, and add a customer in a Dialog. |
| 회의실 예약 (Meeting room booking) | `?example=booking` | Pick a date, room, and time, check that a name is required, and confirm or cancel a booking. |
| 매출 대시보드 (Sales dashboard) | `?example=dashboard` | Update the Query and metrics by switching between weekly and monthly views, and switch among bar, line, and area charts. |
| 요금 계산기 (Pricing calculator) | `?example=pricing` | Calculate a Derived value from plan, billing interval, and headcount, use Slider with the keyboard, and save a quote. |

The scenario file defines the examples and helpers for authoring standard ViewSpec JSON. Use the JSON displayed in the editor as-is, without registering host Actions. The examples use in-memory sample data. External API requests, actual bookings, persistent customer records, and payments are outside the demo's scope. Reloading or restoring an example resets the data. The layout uses the `demo-*` rules. [scenarios.mjs](scenarios.mjs), [gallery.css](gallery.css)

Edits and live State are preserved while the browser keeps the page in its back/forward cache. The gallery disposes the renderer on the final `pagehide` when the browser does not retain the page in that cache. If the browser reloads the document on navigation, it resets just as it does on refresh.

Forms group values by how they are saved and reset. Edit `form` and store the applied values in `receipt`. Before saving, `receipt` is `null`, and a Derived value tracks whether a save exists. Discarding profile changes restores the last applied values, or the initial values before the first apply. Canceling or closing the customer dialog clears its input. Canceling a booking clears the confirmation and preserves the form in progress.

| Screen | Writable State |
|---|---|
| Account settings | `tab`, `form` (name, email, team, notifications), `receipt` |
| Customer list | `rows`, `filters` (status, search), `pagination` (page, size), `sorting`, `selected`, `open`, `form` (new customer) |
| Meeting room booking | `form` (booker, date, room, time, requests), `receipt` |
| Sales dashboard | `period`, `kind`. Query criteria and chart presentation stay independent. |
| Pricing calculator | `form` (plan, billing interval, headcount), `receipt` |

The State and Derived schemas specify field types, required properties, allowed values, and the headcount range. During editing, empty names and invalid emails remain strings. Derived computes whether the form can be submitted. The helper uses the same State schema for Action State ports and generates JSON that reads the other properties to build a replacement object on field edits. The runtime writes the complete object. Field writes and automatic merging are outside this contract. [scenario-state.mjs](scenario-state.mjs), [Form State handoff (Korean)](../../../docs/handoff/svelte-ui-form-state-2026-11-03.md)

Select a component family to see both the example ViewSpec JSON and its rendered DOM. Applying JSON edits replaces the View and starts a new lifetime. The error example checks validation by adding an unsupported input to the current family's root. The error appears while the previous view stays visible, and restoring the example returns the editor to its starting definition. Inspect inputs and execution in the State, Query, and Action panels.

Use the JSON editor's **전체 / State / Derived / Query / Action / Component** tabs to choose a section and the selector below to choose an item. Variable and Datasource appear when the document contains them. The number beside a section is its item count. The selector shows the item's original JSON path, such as `/states/form`. You can also set the section in the URL, for example `?example=profile&section=State`.

Each section shows part of one ViewSpec. For a Query, edit its `inputs` at the point of use. For an Action, edit the event binding and its `inputs` together. A Component selection includes the node's children and events. Switching sections or items incorporates syntactically valid changes into the draft. Select **적용** (Apply) to run the full ViewSpec. A JSON syntax error blocks switching items and preserves the draft and running view. Use **전체** (All) to add, delete, or rename items and change top-level settings. Switching examples, restoring an example, or reloading resets the draft.

- The gallery and browser tests share the ViewSpec definitions and JSON reference counters for all 66 catalog families. [samples.mjs](../test/fixtures/samples.mjs)
- The separate host fixture composes the original public Svelte parts for dates and charts in their required native contexts. It directly references 17 child parts each from Calendar and Range Calendar, plus one LayerChart Tooltip. [RawComposition.svelte](../test/fixtures/RawComposition.svelte)
- Button changes saved State through an Action. Input and selection components wire events to State. Data Table takes rows from a View Query and updates sorting, filtering, and pagination State.
- The example explicitly registers the full set. Consumer apps can register only the families they need.

Run the screen example regression tests with `node --test packages/svelte-ui/test/scenarios.browser.mjs`. They also run under `npm run test:svelte-ui`.

Run the section editor regression tests with `node --test packages/svelte-ui/test/definition-sections.browser.mjs`. The handoff records the verification scope and results. [Editor handoff (Korean)](../../../docs/handoff/svelte-ui-kind-editor-2026-11-03.md)
