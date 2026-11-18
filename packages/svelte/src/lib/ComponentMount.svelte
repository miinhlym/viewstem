<script lang="ts">
  import { untrack } from 'svelte';
  import type { NodeSnapshot } from '@viewstem/core';
  import type { ComponentMountContext } from '@viewstem/dom';
  import type { ComponentAdapter } from './types.js';
  import SlotOutlet from './SlotOutlet.svelte';

  let { adapter: Adapter, initial, report, emit, provideSlot }: {
    adapter: ComponentAdapter;
    initial: NodeSnapshot;
    report(cause: unknown): void;
    emit: ComponentMountContext['emit'];
    provideSlot: ComponentMountContext['provideSlot'];
  } = $props();
  let node = $state.raw(untrack(() => initial));
  let pending = $state(false);

  export function update(next: NodeSnapshot) { node = next; }
  export function setPending(value: boolean) {
    pending = value;
    if (value) node = { ...node, status: 'pending' };
  }
</script>

{#snippet renderSlot(name: string)}
  {#if Object.hasOwn(node.slots, name)}
    <SlotOutlet {name} {provideSlot} />
  {/if}
{/snippet}

<svelte:boundary onerror={report}>
  <Adapter {node} inputs={node.inputs} {emit} {renderSlot} {provideSlot} />
  {#if pending}<span data-viewstem-pending role="status" aria-busy="true">…</span>{/if}
</svelte:boundary>
