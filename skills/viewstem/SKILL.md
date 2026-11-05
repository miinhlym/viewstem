---
name: viewstem
description: Build and debug consumer apps using Viewstem packages and declarative Viewstem definitions. Use for Viewstem integration, resource composition, Svelte adapters, and Viewstem-provided UI, including changes to existing Viewstem code. Not for unrelated Svelte work or developing the Viewstem library itself.
---

# Viewstem consumer apps

Requires project file access and Node.js 22 or newer. Work from the consumer app's installed packages. In a monorepo, identify the
specific app and its package manifest before resolving dependencies. Follow the
user's requested scope and response language.

## Find the applicable contract

- Read the installed package README and public declarations for the part you
  change. Package versions and exports come from the installed manifest; a
  workspace version does not prove that version has been published to npm.
- Use `@viewstem/core` for DOM-independent work, `@viewstem/svelte` for the
  Svelte renderer, and `@viewstem/svelte-ui` for optional provided UI.
- If a package is missing, use the project's intended released version or a
  supplied local tarball. Do not substitute repository source imports.
- Resolve public JSON files from the target app, not from this skill's install
  directory: `@viewstem/svelte-ui/shadcn/support.json` and
  `@viewstem/core/cel-support.json`. Read JSON as data; no runtime import is
  needed to inspect it. Resolve from the app's `package.json` with Node's
  `createRequire` when the current working directory differs.

## Rules that change implementation choices

- Use public factories such as `createRegistry`, `createRuntime`, and
  `createRenderer`; `Registry`, `Runtime`, and `View` are types, not constructors.
- The renderer registers no default UI. Register the needed public component
  sets explicitly and import the UI package stylesheet when using that set.
  Registering the same set twice is an error.
- Start from an installed README example when it already covers the exact API
  and inputs you need; do not expand a catalog merely to repeat that example.
  For an unknown UI input, event, or support mode, locate its component entry
  and inspect only the needed named members of `propertiesRef`, `callbacksRef`,
  or `unsupportedRef`. Never print entire referenced dictionaries: even one
  component's shared DOM callbacks are large. Preserve the selected member's
  `required`, `uncertain`, schema booleans, and codec. A partial lookup does not
  establish support for unselected members.
  Exclude the minified UI support catalog from broad recursive text searches.
  `head` limits lines, not bytes; one matching JSON line can contain the whole
  catalog. Parse it with Node's `JSON.parse` and select the needed IDs or keys.
- `native-context` entries have no JSON component contract. Compose the native
  parts in host Svelte through the family's public `components` namespace.
  Read the exported type to find the actual symbol; do not derive it from an ID.
- DOM event codecs deliver their payload directly. Other UI callbacks deliver
  `{value: argument}`. Supported event keys and unsupported native prop names
  are distinct: an unsupported `onStateChange` is not automatically a JSON
  `stateChange` event. Do not invent aliases or remove unsupported prefixes.
- Pass a writable State handle explicitly through a State port when an Action
  needs to write it. Value inputs and node snapshots are read-only. Bind UI
  values back to State so changes are visible on the next projection.
- Prefer declarative Query display bindings when no independent State is needed.
  If a subscriber writes State during an active View projection, its current
  callback snapshot remains unchanged; inspect a subsequent projection and the
  rendered result. Check the installed package's subscription contract when
  working with older development artifacts.
- Core initial completion can resolve with `queryErrors`. Renderer completion,
  DOM updates, and browser paint are different observations. Check the relevant
  error channel and the actual rendered result rather than treating resolution
  alone as success.
- Release resources according to ownership. `renderer.mount` owns its View;
  `attach` and `ViewstemView` borrow one. Dispose resources created by the app
  while preserving resources borrowed from its host.

## Verify the requested outcome

Use the app's existing checks and exercise the behavior you changed: render,
input-to-State round trip, Action result or error, and cleanup as applicable.
Distinguish failures in core from renderer failures. Report what actually ran
and any unverified boundary. Explanation-only requests do not require edits.

This is an initial development skill, not a claim that a released package range
has passed all host and behavior checks. The initial local evaluation uses
Viewstem `0.1.0` tarballs and Svelte `5.57.3`; those mutable development versions
must be identified by their artifact hashes in the evaluation record.

For installing or diagnosing skill discovery, read only the relevant host guide:
[Codex](integrations/codex.md) or [Claude Code](integrations/claude-code.md).
These guides are not prerequisites for ordinary app changes.
