import { createRuntime } from '@viewstem/core';
import { createRenderer } from '@viewstem/dom';
import { ui } from '@viewstem/ui';

const runtime = createRuntime();
runtime.registry.registerResourceSet(ui);
const renderer = createRenderer({ runtime });
const target = document.querySelector('main')!;
const display = renderer.mount({ target, source: {
  render: { id: 'button', componentRef: 'shadcn.Button', inputs: { text: 'DOM only' } },
} });
const browser = window as Window & { testRun?: () => Promise<unknown> };
browser.testRun = async () => {
  await display.ready;
  await display.whenRendered();
  const text = target.querySelector('button')?.textContent;
  await display.unmount();
  await renderer.dispose();
  runtime.dispose();
  return { text, empty: target.childNodes.length === 0 };
};
