<script lang="ts">
  import { onMount } from 'svelte';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Moon from '@lucide/svelte/icons/moon';
  import Sun from '@lucide/svelte/icons/sun';
  import { Button } from '../ui/button/index.js';
  import * as DropdownMenu from '../ui/dropdown-menu/index.js';
  type Choice = 'auto' | 'light' | 'dark';
  let { locale }: { locale: 'ko' | 'en' } = $props();
  let choice = $state<Choice>('auto');
  let ready = $state(false);
  const ko = $derived(locale === 'ko');
  const Icon = $derived(choice === 'dark' ? Moon : choice === 'light' ? Sun : Monitor);
  function read(): Choice {
    try { const value = localStorage.getItem('starlight-theme'); return value === 'light' || value === 'dark' ? value : 'auto'; } catch { return 'auto'; }
  }
  function apply(value: Choice) {
    const dark = value === 'dark' || (value === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', dark);
  }
  function select(value: string) {
    choice = value as Choice;
    apply(choice);
    try { localStorage.setItem('starlight-theme', choice === 'auto' ? '' : choice); } catch { /* Storage is optional. */ }
  }
  onMount(() => {
    const sync = () => { choice = read(); apply(choice); };
    const media = matchMedia('(prefers-color-scheme: dark)');
    const storage = (event: StorageEvent) => { if (event.key === 'starlight-theme' || event.key === null) sync(); };
    sync(); ready = true;
    media.addEventListener('change', sync); window.addEventListener('storage', storage);
    return () => { media.removeEventListener('change', sync); window.removeEventListener('storage', storage); };
  });
</script>
<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}<Button {...props} variant="ghost" size="icon" disabled={!ready} aria-label={ko ? '색상 테마' : 'Color theme'}><Icon /></Button>{/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end">
    <DropdownMenu.RadioGroup value={choice} onValueChange={select}>
      <DropdownMenu.RadioItem value="auto" closeOnSelect><Monitor />{ko ? '시스템 설정' : 'System'}</DropdownMenu.RadioItem>
      <DropdownMenu.RadioItem value="light" closeOnSelect><Sun />{ko ? '밝게' : 'Light'}</DropdownMenu.RadioItem>
      <DropdownMenu.RadioItem value="dark" closeOnSelect><Moon />{ko ? '어둡게' : 'Dark'}</DropdownMenu.RadioItem>
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Content>
</DropdownMenu.Root>
