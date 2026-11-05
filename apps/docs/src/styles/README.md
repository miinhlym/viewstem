# Site style ownership

All routes (home, documentation, examples, playground; English and Korean) load
`site.css`. `SiteHead.astro` loads it for standalone Astro pages; Starlight loads
that same entry through `customCss`. Do not import `home.css` to initialize another
page. Page CSS owns layout and explicitly scoped presentation only.

| Owner | Responsibility |
| --- | --- |
| `layer-order.css` | Declares framework reset → `site-base` → component/utility precedence before Starlight or preview styles load. |
| `global.css` | Tailwind generation and the official shadcn neutral palette/utility mapping. |
| `site-theme.css` | Site font stacks, heading/body/code tokens, layout tokens, palette aliases and syntax colors. |
| `site-base.css` | Root/body inheritance, font smoothing, text sizing, Korean wrapping, heading defaults, form inheritance, code font, focus and shared navigation typography. |
| `docs.css` | Maps Starlight variables to site tokens; documentation frame, prose spacing and table/details layout. |
| `header.css`, `home.css`, `examples.css`, `playground-layout.css` | Their own layouts. Home display headings are limited to hero/section headings, never all headings under body. |
| `demo-workbench.css`, `demo-options-layout.css` | Demo pane and control arrangement. |
| `component-demo-theme.css` | Preserves original library preview theme defaults, including portals. |
| `scroll-regions.css`, `motion.css` | Shared ScrollArea host sizing and motion/reduced-motion behavior. |

The `site-base` cascade layer comes after Starlight and Tailwind resets and before
component utilities. Never fix page inheritance differences with blanket
`!important`, vendor edits, or a per-page copy of the typography reset. Components
may intentionally set their own size/weight/line height. Home display typography,
compact toolbar titles and monospace code are explicit roles, not alternate page
baselines. Korean uses `keep-all`, English uses `normal`; both share all other
body defaults. Portals inherit directly from this same body baseline.

`json-editor.ts` applies the common code tokens through CodeMirror's theme API.
Astro's Expressive Code configuration and static JSON blocks use these same font,
size, line-height and syntax-color tokens. Do not redefine editor typography in
page CSS. Static `/fonts/site-fonts.css` remains outside Vite-injected CSS to avoid
font-face replacement during hydration/navigation.

The pinned official `components/ui` source and generated runtime preview CSS are
not site reset owners; preserve their source. Generated `*.generated.css` files
are build outputs and are not edited manually.

Verification: `verify-site-inheritance.mjs` compares root/body, actual shared
header controls, native text/form defaults, mobile portals and code editors over
six page kinds × two languages × three widths × two themes (72 cases).
`verify-shared-sidebar.mjs`, `verify-sidebar-scrollarea.mjs`,
`verify-font-navigation.mjs`, `verify-scroll-regions.mjs`, and
`verify-scroll-overlays.mjs` cover the affected interaction boundaries.
