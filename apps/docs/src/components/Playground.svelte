<script lang="ts">
  import ScrollRegion from './site/ScrollRegion.svelte';
  import { onMount } from 'svelte';
  import type { ViewSpec } from '@viewstem/core';
  import type { createPlaygroundRenderer } from './playground-renderer';
  import * as Empty from '@/components/ui/empty/index.js';
  import { Spinner } from '@/components/ui/spinner/index.js';
  import * as Alert from '@/components/ui/alert/index.js';
  import { Button } from '@/components/ui/button/index.js';
  import * as Resizable from '@/components/ui/resizable/index.js';
  import { createJsonEditor } from '../lib/json-editor';
  import { playgroundCopy, type Locale } from './playground-copy';

  const draftKey = 'viewstem.playground.draft.v1';
  let { locale }: { locale: Locale } = $props();
  let labels = $derived(playgroundCopy[locale]);
  let editorHost: HTMLDivElement;
  let previewTarget: HTMLDivElement;
  let actions: { run(): void; startExample(): void } | undefined;

  let source = $state('');
  let executedSource = $state<string>();
  let vertical = $state(false);
  let ready = $state(false);
  let running = $state(false);
  let message = $state('');
  let error = $state('');
  let hasPreview = $derived(executedSource !== undefined);
  let status = $derived(running ? labels.running : hasPreview && source !== executedSource ? labels.pending : message);

  onMount(() => {
    const media = window.matchMedia('(max-width: 752px)');
    const updateOrientation = () => { vertical = media.matches; };
    updateOrientation();
    media.addEventListener('change', updateOrientation);

    let disposed = false;
    let renderer: ReturnType<typeof createPlaygroundRenderer> | undefined;

    async function run() {
      const input = editor.state.doc.toString();
      if (disposed || running || !input.trim()) return;
      error = '';
      message = '';
      let view: ViewSpec;
      try {
        const parsed: unknown = JSON.parse(input);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('render' in parsed)) {
          error = labels.invalidView;
          return;
        }
        view = parsed as ViewSpec;
      } catch (cause) {
        error = cause instanceof Error ? `${labels.invalidJson} ${cause.message}` : labels.invalidJson;
        return;
      }

      running = true;
      try {
        if (!renderer) {
          const { createPlaygroundRenderer } = await import('./playground-renderer');
          if (disposed) return;
          renderer = createPlaygroundRenderer(previewTarget, diagnostic => {
            if (disposed) return;
            error = diagnostic.error.message;
            message = '';
          });
        }

        const { queryErrors } = await renderer.run(view);
        if (disposed) return;
        executedSource = input;
        if (queryErrors.length) error = queryErrors.map(({ query, error }) => `${query} · ${error.message}`).join('\n');
        if (!error) message = labels.rendered;
      } catch (cause) {
        if (!disposed) error = typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : String(cause);
      } finally {
        if (!disposed) running = false;
      }
    }

    function startExample() {
      if (editor.state.doc.toString().trim() || running) return;
      const example = JSON.stringify({
        render: { id: 'hello', componentRef: 'shadcn.Button', inputs: { text: labels.greeting } },
      }, null, 2);
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: example } });
      editor.focus();
      void run();
    }

    // Keep the same draft when switching languages or returning in this tab.
    try { source = sessionStorage.getItem(draftKey) ?? ''; } catch { /* optional storage */ }
    const editor = createJsonEditor({
      parent: editorHost,
      source,
      label: labels.editor,
      onChange: value => {
        source = value;
        if (!value.trim()) error = '';
        try {
          if (value) sessionStorage.setItem(draftKey, value);
          else sessionStorage.removeItem(draftKey);
        } catch { /* optional storage */ }
      },
      onRun: () => void run(),
    });

    actions = { run: () => void run(), startExample };
    ready = true;

    return () => {
      disposed = true;
      media.removeEventListener('change', updateOrientation);
      editor.destroy();
      if (renderer) void renderer.dispose().catch(console.error);
    };
  });
</script>

<div class="playground-panels">
  <h1 class="sr-only">{labels.title}</h1>
  <Resizable.PaneGroup direction={vertical ? 'vertical' : 'horizontal'} keyboardResizeBy={5} data-slot="resizable-panel-group">
    <Resizable.Pane defaultSize={50} minSize={25} data-slot="resizable-panel">
      <section class="editor-panel" aria-labelledby="playground-editor-label">
        <div class="panel-title editor-title">
          <h2 id="playground-editor-label">{labels.editor}</h2>
          <span class="run-status" role="status">{status || labels.manual}</span>
          <Button size="sm" aria-keyshortcuts="Control+Enter Meta+Enter" onclick={() => actions?.run()} disabled={!ready || running || !source.trim()}>
            {#if running}<Spinner aria-hidden="true" data-icon="inline-start" />{/if}
            {labels.run}
          </Button>
        </div>
        <ScrollRegion class="editor-scroll" label={labels.editor}><div class="editor-host" bind:this={editorHost}></div></ScrollRegion>
      </section>
    </Resizable.Pane>
    <Resizable.Handle withHandle class="shrink-0" aria-label={labels.resize} aria-orientation={vertical ? 'horizontal' : 'vertical'} />
    <Resizable.Pane defaultSize={50} minSize={25} data-slot="resizable-panel">
      <section class="result-panel" aria-labelledby="playground-preview-label">
        <div class="panel-title">
          <h2 id="playground-preview-label">{labels.preview}</h2>
        </div>
        <ScrollRegion class="preview-scroll" label={labels.preview}><div class="result-content">
          {#if error}
            <Alert.Root variant="destructive">
              <Alert.Title>{labels.error}</Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Root>
          {:else if !hasPreview && !running}
            <Empty.Root>
              <Empty.Header><Empty.Title>{labels.emptyTitle}</Empty.Title><Empty.Description>{labels.empty}</Empty.Description></Empty.Header>
              <Empty.Content class="flex-row flex-wrap justify-center">
                {#if !source.trim()}
                  <Button size="sm" variant="outline" onclick={() => actions?.startExample()} disabled={!ready}>
                    {labels.starter}
                  </Button>
                {/if}
                <Button variant="link" size="sm" href={`${locale === 'ko' ? '/ko' : ''}/docs/quickstart/`}>
                  {labels.quickstart}
                </Button>
              </Empty.Content>
            </Empty.Root>
          {/if}
          <div class="preview-target" bind:this={previewTarget}></div>
          <noscript>{labels.noScript}</noscript>
        </div></ScrollRegion>
      </section>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
