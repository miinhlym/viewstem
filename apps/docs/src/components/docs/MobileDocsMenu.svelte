<script lang="ts">
  import type { SidebarEntry } from '../../lib/sidebar-navigation';
  import SidebarSheet from '../site/SidebarSheet.svelte';
  let { entries, locale }: { entries: SidebarEntry[]; locale: 'en' | 'ko' } = $props();
  let label = $derived(locale === 'ko' ? '문서 메뉴' : 'Docs menu');
</script>

<SidebarSheet {entries} {label} description={locale === 'ko' ? '문서 페이지 탐색' : 'Browse documentation pages'} closeLabel={locale === 'ko' ? '닫기' : 'Close'} />
