<script lang="ts">
  import type { StarlightRouteData } from '@astrojs/starlight/route-data';
  import SidebarNavigation from '../site/SidebarNavigation.svelte';
  import { finishSidebarRestore } from '../../lib/docs-sidebar';

  let { entries, persistKey }: {
    entries: StarlightRouteData['sidebar'];
    persistKey: string;
  } = $props();
</script>

<SidebarNavigation {entries} label={persistKey === 'ko' ? '문서 메뉴' : 'Docs menu'}
  storageKey={`viewstem-docs-groups:${persistKey}`} onRestore={finishSidebarRestore} />
