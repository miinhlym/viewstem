# Proposed framework-independent Viewstem web UI

This is a snapshot of the proposal under review. The proposal responds to a request for browser UI usable from JavaScript across frameworks, with shadcn as the first set of components.

## Proposed package boundary

Keep `@viewstem/core` as the DOM-independent runtime for View JSON, State, Query, and Action. Add `@viewstem/ui` as the default browser client path, with a DOM renderer, a shadcn-style component set, and compiled CSS. React, Vue, Svelte, and plain JavaScript hosts supply a DOM container. Viewstem owns rendering and cleanup within it. The existing Svelte packages remain optional for native Svelte integration.

The renderer uses the public `View.subscribe()` and `View.emit()` APIs. It preserves node identity on repeat reorder and follows Viewstem slot and mount/dispose semantics. Individual components could also be exposed to JavaScript callers outside View JSON. Custom Elements could be added later for direct HTML composition.

## Proposed catalog

Carry over the Nova/Neutral visual language and compatible public JSON IDs, inputs, slots, events, and payloads from the Svelte catalog. Implement the UI behavior on the DOM side. Publish support per family because the existing catalog includes Svelte-specific composition. Start with Button, Card, Input, Checkbox, and Dialog. Defer Combobox, Calendar, and Chart.

## Proposed verification and release

Run the same JSON from plain JavaScript, React, Vue, and Svelte. Verify State round trips, typing across projection updates, repeat reorder, keyboard operation, and Dialog focus return. Add the new package to the release flow and verify consumption of the packaged build before the public release. The proposal leaves release timing and the implementation behind complex components open.
