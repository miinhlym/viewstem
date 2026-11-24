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
      import { createRenderer } from '@viewstem/dom';
      import { ui } from '@viewstem/ui';
      import { createRuntime, createStateStore } from '@viewstem/core';
      window.createRendererForTest = createRenderer;
      const runtime = createRuntime();
      runtime.registry.registerResourceSet(ui);
      window.renderer = createRenderer({ runtime });
      window.source = {
        states: { label: { kind: 'State', schema: { type: 'string' }, initial: 'Draft' } },
        render: { id: 'label', componentRef: 'shadcn.Badge', inputs: { text: { '@path': '/states/label' }, title: 'Status' } },
      };
      window.clickAndDetach = async (left, right) => {
        const runtime = createRuntime();
        runtime.registry.registerResourceSet(ui);
        const renderer = createRenderer({ runtime });
        let calls = 0;
        renderer.runtime.registry.registerAction({ kind: 'Action', id: 'record', spec: {} }, () => { calls++; });
        const view = await renderer.runtime.createView({
          render: { id: 'button', componentRef: 'shadcn.Button', inputs: { text: 'Record' },
            on: { click: { actionRef: 'record' } } },
        });
        const first = renderer.attach(view, left);
        const second = renderer.attach(view, right);
        await Promise.all([first.whenRendered(), second.whenRendered()]);
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
        runtime.registry.registerResourceSet(ui);
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
    ` }, outfile: 'bundle.js', bundle: true, write: false, platform: 'browser', format: 'iife',
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<main id="left"></main><main id="right"></main>');
  await page.addStyleTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.css')).text });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text });
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
    const badge = left.querySelector('[data-vs-component="Badge"]');
    let managedChanges = 0;
    const attributes = new MutationObserver(records => { managedChanges += records.length; });
    attributes.observe(badge, { attributes: true, attributeFilter: ['data-vs-managed'] });
    view.getState('label').write('Saved');
    await Promise.all([screen.whenRendered(), attachment.whenRendered()]);
    const before = [left.textContent, right.textContent];
    const stableAttributes = [badge.getAttribute('title'), managedChanges + attributes.takeRecords().length];
    attributes.disconnect();
    const next = structuredClone(source);
    delete next.render.inputs.title;
    await view.updateDefinition(next);
    await Promise.all([screen.whenRendered(), attachment.whenRendered()]);
    const titleRemoved = badge === left.querySelector('[data-vs-component="Badge"]') && !badge.hasAttribute('title');
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
    return { conflict, duplicate, disconnected, before, after, stableAttributes, titleRemoved, invalidInput, diagnostics, publication, detachedClick,
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
  assert.deepEqual(result.stableAttributes, ['Status', 0]);
  assert.equal(result.titleRemoved, true);
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
      import { createRuntime } from '@viewstem/core';
      import { createRenderer as createDom } from '@viewstem/dom';
      import { createRenderer as createSvelte } from './packages/svelte/src/lib/renderer.ts';
      window.makeRenderers = () => {
        const resourceResolver = () => new Promise(() => {});
        return [createDom({ runtime: createRuntime({ resourceResolver }) }), createSvelte({ resourceResolver })];
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

test('a DOM Card, Svelte layout and DOM Button share the same View State and Actions', async t => {
  const { outputFiles } = await build({
    stdin: { resolveDir: workspace, contents: `
      import { createRuntime, defineResourceSet } from '@viewstem/core';
      import { createRenderer } from '@viewstem/dom';
      import { svelteConnector, svelteComponent } from '@viewstem/svelte';
      import { ui } from '@viewstem/ui';
      import Layout from './packages/svelte/test/fixtures/Layout.svelte';
      import Probe from './packages/svelte/test/fixtures/Probe.svelte';
      const runtime = createRuntime();
      runtime.registry.registerResourceSet(defineResourceSet({ id: 'mix', version: '1', dependencies: [ui], components: [
        svelteComponent({ kind: 'Component', id: 'Layout', spec: { slots: { default: {} } } }, Layout),
        svelteComponent({ kind: 'Component', id: 'Chart', spec: { ports: { value: { kind: 'Value', schema: true, required: true } } } }, Probe),
      ] }));
      const renderer = createRenderer({ runtime, connectors: [svelteConnector] });
      const path = value => ({ '@path': value });
      const str = { type: 'string' };
      window.run = async () => {
        const target = document.querySelector('main');
        const mounted = renderer.mount({ target, source: {
          states: { title: { kind: 'State', schema: str, initial: 'Before' }, href: { kind: 'State', schema: true, initial: null } },
          render: { id: 'card', componentRef: 'shadcn.Card.Root', slots: { default: [
            { id: 'layout', componentRef: 'Layout', slots: { default: [
              { id: 'button', componentRef: 'shadcn.Button', inputs: { text: path('/states/title'), href: path('/states/href') }, on: { click: {
                action: { ports: { title: { kind: 'State', schema: str, required: true } }, steps: [
                  { kind: 'SetState', target: path('/ports/title'), value: 'After' },
                ] }, inputs: { title: path('/states/title') },
              } } },
              { id: 'chart', componentRef: 'Chart', inputs: { value: path('/states/title') } },
            ] } },
          ] } },
        } });
        const view = await mounted.ready;
        await mounted.whenRendered();
        const card = target.querySelector('[data-vs-part=card]');
        const action = () => card.querySelector('[data-layout] [data-vs-component=Button]');
        const first = action().localName;
        action().click();
        await new Promise(resolve => setTimeout(resolve, 0));
        await mounted.whenRendered();
        const values = [ action().textContent, card.querySelector('[data-value]').textContent ];
        view.getState('href').write('/download');
        await mounted.whenRendered();
        const second = action().localName;
        view.getState('href').write(null);
        await mounted.whenRendered();
        const third = action().localName;
        await mounted.unmount();
        return { values, tags: [first, second, third], empty: target.childNodes.length === 0 };
      };
    ` },
    outfile: 'bundle.js', bundle: true, write: false, platform: 'browser', format: 'iife', conditions: ['browser', 'svelte'],
    plugins: [{ name: 'svelte', setup(builder) {
      builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
        contents: compile(await readFile(path, 'utf8'), { filename: path, generate: 'client' }).js.code, loader: 'js',
      }));
    } }],
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<main data-viewstem-ui></main>');
  await page.addStyleTag({ content: outputFiles.find(file => file.path.endsWith('.css')).text });
  await page.addScriptTag({ content: outputFiles.find(file => file.path.endsWith('.js')).text });
  assert.deepEqual(await page.evaluate(() => window.run()), { values: ['After', 'After'], tags: ['button', 'a', 'button'], empty: true });
});
