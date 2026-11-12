<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import CopyIcon from '@lucide/svelte/icons/copy';
  import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
  import { Button } from '@/components/ui/button/index.js';
  import * as Tooltip from '@/components/ui/tooltip/index.js';
  import * as Tabs from '@/components/ui/tabs/index.js';
  import { setupComponentDemo } from '../examples/component-demo-client';

  type Panel = 'preview' | 'json' | 'setup';
  let { ko, preview, source, setup, copyLabel, showSetup = false }: {
    ko: boolean;
    preview: Snippet;
    source: Snippet;
    setup?: Snippet;
    showSetup?: boolean;
    copyLabel?: string;
    children?: Snippet;
  } = $props();

  const resetLabel = $derived(ko ? '예제 다시 실행' : 'Run example again');
  let panel = $state<Panel>('preview');
  const copyText = $derived(panel === 'setup'
    ? (ko ? '실행 코드 복사' : 'Copy setup code')
    : (copyLabel ?? (ko ? 'JSON 복사' : 'Copy JSON')));

  function connect(root: HTMLDivElement) {
    const container = root.closest<HTMLElement>('[data-component-demo]')!;
    const previewId = container.getAttribute('aria-labelledby');
    const jsonId = container.querySelector('.source-heading')?.id;
    const variant = container.hasAttribute('data-demo-lazy');
    const listeners = new AbortController();
    const { signal } = listeners;
    let controller: ReturnType<typeof setupComponentDemo> | undefined;
    let hashFrame: number | undefined;

    function followHash() {
      let id: string;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      const target = document.getElementById(id);
      if (!target || !container.contains(target)) return;
      if (id === jsonId) panel = 'json';
      else if (id === previewId) panel = 'preview';
      else return;

      if (hashFrame !== undefined) cancelAnimationFrame(hashFrame);
      hashFrame = requestAnimationFrame(() => {
        hashFrame = undefined;
        target.scrollIntoView({ block: variant ? 'start' : 'nearest' });
        if (id === jsonId || variant) target.focus({ preventScroll: true });
      });
    }

    window.addEventListener('hashchange', followHash, { signal });
    const initialize = () => {
      controller = setupComponentDemo(container);
      followHash();
    };
    // The Astro island may hydrate before the serialized source arrives.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true, signal });
    else untrack(initialize);
    return () => {
      listeners.abort();
      if (hashFrame !== undefined) cancelAnimationFrame(hashFrame);
      controller?.dispose();
    };
  }
</script>

<div {@attach connect} class="demo-workbench" data-panel={panel}>
  <Tabs.Root value={panel} onValueChange={value => { panel = value as Panel; }} class="workbench-tabs">
    <div class="workbench-toolbar">
      <Tabs.List aria-label={ko ? '예제 보기' : 'Example view'}>
        <Tabs.Trigger value="preview" data-demo-tab="preview">{ko ? '미리보기' : 'Preview'}</Tabs.Trigger>
        <Tabs.Trigger value="json" data-demo-tab="json">JSON</Tabs.Trigger>
        {#if showSetup}
          <Tabs.Trigger value="setup" data-demo-tab="setup">{ko ? '실행 코드' : 'Setup'}</Tabs.Trigger>
        {/if}
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
                <Button {...props} variant="ghost" size="icon-sm" data-demo-copy aria-label={copyText}><CopyIcon aria-hidden="true" /></Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{copyText}</Tooltip.Content>
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
      {#if showSetup}
        <Tabs.Content value="setup" class="workbench-setup">
          {#snippet child({ props })}
            <div {...props} hidden={undefined}>{@render setup?.()}</div>
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
