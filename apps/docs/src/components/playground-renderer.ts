import { createRenderer, type RendererErrorListener } from '@viewstem/svelte';
import { registerComponents } from '@viewstem/svelte-ui';
import { button } from '@viewstem/svelte-ui/shadcn/button';
import { card } from '@viewstem/svelte-ui/shadcn/card';
import { switchSet } from '@viewstem/svelte-ui/shadcn/switch';

export function createPlaygroundRenderer(onError: RendererErrorListener) {
  const renderer = createRenderer({ onError });
  registerComponents(renderer, [button, card, switchSet]);
  return renderer;
}
