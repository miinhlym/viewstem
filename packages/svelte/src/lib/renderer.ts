import { mount, unmount } from 'svelte';
import { createRegistry, createRuntime } from '@viewstem/core';
import type { View, ViewSpec, ViewTarget, InitialReport } from '@viewstem/core';
import ViewstemView from './ViewstemView.svelte';
import { cancelled, failure, rendererStates, transformError, type RendererState } from './connection.js';
import type { ComponentAdapter, ComponentRegistration, RenderAttachment, MountedView, RenderOptions, Renderer, RendererOptions } from './types.js';

const targets = new WeakMap<Element, object>();

export function createRenderer({ runtime: injectedRuntime, onError, ...runtimeOptions }: RendererOptions = {}): Renderer {
  if (injectedRuntime !== undefined && Object.keys(runtimeOptions).length) throw failure('INVALID_DEFINITION', 'Runtime injection and Runtime creation options are mutually exclusive.');
  const ownsRuntime = injectedRuntime === undefined;
  const runtime = injectedRuntime === undefined
    ? createRuntime({ ...runtimeOptions, registry: runtimeOptions.registry === undefined ? createRegistry({ functions: runtimeOptions.functions }) : runtimeOptions.registry })
    : injectedRuntime;
  const state: RendererState = { alive: true, adapters: new Map(), connections: new Set(), onError };
  const attachments = new Set<RenderAttachment>();
  const pending = new Set<Promise<void>>();
  let disposal: Promise<void> | undefined;
  const check = () => { if (!state.alive) throw cancelled(); };
  function claim(target: Element): object {
    check();
    if (!target || target.nodeType !== 1 || typeof target.appendChild !== 'function') throw failure('INVALID_DEFINITION', 'A DOM Element target is required.');
    if (targets.has(target)) throw failure('INVALID_DEFINITION', 'This target already has a renderer attachment.');
    const token = {};
    targets.set(target, token);
    return token;
  }
  function release(target: Element, token: object) { if (targets.get(target) === token) targets.delete(target); }
  function attach(view: View, target: Element, options: RenderOptions, token: object, owned: boolean): RenderAttachment {
    let instance: ReturnType<typeof ViewstemView>;
    try {
      instance = mount(ViewstemView, { target, context: options.context, transformError: transformError, props: { view, renderer, onError: options.onError, fallback: options.fallback } });
      // Host component initialization may synchronously dispose its renderer.
      if (!state.alive) { void unmount(instance).catch(() => {}); throw cancelled(); }
    } catch (error) {
      release(target, token);
      if (owned) view.dispose();
      throw state.alive ? transformError(error) : cancelled();
    }
    let disposed = false, stopped: Promise<void> | undefined;
    const attachment: RenderAttachment = {
      view,
      async whenRendered() { if (disposed) throw cancelled(); await instance.whenRendered(); if (disposed) throw cancelled(); },
      dispose() {
        if (stopped) return stopped;
        let resolve!: () => void, reject!: (error: unknown) => void;
        stopped = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
        disposed = true;
        attachments.delete(attachment);
        const cleanup: Promise<void>[] = [];
        // Publish the promise before host teardown can reenter. Execution stops
        // synchronously, and a failing host cleanup must not retain the DOM claim.
        try { if (owned) view.dispose(); } catch (error) { cleanup.push(Promise.reject(error)); }
        try { cleanup.push(unmount(instance)); } catch (error) { cleanup.push(Promise.reject(error)); }
        void Promise.allSettled(cleanup).then(results => {
          release(target, token);
          const failed = results.find(result => result.status === 'rejected');
          if (failed?.status === 'rejected') reject(failed.reason); else resolve();
        });
        return stopped;
      },
    };
    attachments.add(attachment);
    return attachment;
  }
  const renderer: Renderer = {
    runtime,
    registry: runtime.registry,
    registerComponent(id, component) {
      check();
      runtime.registry.get('Component', id);
      if (!runtime.registry.isCode('Component', id) || typeof component !== 'function' || state.adapters.has(id)) throw failure('INVALID_DEFINITION', 'Register one Svelte implementation for an existing code Component.');
      state.adapters.set(id, component);
    },
    registerComponents(entries) {
      check();
      if (!Array.isArray(entries)) throw failure('INVALID_DEFINITION', 'Component registrations must be an array.');
      const contracts: ComponentRegistration['contract'][] = [];
      const adapters = new Map<string, ComponentAdapter>();
      const registrations = Array.from(entries, entry => {
        const { contract, component } = entry ?? {};
        return { contract, component };
      });
      for (const { contract, component } of registrations) {
        const id = contract?.id;
        if (contract?.kind !== 'Component' || typeof id !== 'string' || !id || typeof component !== 'function' || adapters.has(id)) {
          throw failure('INVALID_DEFINITION', 'Each registration requires a distinct Component contract and Svelte implementation.');
        }
        contracts.push(contract);
        adapters.set(id, component);
      }
      check();
      for (const id of adapters.keys()) {
        if (state.adapters.has(id)) throw failure('INVALID_DEFINITION', 'A Svelte implementation is already registered for this Component.');
      }
      runtime.registry.registerComponentContracts(contracts);
      for (const [id, component] of adapters) state.adapters.set(id, component);
    },
    attach(view, target, options = {}) { return attach(view, target, options, claim(target), false); },
    async mount({ target, context, onError: localError, fallback, ...definition }) {
      const token = claim(target);
      let complete!: () => void;
      const completion = new Promise<void>(resolve => { complete = resolve; });
      pending.add(completion);
      let view: View | undefined;
      try {
        const mounted = await runtime.createView(definition as ViewTarget);
        view = mounted.view;
        // Consume cancellation even if the renderer was disposed during resource resolution.
        mounted.initialComplete.catch(() => {});
        check();
        const attachment = attach(view, target, { context, onError: localError, fallback }, token, true);
        const finish = (initial: Promise<InitialReport>): Promise<InitialReport> => {
          const result = initial.then(async report => {
            await attachment.whenRendered();
            if (view!.getSnapshot().generation !== report.generation) throw cancelled();
            return report;
          });
          result.catch(() => {});
          return result;
        };
        const handle: MountedView = {
          ...attachment,
          initialComplete: finish(mounted.initialComplete),
          async update(spec: ViewSpec, options) { check(); const result = await view!.update(spec, options); return { initialComplete: finish(result.initialComplete) }; },
          async replace(next) { check(); const result = await view!.replace(next); return { initialComplete: finish(result.initialComplete) }; },
        };
        return handle;
      } catch (error) {
        try { view?.dispose(); } finally { release(target, token); }
        throw error;
      }
      finally { pending.delete(completion); complete(); }
    },
    dispose() {
      if (disposal) return disposal;
      // Establish the promise before user teardown/abort callbacks can reenter dispose.
      let resolve!: () => void, reject!: (error: unknown) => void;
      disposal = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      state.alive = false;
      const cleanup: Promise<void>[] = [...pending];
      const attempt = (run: () => void | Promise<void>) => {
        try { cleanup.push(Promise.resolve(run())); }
        catch (error) { cleanup.push(Promise.reject(error)); }
      };
      for (const connection of [...state.connections]) attempt(() => connection.dispose());
      // Cancel owned execution synchronously, including Views mounted through runtime.
      // The core Runtime preserves an externally supplied StateStore.
      if (ownsRuntime) attempt(() => runtime.dispose());
      for (const attachment of [...attachments]) attempt(() => attachment.dispose());
      // A host resourceResolver cannot be forcibly aborted. Wait for late mount cleanup
      // and all detachments, even if an individual teardown fails.
      void Promise.allSettled(cleanup).then(results => {
        const failed = results.find(result => result.status === 'rejected');
        if (failed?.status === 'rejected') reject(failed.reason); else resolve();
      });
      return disposal;
    },
  };
  rendererStates.set(renderer, state);
  return renderer;
}
