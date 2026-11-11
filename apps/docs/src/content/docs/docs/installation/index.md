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
| Build with the supplied Svelte shadcn components | `@viewstem/core`, `@viewstem/svelte`, `@viewstem/svelte-ui` |

### Install Core only

After cloning the repository and running `npm ci`, run these commands from the repository root.

```sh
npm run build
mkdir -p ../viewstem-packages
npm pack -w @viewstem/core --pack-destination ../viewstem-packages
```

From your app directory, install with `npm install /absolute/path/to/viewstem-packages/viewstem-core-0.1.0.tgz`, replacing the path with the generated file location. Continue with the [Core runtime guide](../core/guides/runtime/). To render a Svelte UI, follow the steps below.


## Build the packages

Clone the repository or open your existing Viewstem checkout. Run these commands from the repository root. They create package files for the core, the Svelte renderer, and the shadcn component set.

```sh
git clone https://github.com/miinhlym/viewstem.git
cd viewstem
npm ci
npm run build:svelte-ui

mkdir -p ../viewstem-packages
npm pack -w @viewstem/core -w @viewstem/svelte -w @viewstem/svelte-ui \
  --pack-destination ../viewstem-packages
```

If you already have a checkout, start with `npm ci` from its root.

## Install in a Svelte app

If you need a new app, create it beside your Viewstem checkout.

```sh
cd ..
npm create vite@7.1.3 viewstem-demo -- --template svelte --no-interactive
cd viewstem-demo
```

Run the install command from the root of your Svelte app. These paths assume the app is next to `viewstem-packages`. If your app lives elsewhere, adjust the paths to the three package files.

```sh
npm install \
  ../viewstem-packages/viewstem-core-0.1.0.tgz \
  ../viewstem-packages/viewstem-svelte-0.1.0.tgz \
  ../viewstem-packages/viewstem-svelte-ui-0.1.0.tgz
```

The Svelte renderer uses core internally. The Quick Start imports the renderer and the shadcn component set.

## Next step

[Quick Start](../quickstart/) renders a button from a JSON View in the app you just set up.
