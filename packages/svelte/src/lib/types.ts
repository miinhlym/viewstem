import type { Component, Snippet } from 'svelte';
import type { ApplicationResult, ComponentContract, InitialReport, NodeSnapshot, PublicError, Registry, Runtime, RuntimeOptions, View, ViewSpec, ViewTarget } from '@viewstem/core';

/** Explicit bridge props. No inputs are spread onto DOM or Svelte component props. */
export interface ComponentAdapterProps {
  readonly inputs: NodeSnapshot['inputs'];
  readonly node: NodeSnapshot;
  readonly emit: (event: string, payload: unknown) => Promise<unknown>;
  readonly renderSlot: Snippet<[name: string]>;
}
export type ComponentAdapter = Component<ComponentAdapterProps>;
export interface ComponentRegistration {
  readonly contract: ComponentContract;
  readonly component: ComponentAdapter;
}
export interface RendererDiagnostic {
  readonly phase: 'render' | 'event';
  readonly error: PublicError;
  readonly node?: NodeSnapshot;
}
export type RendererErrorListener = (diagnostic: RendererDiagnostic) => void;
export type RenderFallback = Snippet<[node: NodeSnapshot, error: PublicError | null]>;
export interface ViewstemViewProps {
  readonly renderer: Renderer;
  /** Borrowed View: unmounting this Svelte component only detaches its renderer. */
  readonly view: View;
  readonly onError?: RendererErrorListener;
  readonly fallback?: RenderFallback;
}
export interface RenderAttachment {
  readonly view: View;
  /** Wait for the current projection's DOM commit; excludes Query completion, paint and host async work. */
  whenRendered(): Promise<void>;
  /** Detach DOM/subscriptions; an attached external View remains alive. */
  dispose(): Promise<void>;
}
export interface MountedView extends RenderAttachment {
  /** First executable Query results and their DOM commit; Query errors remain in the report. */
  readonly initialComplete: Promise<InitialReport>;
  /** Apply the core update; the returned initialComplete also includes its DOM commit. */
  update(spec: ViewSpec, options?: Parameters<View['update']>[1]): Promise<ApplicationResult>;
  /** Replace the core lifetime; the returned initialComplete also includes its DOM commit. */
  replace(target: ViewTarget): Promise<ApplicationResult>;
  /** Dispose the View created by mount as well as its DOM. */
  dispose(): Promise<void>;
}
export interface RenderOptions {
  readonly context?: Map<unknown, unknown>;
  readonly onError?: RendererErrorListener;
  readonly fallback?: RenderFallback;
}
export interface Renderer {
  readonly runtime: Runtime;
  /** The same Registry used by runtime; no resources are registered implicitly. */
  readonly registry: Registry;
  /** Bind an implementation to an already explicitly registered code Component. */
  registerComponent(id: string, component: ComponentAdapter): void;
  /** Register new Component contracts and their implementations as one batch. */
  registerComponents(entries: readonly ComponentRegistration[]): void;
  mount(target: ViewTarget & RenderOptions & { readonly target: Element }): Promise<MountedView>;
  attach(view: View, target: Element, options?: RenderOptions): RenderAttachment;
  /** Detach all renderings, dispose mounted Views and an internally created Runtime. */
  dispose(): Promise<void>;
}
export type RendererOptions = {
  readonly onError?: RendererErrorListener;
} & (
  | (Omit<RuntimeOptions, 'registry'> & { readonly registry?: Registry; readonly runtime?: never })
  | ({ readonly runtime: Runtime } & { readonly [K in keyof RuntimeOptions]?: never })
);
