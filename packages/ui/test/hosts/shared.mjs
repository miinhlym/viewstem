import { createRenderer } from '@viewstem/ui';
import '@viewstem/ui/styles.css';
import definition from '../view.json';
import catalog from '../catalog.json';

export function start(target) {
  const renderer = createRenderer();
  let mounted;
  let view;
  let disposeExample;
  let stopped = false;
  window.fixture.ready = renderer.runtime.createView(definition).then(async result => {
    if (stopped) return;
    view = result;
    mounted = renderer.attach(view, target, { onError: ({ error }) => window.fixture.errors.push(error.code ?? String(error)) });
    await mounted.whenSettled(view.initial);
    if (stopped) return;
    window.fixture.view = view;
    window.fixture.detach = () => mounted.detach();
    window.fixture.reattach = () => { mounted = renderer.attach(view, target); };
    window.fixture.checkDuplicate = () => renderer.attach(view, target);
    window.fixture.showExample = async slug => {
      await disposeExample?.();
      const definition = catalog.find(example => example.slug === slug).view;
      const example = await renderer.runtime.createView(definition);
      const container = document.createElement('section');
      container.id = 'catalog-example';
      target.append(container);
      const attachment = renderer.attach(example, container, { onError: ({ error }) => window.fixture.errors.push(error.code ?? String(error)) });
      disposeExample = async () => { await attachment.detach(); example.dispose(); container.remove(); };
      await attachment.whenSettled(example.initial);
      window.fixture.example = example;
      return example.getSnapshot().roots;
    };
  }).catch(error => {
    if (!stopped) throw error;
  });
  return async () => {
    stopped = true;
    await disposeExample?.();
    await mounted?.detach();
    await renderer.dispose();
    view?.dispose();
  };
}
