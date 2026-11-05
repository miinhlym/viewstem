---
title: Style the kit and use native Svelte parts
description: Apply the bundled theme, override tokens, and use native components when you need Svelte APIs.
sidebar:
  order: 3
---

## Apply the bundled CSS

Import `@viewstem/svelte-ui/shadcn/styles.css` once from your browser entry point. The stylesheet includes the kit's Nova styles and neutral theme. It scopes the component rules and reset to the kit's `data-viewstem-shadcn` elements and their content. It works without a host Tailwind build.

## Set a theme for overlays too

Set `class="dark"` or `data-theme="dark"` on `html` for dark mode. Define semantic tokens on `html` or `body` so overlays portaled into the body inherit them. Tokens on an inner wrapper apply only to descendants of that wrapper.

Where the part accepts a `class` input, pass a class such as `"toolbar-save"` and define it in the host stylesheet. Use your host Tailwind build if you need utility classes beyond the bundled stylesheet.

```css
:root {
  --viewstem-primary: #254fc6;
  --viewstem-primary-foreground: #fff;
}

:root[data-theme="dark"] {
  --viewstem-primary: #a6b8ff;
  --viewstem-primary-foreground: #17234c;
}

[data-viewstem-shadcn].toolbar-save {
  min-width: 8rem;
}
```

## Bind a native Calendar in Svelte

Import the family subpath's `components` namespace. For this example, add `@internationalized/date` to your app's direct dependencies. `Calendar.Calendar` accepts a native `DateValue`. The JSON ID `shadcn.Calendar.Root` takes a date-only string and encodes changed values for Viewstem.

```svelte
<script lang="ts">
  import { parseDate, type DateValue } from '@internationalized/date';
  import { components as Calendar } from '@viewstem/svelte-ui/shadcn/calendar';
  import '@viewstem/svelte-ui/shadcn/styles.css';

  let date = $state<DateValue | undefined>(parseDate('2026-11-03'));
</script>

<Calendar.Calendar type="single" bind:value={date} />
```

Use native Svelte parts for scoped snippets, function props, references, `FileList` values, and `bind:` directives. See the [Calendar reference](../../components/calendar/) for native date parts and [Chart](../../components/chart/) for the native tooltip. For custom Svelte code that should be callable from a View, [register a Svelte adapter](/docs/svelte/adapters/).
