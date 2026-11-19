import type { ComponentBinding, NodeSnapshot, PublicError, View } from '@viewstem/core';
import { createDiagnostic, createRenderError, subscribeRenderProjection, type RenderEmission, type RenderProjection } from '@viewstem/core/renderer';
import type { ComponentConnector, MountedComponent } from './connector.js';
import type { BrowserDisplayOptions, MountedDisplayFallback } from './renderer.js';

type OnError = (cause: unknown, nodeId?: string) => void;
type Host = { readonly isOpen: () => boolean; readonly emit: RenderEmission; readonly reportDisposal: OnError };
type Branch = { parent: HTMLElement; before: Node | null; nodes: Map<string, MountedNode>; isOpen: () => boolean };
type Slot = { branch: Branch };
type Fallback = { start: Comment; handle: MountedDisplayFallback | undefined; status: NodeSnapshot['status']; errorKey: string };
type MountedNode = {
  key: string;
  snapshot: NodeSnapshot;
  start: Comment;
  end: Comment;
  lifetime: AbortController;
  handle: MountedComponent | undefined;
  binding: ComponentBinding | undefined;
  branch: Branch;
  children: Branch;
  slots: Map<string, Slot>;
  retiredSlots: Set<Branch>;
  acceptingSlots: boolean;
  pending: boolean;
  hasRenderedReady: boolean;
  fallback: Fallback | undefined;
};
type Work = {
  projection: RenderProjection;
  controller: AbortController;
  failures: { cause: unknown; nodeId?: string }[];
  done: Promise<void>;
};

const cancelled = () => Object.freeze({ code: 'CANCELLED', message: 'CANCELLED' });
const branch = (parent: HTMLElement, before: Node | null, isOpen: () => boolean): Branch =>
  ({ parent, before, nodes: new Map(), isOpen });

function untilAborted(value: void | Promise<void>, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => reject(cancelled());
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(value).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function clearRange(start: Comment, end: Comment) {
  let cursor = start.nextSibling;
  while (cursor && cursor !== end) {
    const next = cursor.nextSibling;
    cursor.parentNode?.removeChild(cursor);
    cursor = next;
  }
}

function moveRange(parent: HTMLElement, start: Comment, end: Comment, before: Node | null) {
  if (end.nextSibling === before) return;
  const active = parent.ownerDocument.activeElement;
  let wasFocused = false;
  const movable = parent as HTMLElement & { moveBefore?(node: Node, before: Node | null): void };
  const move = parent.isConnected && typeof movable.moveBefore === 'function' ? movable.moveBefore.bind(parent) : undefined;
  const field = !move && (active?.localName === 'input' || active?.localName === 'textarea') ? active as HTMLInputElement | HTMLTextAreaElement : undefined;
  const selection = field && { start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection };
  let cursor: Node | null = start;
  while (cursor) {
    const next: Node | null = cursor.nextSibling;
    if (move) move(cursor, before);
    else {
      wasFocused ||= active !== null && cursor.contains(active);
      parent.insertBefore(cursor, before);
    }
    if (cursor === end) break;
    cursor = next;
  }
  const elementType = parent.ownerDocument.defaultView?.HTMLElement;
  if (wasFocused && elementType && active instanceof elementType && active.isConnected
    && parent.ownerDocument.activeElement === parent.ownerDocument.body) {
    active.focus({ preventScroll: true });
    if (selection && selection.start !== null && selection.end !== null) field?.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined);
  }
}

class BrowserConnection {
  readonly #root: Branch;
  readonly #stop: () => void;
  #work: Work | undefined;
  #closed = false;
  #cleanup: Promise<void> | undefined;

  constructor(view: View, target: HTMLElement, readonly connectors: ReadonlyMap<string, ComponentConnector>,
    readonly options: BrowserDisplayOptions, readonly host: Host, readonly onError: OnError) {
    this.#root = branch(target, null, () => !this.#closed && this.host.isOpen());
    this.#stop = subscribeRenderProjection(view, projection => this.#schedule(projection));
  }

