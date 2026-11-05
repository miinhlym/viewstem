<script lang="ts">
  import SidebarSheet from './SidebarSheet.svelte';
  import { exampleNavigationEntries, type ExampleNavigationProps } from '../../examples/navigation';
  let props: ExampleNavigationProps = $props();
  let ko = $derived(props.home.startsWith('/ko/'));
  let entries = $derived(exampleNavigationEntries(props));
</script>

<SidebarSheet {entries} label={props.label} description={ko ? '예제 페이지 탐색' : 'Browse example pages'} closeLabel={ko ? '닫기' : 'Close'} compact />
