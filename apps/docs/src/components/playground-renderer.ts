import type { View, ViewSpec } from '@viewstem/core';
import type { RendererErrorListener } from '@viewstem/core/renderer';
import { createRenderer } from '@viewstem/ui';

export function createPlaygroundRenderer(target: HTMLElement, onError: RendererErrorListener) {
  const renderer = createRenderer({ onError });
  let view: View | undefined;
  let screen: ReturnType<typeof renderer.mount> | undefined;

  return {
    async run(spec: ViewSpec) {
      if (view && screen) return screen.whenSettled(await view.replace(spec));
      const mounted = renderer.mount({ target, source: spec });
      view = await mounted.ready;
      screen = mounted;
      return mounted.whenSettled(view.initial);
    },
    dispose: () => renderer.dispose(),
  };
}
