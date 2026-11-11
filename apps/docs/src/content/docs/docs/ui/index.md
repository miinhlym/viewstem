---
title: Viewstem UI
description: Render Viewstem JSON in the browser with the framework-independent UI package.
---

`@viewstem/ui` renders a View from [`@viewstem/core`](../core/) into a browser DOM container. It provides the shared shadcn component catalog with Basecoat Vega styles and the Neutral palette. Plain JavaScript, React, Vue, and Svelte apps can use the same DOM attachment API.

The package is a private workspace prototype. The browser guide shows how to build and install local package files.

## Guides

- [Mount a View in the browser](guides/mount-in-browser/) to install the packages, render a button, and dispose of the attachment.
- [Browse the component catalog](components/) to find examples and check which inputs, slots, and events the DOM renderer supports.

## Reference

- [Browser UI API](api/) covers `registerShadcn()`, `attach()`, the stylesheet, and the support metadata.
