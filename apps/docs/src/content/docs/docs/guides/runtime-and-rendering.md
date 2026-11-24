---
title: Runtime and rendering lifetimes
description: Use one View across displays and choose what to wait for and what to dispose.
---

[Core](../../core/) owns the View and its State. A [DOM](../../dom/) or [Svelte](../../svelte/) renderer connects that View to a display. A View can have several display connections, each with its own rendering result.

## Mount and attach

Use `mount()` to create a View owned by a mount. Use `attach(view, target)` to borrow an existing View. Unmounting an owned View ends its lifetime and cancels pending work. Detaching a borrowed View releases the display while the host continues to own the View. On app shutdown, dispose the renderer and the Runtime that the app owns.

## Wait for the right result

| Signal | What it covers |
| --- | --- |
| `mounted.ready` | The View has been prepared and the display is connected. |
| `mounted.whenRendered()` | DOM updates for that display or a failure on that connection. It does not wait for Queries or browser paint. |
| `view.initial` | The initial eligible Query report. Inspect the reported Query errors. |

Check the display's error when it fails to render. A failure on one connection leaves the View and other connections available. Replacing a parent slot may recreate child DOM instances. When the View node keeps its lifetime, its Core State is preserved.

## Supply host capabilities

The host supplies required capabilities before running Actions that need them. An Action whose required host capability is missing fails before its steps run. Provide server-side secret resolution and destination authorization through the [HTTP executor](../../core/http/) when requests use secrets or Login.
