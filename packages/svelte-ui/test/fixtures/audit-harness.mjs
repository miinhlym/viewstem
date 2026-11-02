import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { svelteConsumerPlugin } from '../../example/server.mjs';

// Exercise the published package entry points, real Core State/Action dispatch,
// and native browser controls. This is intentionally not a second UI runtime.
export async function createAuditHarness() {
  const bundle = await build({ stdin: { contents: `
    export { createRenderer } from '@viewstem/svelte';
    export { registerComponents } from '@viewstem/svelte-ui';
    export { shadcn } from '@viewstem/svelte-ui/shadcn';
    export { toast } from '@viewstem/svelte-ui/shadcn/sonner';
  `, resolveDir: fileURLToPath(new URL('../../', import.meta.url)) }, bundle: true, write: false,
    platform: 'browser', format: 'iife', globalName: 'API', conditions: ['svelte', 'browser'], plugins: [svelteConsumerPlugin] });
  const javascript = bundle.outputFiles[0].text;
  const css = await readFile(new URL(import.meta.resolve('@viewstem/svelte-ui/shadcn/styles.css')), 'utf8');
  const browser = await chromium.launch({ headless: true });
  return {
    close: () => browser.close(),
    async setup(t, view, { viewport = { width: 1280, height: 900 } } = {}) {
      const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://localhost/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><button id="host">Host</button><div id="app" style="padding:24px;max-width:1000px"></div><button id="after">After</button></body></html>' }));
      await page.goto('http://localhost/');
      await page.addScriptTag({ content: javascript });
      await page.addStyleTag({ content: css });
      await page.evaluate(async view => {
        window.diagnostics = []; window.events = []; window.unhandled = [];
        window.addEventListener('unhandledrejection', e => unhandled.push(String(e.reason?.code ?? e.reason)));
        window.renderer = API.createRenderer({ onError: entry => diagnostics.push(entry) });
        API.registerComponents(renderer, API.shadcn);
        renderer.registry.registerAction({ kind: 'Action', id: 'audit-record', spec: { ports: { name: { kind: 'Value', schema: { type: 'string' } }, payload: { kind: 'Value', schema: true } } } }, ({ inputs }) => { events.push({ name: inputs.name, payload: inputs.payload }); });
        window.mounted = await renderer.mount({ target: document.querySelector('#app'), view });
        await mounted.initialComplete;
      }, view);
      t.after(async () => {
        try {
          const evidence = await page.evaluate(async () => {
            await renderer.dispose();
            return { diagnostics: diagnostics.filter(e => e.error?.code !== 'CANCELLED'), unhandled };
          });
          assert.deepEqual(errors, [], 'uncaught browser errors');
          assert.deepEqual(evidence, { diagnostics: [], unhandled: [] }, 'renderer diagnostics and unhandled rejections');
        } finally { await context.close(); }
      });
      return page;
    },
  };
}

export const path = value => ({ '@path': value });
export const state = (initial, schema = true) => ({ kind: 'State', schema, initial });
export const node = (name, inputs = {}, children = [], extra = {}) => ({
  componentRef: 'shadcn.' + name, inputs,
  ...(children.length ? { slots: { default: children } } : {}), ...extra,
});
export function identify(view, prefix = 'audit') {
  let serial = 0;
  const visit = item => {
    const id = item.id ?? `${prefix}-${++serial}`;
    return { ...item, id,
      ...(item.on ? { on: Object.fromEntries(Object.entries(item.on).map(([name, binding]) => [name, { ...binding, id: binding.id ?? `${id}-${name}` }])) } : {}),
      ...(item.slots ? { slots: Object.fromEntries(Object.entries(item.slots).map(([name, children]) => [name, children.map(visit)])) } : {}),
    };
  };
  return { ...view, render: visit(view.render) };
}
export const group = (...children) => node('Field.Group', {}, children);
export const record = name => ({ actionRef: 'audit-record', inputs: { name, payload: path('/event') } });
export const bind = (name, event = 'valueChange', next = path('/event/value')) => ({ [event]: {
  action: { ports: { target: { kind: 'State', schema: true }, next: { kind: 'Value', schema: true } }, steps: [{ kind: 'SetState', target: path('/ports/target'), value: path('/ports/next') }] },
  inputs: { target: path('/states/' + name), next },
} });
export const read = (page, name) => page.evaluate(name => mounted.view.getState(name).read(), name);
export const write = (page, name, value) => page.evaluate(async ({ name, value }) => { mounted.view.getState(name).write(value); await mounted.whenRendered(); }, { name, value });
export const waitState = (page, name, value) => page.waitForFunction(({ name, value }) => JSON.stringify(mounted.view.getState(name).read()) === JSON.stringify(value), { name, value });
export const slot = (page, name) => page.locator(`[data-slot="${name}"]`);
