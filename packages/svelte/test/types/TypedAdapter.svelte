<script lang="ts">
  import type { ComponentAdapterProps } from '@viewstem/svelte';
  import type { Snippet } from 'svelte';
  let { inputs, node, emit, renderSlot }: ComponentAdapterProps = $props();
  const label = $derived(typeof inputs.label === 'string' ? inputs.label : node.id);

  function checkContract() {
    const result: Promise<unknown> = emit('selected', { id: 'one' });
    const slots: Snippet<[name: string]> = renderSlot;
    // @ts-expect-error The event payload is explicit, including for void-like events.
    emit('selected');
    // @ts-expect-error emit preserves the Action result instead of promising void.
    const noResult: Promise<void> = emit('selected', null);
    // @ts-expect-error Slot names are strings.
    const numericSlots: Snippet<[name: number]> = renderSlot;
    // @ts-expect-error The supplied public inputs snapshot is readonly.
    inputs.label = 'changed';
    void [result, slots, noResult, numericSlots];
  }
  void checkContract;
</script>

<button disabled={node.status !== 'ready'} onclick={() => emit('selected', { id: 'one' }).catch(() => {})}>{label}</button>
{@render renderSlot('body')}
