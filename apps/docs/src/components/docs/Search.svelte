<script lang="ts">
  import ScrollRegion from "../site/ScrollRegion.svelte";
  import SearchIcon from '@lucide/svelte/icons/search';
  import XIcon from '@lucide/svelte/icons/x';
  import { onMount } from 'svelte';
  import { Button } from '@/components/ui/button/index.js';
  import * as Dialog from '@/components/ui/dialog/index.js';
  import * as Command from '@/components/ui/command/index.js';
  import * as Empty from '@/components/ui/empty/index.js';
  import * as Alert from '@/components/ui/alert/index.js';
  import * as Kbd from '@/components/ui/kbd/index.js';
  import { Spinner } from '@/components/ui/spinner/index.js';

  type SearchLink = { url: string; title: string; excerpt: string };
  type PagefindHit = {
    data: () => Promise<{
      url: string;
      meta: { title: string };
      excerpt: string;
      sub_results: SearchLink[];
    }>;
  };
  type Pagefind = { search: (term: string) => Promise<{ results: PagefindHit[] }> };
  type SearchResult = SearchLink & { sections: SearchLink[] };
  type SearchState = {
    query: string;
    hits: PagefindHit[];
    results: SearchResult[];
    loadingMore?: boolean;
    failed?: boolean;
  };

  const pageSize = 8;
  const pagefindUrl = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/pagefind/pagefind.js`;
  const messages = {
    en: {
      search: 'Search docs',
      navigate: 'Navigate',
      select: 'Open',
      indexTitle: 'Search is unavailable',
      help: 'Search documentation pages and sections.',
      placeholder: 'Type to search…',
      close: 'Close',
      unavailable: 'The search index is unavailable. Build and serve the site to search in development.',
      failed: 'Could not load search results. Try searching again.',
      pending: 'Searching…',
      empty: 'No results found.',
      more: 'Show more results',
      count: (shown: number, total: number) => `Showing ${shown} of ${total} results`,
    },
    ko: {
      search: '문서 검색',
      navigate: '이동',
      select: '열기',
      indexTitle: '검색을 사용할 수 없습니다',
      help: '문서 페이지와 섹션을 검색합니다.',
      placeholder: '검색어 입력…',
      close: '닫기',
      unavailable: '검색 색인을 사용할 수 없습니다. 개발 환경에서는 사이트를 빌드하고 실행한 뒤 검색할 수 있습니다.',
      failed: '검색 결과를 불러오지 못했습니다. 다시 검색해 주세요.',
      pending: '검색 중…',
      empty: '검색 결과가 없습니다.',
      more: '검색 결과 더 보기',
      count: (shown: number, total: number) => `검색 결과 ${total}개 중 ${shown}개 표시`,
    },
  };

  let { locale, hasIndex }: { locale: 'en' | 'ko'; hasIndex: boolean } = $props();
  let t = $derived(messages[locale]);
  let open = $state(false);
  let appleKeyboard = $state(false);
  let composing = $state(false);
  let input = $state('');
  let searchState = $state.raw<SearchState>();
  let inputElement = $state<HTMLInputElement | null>(null);
  let restoreFocus: HTMLElement | null = null;
  let query = $derived(input.trim());
  let matches = $derived(!composing && searchState?.query === query ? searchState : undefined);
  let status = $derived(!hasIndex ? t.unavailable : !query || composing ? '' : !matches ? t.pending
    : matches.failed ? t.failed : matches.hits.length ? t.count(matches.results.length, matches.hits.length) : t.empty);

  function changeOpen(next: boolean) {
    open = next;
    if (!next) {
      input = '';
      composing = false;
      searchState = undefined;
    }
  }

  function changeInput(value: string) {
    if (value.trim() !== query) searchState = undefined;
    input = value;
  }

  onMount(() => {
    appleKeyboard = /Macintosh|iPhone|iPad|iPod/i.test(navigator.userAgent);
  });

  function onShortcut(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey
      || (!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== 'k') return;
    if (!open && document.querySelector('[role="dialog"][data-state="open"], dialog[open]')) return;
    event.preventDefault();
    if (event.repeat) return;
    if (!open && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      restoreFocus = document.activeElement;
    }
    changeOpen(!open);
  }

  async function loadResults(hits: PagefindHit[]): Promise<SearchResult[]> {
    return Promise.all(hits.map(async (hit) => {
      const { url, meta, excerpt, sub_results } = await hit.data();
      return { url, title: meta.title, excerpt, sections: sub_results.filter((section) => section.url !== url) };
    }));
  }

  $effect(() => {
    if (!open || !hasIndex || !query || composing) return;
    const term = query;
    let current = true;
    const timer = window.setTimeout(async () => {
      try {
        // Pagefind uses the document language to select the corresponding index.
        const pagefind: Pagefind = await import(/* @vite-ignore */ pagefindUrl);
        if (!current) return;
        const { results: hits } = await pagefind.search(term);
        if (!current) return;
        const results = await loadResults(hits.slice(0, pageSize));
        if (current) searchState = { query: term, hits, results };
      } catch {
        if (current) searchState = { query: term, hits: [], results: [], failed: true };
      }
    }, 150);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  });

  async function showMore() {
    if (!matches || matches.loadingMore) return;
    const pending = { ...matches, loadingMore: true, failed: false };
    searchState = pending;
    const count = pending.results.length;
    try {
      const next = await loadResults(pending.hits.slice(count, count + pageSize));
      if (searchState === pending) searchState = { ...pending, results: [...pending.results, ...next], loadingMore: false };
    } catch {
      if (searchState === pending) searchState = { ...pending, loadingMore: false, failed: true };
    }
  }
</script>

<svelte:window onkeydown={onShortcut} />

{#snippet excerpt(text: string)}
  <p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
    {#each text.split(/<mark>(.*?)<\/mark>/gs) as part, index (`${index}:${part}`)}
      {#if index % 2}<mark class="rounded-xs bg-accent px-0.5 text-accent-foreground">{part}</mark>{:else}{part}{/if}
    {/each}
  </p>
{/snippet}

<Dialog.Root bind:open={() => open, changeOpen}>
  <Dialog.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="sm" class="min-[50rem]:w-48 min-[50rem]:justify-start" aria-keyshortcuts="Control+K Meta+K">
        <SearchIcon aria-hidden="true" data-icon="inline-start" />
        {t.search}
        <Kbd.Group class="ms-auto hidden shrink-0 min-[50rem]:inline-flex" aria-hidden="true">
          <!-- Both platform labels reserve the same space during hydration. -->
          <Kbd.Root class="grid">
            <span class="col-start-1 row-start-1" class:invisible={appleKeyboard}>Ctrl</span>
            <span class="col-start-1 row-start-1" class:invisible={!appleKeyboard}>⌘</span>
          </Kbd.Root>
          <Kbd.Root>K</Kbd.Root>
        </Kbd.Group>
      </Button>
    {/snippet}
  </Dialog.Trigger>
  <Dialog.Content
    showCloseButton={false}
    class="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col gap-0 p-0 sm:max-w-xl motion-reduce:animate-none"
    onOpenAutoFocus={(event) => {
      if (!inputElement || inputElement.disabled) return;
      event.preventDefault();
      inputElement.focus();
    }}
    onCloseAutoFocus={(event) => {
      const previous = restoreFocus;
      restoreFocus = null;
      if (!previous?.isConnected) return;
      previous.focus({ preventScroll: true });
      if (document.activeElement === previous) event.preventDefault();
    }}
  >
    <Dialog.Header class="sr-only">
      <Dialog.Title>{t.search}</Dialog.Title>
      <Dialog.Description>{t.help}</Dialog.Description>
    </Dialog.Header>
    <Command.Root shouldFilter={false} loop class="h-auto min-h-0">
      <div class="flex items-center pe-10">
        <div class="min-w-0 flex-1">
          <Command.Input
            bind:ref={inputElement}
            bind:value={() => input, changeInput}
            aria-label={t.search}
            autocomplete="off"
            spellcheck={false}
            placeholder={t.placeholder}
            disabled={!hasIndex}
            oncompositionstart={() => (composing = true)}
            oncompositionend={() => (composing = false)}
          />
        </div>

      </div>
      <div class="min-h-0 max-h-[min(55dvh,24rem)]">
        <ScrollRegion orientation="vertical" label={t.search}>
          <Command.List class="max-h-none overflow-visible" aria-label={t.search}>
            {#if !hasIndex || !query}
              <Empty.Root>
                <Empty.Header>
                  <Empty.Media variant="icon"><SearchIcon aria-hidden="true" /></Empty.Media>
                  <Empty.Title>{!hasIndex ? t.indexTitle : t.search}</Empty.Title>
                  <Empty.Description>{!hasIndex ? t.unavailable : t.help}</Empty.Description>
                </Empty.Header>
              </Empty.Root>
            {:else if matches?.failed}
              <div class="p-2"><Alert.Root variant="destructive"><Alert.Description>{t.failed}</Alert.Description></Alert.Root></div>
            {:else if !matches || composing}
              <div class="flex items-center justify-center gap-2 p-6" role="status"><Spinner aria-hidden="true" />{t.pending}</div>
            {:else if !matches.hits.length}
              <Command.Empty forceMount role="status">{t.empty}</Command.Empty>
            {/if}
            {#each matches?.results ?? [] as result (result.url)}
              <Command.Group value={result.url}>
                <Command.LinkItem href={result.url} value={result.url} class="items-start py-3">
                  <div class="min-w-0 flex-1">
                    <span class="font-medium">{result.title}</span>
                    {#if result.sections.length === 0}{@render excerpt(result.excerpt)}{/if}
                  </div>
                </Command.LinkItem>
                {#each result.sections as section (section.url)}
                  <Command.LinkItem href={section.url} value={section.url} class="items-start py-3 ps-5">
                    <div class="min-w-0 flex-1"><span>{section.title}</span>{@render excerpt(section.excerpt)}</div>
                  </Command.LinkItem>
                {/each}
              </Command.Group>
            {/each}
            {#if matches && matches.results.length < matches.hits.length}
              <Command.Group>
                <Command.Item value="__more" onSelect={showMore} disabled={matches.loadingMore}>
                  {#if matches.loadingMore}<Spinner aria-hidden="true" />{/if}
                  {matches.loadingMore ? t.pending : t.more}
                </Command.Item>
              </Command.Group>
            {/if}
          </Command.List>
        </ScrollRegion>
      </div>
      {#if matches?.hits.length}<p role="status" class="px-3 py-2 text-xs text-muted-foreground">{status}</p>{/if}
      <Command.Separator />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-xs text-muted-foreground" aria-hidden="true">
        <span class="inline-flex items-center gap-1"><Kbd.Group><Kbd.Root>↑</Kbd.Root><Kbd.Root>↓</Kbd.Root></Kbd.Group>{t.navigate}</span>
        <span class="inline-flex items-center gap-1"><Kbd.Root>↵</Kbd.Root>{t.select}</span>
        <span class="ms-auto inline-flex items-center gap-1"><Kbd.Root>Esc</Kbd.Root>{t.close}</span>
      </div>
    </Command.Root>
    <Dialog.Close>
      {#snippet child({ props })}
        <Button {...props} variant="ghost" size="icon-sm" class="absolute top-2 right-2" aria-label={t.close}><XIcon aria-hidden="true" /></Button>
      {/snippet}
    </Dialog.Close>
  </Dialog.Content>
</Dialog.Root>
