<script>
  import { getContext, onMount, onDestroy } from 'svelte';
  import { observations } from './observations.mjs';
  let { inputs, node, emit } = $props();
  let local = $state(0);
  let eventResult = $state('none');
  const context = getContext('viewstem-test-context');
  async function send(payload = inputs.payload ?? null) {
    try {
      const result = await emit('change', payload);
      eventResult = JSON.stringify(result) ?? 'undefined';
      observations.events.push({ result });
      return result;
    } catch (error) {
      eventResult = error.code;
      observations.events.push({ error: error.code });
      return { error: error.code };
    }
  }
  onMount(() => {
    observations.mounted.push(node.address);
    observations.callbacks.set(node.address, send);
    observations.emitters.set(node.address, emit);
  });
  onDestroy(() => observations.destroyed.push(node.address));
</script>

<article data-probe={node.id} data-label={String(inputs.label ?? '')} data-address={node.address} data-status={node.status}>
  <output data-value>{String(inputs.value ?? '')}</output>
  <output data-cell>{inputs.cell ? String(inputs.cell.read()) : ''}</output>
  <output data-query>{inputs.query ? JSON.stringify(inputs.query.getSnapshot()) : ''}</output>
  <output data-context>{context ?? ''}</output>
  <button data-local onclick={() => local += 1}>local {local}</button>
  <button data-write onclick={() => inputs.cell?.write(Number(inputs.cell.read()) + 1)}>write</button>
  <button data-refresh onclick={() => inputs.query?.refresh().catch(() => {})}>refresh</button>
  <button data-event onclick={() => send()}>event</button>
  <output data-event-result>{eventResult}</output>
</article>
