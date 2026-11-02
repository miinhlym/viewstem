<script lang="ts">
  import { setContext, type Snippet } from 'svelte';
  import { childContext, type ChildBridge } from './types.js';
  let { target, props, children }: { target: string; props: Record<PropertyKey, unknown>; children: Snippet } = $props();
  setContext<ChildBridge>(childContext, { get target() { return target; }, get props() { return props; } });
</script>
{@render children()}
