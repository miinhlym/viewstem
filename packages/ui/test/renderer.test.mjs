import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { compile } from 'svelte/compiler';

const workspace = fileURLToPath(new URL('../../../', import.meta.url));

test('DOM renderer owns mounted views and borrows attachments', async t => {
  const bundle = await build({
    stdin: { resolveDir: workspace, contents: `
      import { createRenderer, registerShadcn } from '@viewstem/ui';
      import { createRuntime, createStateStore } from '@viewstem/core';
      window.createRendererForTest = createRenderer;
      window.renderer = createRenderer();
      window.source = {
        states: { label: { kind: 'State', schema: { type: 'string' }, initial: 'Draft' } },
        render: { id: 'label', componentRef: 'shadcn.Badge', inputs: { text: { '@path': '/states/label' } } },
      };
      window.clickAndDetach = async (left, right) => {
        const renderer = createRenderer();
        let calls = 0;
        renderer.runtime.registry.registerAction({ kind: 'Action', id: 'record', spec: {} }, () => { calls++; });
        const view = await renderer.runtime.createView({
          render: { id: 'button', componentRef: 'shadcn.Button', inputs: { text: 'Record' },
            on: { click: { actionRef: 'record' } } },
        });
        const first = renderer.attach(view, left);
        const second = renderer.attach(view, right);
        left.querySelector('button').click();
        await first.detach();
        const afterDetach = calls;
        await new Promise(resolve => setTimeout(resolve, 0));
        right.querySelector('button').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        const result = { afterDetach, calls, empty: !left.hasChildNodes() };
        await second.detach();
        await renderer.dispose();
        return result;
      };
      window.mountDuringPublication = async target => {
        const store = createStateStore();
        let requests = 0, disposal, liveStates;
        const runtime = createRuntime({ stateStore: store, requestExecutor() {
          requests++;
          return new Promise(() => {});
        } });
        registerShadcn(runtime.registry);
        const renderer = createRenderer({ runtime });
        const stop = store.subscribe(null, ({ changes }) => {
          if (changes.some(change => change.kind === 'added')) disposal = renderer.dispose();
        });
        const screen = renderer.mount({ target, source: { ...window.source, queries: { first: { query: {
          sources: { data: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: '/' } } },
          transform: { input: { '@path': '/sources/data' } },
        } } } } });
        const code = await screen.ready.then(() => 'ready', error => error.code);
        await disposal;
        store.subscribe(null, ({ states }) => { liveStates = Object.keys(states).length; })();
        stop();
        runtime.dispose();
        store.dispose();
        return { code, requests, liveStates, empty: target.textContent };
      };
    ` }, bundle: true, write: false, platform: 'browser', format: 'iife',
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<main id="left"></main><main id="right"></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    let conflict;
    try { createRendererForTest({ runtime: renderer.runtime, resources: [] }); } catch (error) { conflict = error.code; }
    const left = document.querySelector('#left');
    const right = document.querySelector('#right');
    const screen = renderer.mount({ target: left, source });
    let duplicate;
    try { renderer.mount({ target: left, source }); } catch (error) { duplicate = error; }
    let disconnected;
    try { renderer.mount({ target: document.createElement('div'), source }); } catch (error) { disconnected = error; }
    const view = await screen.ready;
    const attachment = renderer.attach(view, right);
    await attachment.whenRendered();
    view.getState('label').write('Saved');
    await Promise.all([screen.whenRendered(), attachment.whenRendered()]);
    const before = [left.textContent, right.textContent];
    await attachment.detach();
    const after = [left.textContent, right.textContent];
    await screen.unmount();
    const diagnostics = [], central = [];
    const observer = createRendererForTest({ runtime: renderer.runtime, onError: diagnostic => central.push(diagnostic) });
    const invalid = observer.mount({ target: left, onError: diagnostic => diagnostics.push(diagnostic), source: {
      render: { id: 'invalid', componentRef: 'shadcn.Button', inputs: { text: 12 } },
    } });
    const invalidInput = await invalid.ready.catch(error => error);
    await observer.dispose();
    const remount = renderer.mount({ target: left, source });
    await remount.ready;
    await renderer.dispose();
    const publication = await mountDuringPublication(left);
    const detachedClick = await clickAndDetach(left, right);
    return { conflict, duplicate, disconnected, before, after, invalidInput, diagnostics, publication, detachedClick,
      sharedDiagnostic: central.length === 1 && central[0] === diagnostics[0], empty: left.textContent,
    };
  });
  assert.equal(result.conflict, 'INVALID_DEFINITION');
  assert.equal(result.duplicate.code, 'INVALID_DEFINITION');
  assert.match(result.duplicate.message, /already has a Viewstem connection/);
  assert.equal(result.disconnected.code, 'INVALID_DEFINITION');
  assert.match(result.disconnected.message, /connected HTMLElement/);
  assert.deepEqual(result.before, ['Saved', 'Saved']);
  assert.deepEqual(result.after, ['Saved', '']);
  assert.equal(result.invalidInput.code, 'INVALID_DEFINITION');
  assert.equal(result.invalidInput.input, 'text');
  assert.deepEqual(result.invalidInput.resource, { kind: 'Component', id: 'shadcn.Button' });
  assert.deepEqual(result.diagnostics, [{ phase: 'prepare', error: result.invalidInput }]);
  assert.equal(result.sharedDiagnostic, true);
  assert.deepEqual(result.publication, { code: 'CANCELLED', requests: 0, liveStates: 0, empty: '' });
  assert.deepEqual(result.detachedClick, { afterDetach: 0, calls: 1, empty: true });
  assert.equal(result.empty, '');
});


test('DOM and Svelte reserve the same target across renderers', async t => {
  const bundle = await build({
    stdin: { resolveDir: workspace, contents: `
      import { createRenderer as createDom } from '@viewstem/ui';
      import { createRenderer as createSvelte } from './packages/svelte/src/lib/renderer.ts';
      window.makeRenderers = () => {
        const resourceResolver = () => new Promise(() => {});
        return [createDom({ resourceResolver }), createSvelte({ resourceResolver })];
      };
    ` },
    bundle: true, write: false, platform: 'browser', format: 'iife', conditions: ['browser'],
    plugins: [{ name: 'svelte', setup(builder) {
      builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
        contents: compile(await readFile(path, 'utf8'), { filename: path, generate: 'client' }).js.code,
        loader: 'js',
      }));
    } }],
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<main id="target"></main>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const [dom, svelte] = makeRenderers();
    const target = document.querySelector('#target');
    const source = { ref: 'delayed' };
    const first = dom.mount({ target, source });
    let domFirst;
    try { svelte.mount({ target, source }); } catch (error) { domFirst = error.code; }
    await first.unmount();
    const second = svelte.mount({ target, source });
    let svelteFirst;
    try { dom.mount({ target, source }); } catch (error) { svelteFirst = error.code; }
    await second.unmount();
    await Promise.all([dom.dispose(), svelte.dispose()]);
    return [domFirst, svelteFirst];
  });
  assert.deepEqual(result, ['INVALID_DEFINITION', 'INVALID_DEFINITION']);
});
