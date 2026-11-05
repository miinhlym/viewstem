# Site UI sources

The website uses official **shadcn-svelte**, installed directly in the Astro site.
It follows https://www.shadcn-svelte.com/docs/installation/astro. Site controls do
not import the library's `@viewstem/svelte-ui` catalog; that package remains the
runtime behind the public JSON examples.

- CLI: `shadcn-svelte@1.8.0`; configuration: `../components.json`.
- Registry style: `nova`; icons: Lucide; base color: Neutral.
- `site-ui-manifest.json` records the 28 installed component families, source
  SHA-256 hashes, and the official utility source hash.
- Sources in `src/components/ui/<component>` were installed through the official
  CLI on 2026-11-06 without modifying their implementation.
- `shadcn-svelte-LICENSE.md` preserves the upstream MIT license.
- `shadcn-neutral.json` preserves the original Neutral payload used by the site;
  those semantic tokens and the Pretendard/D2Coding fonts remain unchanged.
- `src/components/site`, `src/components/docs`, and the Svelte workbench/playground
  compose these components with navigation, translation, and editor state.

Docs and examples share `site/SidebarTree.svelte` for links and collapsible groups,
and `site/SidebarSheet.svelte` for the mobile navigation panel. Their adapters only
supply route data and documentation persistence hooks. Sidebar dimensions and
reading width come from the shared `--site-sidebar-*` / `--site-content-width`
tokens; the examples index uses the full page frame, independently of the home
page's marketing container.

`src/styles/global.css` imports Tailwind and `shadcn-svelte/tailwind.css` custom
variants. CSS layers place Tailwind preflight before Starlight layout and site
utilities after Starlight reset. The library previews retain their independent
scoped CSS. ThemeInit and ThemeMenu synchronize `.dark` and Starlight's
`data-theme` before paint and on theme changes.

The 2026-11-05 React implementation was superseded by D130. Its license and
`site-react-ui-manifest-2026-11-05.json` are retained as historical evidence. React,
React DOM, the Astro React integration, React type packages, Radix React UI,
Lucide React, React Resizable Panels, and the React shadcn CLI are not dependencies
of the current site.

The site primitive audit is recorded in [site-ui-audit-2026-11-06.md](site-ui-audit-2026-11-06.md).
Search uses official Command/LinkItem, Dialog and Kbd; filtering uses ToggleGroup;
empty states, loading feedback, errors, badges and tooltips compose the corresponding
upstream components. Registry dependencies (InputGroup/Textarea and Toggle) are
included unchanged. Existing vendor files were verified before adding the new families.
