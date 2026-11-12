import { createRegistry, createRuntime, type ViewSpec } from '@viewstem/core';
import { attach, registerShadcn } from '@viewstem/ui';
import { registerUiToastAction, sonnerInputs } from './component-demo-ui-setup';

export async function mountUiComponentDemo(target: HTMLElement, view: ViewSpec, family: string, onError: (error: unknown) => void) {
  const registry = createRegistry();
  registerShadcn(registry);
  const runtime = createRuntime({ registry });
  let attachment: ReturnType<typeof attach> | undefined;
  let disposeToast: (() => void) | undefined;
  const dispose = async () => { attachment?.dispose(); disposeToast?.(); runtime.dispose(); };
  try {
    if (family === 'sonner') disposeToast = await registerUiToastAction(registry, runtime, target, attach, sonnerInputs(view));
    const mounted = await runtime.createView({ view });
    attachment = attach(mounted.view, target, { onError });
    const report = await mounted.initialComplete;
    const error = report.queryErrors[0]?.error ?? mounted.view.getSnapshot().errors[0];
    if (error) throw new Error(error.message);
    return { dispose };
  } catch (error) { await dispose(); throw error; }
}
