// Runs inline after the server-rendered sidebar, before deferred Svelte hydration.
// The temporary rules restore geometry without changing the hydration markup.
(() => {
  const root = document.querySelector('[data-docs-sidebar]');
  const scroller = root?.querySelector('[data-slot="scroll-area-viewport"]');
  if (!root || !scroller) return;
  const desktop = matchMedia('(min-width: 50rem)');
  const key = root.dataset.persistKey;
  const scrollKey = `viewstem-docs-scroll:${key}`;
  let groups = {};
  let savedTop = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(`viewstem-docs-groups:${key}`) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) groups = saved;
    const top = JSON.parse(sessionStorage.getItem(scrollKey) || 'null');
    if (typeof top === 'number' && Number.isFinite(top) && top >= 0) savedTop = top;
  } catch { /* Storage is optional; current-page navigation still works. */ }
  const style = document.createElement('style');
  style.dataset.sidebarBootstrap = '';
  style.textContent = [...root.querySelectorAll('[data-sidebar-group]')].flatMap(group => {
    const saved = groups[group.dataset.sidebarGroup];
    if (typeof saved !== 'boolean' || group.hasAttribute('data-sidebar-current')) return [];
    const selector = `[data-docs-sidebar] [data-sidebar-group="${CSS.escape(group.dataset.sidebarGroup)}"]`;
    return [
      `${selector} > [data-slot="collapsible-content"] { display: ${saved ? 'block' : 'none'} !important; }`,
      `${selector} > button > svg { rotate: ${saved ? '90deg' : '0deg'} !important; transition: none !important; }`,
    ];
  }).join('\n');
  root.append(style);
  const revealCurrent = () => {
    const current = root.querySelector('[aria-current="page"]');
    if (!current) return;
    const viewport = scroller.getBoundingClientRect();
    const link = current.getBoundingClientRect();
    if (link.top < viewport.top || link.bottom > viewport.bottom) {
      scroller.scrollTop += link.top - viewport.top - (viewport.height - link.height) / 2;
    }
  };
  if (desktop.matches) {
    if (savedTop !== null) scroller.scrollTop = savedTop;
    revealCurrent();
  }
  const save = () => {
    if (!desktop.matches) return;
    try { sessionStorage.setItem(scrollKey, JSON.stringify(scroller.scrollTop)); } catch {}
  };
  scroller.addEventListener('scroll', save, { passive: true });
  const saveNavigation = () => {
    if (!desktop.matches) return;
    save();
    // Persist the actual tree, including ancestors opened for the current page.
    // Computed display also reflects the temporary pre-hydration CSS rules.
    const open = Object.fromEntries([...root.querySelectorAll('[data-sidebar-group]')].map(group => [
      group.dataset.sidebarGroup,
      getComputedStyle(group.querySelector(':scope > [data-slot="collapsible-content"]')).display !== 'none',
    ]));
    try { sessionStorage.setItem(`viewstem-docs-groups:${key}`, JSON.stringify(open)); } catch {}
  };
  root.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a')) saveNavigation();
  }, { capture: true });
  window.addEventListener('pagehide', saveNavigation);
})();
