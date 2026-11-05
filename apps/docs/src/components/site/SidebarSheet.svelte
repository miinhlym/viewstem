<script lang="ts">
  import { onMount } from 'svelte';
  import MenuIcon from '@lucide/svelte/icons/menu';
  import XIcon from '@lucide/svelte/icons/x';
  import { buttonVariants } from '../ui/button/index.js';
  import * as Sheet from '../ui/sheet/index.js';
  import SidebarNavigation from './SidebarNavigation.svelte';
  import type { SidebarEntry } from '../../lib/sidebar-navigation';

  let { label, title = label, description, closeLabel, compact = false, triggerVariant = compact ? 'outline' : 'ghost', entries }: {
    label: string;
    title?: string;
    description: string;
    closeLabel: string;
    compact?: boolean;
    triggerVariant?: 'outline' | 'ghost';
    entries: SidebarEntry[];
  } = $props();
  let open = $state(false);
  let viewport = $state<HTMLElement | null>(null);
  const close = () => { open = false; };

  onMount(() => {
    const desktop = matchMedia('(min-width: 50rem)');
    const onChange = (event: MediaQueryListEvent) => { if (!compact && event.matches) close(); };
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  });

  function revealCurrent() {
    const current = viewport?.querySelector('[aria-current="page"]');
    if (!current || !viewport) return;
    const area = viewport.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    if (item.top < area.top || item.bottom > area.bottom) {
      viewport.scrollTop += item.top - area.top - (area.height - item.height) / 2;
    }
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Trigger
    class={buttonVariants({ variant: triggerVariant, size: compact ? 'icon' : 'default', class: compact ? undefined : 'min-[50rem]:hidden' })}
    data-variant={triggerVariant} data-size={compact ? 'icon' : 'default'} aria-label={label}
  >
    <MenuIcon aria-hidden="true" data-icon={compact ? undefined : 'inline-start'} />
    {#if !compact}{label}{/if}
  </Sheet.Trigger>
  <Sheet.Content side="left" showCloseButton={false} class="gap-0 motion-reduce:animate-none" onOpenAutoFocus={revealCurrent}>
    <Sheet.Header class="flex-row items-center justify-between border-b">
      <Sheet.Title>{title}</Sheet.Title>
      <Sheet.Description class="sr-only">{description}</Sheet.Description>
      <Sheet.Close class={buttonVariants({ variant: 'ghost', size: 'icon' })} data-variant="ghost" data-size="icon" aria-label={closeLabel}>
        <XIcon aria-hidden="true" />
      </Sheet.Close>
    </Sheet.Header>
    <SidebarNavigation {entries} {label} bind:viewportRef={viewport} onNavigate={close} class="min-h-0 flex-1" />
  </Sheet.Content>
</Sheet.Root>
