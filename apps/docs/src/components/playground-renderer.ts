import { createRuntime, type View, type ViewSpec } from '@viewstem/core';
import type { RendererErrorListener } from '@viewstem/core/renderer';
import { createRenderer } from '@viewstem/dom';
import { ui } from '@viewstem/ui';

export function createPlaygroundRenderer(target: HTMLElement, onError: RendererErrorListener) {
  const runtime = createRuntime();
  runtime.registry.registerResourceSet(ui);
  target.setAttribute('data-viewstem-ui', '');
  const renderer = createRenderer({ runtime, onError });
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
    async dispose() { await renderer.dispose(); runtime.dispose(); },
  };
}
