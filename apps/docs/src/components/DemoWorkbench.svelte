<script lang="ts">
  import { flushSync, untrack, type Snippet } from 'svelte';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
  import { Button } from '@/components/ui/button/index.js';
  import * as Tooltip from '@/components/ui/tooltip/index.js';
  import * as Tabs from '@/components/ui/tabs/index.js';
  import DemoOptions from './DemoOptions.svelte';
  import { setupComponentDemo } from '../examples/component-demo-client';
  import type { DemoControl } from '../examples/component-demo-controls.mjs';

  type Panel = 'preview' | 'options' | 'json';
  let { ko, controls, preview, source }: {
    ko: boolean;
    controls: DemoControl[];
    preview: Snippet;
    source: Snippet;
    children?: Snippet;
  } = $props();

  const hasOptions = $derived(controls.length > 0);
  const keyOptions = $derived(ko ? '주요 옵션' : 'Key options');
  const resetLabel = $derived(ko ? '현재 설정 다시 실행' : 'Run current settings again');
  const copyLabel = $derived(ko ? 'JSON 복사' : 'Copy JSON');

  let panel = $state<Panel>('preview');
  let wide = $state(false);
  let controller = $state.raw<ReturnType<typeof setupComponentDemo> | null>(null);

  function connect(root: HTMLDivElement) {
    const container = root.closest<HTMLElement>('[data-component-demo]')!;
    const listeners = new AbortController();
    const { signal } = listeners;
    let lastFocus: HTMLElement | null = null;
    let hashFrame: number | undefined;

    function followHash() {
      let id: string;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      const target = document.getElementById(id);
      if (!target || !container.contains(target)) return;
      if (id === 'component-json') panel = 'json';
      else if (id.startsWith('demo-option-') && hasOptions && !wide) panel = 'options';
      else if (id === 'component-preview') panel = 'preview';

      if (hashFrame !== undefined) cancelAnimationFrame(hashFrame);
      hashFrame = requestAnimationFrame(() => {
        hashFrame = undefined;
        target.scrollIntoView({ block: 'nearest' });
        if (id.startsWith('demo-option-')) target.querySelector<HTMLElement>('[data-control]')?.focus({ preventScroll: true });
        else if (id === 'component-json') root.querySelector<HTMLElement>('.source-scroll [data-slot="scroll-area-viewport"]')?.focus({ preventScroll: true });
      });
    }

    document.addEventListener('focusin', event => {
      lastFocus = event.target instanceof HTMLElement && root.contains(event.target) ? event.target : null;
    }, { signal });
    window.addEventListener('hashchange', followHash, { signal });
    window.addEventListener('popstate', followHash, { signal });

    const resize = new ResizeObserver(([entry]) => {
      const isWide = entry.contentRect.width >= 42 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      if (isWide === wide) return;
      // The container query may hide the focused element before this runs.
      const focusedOption = !isWide && root.querySelector('.workbench-options')?.contains(lastFocus) ? lastFocus : null;
      // A demo without options has no options tab: null must not count as focus.
      const focusedOptionsTab = isWide && lastFocus !== null && lastFocus === root.querySelector('[data-demo-tab="options"]');
      flushSync(() => {
        wide = isWide;
        if (wide && panel === 'options') panel = 'preview';
        else if (focusedOption) panel = 'options';
      });
      if (focusedOption) focusedOption.focus({ preventScroll: true });
      else if (focusedOptionsTab) root.querySelector<HTMLButtonElement>('[data-demo-tab="preview"]')?.focus({ preventScroll: true });
    });
    resize.observe(root);
    container.addEventListener('demo:reveal', event => {
      const requested = (event as CustomEvent<Panel>).detail;
      if (requested === 'options' && (wide || !hasOptions)) return;
      // The controller focuses the requested pane immediately after dispatch.
      flushSync(() => { panel = requested; });
    }, { signal });
    const initialize = () => {
      controller = setupComponentDemo(container);
      followHash();
    };
    // The Astro island may hydrate before the serialized source arrives.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true, signal });
    else untrack(initialize);
    return () => {
      resize.disconnect();
      listeners.abort();
      if (hashFrame !== undefined) cancelAnimationFrame(hashFrame);
      controller?.dispose();
    };
  }
</script>

<div {@attach connect} class="demo-workbench" data-has-options={String(hasOptions)} data-panel={panel}>
  <Tabs.Root value={panel} onValueChange={value => { panel = value as Panel; }} class="workbench-tabs">
    <div class="workbench-toolbar">
      <Tabs.List aria-label={ko ? '예제 보기' : 'Example view'}>
        <Tabs.Trigger value="preview" data-demo-tab="preview">{ko ? '미리보기' : 'Preview'}</Tabs.Trigger>
        {#if hasOptions}
          <Tabs.Trigger
            value="options"
            id="demo-options-tab"
            class="workbench-options-tab"
            data-demo-tab="options"
            disabled={wide}
          >
            {ko ? '옵션' : 'Options'}
          </Tabs.Trigger>
        {/if}
        <Tabs.Trigger value="json" data-demo-tab="json">JSON</Tabs.Trigger>
      </Tabs.List>
      <div class="workbench-actions">
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon-sm" data-demo-reset aria-label={resetLabel}><RotateCcwIcon aria-hidden="true" /></Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{resetLabel}</Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon-sm" data-demo-copy aria-label={copyLabel}><CopyIcon aria-hidden="true" /></Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{copyLabel}</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>
    </div>
    <div class="workbench-body">
      <!-- Bits UI keeps the panel and its Viewstem runtime mounted across tab changes. -->
      <Tabs.Content value="preview" class="workbench-preview">{@render preview()}</Tabs.Content>
      <Tabs.Content value="json" class="workbench-json">
        {#snippet child({ props })}
          <!-- CSS also exposes the server-rendered JSON without scripting. -->
          <div {...props} hidden={undefined}>{@render source()}</div>
        {/snippet}
      </Tabs.Content>
      {#if hasOptions}
        <Tabs.Content value="options" id="demo-options-panel" class="workbench-options" data-demo-options-host>
          {#snippet child({ props })}
            <div
              {...props}
              hidden={undefined}
              role={wide ? 'region' : 'tabpanel'}
              aria-label={wide ? keyOptions : undefined}
              aria-labelledby={wide ? undefined : 'demo-options-tab'}
            >
              <DemoOptions {controls} {ko} {controller} />
            </div>
          {/snippet}
        </Tabs.Content>
      {/if}
    </div>
  </Tabs.Root>
  <div class="workbench-status">
    <p data-demo-status role="status">{ko ? '미리보기를 불러오는 중입니다.' : 'Loading preview.'}</p>
    <p data-copy-status role="status"></p>
  </div>
</div>
