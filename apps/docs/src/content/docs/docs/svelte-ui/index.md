---
title: Svelte UI
description: Register shadcn component sets and compose them in Viewstem.
sidebar:
  order: 0
---

`@viewstem/svelte-ui` provides styled shadcn-svelte components for the [Svelte renderer](/docs/svelte/renderer/). Register the sets your app needs, then refer to their components by ID in a View. You can also import upstream parts directly into host Svelte components.

## Guides

- [Register component families](guides/register-families/) and mount a first View.
- [Compose components in JSON](guides/compose-json/) with inputs, slots, and event Actions.
- [Style the kit and use native Svelte parts](guides/style-and-native/) for theming, snippets, and bindings.

## Reference

- [Registration API and `ComponentSet`](registration/) covers the package root.
- [Component sets](component-sets/) maps every public family import to its component reference.
- [Support metadata and stylesheet](support/) explains the two static package exports, JSON input schemas, and event payloads.

The catalog includes 66 families and 386 upstream Svelte parts. The full kit registers 351 of those parts and six additional JSON compositions, for 357 Viewstem component IDs. The other 35 upstream parts require native Svelte context.
