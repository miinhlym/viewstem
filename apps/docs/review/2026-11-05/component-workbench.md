# Component documentation workbench

## Scope and references

This revision changes the documentation workbench around all 66 bilingual component examples. It does not change the original shadcn-svelte previews or the library adapter. Eight component families currently expose interactive controls.

- [Mantine Button configurator](https://mantine.dev/core/button/): preview next to a compact configuration panel; code stays directly associated with the configuration.
- [Storybook Controls](https://storybook.js.org/docs/essentials/controls): concise named controls update the rendered example; control type follows argument metadata.
- [shadcn Button documentation](https://ui.shadcn.com/docs/components/base/button): a bounded example, code disclosure, and copy action. Current docs use View Code rather than assuming a particular tab implementation.
- [ECharts editor](https://echarts.apache.org/examples/en/editor.html?c=bar-simple): paired configuration and result is relevant; full editor chrome is unnecessary for these small examples. Its client-only page was not used as evidence for exact visual measurements.

## Design before implementation

Keep the site's official shadcn Neutral palette: white #ffffff, foreground #171717, muted #f5f5f5, muted foreground #737373, border #e5e5e5; dark equivalents come from the existing semantic tokens. Pretendard remains the UI font, D2Coding the JSON font. Left-aligned labels and compact 12–14px supporting type keep the component itself prominent.

Desktop, measured by workbench container width (at least 42rem):

```
[ Preview | JSON ]                  [rerun] [copy]
+--------------------------------+-----------------+
|                                | Key options     |
| live component OR view.json    | label      (i)  |
|                                | [control]       |
|                                | ...             |
|                                | restore defaults|
+--------------------------------+-----------------+
status (reserved line)
Run in your app / setup.ts disclosure
```

Compact containers: `[Preview | Options | JSON]`, one active panel, same controls and same live DOM. No forced narrow split. Long JSON scrolls inside its panel. Options are a single column, descriptions and full paths available through a deliberate disclosure. No repeated cards or long path labels in the default view.

Brief review: the distinguishing interaction is inspecting one JSON declaration while changing its corresponding real component. A generic settings grid still makes the reader travel vertically, so replace it with an adjacent rail. Three simultaneous columns would leave less than 250px for each task at the current docs width; use preview/JSON tabs instead. Tabs must preserve mounted runtime state; settings changes explicitly restart it. Preserve direct JSON/option links, IME, copy, numeric error feedback, and the original SSR JSON/setup snippets.

## Acceptance

- Shared layout covers 132 pages; controls remain available for all eight configured families.
- Desktop preview/source and options are adjacent; compact layout has keyboard-operable tabs without horizontal page overflow.
- Tabs do not reset runtime input/state. Changing options and rerun/restore retain their existing distinct behavior.
- Show in JSON reveals and highlights the exact field; API reference links reveal/focus the option, including direct URLs.
- English/Korean, light/dark, 320px/1440px; original shadcn-svelte component markup and styles retained.
- Relevant type checks, production build, behavioral browser checks, visual inspection, and static snippet/link checks.

## Execution evidence

Implemented with the existing official React shadcn Tabs, Button, Field, Input, NativeSelect, Checkbox, and Collapsible. The original component source files and library adapter were not changed. Astro server-rendered JSON lives in a memoized static slot; force-mounted panels preserve the runtime DOM while switching visibility.

Visual critique after implementation: the 736px docs body now gives the preview 478px and the controls a 256px rail. The previous repeated paths and explanation blocks are absent from the default view. Rounded outer containment groups one example rather than adding a card for every option. The stale standalone JSON TOC entry was removed because JSON is now a view within the example; its direct anchor is retained. The CSS breakpoint and ARIA mode both follow 42rem, including enlarged root text. The option help explicitly says changes restart the preview.

An independent review found a missing focus handoff for direct option/JSON URLs; this was fixed. A new resize test then reproduced a browser focus loss when CSS hid the focused rail before ResizeObserver ran. Tracking the actual focused control and revealing/restoring it during the responsive transition fixed the issue. Both paths are covered in the final browser run. No unresolved review findings remain.

- [Options](component-workbench/options.json): all eight configured families × English/Korean × light/dark × 320/1440px = 64 combinations, plus five flow groups. Covers IME, rapid edits, validation, defaults, rerun, copy, JSON highlight, reference round trip, delayed/failed loading, lifecycle, streamed HTML, actual Svelte input DOM identity, keyboard tabs, direct URL focus, responsive focus, enlarged root text, and no-JavaScript JSON/setup access. 69 checks, no failures.
- [Component pages](component-workbench/demos.json): all 132 bilingual pages render their exact JSON; menu coverage, 320px overflow, and representative real interactions pass.
- [Original library styles](component-workbench/library-styles.json): 264 combinations (66 families × two widths × two themes), no differences against the existing independent upstream-style oracle. This compares actual Svelte previews, not the React site controls.
- [Static site](component-workbench/site-integrity.json): 335 HTML pages, 40,770 internal links, zero errors. [Setup snippets](component-workbench/setup.txt): all 132 exact rendered JSON/setup pairs type-check.
- [Session tests](component-workbench/session-tests.tap): 4/4 pass. Full workspace type checking passed, including docs with 96 files and zero errors/warnings/hints. Final React focus changes additionally passed the docs TypeScript check. The final Astro production build succeeded.
- [Development server](component-workbench/dev.json): restarted port 4321 after the Astro check/build cache changed; real input state, variant/source linkage, dark mobile options, and an Accordion without option controls pass with no browser errors.

Evidence reuse: the full page and original-style runs cover the new workbench/slot layout. Later changes only adjusted option help, the workbench border, TOC entry, URL focus, and responsive focus; their affected checks were rerun in the final options/static/dev checks rather than repeating all unchanged library styles. Browsers were Chromium. No deployment or package publication was performed.
