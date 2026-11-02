# shadcn-svelte source snapshot

The snapshot contains the official Nova registry payloads from the revision in
[source.json](source.json), the Neutral palette, shared helpers, and CSS utilities.
It preserves the original JSON/CSS text and records the SHA-256 of each file.
The generated sources include all 62 direct-source catalog families, covering
386 catalog component bindings. The catalog inventory documents alias counting
and the separately implemented recipe families.

From the repository root after installing locked dependencies:

```sh
node packages/svelte-ui/scripts/vendor-source.mjs
node packages/svelte-ui/scripts/css-build.mjs
```

Both commands also accept `--check` for byte-for-byte verification. They use
local files and dependencies. Use the following command with the checkout or
extracted archive at the pinned revision to refresh the inputs. The import
checks all 62 original barrels against the catalog inventory.

```sh
node packages/svelte-ui/scripts/vendor-snapshot.mjs /path/to/pinned/shadcn-svelte
```

The registry has already applied Nova utility classes. Generation selects Lucide
icons, resolves library and hook paths, applies the default menu treatment,
keeps host typography, and inserts `data-viewstem-shadcn` where widgets own
styled DOM. Keep changes to this process in the generator. Source attribution and
terms are in [NOTICE.txt](NOTICE.txt).

The package stylesheet scans vendor and local UI source, and emits scoped CSS.
Set `--viewstem-*` semantic variables on a host ancestor to customize the
Neutral theme. Dark mode follows `.dark` or `data-theme="dark"` on a DOM
ancestor. Set the theme on `html` or `body` to include default body portals.
A portal mounted elsewhere follows the theme of that DOM location.
