# Maintaining the Viewstem website

English | [한국어](README.ko.md)

This private Astro workspace owns the home, documentation, examples, and playground
in English and Korean. Start here when changing the website. Published library
usage documentation lives in [src/content/docs](src/content/docs); this guide is
for contributors maintaining the site itself.

The [website contract](../../docs/VIEWSTEM-SPEC.md#34-공개-문서와-playground-배포) and
[decision history](../../docs/history/decision-register.md) are in Korean and own
product decisions. This guide maps those decisions to implementation and checks.
It does not replace the library specifications or turn dated review results into
current guarantees.

## Run locally

Use Node.js 22.12 or later on a supported release line. Run from the repository root:

```sh
npm ci
npm run dev:docs
```

`predev` builds the library packages used by the previews. `npm ci` also applies
the repository's [dependency patches](../../patches); if setup used
`--ignore-scripts`, run `npx patch-package --error-on-fail` before type checking.
Use the address printed by Astro; an occupied port can change it. Stop your own
server with Ctrl+C when finished.

```sh
npm run typecheck:docs
npm run build:docs
npm run preview -w @viewstem/docs -- --port 4323
```

`build:docs` rebuilds the library dependencies and produces `apps/docs/dist`,
including the search index. `preview:docs` serves that build through Wrangler;
it does not rebuild it. Use a fresh build for search and production-route checks.
[wrangler.jsonc](wrangler.jsonc) configures Workers Static Assets. These commands
do not publish the site; a public URL and deployment/PR-preview setup remain open
in the website contract. Do not edit or commit `dist` or `.astro` output.

## Find the implementation

English routes have no language prefix; Korean routes use `/ko`. The paired
[page entry points](src/pages) pass locale and route data into shared components.
Do not fork a page implementation just to translate it.

| Area | Source to change |
| --- | --- |
| Home `/`, `/ko/` | [HomePage.astro](src/components/HomePage.astro), [home-content.ts](src/components/home-content.ts) |
| Documentation `/docs/`, `/ko/docs/` | [content](src/content/docs), [Astro/Starlight configuration](astro.config.mjs), [content schema](src/content.config.ts), [route middleware](src/lib/docs-route.ts) |
| Examples index and lessons | [ExamplesPage.astro](src/components/ExamplesPage.astro), [catalog.ts](src/examples/catalog.ts) for order/copy, [definitions.ts](src/examples/definitions.ts) for runnable JSON, [preview.ts](src/examples/preview.ts) for editor/execution |
| Playground | [PlaygroundPage.astro](src/components/PlaygroundPage.astro), [Playground.svelte](src/components/Playground.svelte), [playground-copy.ts](src/components/playground-copy.ts), [playground-renderer.ts](src/components/playground-renderer.ts) |
| Shared metadata/header/theme | [SiteHead.astro](src/components/SiteHead.astro), [SiteHeader.astro](src/components/SiteHeader.astro), [ThemeInit.astro](src/components/ThemeInit.astro), [ThemeMenu.svelte](src/components/site/ThemeMenu.svelte); Starlight adapters are in [components/docs](src/components/docs) |
| Shared sidebar | [SidebarNavigation.svelte](src/components/site/SidebarNavigation.svelte), [SidebarTree.svelte](src/components/site/SidebarTree.svelte), [SidebarSheet.svelte](src/components/site/SidebarSheet.svelte); data adapters: [sidebar-navigation.ts](src/lib/sidebar-navigation.ts), [navigation.ts](src/examples/navigation.ts) |
| Documentation sidebar persistence | [docs-sidebar.ts](src/lib/docs-sidebar.ts), [docs-sidebar-bootstrap.js](src/lib/docs-sidebar-bootstrap.js), [Sidebar.astro](src/components/docs/Sidebar.astro) |
| Search, page navigation, internal scrolling | [Search.svelte](src/components/docs/Search.svelte), [Pagination.svelte](src/components/site/Pagination.svelte), [ScrollRegion.svelte](src/components/site/ScrollRegion.svelte), [ScrollEnhancements.astro](src/components/site/ScrollEnhancements.astro) |
| JSON editing | [json-editor.ts](src/lib/json-editor.ts) configures the shared CodeMirror editor |

Documentation and examples reuse the same sidebar tree and mobile sheet. Their
adapters supply data, labels, and persistence hooks. Fix shared behavior there
instead of recreating a tree for a page or viewport. Likewise, reuse site controls
and the internal ScrollArea wrappers; CodeMirror retains its editor scroll behavior.

## Change design without splitting the site

Read [style ownership](src/styles/README.md) before changing typography, spacing,
widths, or CSS inheritance. It defines the shared `site.css` entry, cascade order,
tokens, and page-specific responsibilities. Read [font ownership](public/fonts/README.md)
before changing font loading, subsets, or fallbacks. Page styles own their layout;
they must not become another site-wide reset.

Keep these two UI sources distinct:

- **Site controls:** official shadcn-svelte sources in [components/ui](src/components/ui),
  composed by site/docs components. [Site upstream records](upstream/README.md)
  own source provenance and hashes. Preserve upstream code and licenses; do not
  resolve a hash failure by merely accepting locally restyled vendor files.
- **Runnable JSON examples:** UI references, examples, and the playground render Views with `@viewstem/ui`.

For a design change, inspect home, docs, examples index, example lesson, and
playground with the same language, theme, and viewport. Check Korean and English,
light and dark themes, narrow and wide screens. Exercise keyboard focus, mobile
sheets, reduced motion, internal scroll areas, and sidebar navigation. Do not
hide focus outlines to fix unwanted automatic focus on arrival.

## Change content and examples

### Hand-authored documentation

Edit the matching files under `src/content/docs/docs` and
`src/content/docs/ko/docs` together. Keep route suffixes, examples, public names,
and support limits aligned. Retain existing anchors when editing headings.
[astro.config.mjs](astro.config.mjs) owns explicit menu order, translated group
labels, autogenerated groups, and redirects; frontmatter owns page title,
description, and order inside autogenerated groups. For a route change, update
both locales, inbound links, and necessary redirects. Verify language switching
and previous/next navigation rather than only opening the new URL.

### Generated component references and live previews

Files marked `Generated by apps/docs/scripts/generate-ui-reference.mjs` are
outputs. Change the [generator](scripts/generate-ui-reference.mjs), its bilingual
explanations, or the owning package contract, then regenerate from the repository root:

```sh
npm run build:ui
node apps/docs/scripts/generate-ui-reference.mjs
node apps/docs/scripts/generate-ui-reference.mjs --check
```

The generator reads `packages/ui/dist/support.json` and generates 66 detail pages in each locale. Run `npm run build:ui` before regenerating and make table changes in the package contract and generator.

[MarkdownContent.astro](src/components/docs/MarkdownContent.astro) inserts
[ComponentDemo.astro](src/components/ComponentDemo.astro) into each component route.
[component-reference-demos.mjs](src/examples/component-reference-demos.mjs) defines the localized
primary and variant examples. Displayed, copied and executed JSON use the same initial definition.

[DemoWorkbench.svelte](src/components/DemoWorkbench.svelte) owns the example tabs and toolbar.
[component-demo-ui-runtime.ts](src/examples/component-demo-ui-runtime.ts) attaches core Views
through `@viewstem/ui`. Sonner registers its host Action against a separate DOM Notifications View.
[component-demo-ui-setup.ts](src/examples/component-demo-ui-setup.ts) generates the consumer setup code.
Tab changes preserve runtime state, and rerunning restores the initial state.

### Lessons and playground

For a lesson, change its definition and bilingual catalog entry together; the
catalog drives routes and learning order. Check the expected result, suggested
edit, required resources/inputs, reset, and adjacent lessons. Fixtures must remain
distinguishable from real host APIs. For the playground, preserve manual Run,
unrun-change feedback, and draft restoration across same-tab language changes;
restored drafts must not execute automatically.

## Choose checks by the changed boundary

Run commands below from the repository root. This is a selection guide, not a
requirement to run every script for every edit. Existing evidence is reusable only
while its code, inputs, build and environment still apply. Browser scripts use
Playwright; install its Chromium with `npx playwright install chromium` if needed.
The font/navigation, shared-sidebar, inheritance, scroll and search scripts also
include checks that launch installed Google Chrome.

| Change | Existing checks |
| --- | --- |
| Maintainer Markdown only | Check local links and commands against their owners; `git diff --check`. No site build is needed. |
| Site routes/content/menu | Fresh `npm run build:docs`, then `node apps/docs/scripts/verify-docs-site.mjs`; `node apps/docs/scripts/verify-starlight-i18n.mjs` for Starlight localization changes |
| Astro/Svelte/TypeScript | `npm run typecheck:docs`; `node apps/docs/scripts/verify-site-svelte.mjs` checks upstream site sources, React exclusion and built islands |
| Core, DSL, UI usage snippets or task guides | Respectively `node apps/docs/scripts/verify-core-docs.mjs`, `node apps/docs/scripts/verify-dsl-docs.mjs`, `node apps/docs/scripts/verify-ui-docs.mjs`, `node apps/docs/scripts/verify-task-guides.mjs` |
| Component references/setup | Generator `--check`; `node apps/docs/scripts/verify-component-setup.mjs` |
| Component example and tabs | `node --test apps/docs/scripts/component-demo-session.test.mjs`; `node apps/docs/scripts/verify-component-demos.mjs` |
| Examples and playground | `node apps/docs/scripts/verify-site-previews.mjs` against the built site at `DOCS_ORIGIN` |
| Sidebar persistence/ScrollArea | `node apps/docs/scripts/verify-sidebar-scroll.mjs`; `node apps/docs/scripts/verify-sidebar-scrollarea.mjs`; live checks below for shared markup and text |

Snippet/setup checks consume built library exports: rebuild changed packages with
`npm run build:ui` first. Link, site-source, component-setup, sidebar, component examples, and
fidelity checks consume `apps/docs/dist`; rebuild the site after relevant changes.
The sidebar, component examples and fidelity checks start their own static servers.

For checks against a running server, set the origin explicitly; script defaults
differ between ports 4321 and 4323. For example, with the built preview running:

```sh
DOCS_ORIGIN=http://127.0.0.1:4323 node apps/docs/scripts/verify-site-inheritance.mjs
SITE_UI_ORIGIN=http://127.0.0.1:4323 node apps/docs/scripts/verify-site-ui.mjs
DOCS_ORIGIN=http://127.0.0.1:4323 node apps/docs/scripts/verify-site-search.mjs
```

Other `DOCS_ORIGIN` checks are `verify-site-shell.mjs`, `verify-shared-sidebar.mjs`,
`verify-sidebar-text.mjs`, `verify-font-loading.mjs`, `verify-font-navigation.mjs`,
`verify-scroll-regions.mjs`, and `verify-scroll-overlays.mjs`, all in `scripts/`.
For a full preview design audit, use the existing runner:

```sh
node apps/docs/scripts/verify-preview-design.mjs --origin=http://127.0.0.1:4323 --phase=matrix --output=/tmp/viewstem-preview-review
DEMO_INTERACTIONS_ONLY=1 node apps/docs/scripts/verify-component-demos.mjs
```

These capture render and interaction evidence; they do not replace visual review.
The runner also supports `--family=<slug>` for a focused check. Distinguish that
sample from a full catalog audit. Keep temporary screenshots/DOM captures outside
the source tree. For historical findings and limitations, see the dated
[review records](review). Report actual commands, coverage,
failures and unexecuted areas; do not rewrite old results as a new pass.
