<script lang="ts">
  import SidebarSheet from './SidebarSheet.svelte';
  import type { SidebarEntry } from '../../lib/sidebar-navigation';
  let { label, links, locale }: { label: string; locale: 'ko' | 'en'; links: { label: string; href: string; current: boolean }[] } = $props();
  let entries: SidebarEntry[] = $derived(links.map(link => ({ type: 'link', label: link.label, href: link.href, isCurrent: link.current })));
</script>

<SidebarSheet {entries} {label} title="Viewstem" description={label}
  closeLabel={locale === 'ko' ? '닫기' : 'Close'} compact triggerVariant="ghost" />
