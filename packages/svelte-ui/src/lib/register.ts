import type { ComponentRegistration, Renderer } from '@viewstem/svelte';

/** A complete, explicitly registered family; importing it does not mutate a renderer. */
export interface ComponentSet {
  readonly id: string;
  readonly components: readonly ComponentRegistration[];
}

export function registerComponents(renderer: Renderer, sets: readonly ComponentSet[]): void {
  if (!Array.isArray(sets)) throw Object.freeze({ code: 'INVALID_DEFINITION', message: 'Component sets must be an array.' });
  const entries: ComponentRegistration[] = [];
  for (const set of sets) {
    if (!set || typeof set.id !== 'string' || !Array.isArray(set.components)) throw Object.freeze({ code: 'INVALID_DEFINITION', message: 'Invalid component set.' });
    entries.push(...set.components);
  }
  renderer.registerComponents(entries);
}
