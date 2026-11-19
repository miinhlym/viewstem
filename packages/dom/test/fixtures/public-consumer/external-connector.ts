import type { ComponentConnector } from '@viewstem/dom';

export const material = Object.freeze({ name: 'external label' });
export const mounts: string[] = [];
export const disposals: string[] = [];
export const externalConnector: ComponentConnector = {
  id: 'external',
  accepts: implementation => implementation === material,
  mount(_implementation, context) {
    const { node, anchor, parent, signal } = context;
    const element = parent.ownerDocument.createElement('button');
    const key = String(node.inputs.key);
    element.dataset.external = key;
    element.textContent = String(node.inputs.label);
    element.addEventListener('click', () => { void context.emit('click', null).catch(() => {}); }, { signal });
    parent.insertBefore(element, anchor);
    mounts.push(key);
    return {
      update(next) { element.textContent = String(next.inputs.label); },
      setPending(value) { element.toggleAttribute('aria-busy', value); },
      dispose() { disposals.push(key); element.remove(); },
    };
  },
};
