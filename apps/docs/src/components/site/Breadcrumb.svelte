<script lang="ts">
  import * as Breadcrumb from '../ui/breadcrumb/index.js';
  let { links, title, label, class: className }: { links: { href?: string; label: string }[]; title: string; label: string; class?: string } = $props();
</script>
<Breadcrumb.Root aria-label={label} class={className}>
  <Breadcrumb.List>
    {#each links as link, index (link.href ?? link.label)}
      <Breadcrumb.Item>
        {#if link.href}<Breadcrumb.Link href={link.href}>{link.label}</Breadcrumb.Link>{:else}<span>{link.label}</span>{/if}
      </Breadcrumb.Item>
      <Breadcrumb.Separator data-current-crumb={index === links.length - 1 ? '' : undefined} />
    {/each}
    <Breadcrumb.Item data-current-crumb=""><Breadcrumb.Page>{title}</Breadcrumb.Page></Breadcrumb.Item>
  </Breadcrumb.List>
</Breadcrumb.Root>
