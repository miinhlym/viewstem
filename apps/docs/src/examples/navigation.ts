import type { SidebarEntry } from '../lib/sidebar-navigation';

export type ExampleNavigationProps = {
  label: string;
  title: string;
  home: string;
  current?: string;
  groups: { title: string; items: { href: string; label: string }[] }[];
};

export function exampleNavigationEntries({ title, home, current, groups }: ExampleNavigationProps): SidebarEntry[] {
  return [
    { type: 'link', label: title, href: home, isCurrent: !current },
    ...groups.map(group => ({
      type: 'group' as const,
      label: group.title,
      collapsed: Boolean(current),
      entries: group.items.map(item => ({ type: 'link' as const, ...item, isCurrent: item.href === current })),
    })),
  ];
}
