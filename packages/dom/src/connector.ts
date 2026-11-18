import type { NodeSnapshot } from '@viewstem/core';

export interface ComponentMountContext {
  readonly parent: HTMLElement;
  readonly anchor: Node;
  readonly node: NodeSnapshot;
  readonly signal: AbortSignal;
  readonly hostContext?: unknown;
  readonly invalidate: () => void;
  readonly emit: (event: string, payload: unknown) => Promise<unknown>;
  readonly provideSlot: (name: string, host: HTMLElement, before?: Node | null) => () => void;
}

export interface MountedComponent {
  update(node: NodeSnapshot, signal: AbortSignal): void;
  setPending(pending: boolean): void;
  /** Report completion when the connector updates its own DOM asynchronously. */
  whenRendered?(signal: AbortSignal): void | Promise<void>;
  afterChildren?(node: NodeSnapshot): void;
  dispose(): void | Promise<void>;
}

export interface ComponentConnector {
  readonly id: string;
  readonly renderUnready?: boolean;
  accepts(implementation: unknown): boolean;
  mount(implementation: unknown, context: ComponentMountContext): MountedComponent;
}
