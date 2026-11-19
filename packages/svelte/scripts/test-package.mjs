import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile, mkdir, copyFile, symlink } from 'node:fs/promises';
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
const compileSvelte = generate => ({ name: 'isolated-svelte-consumer', setup(builder) {
  builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
    const result = compile(await readFile(path, 'utf8'), { filename: path, generate, css: 'injected', dev: true });
    assert.deepEqual(result.warnings, [], `compiler warnings: ${path}`);
    return { contents: result.js.code, loader: 'js' };
  });
} });
let server, browser;
try {
  const pack = name => JSON.parse(execute('npm', ['pack', join(root, 'packages', name), '--pack-destination', directory, '--ignore-scripts', '--json'], root))[0];
  const core = pack('core'), dom = pack('dom'), svelte = pack('svelte');
  const paths = svelte.files.map(file => file.path);
  for (const path of ['LICENSE', 'README.md', 'README.ko.md', 'dist/index.js', 'dist/index.d.ts', 'dist/ViewstemView.svelte', 'dist/ViewstemView.svelte.d.ts', 'dist/renderer.js', 'dist/types.d.ts']) assert.ok(paths.includes(path), path);
  assert.ok(paths.every(path => ['LICENSE', 'README.md', 'README.ko.md', 'package.json'].includes(path) || path.startsWith('dist/')));
  assert.ok(paths.every(path => !/(?:^|\/)(?:test|example|node_modules)\//.test(path)));
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execute('npm', ['install', ...[core, dom, svelte].map(pkg => join(directory, pkg.filename)), 'svelte@5.57.3', '--ignore-scripts', '--no-audit', '--no-fund']);
  const consumerManifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(consumerManifest.dependencies).sort(), ['@viewstem/core', '@viewstem/dom', '@viewstem/svelte', 'svelte']);
  const installedManifest = JSON.parse(await readFile(join(directory, 'node_modules/@viewstem/svelte/package.json'), 'utf8'));
  assert.equal(installedManifest.license, 'MIT');
  assert.equal(await readFile(join(directory, 'node_modules/@viewstem/svelte/LICENSE'), 'utf8'), await readFile(join(root, 'LICENSE'), 'utf8'));
  assert.equal(installedManifest.dependencies['@viewstem/core'], core.version);
  assert.equal(installedManifest.dependencies['@viewstem/dom'], dom.version);
  await writeFile(join(directory, 'consumer.ts'), `import { createRenderer, svelteComponent, ViewstemView, type ComponentAdapter, type MountedView, type ComponentAdapterProps, type ComponentContract, type ViewSpec, type Runtime, type RequestExecutor } from '@viewstem/svelte';
import { defineResourceSet } from '@viewstem/core';
import type { Component, ComponentProps, Snippet } from 'svelte';
import type { ViewstemViewProps, ViewstemSourceProps } from '@viewstem/svelte';
const renderer = createRenderer();
const runtime: Runtime = renderer.runtime;
const contract: ComponentContract = {kind:'Component',id:'Explicit',spec:{}};
const spec: ViewSpec = {render:{id:'root',componentRef:'Explicit'}};
const requestExecutor: RequestExecutor = async () => ({status:200,headers:{},body:null});
createRenderer({requestExecutor});
createRenderer({runtime});
declare const adapter: ComponentAdapter;
runtime.registry.registerResourceSet(defineResourceSet({ id: 'consumer', version: '1', components: [svelteComponent(contract, adapter)] }));
declare const props: ComponentAdapterProps;
const slot: Snippet<[string]> = props.renderSlot;
const result: Promise<unknown> = props.emit('click', {});
declare const handle: MountedView;
const view = await handle.ready;
const report = await handle.whenSettled(view.initial);
const generation: number = report.generation;
await handle.whenRendered();
const host: Component<{renderer: typeof renderer; view: typeof view}, {whenRendered(): Promise<void>}> = ViewstemView;
interface ExistingWrapper extends ViewstemViewProps { title: string }
declare const wrapper: ExistingWrapper;
const borrowedView: typeof view = wrapper.view;
const borrowed: ComponentProps<typeof ViewstemView> = wrapper;
const owned: ViewstemSourceProps = { renderer, source: spec, inputs: { count: 1 } };
const sourceProps: ComponentProps<typeof ViewstemView> = owned;
const resourceSet = defineResourceSet({ id: 'standalone', version: '1' });
const standalone: ComponentProps<typeof ViewstemView> = { source: spec, resourceSets: [resourceSet] };
const standaloneOptions: ComponentProps<typeof ViewstemView> = { source: { ref: 'registered' }, inputs: { count: 1 }, onError: async () => {} };
// @ts-expect-error Component-owned sets require the standalone source form
const suppliedWithSets: ComponentProps<typeof ViewstemView> = { renderer, source: spec, resourceSets: [resourceSet] };
// @ts-expect-error A borrowed View requires a renderer and does not register sets
const borrowedWithSets: ComponentProps<typeof ViewstemView> = { view, resourceSets: [resourceSet] };
// @ts-expect-error Resource sets require a source
const setsOnly: ComponentProps<typeof ViewstemView> = { resourceSets: [resourceSet] };
// @ts-expect-error view and source are mutually exclusive
const ambiguous: ComponentProps<typeof ViewstemView> = { renderer, view, source: spec };
// @ts-expect-error view or source is required
const missing: ComponentProps<typeof ViewstemView> = { renderer };
// @ts-expect-error initial inputs belong to a new source
const borrowedWithInputs: ComponentProps<typeof ViewstemView> = { renderer, view, inputs: {} };
// @ts-expect-error adapter registration is a Component, not arbitrary markup
svelteComponent(contract, '<button>');
// @ts-expect-error the mounting target must be an Element
renderer.mount({ target: 'body', source: { render: { id: 'x', componentRef: 'Explicit' } } });
// @ts-expect-error inputs are read-only core snapshots
props.inputs.changed = true;
// @ts-expect-error renderer Registry does not expose the implementation engine
renderer.runtime.registry.fork();
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
renderer.runtime.registry.registerComponent(contract);
`);
  const tsc = join(root, 'node_modules/typescript/bin/tsc');
  const typecheckArgs = ['--strict', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--lib', 'ES2022,DOM'];
  execute(process.execPath, [tsc, ...typecheckArgs, 'consumer.ts']);

  const authorPackage = join(directory, 'contract-package');
  const authorSource = join(authorPackage, 'src');
  await mkdir(authorSource, { recursive: true });
  await Promise.all(['ContractAdapter.svelte', 'contract.ts'].map(name =>
    copyFile(join(root, 'packages/svelte/test/types', name), join(authorSource, name))));
  await writeFile(join(authorPackage, 'package.json'), JSON.stringify({
    name: 'contract-package', private: true, type: 'module',
    peerDependencies: { svelte: '^5.57.3', '@viewstem/core': core.version, '@viewstem/svelte': svelte.version },
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
  }));
  await writeFile(join(authorPackage, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', types: ['svelte'] },
    include: ['src'],
  }));
  await writeFile(join(authorSource, 'index.ts'), `import { svelteComponent } from '@viewstem/svelte';
import Adapter from './ContractAdapter.svelte';
import { countContract } from './contract.js';
export { countContract };
export const binding = svelteComponent(countContract, Adapter);
`);
  execute(process.execPath, [join(root, 'node_modules/@sveltejs/package/src/cli.js'), '-i', 'src', '-o', 'dist'], authorPackage);
  assert.match(await readFile(join(authorPackage, 'dist/index.d.ts'), 'utf8'), /export declare const binding:/);
  assert.match(await readFile(join(authorPackage, 'dist/ContractAdapter.svelte.d.ts'), 'utf8'), /ComponentAdapterProps/);
  await symlink(authorPackage, join(directory, 'node_modules/contract-package'), 'dir');
  await writeFile(join(directory, 'contract-consumer.ts'), `import { svelteComponent } from '@viewstem/svelte';
import type { ComponentProps } from 'svelte';
import { binding, countContract } from 'contract-package';
svelteComponent(countContract, binding.implementation);
declare const props: ComponentProps<typeof binding.implementation>;
// @ts-expect-error Pending numbers might be absent.
const unchecked: number = props.node.inputs.count;
if (props.node.status === 'ready') {
  const count: number = props.node.inputs.count;
  // @ts-expect-error The ready input is a number.
  const text: string = props.node.inputs.count;
}
const wrongContract = {
  ...countContract, spec: { ports: { count: { kind: 'Value', schema: { type: 'string' }, required: true } } },
} as const;
// @ts-expect-error The exported adapter still requires the number contract.
svelteComponent(wrongContract, binding.implementation);
`);
  execute(process.execPath, [tsc, ...typecheckArgs, 'contract-consumer.ts']);
  await writeFile(join(directory, 'Button.svelte'), `<script lang="ts">
import type { ComponentAdapterProps } from '@viewstem/svelte';
let { inputs, node, emit }: ComponentAdapterProps = $props();
</script>
<button disabled={node.status !== 'ready'} onclick={() => emit('click', {})}>{String(inputs.value)}</button>
`);
  await writeFile(join(directory, 'Standalone.svelte'), `<script lang="ts">
import { ViewstemView } from '@viewstem/svelte';
import type { ResourceSet, ViewSource } from '@viewstem/core';
let { source, resources }: { source: ViewSource; resources: ResourceSet } = $props();
</script>
<ViewstemView {source} resourceSets={[resources]} />
`);
  await writeFile(join(directory, 'server-consumer.mjs'), `import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import { defineResourceSet } from '@viewstem/core';
import Standalone from './Standalone.svelte';
let runtimeCreations = 0;
Object.defineProperty(globalThis, 'fetch', { configurable: true, get() { runtimeCreations++; } });
const resources = defineResourceSet({ id: 'server-fixture', version: '1' });
const source = { render: { id: 'root', componentRef: 'clientComponent' } };
const result = render(Standalone, { props: { source, resources } });
assert.doesNotMatch(result.body, /clientComponent|display: contents/);
assert.equal(runtimeCreations, 0);
`);
  await build({ absWorkingDir: directory, entryPoints: ['server-consumer.mjs'], outfile: 'server-built.mjs',
    bundle: true, platform: 'node', format: 'esm', conditions: ['svelte'],
    external: ['svelte', '@viewstem/core', '@viewstem/dom'], plugins: [compileSvelte('server')] });
  execute(process.execPath, ['server-built.mjs']);
  await writeFile(join(directory, 'consumer.mjs'), `import { createRenderer, svelteComponent } from '@viewstem/svelte';
import { defineResourceSet } from '@viewstem/core';
import * as publicApi from '@viewstem/svelte';
import { mount, unmount } from 'svelte';
import Button from './Button.svelte';
import Standalone from './Standalone.svelte';
if (Object.keys(publicApi).sort().join(',') !== 'SVELTE_CONNECTOR_ID,ViewstemView,createRenderer,svelteComponent,svelteConnector,transformError') throw new Error('unexpected public exports');
const renderer = createRenderer();
if ('variable' in renderer.runtime || 'fork' in renderer.runtime.registry) throw new Error('implementation exposed');
const { registry } = renderer.runtime;
const contract = {kind:'Component',id:'Button',spec:{ports:{value:{kind:'Value',schema:{type:'number'},required:true}},events:{click:{schema:{type:'object',additionalProperties:false}}}}};
registry.registerResources([{kind:'Action',id:'set',spec:{ports:{target:{kind:'State',schema:{type:'number'},required:true}},steps:[{kind:'SetState',target:{'@path':'/ports/target'},value:2}]}}]);
const resources = defineResourceSet({ id: 'consumer', version: '1', components: [svelteComponent(contract, Button)] });
registry.registerResourceSet(resources);
const handle = renderer.mount({target:document.querySelector('main'),source:{states:{count:{kind:'State',schema:{type:'number'},initial:0}},render:{id:'button',componentRef:'Button',inputs:{value:{'@path':'/states/count'}},on:{click:{actionRef:'set',inputs:{target:{'@path':'/states/count'}}}}}}});
const view = await handle.ready;
await handle.whenSettled(view.initial);
if (Object.keys(handle).sort().join(',') !== 'ready,unmount,whenRendered,whenSettled') throw new Error('unexpected mounted View surface');
if ('mount' in renderer.runtime || 'registerComponent' in registry || 'snapshot' in view) throw new Error('legacy alias exposed');
await handle.whenRendered();
const standalone = mount(Standalone, { target: document.querySelector('aside'), props: {
  source: { render: { id: 'independent', componentRef: 'Button', inputs: { value: 42 } } }, resources,
} });
document.body.dataset.ready='true';
window.disposeConsumer=async()=>{ await unmount(standalone); await renderer.dispose(); };
`);
  const bundle = await build({ absWorkingDir: directory, entryPoints: ['consumer.mjs'], bundle: true, write: false, platform: 'browser', format: 'esm', conditions: ['svelte', 'browser'], plugins: [compileSvelte('client')] });
  server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/consumer.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/consumer.js' ? bundle.outputFiles[0].contents : '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><main></main><aside></aside><script type="module" src="/consumer.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  assert.equal(await page.locator('main button').textContent(), '0');
  assert.equal(await page.locator('aside button').textContent(), '42');
  await page.locator('main button').click();
  await page.waitForFunction(() => document.querySelector('main button')?.textContent === '2');
  await page.evaluate(() => window.disposeConsumer());
  assert.equal(await page.locator('main button').count(), 0);
  assert.equal(await page.locator('aside button').count(), 0);
  assert.deepEqual(errors, []);
  const report = { nodeVersion: process.version, svelteVersion: '5.57.3', files: paths, integrity: svelte.integrity, bytes: svelte.size, unpackedBytes: svelte.unpackedSize, license: 'MIT; installed text verified', consumerDependencies: Object.keys(consumerManifest.dependencies).sort(), coreResolution: 'local Core and DOM tarballs', imports: '@viewstem/core and @viewstem/svelte public exports', types: 'passed', componentDeclarations: 'emitted and consumed', ssr: 'passed', browser: 'passed', errors };
  const results = resolve(root, process.env.VIEWSTEM_SVELTE_RESULTS_DIR ?? 'packages/svelte/test/results');
  await mkdir(results, { recursive: true });
  await writeFile(join(results, `package-node${process.versions.node.split('.')[0]}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
