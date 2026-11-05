# Site fonts

The site serves these fonts locally. Runtime requests do not depend on a font CDN.
Each family includes its upstream SIL Open Font License. Exact source URLs,
source hashes and converted output hashes are recorded in `sources.json`.

- **Pretendard Variable 1.3.9**: upstream dynamic Unicode subsets, unchanged.
  `public/fonts/site-fonts.css` retains the upstream Unicode ranges and uses local URLs.
  Only subsets needed by the current text are requested.
- **D2Coding**: regular and bold, from upstream revision
  `48d294137e3b65158deef2f5846d2e335e43f92f`, compressed from the standard TTF
  files into WOFF2 with FontTools. No glyphs are removed. Code ligatures are
  disabled in CSS, including CodeMirror.
- **Noto Sans Symbols 2**: from Google Fonts revision
  `bbda7253fc363238b05d97515ca71f8ae49c4fa9`, compressed from TTF into WOFF2
  with FontTools. No glyphs are removed; this is a symbol fallback, not a
  guarantee of complete Unicode coverage.

`site-theme.css` owns the shared font stacks for the home page, documentation,
examples, preview controls and playground. Platform color emoji fonts precede
the symbol fallback so emoji-only characters retain their platform appearance.
UI icons remain SVG. Pretendard and D2Coding use `font-display: optional`:
when a font misses the initial rendering window, readable fallback text remains
stable for that page instead of swapping later. System text fonts precede emoji
and symbol fallbacks, preventing a late symbol font from changing ordinary spaces.
Noto Sans Symbols 2 retains `swap` so uncommon missing symbols can still appear.

`FontPreload.astro` links the font-face stylesheet directly from `public/`. It is
not imported into a Vite CSS module: replacing the SSR style during development
would recreate font faces and can change already-visible text to fallback glyphs.
The shared theme stylesheet contains font stacks, not font-face declarations.

`FontPreload.astro` derives the required Pretendard subsets from the page title,
shared navigation, and the CSS Unicode ranges. It also preloads regular D2Coding
(already used by shared shortcuts and inline code). It does not preload all Korean
subsets or the bold code font. The policy is shared by home, docs, examples, and
playground; it does not hide the page or wait for fonts in JavaScript.

When updating fonts, preserve the licenses, update `sources.json`, retain the
matching Unicode ranges, and verify actual rendered fonts as well as loading.
