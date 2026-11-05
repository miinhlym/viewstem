<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ScrollArea } from '../ui/scroll-area/index.js';
  import { cn } from '@/lib/utils.js';

  let { children, class: className, label, orientation = 'both', viewportRef = $bindable(null) }: {
    children?: Snippet;
    class?: string;
    label?: string;
    orientation?: 'vertical' | 'horizontal' | 'both';
    viewportRef?: HTMLElement | null;
  } = $props();

  $effect(() => {
    if (!viewportRef) return;
    if (label) { viewportRef.setAttribute('aria-label', label); viewportRef.setAttribute('role', 'region'); }
    viewportRef.tabIndex = 0;
  });
</script>

<ScrollArea bind:viewportRef orientation={orientation} type="auto" class={cn('site-scroll-area', className)} data-site-scroll={orientation}>
  {@render children?.()}
</ScrollArea>
