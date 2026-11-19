---
title: Installation
description: Choose the packages for your app and install them from local builds.
---

Viewstem packages are not published to the public npm registry yet. Install them in your app from locally built package files.

## Requirements

- Git and npm.
- Node.js 22.12 or later on a supported release line.
- For rendering in Svelte: Svelte 5.57.3 or later in the 5.x series. Core alone does not require Svelte.

## Choose your packages

| Your task | Packages |
|---|---|
| Use execution, State, and Query without a DOM | `@viewstem/core` |
| Render a View with DOM components | `@viewstem/core`, `@viewstem/dom` |
| Render the shared catalog in a browser DOM container | `@viewstem/core`, `@viewstem/dom`, `@viewstem/ui` |
| Render with your own Svelte components | `@viewstem/core`, `@viewstem/dom`, `@viewstem/svelte` |

### Install Core only

After cloning the repository and running `npm ci`, run these commands from the repository root.

```sh
npm run build
mkdir -p ../viewstem-packages
npm pack -w @viewstem/core --pack-destination ../viewstem-packages
```

From your app directory, install with `npm install /absolute/path/to/viewstem-packages/viewstem-core-0.1.0.tgz`, replacing the path with the generated file location. Continue with the [Core runtime guide](../core/guides/runtime/).

## Build the browser UI packages

From the repository root after `npm ci`, run:

```sh
npm run build:ui
mkdir -p ../viewstem-packages
npm pack -w @viewstem/core -w @viewstem/dom -w @viewstem/ui --pack-destination ../viewstem-packages
```

Install all three tarballs together from your app. These paths assume it is next to `viewstem-packages`.

```sh
npm install ../viewstem-packages/viewstem-core-0.1.0.tgz ../viewstem-packages/viewstem-dom-0.1.0.tgz ../viewstem-packages/viewstem-ui-0.1.0.tgz
```

For custom DOM components alone, use `npm run build:dom` and omit the UI workspace and tarball. With the UI catalog installed, continue to the [Quick Start](../quickstart/).

## Build and install the Svelte packages

From the repository root after `npm ci`, run:

```sh
npm run build:svelte
mkdir -p ../viewstem-packages
npm pack -w @viewstem/core -w @viewstem/dom -w @viewstem/svelte --pack-destination ../viewstem-packages
```

From your Svelte app directory, install all three tarballs together.

```sh
npm install ../viewstem-packages/viewstem-core-0.1.0.tgz ../viewstem-packages/viewstem-dom-0.1.0.tgz ../viewstem-packages/viewstem-svelte-0.1.0.tgz
```

Continue with the [Svelte integration guide](../svelte/guides/mount-in-svelte/).
