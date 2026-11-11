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
| Render the shared catalog in a browser DOM container | `@viewstem/core`, `@viewstem/ui` ([local build and installation](../ui/guides/mount-in-browser/)) |
| Render with your own Svelte components | `@viewstem/core`, `@viewstem/svelte` |

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
npm pack -w @viewstem/core -w @viewstem/ui --pack-destination ../viewstem-packages
```

Install both tarballs from your app. These paths assume it is next to `viewstem-packages`.

```sh
npm install ../viewstem-packages/viewstem-core-0.1.0.tgz ../viewstem-packages/viewstem-ui-0.1.0.tgz
```

The [Quick Start](../quickstart/) runs in a vanilla Vite app or in a connected container in your existing browser app. To use your own Svelte components, run `npm run build:svelte`, pack `@viewstem/svelte` with `npm pack -w @viewstem/svelte --pack-destination ../viewstem-packages`, and follow [Mount in Svelte](../svelte/guides/mount-in-svelte/).