  #schedule(projection: RenderProjection) {
    if (!this.#root.isOpen()) return;
    const previous = this.#work;
    const controller = new AbortController();
    const failures: Work['failures'] = [];
    const work: Work = { projection, controller, failures, done: Promise.resolve().then(async () => {
      await previous?.done;
      if (!this.#current(work)) return;
      try { await this.#reconcile(this.#root, projection.snapshot.roots, work); }
      catch (cause) { this.#fail(work, cause); }
      for (const { cause, nodeId } of failures) {
        if (!this.#current(work)) break;
        this.onError(cause, nodeId);
      }
    }) };
    this.#work = work;
    previous?.controller.abort();
  }

  #current(work: Work) {
    return this.#root.isOpen() && this.#work === work && !work.controller.signal.aborted;
  }

  #canRender(node: MountedNode, work: Work) {
    return this.#current(work) && node.branch.isOpen();
  }

  #fail(work: Work, cause: unknown, nodeId?: string) {
    if (!this.#current(work)) return;
    work.failures.push({ cause: createDiagnostic('render', cause).error, ...(nodeId === undefined ? {} : { nodeId }) });
  }

  async whenRendered(generation: number, sequence: number) {
    while (this.#root.isOpen()) {
      const work = this.#work;
      if (!work || work.projection.generation !== generation || work.projection.sequence < sequence) break;
      await work.done;
      if (!this.#current(work)) continue;
      if (work.failures.length) throw work.failures[0]!.cause;
      return;
    }
    throw cancelled();
  }

  dispose() {
    if (this.#cleanup) return this.#cleanup;
    this.#closed = true;
    this.#stop();
    this.#work?.controller.abort();
    this.#cleanup = Promise.resolve(this.#work?.done).then(() => this.#clear(this.#root));
    return this.#cleanup;
  }

  #createNode(key: string, item: NodeSnapshot, owner: Branch, binding: ComponentBinding | undefined,
    range?: Pick<MountedNode, 'start' | 'end'>): MountedNode {
    const { parent } = owner;
    const start = range?.start ?? parent.ownerDocument.createComment('viewstem');
    const end = range?.end ?? parent.ownerDocument.createComment('/viewstem');
    if (!range) {
      parent.insertBefore(start, owner.before);
      parent.insertBefore(end, owner.before);
    }
    const lifetime = new AbortController();
    return { key, snapshot: item, start, end, lifetime, binding, handle: undefined, branch: owner, fallback: undefined,
      children: branch(parent, end, () => owner.isOpen() && !lifetime.signal.aborted), slots: new Map(),
      acceptingSlots: false, retiredSlots: new Set(), pending: false, hasRenderedReady: false };
  }

  async #reconcile(owner: Branch, snapshots: readonly NodeSnapshot[], work: Work) {
    const byAddress = new Map(snapshots.flatMap((node, index) => node.address !== undefined || this.options.fallback
      ? [[node.address ?? `placeholder:${node.id}:${index}`, node] as const] : []));
    for (const [key, node] of owner.nodes) {
      const next = byAddress.get(key);
      const binding = next?.componentRef ? work.projection.componentBinding(next.componentRef) : undefined;
      if (next && next.generation === node.snapshot.generation && binding === node.binding) continue;
      owner.nodes.delete(key);
      await this.#remove(node, this.host.reportDisposal);
    }
    if (!this.#current(work) || !owner.isOpen()) return;
    let before = owner.before;
    const mounted: MountedNode[] = [];
    for (const [key, snapshot] of [...byAddress].reverse()) {
      let node = owner.nodes.get(key);
      if (!node) {
        node = this.#createNode(key, snapshot, owner, snapshot.componentRef ? work.projection.componentBinding(snapshot.componentRef) : undefined);
        owner.nodes.set(key, node);
      }
      node.snapshot = snapshot;
      moveRange(owner.parent, node.start, node.end, before);
      before = node.start;
      mounted.push(node);
    }
    await Promise.all(mounted.reverse().map(node => this.#renderNode(node, work)));
  }

  #provideSlot(node: MountedNode, name: string, host: HTMLElement, before?: Node | null) {
    if (node.lifetime.signal.aborted || !node.branch.isOpen()) return () => {};
    const type = host?.ownerDocument?.defaultView?.HTMLElement;
    if (!Object.hasOwn(node.binding?.contract.spec.slots ?? {}, name) || !type || !(host instanceof type) || host.ownerDocument !== node.start.ownerDocument
      || (before && before.parentNode !== host)) {
      throw new TypeError(`Invalid Viewstem slot: ${name}`);
    }
    const invalidate = () => this.#invalidate(node);
    const previous = node.slots.get(name);
    const anchor = host === node.branch.parent ? node.end : before ?? null;
    const sameHost = previous?.branch.parent === host;
    const content: Branch = sameHost ? previous.branch
      : branch(host, anchor, () => node.slots.get(name)?.branch === content && node.children.isOpen());
    const changed = !sameHost || content.before !== anchor;
    content.before = anchor;
    if (previous && !sameHost) node.retiredSlots.add(previous.branch);
    const slot: Slot = { branch: content };
    node.slots.set(name, slot);
    if (changed) invalidate();
    return () => {
      if (node.slots.get(name) !== slot) return;
      node.slots.delete(name);
      node.retiredSlots.add(slot.branch);
      invalidate();
    };
  }

  #invalidate(node: MountedNode) {
    if (!node.acceptingSlots && !node.lifetime.signal.aborted && node.branch.isOpen() && this.#work) this.#schedule(this.#work.projection);
  }

  async #clearRetiredSlots(node: MountedNode) {
    for (const old of node.retiredSlots) {
      node.retiredSlots.delete(old);
      await this.#clear(old, this.host.reportDisposal);
    }
  }

  async #fallback(node: MountedNode, error: PublicError | null, work: Work) {
    const render = this.options.fallback;
    if (!render) return;
    const parent = node.branch.parent;
    const context = { parent, anchor: node.end, node: node.snapshot, error };
    const { status } = node.snapshot;
    const errorKey = JSON.stringify(error);
    const previous = node.fallback;
    if (previous?.handle && !previous.handle.update && (previous.status !== status || previous.errorKey !== errorKey)) {
      await this.#removeFallback(node, previous);
      if (!this.#canRender(node, work)) return;
    }
    if (!node.fallback) {
      const start = parent.ownerDocument.createComment('viewstem fallback');
      parent.insertBefore(start, node.end);
      node.fallback = { start, handle: undefined, status, errorKey };
    }
    const fallback = node.fallback;
    fallback.status = status;
    fallback.errorKey = errorKey;
    if (fallback.handle?.update) fallback.handle.update(context);
    else if (!fallback.handle) {
      clearRange(fallback.start, node.end);
      // Removing fallback DOM can close the display from a custom element callback.
      if (!this.#canRender(node, work)) return;
      fallback.handle = render(context) ?? undefined;
    }
    if (!this.#canRender(node, work)) return;
    const signal = work.controller.signal;
    if (fallback.handle?.whenRendered) await untilAborted(fallback.handle.whenRendered(), signal);
  }

  async #removeFallback(node: MountedNode, fallback: Fallback) {
    node.fallback = undefined;
    try { await fallback.handle?.dispose(); }
    catch (cause) { this.host.reportDisposal(cause, node.snapshot.id); }
    finally {
      clearRange(fallback.start, node.end);
      fallback.start.remove();
    }
  }

  async #replaceWithFallback(node: MountedNode, error: PublicError | null, work: Work) {
    const { branch: owner, snapshot, key } = node;
    if (!this.options.fallback) {
      owner.nodes.delete(key);
      await this.#remove(node, this.host.reportDisposal);
      return;
    }
    // Retain this range while other failed siblings clean up their contents.
    const replacement = this.#createNode(key, snapshot, owner, node.binding, node);
    owner.nodes.set(key, replacement);
    await this.#disposeContents(node, this.host.reportDisposal);
    if (!this.#canRender(replacement, work)) return;
    try { await this.#fallback(replacement, error, work); }
    catch (cause) { this.#fail(work, cause, snapshot.id); }
  }

  async #renderNode(node: MountedNode, work: Work) {
    if (!this.#canRender(node, work)) return;
    const { snapshot, binding } = node;
    const signal = work.controller.signal;
    const connector = binding && this.connectors.get(binding.connectorId);
    const waiting = snapshot.status === 'pending';
    try {
      if (waiting && node.handle && node.hasRenderedReady) {
        node.acceptingSlots = true;
        try {
          if (!node.pending) node.handle.setPending(true);
          node.pending = true;
          if (!this.#canRender(node, work)) return;
          if (node.handle.whenRendered) await untilAborted(node.handle.whenRendered(signal), signal);
        } finally { node.acceptingSlots = false; }
        if (this.#canRender(node, work)) await this.#clearRetiredSlots(node);
        return;
      }
      if (snapshot.status === 'error' && !connector?.renderUnready) {
        if (node.handle || node.children.nodes.size) await this.#replaceWithFallback(node, snapshot.error, work);
        else await this.#fallback(node, snapshot.error, work);
        return;
      }
      if (snapshot.status !== 'ready' && !connector?.renderUnready) {
        if (node.handle && !node.pending) node.handle.setPending(true);
        if (!node.handle) await this.#fallback(node, null, work);
        node.pending = true;
        return;
      }
      if (node.fallback) {
        await this.#removeFallback(node, node.fallback);
        if (!this.#canRender(node, work)) return;
      }
      const id = snapshot.componentRef;
      if (!id || !work.projection.isCodeComponent(id)) {
        await this.#reconcile(node.children, snapshot.children, work);
        return;
      }
      node.acceptingSlots = true;
      try {
        if (!node.handle) {
          if (!connector || !binding || !connector.accepts(binding.implementation)) {
            throw createRenderError(true, {
              componentId: id,
              connectorId: connector ? undefined : binding?.connectorId,
              instanceId: snapshot.instanceId,
            });
          }
          if (!this.#canRender(node, work)) return;
          const current = () => node.handle !== undefined && node.children.isOpen()
            && this.#work?.projection.componentBinding(id) === binding;
          node.handle = connector.mount(binding.implementation, {
            node: snapshot, parent: node.branch.parent, anchor: node.end, signal: node.lifetime.signal,
            hostContext: this.options.hostContext, invalidate: () => this.#invalidate(node),
            emit: (event, payload) => this.host.emit(node.snapshot, event, payload, current),
            provideSlot: (name, element, before) => this.#provideSlot(node, name, element, before),
          });
        } else node.handle.update(snapshot, signal);
        if (!this.#canRender(node, work)) return;
        if (node.pending !== waiting) {
          node.handle.setPending(waiting);
          node.pending = waiting;
          if (!this.#canRender(node, work)) return;
        }
        node.hasRenderedReady ||= snapshot.status === 'ready';
        if (node.handle.whenRendered) await untilAborted(node.handle.whenRendered(signal), signal);
      } finally { node.acceptingSlots = false; }
      if (!this.#canRender(node, work)) return;
      await this.#clearRetiredSlots(node);
      if (!this.#canRender(node, work)) return;
      await Promise.all([...node.slots].map(([name, slot]) => this.#reconcile(slot.branch, snapshot.slots[name] ?? [], work)));
      if (this.#canRender(node, work)) node.handle.afterChildren?.(snapshot);
    } catch (cause) {
      if (!this.#canRender(node, work)) return;
      const error = createDiagnostic('render', cause).error;
      this.#fail(work, error, snapshot.id);
      await this.#replaceWithFallback(node, error, work);
    }
  }

  async #disposeContents(node: MountedNode, reportDisposal?: OnError) {
    node.lifetime.abort();
    const cleanup = [node.children, ...[...node.slots.values()].map(slot => slot.branch), ...node.retiredSlots];
    const results = await Promise.allSettled(cleanup.map(child => this.#clear(child, reportDisposal)));
    try { await (node.handle ? node.handle.dispose() : node.fallback?.handle?.dispose()); }
    catch (cause) {
      if (!reportDisposal) throw cause;
      reportDisposal(cause, node.snapshot.id);
    }
    finally { clearRange(node.start, node.end); }
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }

  async #remove(node: MountedNode, reportDisposal?: OnError) {
    try { await this.#disposeContents(node, reportDisposal); }
    finally {
      node.start.remove();
      node.end.remove();
    }
  }

  async #clear(owner: Branch, reportDisposal?: OnError) {
    const nodes = [...owner.nodes.values()];
    owner.nodes.clear();
    const results = await Promise.allSettled(nodes.map(node => this.#remove(node, reportDisposal)));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
}

export function connectBrowser(view: View, target: HTMLElement, connectors: ReadonlyMap<string, ComponentConnector>,
  options: BrowserDisplayOptions, host: Host, onError: OnError) {
  return new BrowserConnection(view, target, connectors, options, host, onError);
}
