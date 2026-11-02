import { createRegistry, createRuntime, createStateStore } from '@viewstem/core';
import { createRenderer, ViewstemView, transformError } from '@viewstem/svelte';
import { mount, unmount, tick } from 'svelte';
import Probe from './fixtures/Probe.svelte';
import Layout from './fixtures/Layout.svelte';
import Host from './fixtures/Host.svelte';
import Crash from './fixtures/Crash.svelte';
import Reentrant from './fixtures/Reentrant.svelte';
import { observations } from './fixtures/observations.mjs';

export { createRegistry, createRuntime, createStateStore, createRenderer, ViewstemView, transformError, Probe, Layout, Host, Crash, Reentrant, mount, unmount, tick, observations };
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
