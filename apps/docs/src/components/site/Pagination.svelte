<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import * as Pagination from '../ui/pagination/index.js';
  import { Button } from '../ui/button/index.js';
  import { cn } from '@/lib/utils.js';
  let { previous, next, previousLabel, nextLabel, label, dir = 'ltr', class: extra }: {
    previous?: {href: string; label: string}; next?: {href: string; label: string}; previousLabel: string; nextLabel: string; label: string; dir?: 'ltr' | 'rtl'; class?: string;
  } = $props();
</script>
{#if previous || next}
  <Pagination.Root count={2} perPage={1} class={cn('page-pagination border-t pt-4',extra)} aria-label={label} {dir}>
    <Pagination.Content class="grid w-full grid-cols-2 gap-4">
      {#if previous}<Pagination.Item class={!next ? 'col-span-2' : undefined}>
        <Button href={previous.href} rel="prev" variant="ghost" class="h-auto w-full justify-start py-3 text-left whitespace-normal">
          {#if dir === 'ltr'}<ArrowLeft />{:else}<ArrowRight />{/if}
          <span class="grid gap-1"><small class="text-muted-foreground">{previousLabel}</small><span>{previous.label}</span></span>
        </Button>
      </Pagination.Item>{/if}
      {#if next}<Pagination.Item class={previous ? 'col-start-2' : 'col-span-2'}>
        <Button href={next.href} rel="next" variant="ghost" class="h-auto w-full justify-end py-3 text-right whitespace-normal">
          <span class="grid gap-1"><small class="text-muted-foreground">{nextLabel}</small><span>{next.label}</span></span>
          {#if dir === 'ltr'}<ArrowRight />{:else}<ArrowLeft />{/if}
        </Button>
      </Pagination.Item>{/if}
    </Pagination.Content>
  </Pagination.Root>
{/if}
