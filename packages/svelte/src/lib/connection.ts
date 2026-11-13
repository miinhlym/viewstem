import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { createDiagnostic, createRenderError } from '@viewstem/core/renderer';
import type { Subscriber, Unsubscriber } from 'svelte/store';
import type { NodeSnapshot, PublicError, View, ViewSnapshot } from '@viewstem/core';
import type { RendererDiagnostic, RendererErrorListener, ComponentAdapter, Renderer } from './types.js';

export const failure = (code: string, message: string): PublicError => Object.freeze({ code, message });
export const cancelled = () => failure('CANCELLED', 'The renderer attachment is disposed.');
const missingAdapter = failure('REFERENCE_NOT_FOUND', 'No Svelte implementation is registered for this Component.');
const renderFailure = failure('INTERNAL_ERROR', 'The Svelte component could not be rendered.');
/** Pass as Svelte mount/hydrate transformError when hosting ViewstemView yourself. */
export function transformError(error: unknown): PublicError {
  // Identity checks never access a host-thrown Proxy, getter, message or then property.
  return error === missingAdapter ? missingAdapter : renderFailure;
}
export const nodeKey = (node: NodeSnapshot): string | NodeSnapshot => node.address === undefined ? node : JSON.stringify([node.address, node.generation]);

export interface RendererState {
  alive: boolean;
  adapters: Map<string, ComponentAdapter>;
  connections: Set<Connection>;
  ownedViews: Set<() => Promise<void>>;
  onError?: RendererErrorListener;
}
export const rendererStates = new WeakMap<Renderer, RendererState>();
export function rendererState(renderer: Renderer): RendererState {
  const state = rendererStates.get(renderer);
  if (!state?.alive) throw cancelled();
  return state;
}

/** Projection subscription only; State/Query/Action execution remains in core. */
export class Connection {
  private alive = true;
  private readonly value;
  private readonly unsubscribe;
  private adapters;
  private codeIds;
  private readonly errors = new Map<ReturnType<typeof nodeKey>, PublicError>();
  private boundaryError: PublicError | undefined;
  private readonly state;
  constructor(readonly renderer: Renderer, readonly view: View, private readonly onError: RendererErrorListener) {
    this.state = rendererState(renderer);
    this.adapters = new Map(this.state.adapters);
    this.codeIds = new Set(renderer.runtime.registry.list('Component').filter(item => renderer.runtime.registry.isCode('Component', item.id)).map(item => item.id));
    const initial = view.getSnapshot();
    let lifetime = initial.lifetime;
    this.value = writable<ViewSnapshot | null>(initial);
    this.unsubscribe = view.subscribe(snapshot => {
      if (!this.alive) return;
      this.boundaryError = undefined;
      // replace injects the current registry into a new View lifetime; update retains it.
      if (snapshot.lifetime !== lifetime) {
        lifetime = snapshot.lifetime;
        this.adapters = new Map(this.state.adapters);
        this.codeIds = new Set(renderer.runtime.registry.list('Component').filter(item => renderer.runtime.registry.isCode('Component', item.id)).map(item => item.id));
      }
      this.value.set(snapshot);
    });
    this.state.connections.add(this);
  }
  subscribe(listener: Subscriber<ViewSnapshot | null>): Unsubscriber { return this.value.subscribe(listener); }
  isOpen(): boolean { return this.alive; }
  adapter(node: NodeSnapshot): ComponentAdapter | undefined {
    if (!node.componentRef || !this.codeIds.has(node.componentRef)) return undefined;
    const adapter = this.adapters.get(node.componentRef);
    if (!adapter) throw missingAdapter;
    return adapter;
  }
  renderFailure(node: NodeSnapshot, caught: unknown): PublicError {
    // Component code is host-owned. Do not expose arbitrary exceptions or input data.
    const error = createRenderError(caught === missingAdapter, { componentId: node.componentRef, instanceId: node.instanceId });
    this.errors.set(nodeKey(node), error);
    if (this.alive) this.onError(createDiagnostic('render', error, { nodeId: node.instanceId }));
    return error;
  }
  failBoundary(): void {
    if (!this.alive) return;
    this.boundaryError = createRenderError(false);
    this.onError(createDiagnostic('render', this.boundaryError));
  }
  clearRenderFailure(node: NodeSnapshot): void { this.errors.delete(nodeKey(node)); }
  emit(node: NodeSnapshot, event: string, payload: unknown): Promise<unknown> {
    // DOM updates are batched. A retained callback must consult core's current
    // readiness, including writes made before this attachment receives its next projection.
    let current: NodeSnapshot | undefined;
    let disposed = false;
    if (this.alive && node.address !== undefined) {
      let roots: readonly NodeSnapshot[] = [];
      try { roots = this.view.getSnapshot().roots; }
      catch { disposed = true; } // A borrowed View may be disposed before its DOM is detached.
      const nodes = [...roots];
      while (nodes.length) {
        const candidate = nodes.pop()!;
        if (candidate.address === node.address && candidate.generation === node.generation) { current = candidate; break; }
        nodes.push(...candidate.children);
      }
    }
    const result = !this.alive || disposed || !current ? Promise.reject(cancelled()) : current.status !== 'ready'
      ? Promise.reject(failure('INPUT_NOT_READY', 'The Component inputs are not ready.'))
      : this.view.emit(node, event, payload);
    // Observe ignored DOM-handler promises without turning rejection into success.
    result.catch(() => {});
    return result;
  }
  async whenRendered(): Promise<void> {
    await tick();
    if (!this.alive) throw cancelled();
    const error = this.boundaryError ?? this.errors.values().next().value;
    if (error) throw error;
  }
  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    this.unsubscribe();
    this.value.set(null);
    this.errors.clear();
    this.state.connections.delete(this);
  }
}
