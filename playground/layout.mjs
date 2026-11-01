// Workspace dimensions belong to the playground, outside the core runtime.
export function setupLayout() {
  const workspace = document.getElementById('workspace');
  const mobile = matchMedia('(max-width: 760px)');
  const paneButtons = [...document.querySelectorAll('[data-pane]')].filter(node => node.tagName === 'BUTTON');
  function showPane(name) {
    workspace.dataset.pane = name;
    for (const button of paneButtons) button.setAttribute('aria-pressed', String(button.dataset.pane === name));
  }
  for (const button of paneButtons) button.addEventListener('click', () => showPane(button.dataset.pane));
  for (const [id, container, property, axis, fallback, minimum, maximum] of [
    ['column-divider', workspace, '--editor-size', 'x', 46, 20, 75],
    ['row-divider', document.getElementById('output'), '--preview-size', 'y', 62, 20, 80],
  ]) {
    const divider = document.getElementById(id);
    let percent = fallback;
    function apply(next) {
      if (mobile.matches) return;
      const size = axis === 'x' ? container.clientWidth : container.clientHeight;
      if (!size) return;
      const low = Math.max(minimum, (axis === 'x' ? 250 : 110) / size * 100);
      const high = Math.max(low, Math.min(maximum, 100 - (axis === 'x' ? 305 : 105) / size * 100));
      percent = Math.max(low, Math.min(high, next));
      container.style.setProperty(property, `${percent}%`);
      divider.setAttribute('aria-valuemin', low.toFixed(2));
      divider.setAttribute('aria-valuemax', high.toFixed(2));
      divider.setAttribute('aria-valuenow', percent.toFixed(2));
    }
    divider.addEventListener('pointerdown', event => {
      if (event.button !== 0 || mobile.matches) return;
      event.preventDefault(); divider.focus(); divider.setPointerCapture(event.pointerId);
      divider.dataset.dragging = 'true';
    });
    divider.addEventListener('pointermove', event => {
      if (!divider.hasPointerCapture(event.pointerId)) return;
      const rect = container.getBoundingClientRect();
      apply(axis === 'x' ? (event.clientX - rect.left) / rect.width * 100 : (event.clientY - rect.top) / rect.height * 100);
    });
    const finish = () => { delete divider.dataset.dragging; };
    divider.addEventListener('lostpointercapture', finish);
    divider.addEventListener('pointerup', event => { if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId); });
    divider.addEventListener('dblclick', () => apply(fallback));
    divider.addEventListener('keydown', event => {
      const keys = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
      if (![...keys, 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      apply(event.key === 'Home' ? minimum : event.key === 'End' ? maximum : percent + (event.key === keys[0] ? -2 : 2));
    });
    new ResizeObserver(() => apply(percent)).observe(container);
  }
  return { showPane: name => { if (mobile.matches) showPane(name); } };
}
