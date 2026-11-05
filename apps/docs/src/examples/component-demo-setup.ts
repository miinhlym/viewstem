import type { ViewSpec } from '@viewstem/svelte';
import { componentCatalog, componentFamilies } from './component-catalog';

export function demoFamilies(view: ViewSpec): string[] {
  const families = new Set<string>();
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if ('componentRef' in value && typeof value.componentRef === 'string') {
      const family = componentFamilies[value.componentRef];
      if (!family) throw new Error(`Unsupported preview component: ${value.componentRef}`);
      families.add(family);
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(view);
  return [...families].sort();
}

// This function is both executed by the preview and printed in setup.ts.
export function registerToastAction(renderer: import('@viewstem/svelte').Renderer, toast: typeof import('@viewstem/svelte-ui/shadcn/sonner').toast) {
  renderer.registry.registerAction({ kind: 'Action', id: 'docs-show-toast', spec: {
    ports: {
      title: { kind: 'Value', schema: { type: 'string' }, required: true },
      description: { kind: 'Value', schema: { type: 'string' }, required: true },
    },
  } }, ({ inputs }) => {
    toast.success(String(inputs.title), { description: String(inputs.description), toasterId: 'viewstem-docs-sonner', id: 'viewstem-docs-sonner-demo', duration: 4000 });
  });
}

export function demoSetupSource(view: ViewSpec, family: string) {
  const families = demoFamilies(view);
  return [
    "import { createRenderer, type ViewSpec } from '@viewstem/svelte';",
    "import { registerComponents } from '@viewstem/svelte-ui';",
    ...families.map(slug => `import { ${componentCatalog[slug].set}${family === 'sonner' && slug === 'sonner' ? ', toast' : ''} } from '@viewstem/svelte-ui/shadcn/${slug}';`),
    "import '@viewstem/svelte-ui/shadcn/styles.css';",
    "import view from './view.json';",
    '',
    'const renderer = createRenderer();',
    `registerComponents(renderer, [${families.map(slug => componentCatalog[slug].set).join(', ')}]);`,
    ...(family === 'sonner' ? ['', `const registerToastAction: (renderer: ReturnType<typeof createRenderer>, notify: typeof toast) => void = ${registerToastAction.toString()};`, 'registerToastAction(renderer, toast);'] : []),
    '',
    'const target = document.querySelector<HTMLElement>("#preview");',
    'if (!target) throw new Error("Missing #preview element");',
    '// JSON imports widen discriminants; the runtime validates the definition.',
    'const mounted = await renderer.mount({ target, view: view as unknown as ViewSpec });',
    'await mounted.initialComplete;',
    '',
    '// When this screen is removed:',
    ...(family === 'sonner' ? ["// toast.dismiss('viewstem-docs-sonner-demo');"] : []),
    '// await renderer.dispose();',
  ].join('\n');
}
