import { createRegistry, createRuntime, type View, type ViewSpec } from '@viewstem/core';
import { attach, registerShadcn, type Attachment, type AttachOptions } from '@viewstem/ui';

export function createPlaygroundRenderer(target: HTMLElement, onError: NonNullable<AttachOptions['onError']>) {
  const registry = createRegistry();
  registerShadcn(registry);
  const runtime = createRuntime({ registry });
  let view: View | undefined;
  let attachment: Attachment | undefined;

  return {
    async run(spec: ViewSpec) {
      if (view) return view.replace({ view: spec });
      const mounted = await runtime.createView({ view: spec });
      try {
        attachment = attach(mounted.view, target, { onError });
        view = mounted.view;
        return mounted;
      } catch (error) {
        mounted.view.dispose();
        throw error;
      }
    },
    dispose() {
      attachment?.dispose();
      runtime.dispose();
    },
  };
}
