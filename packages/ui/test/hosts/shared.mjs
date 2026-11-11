import { createRegistry, createRuntime } from '@viewstem/core';
import { attach, registerShadcn } from '@viewstem/ui';
import '@viewstem/ui/styles.css';
import definition from '../view.json';
import catalog from '../catalog.json';

export function start(target) {
  const registry = createRegistry();
  registerShadcn(registry);
  const runtime = createRuntime({ registry });
  let mounted;
  let disposeExample;
  let stopped = false;
  window.fixture.ready = runtime.createView({ view: definition }).then(async ({ view, initialComplete }) => {
    if (stopped) return;
    mounted = attach(view, target, { onError: error => window.fixture.errors.push(error.code ?? String(error)) });
    await initialComplete;
    if (stopped) return;
    window.fixture.view = view;
    window.fixture.detach = () => mounted.dispose();
    window.fixture.reattach = () => { mounted = attach(view, target); };
    window.fixture.checkDuplicate = () => attach(view, target);
    window.fixture.showExample = async slug => {
      disposeExample?.();
      const definition = catalog.find(example => example.slug === slug).view;
      const example = await runtime.createView({ view: definition });
      const container = document.createElement('section');
      container.id = 'catalog-example';
      target.append(container);
      const attachment = attach(example.view, container, { onError: error => window.fixture.errors.push(error.code ?? String(error)) });
      disposeExample = () => { attachment.dispose(); example.view.dispose(); container.remove(); };
      await example.initialComplete;
      window.fixture.example = example.view;
      return example.view.getSnapshot().roots;
    };
  }).catch(error => {
    if (!stopped) throw error;
  });
  return () => {
    stopped = true;
    disposeExample?.();
    mounted?.dispose();
    runtime.dispose();
  };
}
