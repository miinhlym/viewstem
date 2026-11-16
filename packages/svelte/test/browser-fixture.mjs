import { createRegistry, createRuntime as publicRuntime, createStateStore } from '@viewstem/core';
import { createRenderer as publicRenderer, ViewstemView, transformError } from '@viewstem/svelte';
import { flushSync, mount, unmount, tick } from 'svelte';
import Probe from './fixtures/Probe.svelte';
import Layout from './fixtures/Layout.svelte';
import Host from './fixtures/Host.svelte';
import SourceHost from './fixtures/SourceHost.svelte';
import Crash from './fixtures/Crash.svelte';
import Reentrant from './fixtures/Reentrant.svelte';
import { observations } from './fixtures/observations.mjs';

// Test-only bridge for historical scenario inputs; the shipped API remains unchanged.
const rawRuntimes = new WeakMap();
const originals = new WeakMap();
function adaptView(view) {
  const adapted = { ...view,
    async update(spec, options) { return { initialComplete: view.whenSettled(await view.updateDefinition(spec, options)) }; },
    async replace({ view: spec, viewRef, ...options }) { return { initialComplete: view.whenSettled(await view.replace(spec ?? { ref: viewRef }, options)) }; },
  };
  originals.set(adapted, view); return adapted;
}
export const rawView = view => originals.get(view) ?? view;

function createRuntime(options) {
  const raw = publicRuntime(options);
  const runtime = { ...raw,
    async createView({ view, viewRef, ...opts }) { const v = adaptView(await raw.createView(view ?? { ref: viewRef }, opts)); return { view: v, initialComplete: v.whenSettled(v.initial) }; },
    invokeAction({ owner, ...request }) { return owner.invokeAction(request); },
    listResources: kind => raw.registry.list(kind), exportResource: (kind, id) => raw.registry.exportResource(kind, id),
  };
  rawRuntimes.set(runtime, raw); return runtime;
}
function createRenderer(options = {}) {
  const rawRuntime = options.runtime && (rawRuntimes.get(options.runtime) ?? options.runtime);
  const renderer = publicRenderer({ ...options, ...(rawRuntime && { runtime: rawRuntime }) });
  const runtime = options.runtime ?? (() => { const raw = renderer.runtime; const wrapped = { ...raw, async createView({ view, viewRef, ...opts }) { const v = adaptView(await raw.createView(view ?? { ref: viewRef }, opts)); return { view: v, initialComplete: v.whenSettled(v.initial) }; }, exportResource: (kind, id) => raw.registry.exportResource(kind, id), listResources: kind => raw.registry.list(kind), invokeAction: ({ owner, ...request }) => owner.invokeAction(request) }; rawRuntimes.set(wrapped, raw); return wrapped; })();
  renderer.runtime = runtime;
  renderer.registry = runtime.registry;
  renderer.registerComponent = renderer.bindComponent;
  renderer.registerComponents = entries => { runtime.registry.registerComponentContracts(entries.map(e => e.contract)); for (const e of entries) renderer.bindComponent(e.contract.id, e.component); };
  const attach = renderer.attach.bind(renderer), mount = renderer.mount.bind(renderer);
  renderer.attach = (view, target, opts) => { const a = attach(rawView(view), target, opts); return { view, whenRendered: a.whenRendered, dispose: a.detach }; };
  renderer.mount = async ({ view, viewRef, target, ...opts }) => {
    const screen = mount({ target, source: view ?? { ref: viewRef }, ...opts });
    const v = adaptView(await screen.ready);
    return { view: v, initialComplete: screen.whenSettled(rawView(v).initial), update: async (spec, options) => ({ initialComplete: screen.whenSettled(await rawView(v).updateDefinition(spec, options)) }), replace: async ({ view, viewRef, ...options }) => ({ initialComplete: screen.whenSettled(await rawView(v).replace(view ?? { ref: viewRef }, options)) }), whenRendered: screen.whenRendered, dispose: screen.unmount };
  };
  return renderer;
}
export { publicRenderer, publicRuntime, createRegistry, createRuntime, createStateStore, createRenderer, ViewstemView, transformError, Probe, Layout, Host, SourceHost, Crash, Reentrant, flushSync, mount, unmount, tick, observations };
export const p = value => ({ '@path': value });
export const resource = (kind, id, spec) => ({ kind, id, spec });
export const port = (schema = true, required = true) => ({ kind: 'Value', schema, required });
export const state = (initial, schema = true) => ({ kind: 'State', schema, ...(initial === undefined ? {} : { initial }) });
export const probe = (id, value, extra = {}) => ({ id, componentRef: 'Probe', inputs: { value }, ...extra });
export const layout = children => ({ id: 'root', componentRef: 'Layout', slots: { default: children } });
export const flatten = snapshot => snapshot.roots.flatMap(function visit(node) { return [node, ...node.children.flatMap(visit)]; });
export function target(id = 'target') {
  const element = document.createElement('div'); element.id = id; document.body.append(element); return element;
}
export function environment({ adapters = true, requestExecutor, store } = {}) {
  const registry = createRegistry();
  registry.registerComponentContract(resource('Component', 'Probe', {
    ports: { value: port(), label: port(true, false), payload: port(true, false), cell: { kind: 'State', schema: { type: 'number' } }, query: { kind: 'Query' } },
    events: { change: { schema: true } },
  }));
  registry.registerComponentContract(resource('Component', 'Layout', { slots: { default: {}, header: {}, body: {}, footer: {} } }));
  const runtime = createRuntime({ registry, ...(requestExecutor ? { requestExecutor } : {}), ...(store ? { stateStore: store } : {}) });
  const diagnostics = [];
  const renderer = createRenderer({ runtime, onError: diagnostic => diagnostics.push(diagnostic) });
  if (adapters) { renderer.registerComponent('Probe', Probe); renderer.registerComponent('Layout', Layout); }
  return { registry, runtime, renderer, diagnostics, target: target() };
}
export function controlled() {
  const requests = [];
  const e = environment({ requestExecutor: (plan, { signal }) => new Promise((resolve, reject) => requests.push({ plan, signal, resolve, reject })) });
  e.requests = requests;
  e.registry.registerResources(['one', 'two'].map(id => resource('Query', id, {
    sources: { response: { datasource: { kind: 'Http', baseUrl: 'https://example.test' }, request: { method: 'GET', path: `/${id}` } } },
    transform: { input: p('/sources/response') },
  })));
  e.reply = (index, body) => requests[index].resolve({ status: 200, headers: {}, body });
  return e;
}
export async function errorOf(run) {
  try { await run(); return null; } catch (error) { return { code: error.code, message: error.message }; }
}
export async function settle(handle) { await handle.whenRendered(); await tick(); }
