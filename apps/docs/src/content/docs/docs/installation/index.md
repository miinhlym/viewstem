---
title: Installation
description: Install the Viewstem packages you need from npm.
---

Run the install command for your use case from your app directory. Commands without a version select npm’s current release. To find docs for an installed version, follow the source and documentation link in that package’s README.

## Requirements

- npm and Node.js 22.12 or later on a supported release line.
- For browser examples, use a bundler that handles ESM and CSS imports, such as Vite.
- For Svelte rendering, use Svelte 5.57.3 or later in the 5.x series.

<a id="install-core"></a>

## Core runtime

Use Core directly to run a View and work with State, Queries, and Actions without rendering a screen.

```sh
npm install @viewstem/core
```

Continue with the [Core runtime guide](../core/guides/runtime/).

<a id="install-dom"></a>

## Custom DOM components

Install the DOM renderer to render a View with components you provide.

```sh
npm install @viewstem/core @viewstem/dom
```

See the [DOM package guide](../dom/) for component registration and mounting.

<a id="install-browser-ui"></a>

## Browser UI catalog

Install the Core runtime, DOM renderer, and default UI catalog to run the browser examples.

```sh
npm install @viewstem/core @viewstem/dom @viewstem/ui
```

Continue with [Quick Start](../quickstart/).

<a id="install-svelte"></a>

## Svelte renderer

Install Core and the Svelte renderer in your Svelte app.

```sh
npm install @viewstem/core @viewstem/svelte
```

Continue with the [Svelte mounting guide](../svelte/guides/mount-in-svelte/).
