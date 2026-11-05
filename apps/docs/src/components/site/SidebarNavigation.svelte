<script lang="ts">
  import type { SidebarEntry } from '../../lib/sidebar-navigation';
  import ScrollRegion from './ScrollRegion.svelte';
  import SidebarTree from './SidebarTree.svelte';
  import { cn } from '@/lib/utils.js';

  let { entries, label, storageKey, onRestore, onNavigate, class: className, viewportRef = $bindable(null) }: {
    entries: SidebarEntry[];
    label: string;
    storageKey?: string;
    onRestore?: () => void;
    onNavigate?: () => void;
    class?: string;
    viewportRef?: HTMLElement | null;
  } = $props();
</script>

<ScrollRegion bind:viewportRef {label} orientation="vertical" class={cn('site-sidebar-scroll', className)}>
  <nav aria-label={label}>
    <SidebarTree {entries} {storageKey} {onRestore} {onNavigate} />
  </nav>
</ScrollRegion>
