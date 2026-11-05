<script lang="ts">
  import { untrack } from 'svelte';
  import * as Tabs from '../ui/tabs/index.js';
  let { files, label }: { files: {key: string; name: string}[]; label: string } = $props();
  let container: HTMLElement | null = null;
  let value = $state(untrack(() => files[0].key));
  let ready = $state(false);
  function connect(host: HTMLDivElement) {
    const parent = host.closest<HTMLElement>('[data-example-preview]');
    if (!parent) return;
    container = parent;
    const sync = () => { ready = parent.dataset.filesReady === 'true'; value = parent.dataset.activeFile ?? files[0].key; };
    untrack(sync); parent.addEventListener('example-file-state', sync);
    return () => { parent.removeEventListener('example-file-state', sync); container = null; };
  }
  function change(key: string) {
    value = key; container?.dispatchEvent(new CustomEvent('example-file-change', { detail: key }));
  }
</script>
<div {@attach connect} class="example-files"><Tabs.Root {value} onValueChange={change}>
  <Tabs.List variant="line" aria-label={label}>{#each files as file (file.key)}
    <Tabs.Trigger value={file.key} disabled={!ready} data-example-file={file.key} aria-controls={'source-' + file.key}>{file.name}</Tabs.Trigger>
  {/each}</Tabs.List>
</Tabs.Root></div>
