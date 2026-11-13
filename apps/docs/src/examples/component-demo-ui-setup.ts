import type { Registry, Runtime, ViewSpec } from '@viewstem/core';
import type { createRenderer } from '@viewstem/ui';

export function sonnerInputs(view: ViewSpec): Record<string, unknown> {
  function visit(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object') return;
    if ('componentRef' in value && value.componentRef === 'shadcn.Sonner' && 'inputs' in value) {
      return value.inputs as Record<string, unknown>;
    }
    for (const child of Object.values(value)) {
      const found = visit(child);
      if (found) return found;
    }
  }
  return visit(view) ?? {};
}

// Executed by the preview and printed verbatim in its consumer setup.ts.
export async function registerUiToastAction(registry: Registry, runtime: Runtime, target: HTMLElement, attach: ReturnType<typeof createRenderer>['attach'], inputs: Record<string, unknown>): Promise<() => Promise<void>> {
  const toastTarget = target.ownerDocument.createElement('div');
  toastTarget.dataset.demoNotifications = '';
  // Mount the fixed overlay outside the workbench's stacking context.
  target.ownerDocument.body.append(toastTarget);
  try {
    const view = await runtime.createView({
      states: { messages: { kind: 'State', schema: true, initial: [] } },
      render: {
        id: 'docs-notifications', componentRef: 'shadcn.Notifications',
        inputs: {
          notifications: { '@path': '/states/messages' },
          position: String(inputs.position ?? 'bottom-right'), closeButton: inputs.closeButton !== false,
          closeButtonAriaLabel: String(inputs.closeButtonAriaLabel ?? 'Close toast'),
          containerAriaLabel: String(inputs.containerAriaLabel ?? 'Notifications'),
        },
        on: { dismiss: {
          action: { ports: { target: { kind: 'State', schema: true, required: true } }, steps: [
            { kind: 'SetState', target: { '@path': '/ports/target' }, value: [] },
          ] },
          inputs: { target: { '@path': '/states/messages' } },
        } },
      },
    });
    const attachment = attach(view, toastTarget);
    await attachment.whenSettled(view.initial);
    registry.registerAction({ kind: 'Action', id: 'docs-show-toast', spec: { ports: {
      title: { kind: 'Value', schema: { type: 'string' }, required: true },
      description: { kind: 'Value', schema: { type: 'string' }, required: true },
    } } }, ({ inputs }) => {
      view.getState('messages').write([{ id: 'viewstem-docs-sonner-demo', title: String(inputs.title), description: String(inputs.description), kind: 'success', duration: 4000 }]);
    });
    return async () => { await attachment.detach(); view.dispose(); toastTarget.remove(); };
  } catch (error) { toastTarget.remove(); throw error; }
}

export function uiDemoSetupSource(view: ViewSpec, family: string) {
  return [
    family === 'sonner' ? "import type { ViewSpec, Registry, Runtime } from '@viewstem/core';" : "import type { ViewSpec } from '@viewstem/core';",
    "import { createRenderer } from '@viewstem/ui';",
    "import '@viewstem/ui/styles.css';",
    "import view from './view.json';", '',
    'const renderer = createRenderer();',
    'const target = document.querySelector<HTMLElement>("#preview");',
    'if (!target) throw new Error("Missing #preview element");',
    ...(family === 'sonner' ? ['', `const registerUiToastAction: (registry: Registry, runtime: Runtime, target: HTMLElement, attach: ReturnType<typeof import('@viewstem/ui').createRenderer>['attach'], inputs: Record<string, unknown>) => Promise<() => Promise<void>> = ${registerUiToastAction.toString()};`,
      'const { runtime } = renderer;',
      `const disposeToast = await registerUiToastAction(runtime.registry, runtime, target, renderer.attach.bind(renderer), ${JSON.stringify(sonnerInputs(view))});`] : []), '',
    '// JSON imports widen discriminants; the runtime validates the definition.',
    'const screen = renderer.mount({ target, source: view as unknown as ViewSpec });', 'await screen.ready;', '',
    '// Call when this screen is removed.', 'export async function dispose() {',
    '  await screen.unmount();', ...(family === 'sonner' ? ['  await disposeToast();'] : []),
    '  await renderer.dispose();', '}',
  ].join('\n');
}
