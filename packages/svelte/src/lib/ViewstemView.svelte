<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { createDiagnostic, createPreparationError, prepareOwnedView } from '@viewstem/core/renderer';
  import type { PublicError, ResourceSet, View, ViewApplication, ViewSource } from '@viewstem/core';
  import type { RenderAttachment, Renderer, RendererDiagnostic, ViewstemViewComponentProps } from './types.js';
  import { cancelled, failure, rendererStates } from './lifecycle.js';
  import { createRenderer, reportComponentDiagnostic } from './renderer.js';
  import { snapshotSource } from './source.js';
  import Display from './Display.svelte';

  let { renderer, view, source, inputs, resourceSets, onError, fallback, pending, prepareError }: ViewstemViewComponentProps = $props();

  let ownedRenderer: Renderer | undefined = $state.raw();
  const initial = untrack(() => {
    if ((view === undefined) === (source === undefined) || (view !== undefined && renderer === undefined)
      || (resourceSets !== undefined && (renderer !== undefined || view !== undefined))) {
      throw failure('INVALID_DEFINITION', 'ViewstemView requires a source or a view with a renderer. Resource sets require a source without a renderer.');
    }
    if (source === undefined) return { owned: false as const, renderer };
    const owner = { owned: true as const, renderer };
    let definition: ViewSource;
    try { definition = snapshotSource(source) as ViewSource; }
    catch { return { ...owner, error: createPreparationError('Could not snapshot the ViewstemView source.') }; }
    try {
      if (resourceSets !== undefined && !Array.isArray(resourceSets)) {
        throw createPreparationError('ViewstemView resourceSets must be an array.');
      }
      const sets: readonly ResourceSet[] = resourceSets?.slice() ?? [];
      const start = prepareOwnedView(renderer?.runtime ?? (() => {
        if (!ownedRenderer) throw cancelled();
        return ownedRenderer.runtime;
      }), definition, { inputs });
      return { ...owner, sets, start };
    } catch (cause) { return { ...owner, error: createDiagnostic('prepare', cause).error }; }
  });

  let attached: ReturnType<typeof Display> | undefined = $state.raw();
  let ownedDisplay: RenderAttachment | undefined;
  let ownedView: View | undefined = $state.raw();
  let loading = $state(false);
  let preparationError: PublicError | undefined = $state.raw();
  let propError: PublicError | undefined = $state.raw();
  let prepare: Promise<View> | undefined;
  let stop: (() => Promise<void>) | undefined;
  let closed = false;
  let destroyed = false;
  onDestroy(() => { destroyed = true; });

  function report(diagnostic: RendererDiagnostic, invalidProps = false) {
    const activeRenderer = initial.owned ? initial.renderer ?? ownedRenderer : renderer ?? initial.renderer;
    reportComponentDiagnostic(activeRenderer, diagnostic, untrack(() => onError),
      () => !destroyed && (invalidProps || !closed));
  }

  function reportPreparation(cause: unknown) {
    const diagnostic = createDiagnostic('prepare', cause);
    preparationError = diagnostic.error;
    report(diagnostic);
  }

  onMount(() => {
    if (!initial.owned || incompatible) return;
    const state = initial.renderer && rendererStates.get(initial.renderer);
    if (initial.renderer && !state?.alive) {
      closed = true;
      return;
    }
    const controller = new AbortController();
    let closeView: (() => Promise<void>) | undefined;
    let release: Promise<void> | undefined;
    const releaseResources = () => release ??= Promise.resolve().then(async () => {
      const results = await Promise.allSettled([closeView?.(), ownedRenderer?.dispose()]);
      const failed = results.find(result => result.status === 'rejected');
      if (failed) {
        report(createDiagnostic('dispose', failed.reason));
        throw failed.reason;
      }
    });
    const prepareFailed = (cause: unknown) => {
      loading = false;
      void releaseResources().catch(() => {});
      reportPreparation(cause);
    };
    let cleanup: Promise<void> | undefined;
    const close = () => {
      if (cleanup) return cleanup;
      closed = true;
      cleanup = Promise.resolve().then(async () => {
        const results = await Promise.allSettled([releaseResources(), ownedDisplay?.detach(), prepare?.catch(() => {})]);
        ownedDisplay = undefined;
        await tick();
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
      }).finally(() => { state?.ownedCleanups.delete(close); });
      controller.abort();
      queueMicrotask(() => {
        ownedView = undefined;
        preparationError = undefined;
        loading = false;
      });
      return cleanup;
    };
    stop = close;
    state?.ownedCleanups.add(close);
    try {
      if ('error' in initial) throw initial.error;
      if (initial.renderer === undefined) {
        ownedRenderer = createRenderer();
        for (const set of initial.sets) ownedRenderer.runtime.registry.registerResourceSet(set);
      }
      const open = () => !closed && (state?.alive ?? true);
      loading = true;
      prepare = initial.start(controller.signal, {
        isOpen: open,
        onCreate(close) { closeView = close; },
      }).then(result => {
        if (!open()) throw cancelled();
        ownedView = result;
        loading = false;
        return result;
      }, (cause: PublicError) => {
        if (!open()) throw cancelled();
        if (cause.code !== 'CANCELLED') prepareFailed(cause);
        else loading = false;
        throw cause;
      });
      void prepare.catch(() => {});
    } catch (cause) { prepareFailed(cause); }
    return () => { void close().catch(() => {}); };
  });

  let incompatible = $derived(initial.owned
    ? renderer !== initial.renderer || source === undefined || view !== undefined || (renderer !== undefined && resourceSets !== undefined)
    : renderer === undefined || view === undefined || source !== undefined || resourceSets !== undefined);
  // Changing ownership requires a new component. Close the old lifetime once
  // and report the invalid change without tracking the diagnostic callback.
  $effect(() => {
    if (!incompatible) return;
    untrack(() => {
      if (closed || propError) return;
      const error = createPreparationError('Remount ViewstemView to change its ownership mode or owned renderer.');
      void stop?.().catch(() => {});
      propError = error;
      report(createDiagnostic('prepare', error), true);
    });
  });

  async function connection() {
    await tick();
    if (propError) throw propError;
    if (initial.owned && !attached && !closed && prepare) {
      await prepare;
      await tick();
    }
    if (closed) throw cancelled();
    if (preparationError) throw preparationError;
    if (!attached) throw cancelled();
    return attached;
  }

  export async function whenRendered(): Promise<void> {
    if (!closed && !propError && attached?.matches(renderer ?? ownedRenderer, initial.owned ? ownedView : view)) return attached.whenRendered();
    await (await connection()).whenRendered();
  }

  export async function whenSettled(application: ViewApplication) {
    if (!closed && !propError && attached?.matches(renderer ?? ownedRenderer, initial.owned ? ownedView : view)) return attached.whenSettled(application);
    return (await connection()).whenSettled(application);
  }
</script>

{#if propError}
  {@render prepareError?.(propError)}
{:else if initial.owned}
  {@const owner = initial.renderer ?? ownedRenderer}
  {#if ownedView && owner}
    <Display renderer={owner} view={ownedView} {onError} {fallback} isOpen={() => !closed && !destroyed}
      onAttach={display => { ownedDisplay = display; }} bind:this={attached} />
  {:else if preparationError}
    {@render prepareError?.(preparationError)}
  {:else if loading}
    {@render pending?.()}
  {/if}
{:else if renderer !== undefined && view !== undefined && source === undefined}
  {#key renderer}
    {#key view}
      <Display {renderer} {view} {onError} {fallback} isOpen={() => !destroyed} bind:this={attached} />
    {/key}
  {/key}
{/if}
