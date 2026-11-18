<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { defineResourceSet } from '@viewstem/core';
  import { createRenderer, svelteComponent, ViewstemView, type View } from '@viewstem/svelte';
  import Stack from './adapters/Stack.svelte';
  import Label from './adapters/Label.svelte';
  import Input from './adapters/Input.svelte';
  import Button from './adapters/Button.svelte';
  import { contracts, viewDefinition } from './definition.js';

  const renderer = createRenderer({ onError: ({ error }) => { issue = error.message; } });
  const adapters = new Map([['Stack', Stack], ['Label', Label], ['Input', Input], ['Button', Button]]);
  renderer.runtime.registry.registerResourceSet(defineResourceSet({ id: 'svelte-example', version: '1',
    components: contracts.map(contract => svelteComponent(contract, adapters.get(contract.id)!)),
  }));

  let view = $state.raw<View | null>(null);
  let issue = $state('');
  let destroyed = false;

  onMount(() => {
    void (async () => {
      try {
        const created = await renderer.runtime.createView(viewDefinition);
        if (!destroyed) view = created;
        await created.whenSettled(created.initial);
      } catch (error) {
        if (!destroyed) issue = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
      }
    })();
  });

  // ViewstemView borrows the View; the renderer owns its Runtime and all its Views.
  onDestroy(() => {
    destroyed = true;
    void renderer.dispose().catch(console.error);
  });
</script>

<main>
  <h1>Viewstem + Svelte</h1>
  <p class="intro">이름을 바꾸면 JSON에 정의한 Action과 Derived가 인사말을 갱신합니다.</p>
  {#if issue}
    <p role="alert">{issue}</p>
  {/if}
  {#if view}
    <ViewstemView {renderer} {view} />
  {:else if !issue}
    <p>화면 준비 중…</p>
  {/if}
</main>

<style>
  :global(body) { margin: 0; background: #fafafa; color: #202020; font-family: system-ui, sans-serif; }
  main { box-sizing: border-box; max-width: 36rem; margin: 4rem auto; padding: 0 1.5rem; }
  h1 { margin: 0; font-size: 1.75rem; }
  .intro { margin: 1rem 0 2rem; color: #555; line-height: 1.6; }
  [role='alert'] { color: #9c2222; }
</style>
