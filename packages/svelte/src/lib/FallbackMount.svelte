<script lang="ts">
  import { untrack } from 'svelte';
  import type { NodeSnapshot, PublicError } from '@viewstem/core';
  import type { RenderFallback } from './types.js';
  let { node, error, fallback, report }: { node: NodeSnapshot; error: PublicError | null; fallback: RenderFallback; report(): void } = $props();
  let current = $state.raw(untrack(() => ({ node, error })));
  export function update(next: NodeSnapshot, cause: PublicError | null) { current = { node: next, error: cause }; }
</script>

<svelte:boundary onerror={report}>
  {@render fallback(current.node, current.error)}
</svelte:boundary>
