// Remove the pre-paint geometry override only after Svelte has committed the
// same persisted group state. Never recenter during hydration or later renders.
export function finishSidebarRestore() {
  document.querySelector('[data-docs-sidebar] [data-sidebar-bootstrap]')?.remove();
}
