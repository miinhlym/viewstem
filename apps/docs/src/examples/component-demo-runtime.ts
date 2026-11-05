import { createRenderer, type ViewSpec, type RendererErrorListener } from '@viewstem/svelte';
import { registerComponents } from '@viewstem/svelte-ui';
import { componentCatalog } from './component-catalog';
import { demoFamilies, registerToastAction } from './component-demo-setup';

export async function mountComponentDemo(target: HTMLElement, view: ViewSpec, family: string, onError: RendererErrorListener) {
  const sets = await Promise.all(demoFamilies(view).map(slug => componentCatalog[slug].load()));
  const renderer = createRenderer({ onError });
  let dismiss: (() => void) | undefined;
  try {
    registerComponents(renderer, sets);
    if (family === 'sonner') {
      const { toast } = await import('@viewstem/svelte-ui/shadcn/sonner');
      registerToastAction(renderer, toast);
      dismiss = () => toast.dismiss('viewstem-docs-sonner-demo');
    }
    const mounted = await renderer.mount({ target, view });
    const report = await mounted.initialComplete;
    const error = report.queryErrors[0]?.error ?? mounted.view.getSnapshot().errors[0];
    if (error) throw new Error(error.message);
    return { dispose: async () => { dismiss?.(); await renderer.dispose(); } };
  } catch (error) {
    dismiss?.();
    await renderer.dispose();
    throw error;
  }
}
