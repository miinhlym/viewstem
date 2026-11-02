# Svelte consumer example

English | [한국어](README.ko.md)

Run this from the repository root.

```sh
npm run build:svelte && node packages/svelte/example/server.mjs
```

Open `http://127.0.0.1:4174`, enter a name, and try the reset button. Set the `PORT` environment variable to change the port. Restart the server after editing source files.

- `definition.ts` defines the host Component contracts and a JSON-serializable View. An input event triggers an inline SetState Action, and Label displays the resulting Derived value.
- `adapters/` contains the four Svelte implementations supplied by the host. Stack lays out the default and footer slots. Input and Button emit events only when `node.status` is ready.
- `App.svelte` starts with `createRenderer()`, explicitly registers the contracts and adapters separately, and passes the result of `renderer.runtime.createView` to `<ViewstemView>`. On teardown, `renderer.dispose()` also cleans up the internal Runtime and View.

This client app imports all Viewstem APIs and shared types from the public `@viewstem/svelte` entry point. Core is an internal dependency. The app supplies and registers its own components. The local server serves the built HTML and JavaScript on a loopback address.
