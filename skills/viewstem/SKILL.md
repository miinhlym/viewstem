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
  Svelte adapter for app-owned components, and `@viewstem/ui` for the default browser catalog.
- If a package is missing, use the project's intended released version or a
  supplied local tarball. Do not substitute repository source imports.
- Resolve public JSON files from the target app, not from this skill's install
  directory: `@viewstem/ui/support.json` and
  `@viewstem/core/cel-support.json`. Read JSON as data; no runtime import is
  needed to inspect it. Resolve from the app's `package.json` with Node's
  `createRequire` when the current working directory differs.

## Rules that change implementation choices

- Use public factories such as `createRegistry`, `createRuntime`, and
  `createRenderer`; `Registry`, `Runtime`, and `View` are types, not constructors.
- For the default catalog, call `registerShadcn(registry)` once, import
  `@viewstem/ui/styles.css`, and attach a core View to a connected DOM container.
  Use the Svelte renderer to register and render app-owned adapters.
- For an unknown JSON input, slot or event, find the component by `id` in the
  installed support file and inspect the required entries in `ports`, `slots`
  or `events`. Keep the schema and required flags when explaining a contract.
  Parse the file and select entries by name to avoid printing the full catalog.
- Check the declared event payload schema before writing an Action binding.
  Native DOM events project JSON fields directly, and value callbacks use a
  `{ value: ... }` payload. Read the supported key from `events`.
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
  `@viewstem/ui.attach` and `ViewstemView` borrow one. Dispose resources created by the app
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
