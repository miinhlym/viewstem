import { createRegistry, createRuntime, type ViewSpec } from '@viewstem/core';
import { createRenderer, registerShadcn } from '@viewstem/ui';
import { registerUiToastAction, sonnerInputs } from './component-demo-ui-setup';

export async function mountUiComponentDemo(target: HTMLElement, view: ViewSpec, family: string, onError: (error: unknown) => void) {
  const registry = createRegistry();
  registerShadcn(registry);
  const runtime = createRuntime({ registry });
  const renderer = createRenderer({ runtime });
  let attachment: ReturnType<typeof renderer.attach> | undefined;
  let disposeToast: (() => Promise<void>) | undefined;
  const dispose = async () => { await attachment?.detach(); await disposeToast?.(); await renderer.dispose(); runtime.dispose(); };
  try {
    if (family === 'sonner') disposeToast = await registerUiToastAction(registry, runtime, target, renderer.attach.bind(renderer), sonnerInputs(view));
    const created = await runtime.createView(view);
    attachment = renderer.attach(created, target, { onError });
    const report = await attachment.whenSettled(created.initial);
    const error = report.queryErrors[0]?.error ?? created.getSnapshot().errors[0];
    if (error) throw new Error(error.message);
    return { dispose };
  } catch (error) { await dispose(); throw error; }
}
