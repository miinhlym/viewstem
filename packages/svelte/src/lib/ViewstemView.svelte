<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { createDiagnostic, createPreparationError, notifyDiagnostic, prepareOwnedView } from '@viewstem/core/renderer';
  import type { PublicError, View, ViewApplication, ViewSource } from '@viewstem/core';
  import type { ViewstemViewComponentProps } from './types.js';
  import { cancelled, failure, rendererStates } from './connection.js';
  import { snapshotSource } from './source.js';
  import ConnectedView from './ConnectedView.svelte';

  let { renderer, view, source, inputs, onError, fallback, pending, prepareError }: ViewstemViewComponentProps = $props();

  const initial = untrack(() => {
    if ((view === undefined) === (source === undefined)) {
      throw failure('INVALID_DEFINITION', 'ViewstemView requires exactly one of view or source.');
    }
    if (source === undefined) return { owned: false as const, renderer };
    let definition: ViewSource;
    try { definition = snapshotSource(source) as ViewSource; }
    catch { return { owned: true as const, renderer, error: createPreparationError('Could not snapshot the ViewstemView source.') }; }
    try { return { owned: true as const, renderer, start: prepareOwnedView(renderer.runtime, definition, { inputs }) }; }
    catch (error) { return { owned: true as const, renderer, error: error as PublicError }; }
  });

  let attached: ReturnType<typeof ConnectedView> | undefined = $state.raw();
  let ownedView: View | undefined = $state.raw();
  let loading = $state(false);
  let preparationError: PublicError | undefined = $state.raw();
  let propError: PublicError | undefined = $state.raw();
  let prepare: Promise<View> | undefined;
  let stop: (() => Promise<void>) | undefined;
  let closed = false;
  let destroyed = false;
  onDestroy(() => { destroyed = true; });

  function report(error: PublicError, invalidProps = false) {
    const activeRenderer = initial.owned ? initial.renderer : renderer;
    const state = rendererStates.get(activeRenderer);
    const open = () => !destroyed && (invalidProps || !closed) && !!state?.alive;
    notifyDiagnostic(createDiagnostic('prepare', error),
      { listener: state?.onError, isOpen: open }, { listener: onError, isOpen: open });
  }

  onMount(() => {
    if (!initial.owned || incompatible) return;
    const owner = initial.renderer;
    const state = rendererStates.get(owner);
    if (!state?.alive) {
      closed = true;
      return;
    }
    const controller = new AbortController();
    let closeView: (() => Promise<void>) | undefined;
    let cleanup: Promise<void> | undefined;
    const close = () => {
      if (cleanup) return cleanup;
      closed = true;
      cleanup = Promise.resolve().then(async () => {
        const results = await Promise.allSettled([closeView?.(), prepare?.catch(() => {})]);
        await tick();
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
      }).finally(() => { state.ownedViews.delete(close); });
      controller.abort();
      queueMicrotask(() => {
        ownedView = undefined;
        preparationError = undefined;
        loading = false;
      });
      return cleanup;
    };
    stop = close;
    state.ownedViews.add(close);
    if (!initial.start) {
      preparationError = initial.error;
      report(initial.error);
      return () => { void close().catch(() => {}); };
    }
    loading = true;
    prepare = initial.start(controller.signal, {
      isOpen: () => !closed && state.alive,
      onCreate(close) { closeView = close; },
    }).then(result => {
      if (closed || !state.alive) throw cancelled();
      ownedView = result;
      loading = false;
      return result;
    }, (error: PublicError) => {
      if (closed) throw cancelled();
      loading = false;
      if (error.code !== 'CANCELLED') {
        preparationError = error;
        report(error);
      }
      throw error;
    });
    void prepare.catch(() => {});
    return () => { void close().catch(() => {}); };
  });

  let incompatible = $derived(initial.owned
    ? renderer !== initial.renderer || source === undefined || view !== undefined
    : view === undefined || source !== undefined);
  // Changing ownership requires a new component. Close the old lifetime once
  // and report the invalid change without tracking the diagnostic callback.
  $effect(() => {
    if (!incompatible) return;
    untrack(() => {
      if (closed || propError) return;
      const error = createPreparationError('Remount ViewstemView to change its ownership mode or owned renderer.');
      void stop?.().catch(() => {});
      propError = error;
      report(error, true);
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
    if (!closed && !propError && attached?.matches(renderer, initial.owned ? ownedView : view)) return attached.whenRendered();
    await (await connection()).whenRendered();
  }

  export async function whenSettled(application: ViewApplication) {
    if (!closed && !propError && attached?.matches(renderer, initial.owned ? ownedView : view)) return attached.whenSettled(application);
    return (await connection()).whenSettled(application);
  }
</script>

{#if propError}
  {@render prepareError?.(propError)}
{:else if initial.owned}
  {#if ownedView}
    <ConnectedView renderer={initial.renderer} view={ownedView} {onError} {fallback} isOpen={() => !closed && !destroyed} bind:this={attached} />
  {:else if preparationError}
    {@render prepareError?.(preparationError)}
  {:else if loading}
    {@render pending?.()}
  {/if}
{:else if view !== undefined && source === undefined}
  {#key renderer}
    {#key view}
      <ConnectedView {renderer} {view} {onError} {fallback} isOpen={() => !destroyed} bind:this={attached} />
    {/key}
  {/key}
{/if}
