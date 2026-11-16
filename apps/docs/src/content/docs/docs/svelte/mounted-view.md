---
title: MountedView and RenderAttachment
description: Use View handles to wait for rendering, apply definition changes, and clean up.
sidebar:
  order: 2
---

## MountedView

`renderer.mount({ target, source, inputs?, url?, onError? })` returns a screen synchronously. Await `screen.ready` to obtain its View. Await `screen.whenRendered()` for the current DOM or `screen.whenSettled(application)` for the application's Query report and DOM update. `await screen.unmount()` releases the owned View and target.

## RenderAttachment

`renderer.attach(view, target, options?)` borrows the View. It exposes `whenRendered()`, `whenSettled(application)` and `detach()`. Await `detach()` before reusing the target. The View owner manages its lifetime.

A View's `initial` is its first application; `updateDefinition`, `setInputs`, and `replace` return later application handles. The core method `view.whenSettled(application)` waits for Query diagnostics without waiting for the renderer. Neither completion method waits for browser paint.
