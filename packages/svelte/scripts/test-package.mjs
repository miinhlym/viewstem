import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'viewstem-svelte-consumer-'));
const execute = (command, args, cwd = directory) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let server, browser;
try {
  const pack = name => JSON.parse(execute('npm', ['pack', join(root, 'packages', name), '--pack-destination', directory, '--ignore-scripts', '--json'], root))[0];
  const core = pack('core'), svelte = pack('svelte');
  const paths = svelte.files.map(file => file.path);
  for (const path of ['LICENSE', 'README.md', 'README.ko.md', 'dist/index.js', 'dist/index.d.ts', 'dist/ViewstemView.svelte', 'dist/ViewstemView.svelte.d.ts', 'dist/renderer.js', 'dist/types.d.ts']) assert.ok(paths.includes(path), path);
  assert.ok(paths.every(path => ['LICENSE', 'README.md', 'README.ko.md', 'package.json'].includes(path) || path.startsWith('dist/')));
  assert.ok(paths.every(path => !/(?:^|\/)(?:test|example|node_modules)\//.test(path)));
  // The override resolves unpublished core locally. It is not a consumer dependency.
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', overrides: { '@viewstem/core': `file:${join(directory, core.filename)}` } }));
  execute('npm', ['install', join(directory, svelte.filename), 'svelte@5.57.3', '--ignore-scripts', '--no-audit', '--no-fund']);
  const consumerManifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(consumerManifest.dependencies).sort(), ['@viewstem/svelte', 'svelte']);
  const installedManifest = JSON.parse(await readFile(join(directory, 'node_modules/@viewstem/svelte/package.json'), 'utf8'));
  assert.equal(installedManifest.license, 'MIT');
  assert.equal(await readFile(join(directory, 'node_modules/@viewstem/svelte/LICENSE'), 'utf8'), await readFile(join(root, 'LICENSE'), 'utf8'));
  assert.equal(installedManifest.dependencies['@viewstem/core'], '0.1.0');
  await writeFile(join(directory, 'consumer.ts'), `import { createRenderer, ViewstemView, type ComponentAdapter, type MountedView, type ComponentAdapterProps, type ComponentContract, type ViewSpec, type Runtime, type RequestExecutor } from '@viewstem/svelte';
import type { Component, Snippet } from 'svelte';
const renderer = createRenderer();
const runtime: Runtime = renderer.runtime;
const contract: ComponentContract = {kind:'Component',id:'Explicit',spec:{}};
renderer.registry.registerComponentContract(contract);
const spec: ViewSpec = {render:{id:'root',componentRef:'Explicit'}};
const requestExecutor: RequestExecutor = async () => ({status:200,headers:{},body:null});
createRenderer({requestExecutor});
createRenderer({runtime});
declare const adapter: ComponentAdapter;
renderer.registerComponent('Explicit', adapter);
declare const props: ComponentAdapterProps;
const slot: Snippet<[string]> = props.renderSlot;
const result: Promise<unknown> = props.emit('click', {});
declare const handle: MountedView;
const report = await handle.initialComplete;
const generation: number = report.generation;
await handle.whenRendered();
const host: Component<{renderer: typeof renderer; view: typeof handle.view}, {whenRendered(): Promise<void>}> = ViewstemView;
// @ts-expect-error adapter registration is a Component, not arbitrary markup
renderer.registerComponent('Bad', '<button>');
// @ts-expect-error the mounting target must be an Element
renderer.mount({ target: 'body', view: { render: { id: 'x', componentRef: 'Explicit' } } });
// @ts-expect-error inputs are read-only core snapshots
props.inputs.changed = true;
// @ts-expect-error renderer Registry does not expose the implementation engine
renderer.registry.fork();
// @ts-expect-error renderer Runtime does not expose the variable engine
renderer.runtime.variable('private');
// @ts-expect-error engine contracts are not forwarded through Svelte
import type { QueryEngine } from '@viewstem/svelte';
// @ts-expect-error optional CEL compiler configuration belongs to core/cel
import type { CelOptions } from '@viewstem/svelte';
// @ts-expect-error optional HTTP configuration belongs to core/http
import type { HttpExecutorOptions } from '@viewstem/svelte';
// @ts-expect-error type inference helpers are private
import type { InputsFromPorts } from '@viewstem/svelte';
// @ts-expect-error old adapter names are not exported from the installed package
import type { Adapter } from '@viewstem/svelte';
// @ts-expect-error old adapter-props names are not exported from the installed package
import type { AdapterProps } from '@viewstem/svelte';
// @ts-expect-error old mounted-view names are not exported from the installed package
import type { RenderedView } from '@viewstem/svelte';
// @ts-expect-error old error-listener names are not exported from the installed package
import type { ErrorListener } from '@viewstem/svelte';
// @ts-expect-error old fallback names are not exported from the installed package
import type { Fallback } from '@viewstem/svelte';
// @ts-expect-error completion properties have no old alias
handle.initial;
// @ts-expect-error DOM completion methods have no old alias
handle.settled();
// @ts-expect-error core View creation does not expose the old mount name
runtime.mount({view:spec});
// @ts-expect-error code Component contracts have an explicit registration name
renderer.registry.registerComponent(contract);
`);
  execute(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--strict', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--lib', 'ES2022,DOM', 'consumer.ts']);
  await writeFile(join(directory, 'Button.svelte'), `<script lang="ts">
import type { ComponentAdapterProps } from '@viewstem/svelte';
let { inputs, node, emit }: ComponentAdapterProps = $props();
</script>
<button disabled={node.status !== 'ready'} onclick={() => emit('click', {})}>{String(inputs.value)}</button>
`);
  await writeFile(join(directory, 'consumer.mjs'), `import { createRenderer } from '@viewstem/svelte';
import * as publicApi from '@viewstem/svelte';
import Button from './Button.svelte';
if (Object.keys(publicApi).sort().join(',') !== 'ViewstemView,createRenderer,transformError') throw new Error('unexpected public exports');
const renderer = createRenderer();
if ('variable' in renderer.runtime || 'fork' in renderer.registry) throw new Error('implementation exposed');
const { registry } = renderer;
registry.registerComponentContract({kind:'Component',id:'Button',spec:{ports:{value:{kind:'Value',schema:{type:'number'},required:true}},events:{click:{schema:{type:'object',additionalProperties:false}}}}});
registry.registerResources([{kind:'Action',id:'set',spec:{ports:{target:{kind:'State',schema:{type:'number'},required:true}},steps:[{kind:'SetState',target:{'@path':'/ports/target'},value:2}]}}]);
renderer.registerComponent('Button', Button);
const handle = await renderer.mount({target:document.querySelector('main'),view:{states:{count:{kind:'State',schema:{type:'number'},initial:0}},render:{id:'button',componentRef:'Button',inputs:{value:{'@path':'/states/count'}},on:{click:{actionRef:'set',inputs:{target:{'@path':'/states/count'}}}}}}});
await handle.initialComplete;
if (Object.keys(handle).sort().join(',') !== 'dispose,initialComplete,replace,update,view,whenRendered') throw new Error('unexpected mounted View surface');
if ('mount' in renderer.runtime || 'registerComponent' in registry || 'snapshot' in handle.view) throw new Error('legacy alias exposed');
await handle.whenRendered();
document.body.dataset.ready='true';
window.disposeConsumer=()=>renderer.dispose();
`);
  const bundle = await build({ absWorkingDir: directory, entryPoints: ['consumer.mjs'], bundle: true, write: false, platform: 'browser', format: 'esm', conditions: ['svelte', 'browser'], plugins: [{ name: 'isolated-svelte-consumer', setup(builder) {
    builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const result = compile(await readFile(path, 'utf8'), { filename: path, generate: 'client', css: 'injected', dev: true });
      assert.deepEqual(result.warnings, [], `compiler warnings: ${path}`);
      return { contents: result.js.code, loader: 'js' };
    });
  } }] });
  server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/consumer.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/consumer.js' ? bundle.outputFiles[0].contents : '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><main></main><script type="module" src="/consumer.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  assert.equal(await page.locator('button').textContent(), '0');
  await page.locator('button').click();
  await page.waitForFunction(() => document.querySelector('button')?.textContent === '2');
  await page.evaluate(() => window.disposeConsumer());
  assert.equal(await page.locator('main button').count(), 0);
  assert.deepEqual(errors, []);
  const report = { nodeVersion: process.version, svelteVersion: '5.57.3', files: paths, integrity: svelte.integrity, bytes: svelte.size, unpackedBytes: svelte.unpackedSize, license: 'MIT; installed text verified', consumerDependencies: Object.keys(consumerManifest.dependencies).sort(), coreResolution: 'transitive dependency; local tarball override for unpublished core', imports: '@viewstem/svelte only (runtime and shared types)', types: 'passed', browser: 'passed', errors };
  const results = resolve(root, process.env.VIEWSTEM_SVELTE_RESULTS_DIR ?? 'packages/svelte/test/results');
  await mkdir(results, { recursive: true });
  await writeFile(join(results, `package-node${process.versions.node.split('.')[0]}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
