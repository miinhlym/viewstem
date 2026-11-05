/** Shared navigation data; adapters supply routes without framework-specific UI. */
type Label = { label: string; badge?: { text: string; class?: string } };
export type SidebarEntry = Label & (
  | { type: 'link'; href: string; isCurrent?: boolean; attrs?: {
      class?: string | null; hreflang?: string | null; target?: string | null;
      rel?: string | null; title?: string | null;
    } }
  | { type: 'group'; entries: SidebarEntry[]; collapsed?: boolean }
);
