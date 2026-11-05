<script lang="ts">
  import ScrollRegion from "../site/ScrollRegion.svelte";
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import { Button, buttonVariants } from '@/components/ui/button/index.js';
  import * as DropdownMenu from '@/components/ui/dropdown-menu/index.js';

  type Item = { text: string; slug: string; children: Item[] };
  let { items, label, mobile = false }: { items: Item[]; label: string; mobile?: boolean } = $props();

  function flatten(items: Item[], depth = 0): { text: string; slug: string; depth: number }[] {
    return items.flatMap(({ text, slug, children }) => [{ text, slug, depth }, ...flatten(children, depth + 1)]);
  }

  let links = $derived(flatten(items));
  let active = $derived(links[0]?.slug);
  let frame = 0;

  function update() {
    frame = 0;
    const inset = document.querySelector('.masthead')?.getBoundingClientRect().bottom ?? 64;
    let current = links[0]?.slug;
    for (const link of links) {
      const element = document.getElementById(decodeURIComponent(link.slug));
      if (element && element.getBoundingClientRect().top <= inset + 80) current = link.slug;
    }
    active = current;
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  $effect(() => {
    links;
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
  });
</script>

<svelte:window onscroll={schedule} onresize={schedule} />

{#if mobile}
  <div class="site-mobile-toc">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class={buttonVariants({ variant: 'outline', size: 'sm' })} data-variant="outline" data-size="sm">
        {label}
        <ChevronDownIcon aria-hidden="true" data-icon="inline-end" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="w-72 max-w-[calc(100vw-2rem)] overflow-hidden">
        <ScrollRegion orientation="vertical" class="max-h-[65vh]" {label}><DropdownMenu.Group>
          {#each links as link (link.slug)}
            <DropdownMenu.Item>
              {#snippet child({ props })}
                <a
                  {...props}
                  href={'#' + link.slug}
                  aria-current={active === link.slug ? 'location' : undefined}
                  style:padding-inline-start={`${0.5 + link.depth * 0.75}rem`}
                >
                  {link.text}
                </a>
              {/snippet}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Group></ScrollRegion>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    <span class="truncate text-xs text-muted-foreground">{links.find((link) => link.slug === active)?.text}</span>
  </div>
{:else}
  <ScrollRegion class="toc-scroll" orientation="vertical" {label}><nav aria-label={label}>
    <h2 class="mb-2 text-sm font-semibold">{label}</h2>
    <ul class="m-0 flex list-none flex-col gap-1 p-0">
      {#each links as link (link.slug)}
        {@const variant = active === link.slug ? 'secondary' : 'ghost'}
        <li style:padding-inline-start={`${link.depth * 0.75}rem`}>
          <Button
            href={'#' + link.slug}
            {variant}
            size="sm"
            data-variant={variant}
            data-size="sm"
            class="h-auto w-full justify-start py-1 text-left font-normal whitespace-normal"
            aria-current={active === link.slug ? 'location' : undefined}
          >
            {link.text}
          </Button>
        </li>
      {/each}
    </ul>
  </nav></ScrollRegion>
{/if}
