<script lang="ts">
  import { tick } from 'svelte';
  import * as Table from '@/components/ui/table/index.js';
  import * as ToggleGroup from '@/components/ui/toggle-group/index.js';
  import { cn } from '@/lib/utils.js';

  type Filter = 'all' | 'active';
  type Status = 'active' | 'trial';

  let { rows, caption, customerLabel, statusLabel, statuses, filterLabel, filterLabels, countLabels }: {
    rows: { name: string; status: Status }[];
    caption: string;
    customerLabel: string;
    statusLabel: string;
    statuses: Record<Status, string>;
    filterLabel: string;
    filterLabels: Record<Filter, string>;
    countLabels: Record<Filter, string>;
  } = $props();

  let filter = $state<Filter>('active');
  let toolbar = $state<HTMLDivElement>();

  async function setFilter(next: string) {
    if ((next !== 'all' && next !== 'active') || next === filter) return;
    filter = next;
    await tick();
    if (filter === next) {
      toolbar?.dispatchEvent(new CustomEvent('customer-filter-change', { detail: next, bubbles: true }));
    }
  }
</script>

<div class="preview-toolbar" {@attach (element) => {
  toolbar = element;
  return () => { toolbar = undefined; };
}}>
  <ToggleGroup.Root
    type="single"
    bind:value={() => filter, setFilter}
    size="sm"
    variant="outline"
    aria-label={filterLabel}
    hidden={!toolbar}
  >
    <ToggleGroup.Item value="all" data-filter="all">{filterLabels.all}</ToggleGroup.Item>
    <ToggleGroup.Item value="active" data-filter="active">{filterLabels.active}</ToggleGroup.Item>
  </ToggleGroup.Root>
  <output data-customer-count>{countLabels[filter]}</output>
</div>
<Table.Root>
  <Table.Caption class="visually-hidden">{caption}</Table.Caption>
  <Table.Header>
    <Table.Row>
      <Table.Head scope="col">{customerLabel}</Table.Head>
      <Table.Head scope="col" class="text-end">{statusLabel}</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#each rows as row (row.name)}
      <Table.Row data-customer-status={row.status} hidden={filter === 'active' && row.status !== 'active'}>
        <Table.Head scope="row">{row.name}</Table.Head>
        <Table.Cell class="text-end">
          <span class={cn('customer-status', { 'is-active': row.status === 'active' })}>{statuses[row.status]}</span>
        </Table.Cell>
      </Table.Row>
    {/each}
  </Table.Body>
</Table.Root>
