<script lang="ts">
  import type { SidebarEntry as Entry } from '../../lib/sidebar-navigation';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import { onMount, tick } from 'svelte';
  import { Badge } from '@/components/ui/badge/index.js';
  import { Button } from '@/components/ui/button/index.js';
  import * as Collapsible from '@/components/ui/collapsible/index.js';
  import { cn } from '@/lib/utils.js';

  type OpenGroups = Record<string, boolean>;

  let { entries, storageKey, onNavigate, onRestore }: {
    entries: Entry[];
    storageKey?: string;
    onRestore?: () => void;
    onNavigate?: () => void;
  } = $props();

  const id = $props.id();
  let stored = $state.raw<OpenGroups>({});
  let toggled = $state.raw<OpenGroups>({});

  const containsCurrent = (entry: Entry): boolean =>
    entry.type === 'link' ? Boolean(entry.isCurrent) : entry.entries.some(containsCurrent);

  onMount(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        stored = Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, boolean] =>
          typeof entry[1] === 'boolean'));
      }
    } catch {
      // Sidebar controls also work when session storage is unavailable.
    }
    void tick().then(() => onRestore?.());
  });

  function setGroup(key: string, open: boolean) {
    toggled = { ...toggled, [key]: open };
    if (storageKey) {
      try { sessionStorage.setItem(storageKey, JSON.stringify({ ...stored, ...toggled })); } catch {}
    }
  }
</script>

{#snippet entryLabel(entry: Entry)}
  <span class="min-w-0 break-words">{entry.label}</span>
  {#if entry.badge}
    <Badge variant="secondary" class={cn('ms-auto', entry.badge.class)}>{entry.badge.text}</Badge>
  {/if}
{/snippet}

<!-- Navigation keeps its text anchored while pressed; action buttons retain their default feedback. -->
{#snippet sidebarEntries(items: Entry[], path: string, idPath: string)}
  <ul role="list" class={path ? 'ms-3 flex flex-col gap-0.5 border-s ps-2' : 'flex flex-col gap-1'}>
    {#each items as entry, index (`${path}/${index}:${entry.label}`)}
      <li>
        {#if entry.type === 'link'}
          <Button
            variant="ghost"
            size="sm"
            data-variant="ghost"
            data-size="sm"
            class={cn(
              'h-auto min-h-7 w-full justify-start py-1 text-start font-normal whitespace-normal active:not-aria-[haspopup]:translate-y-0',
              'aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent-foreground',
              entry.attrs?.class,
            )}
            href={entry.href}
            hreflang={entry.attrs?.hreflang ?? undefined}
            target={entry.attrs?.target ?? undefined}
            rel={entry.attrs?.rel ?? undefined}
            title={entry.attrs?.title ?? undefined}
            aria-current={entry.isCurrent ? 'page' : undefined}
            onclick={onNavigate}
          >
            {@render entryLabel(entry)}
          </Button>
        {:else}
          {@const key = `${path}/${index}:${entry.label}`}
          {@const contentId = `${idPath}-${index}`}
          {@const current = containsCurrent(entry)}
          <Collapsible.Root
            data-sidebar-group={key}
            data-sidebar-current={current ? '' : undefined}
            bind:open={() => toggled[key] ?? (current || (stored[key] ?? !entry.collapsed)), (open) => setGroup(key, open)}
          >
            <Collapsible.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="sm"
                  data-variant="ghost"
                  data-size="sm"
                  class="active:not-aria-[haspopup]:translate-y-0 group/nav h-auto min-h-8 w-full justify-between py-1 text-start font-semibold whitespace-normal aria-expanded:bg-transparent aria-expanded:hover:bg-muted"
                  aria-controls={contentId}
                >
                  {@render entryLabel(entry)}
                  <ChevronRightIcon aria-hidden="true" data-icon="inline-end" class="motion-safe:transition-transform group-aria-expanded/nav:rotate-90" />
                </Button>
              {/snippet}
            </Collapsible.Trigger>
            <!-- Keep all links in the HTML while collapsed branches stay outside the tab order. -->
            <Collapsible.Content id={contentId} forceMount class="my-0.5 data-[state=closed]:hidden">
              {@render sidebarEntries(entry.entries, key, contentId)}
            </Collapsible.Content>
          </Collapsible.Root>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{@render sidebarEntries(entries, '', `${id}-group`)}
