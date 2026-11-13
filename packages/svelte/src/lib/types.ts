import type { Component, Snippet } from 'svelte';
import type { ComponentContract, NodeSnapshot, PublicError, Runtime, RuntimeOptions, View, ViewOptions, ViewSource } from '@viewstem/core';
import type { Renderer as CoreRenderer, RendererDiagnostic, MountedView, RenderAttachment } from '@viewstem/core/renderer';
export interface ComponentAdapterProps { readonly inputs: NodeSnapshot['inputs']; readonly node: NodeSnapshot; readonly emit: (event: string, payload: unknown) => Promise<unknown>; readonly renderSlot: Snippet<[name: string]>; }
export type ComponentAdapter = Component<ComponentAdapterProps>;
export interface ComponentRegistration { readonly contract: ComponentContract; readonly component: ComponentAdapter; }
export type { RendererDiagnostic, MountedView, RenderAttachment };
export type RendererErrorListener = (diagnostic: RendererDiagnostic) => void;
export type RenderFallback = Snippet<[node: NodeSnapshot, error: PublicError | null]>;
export interface ViewstemViewProps { readonly renderer: Renderer; readonly view: View; readonly onError?: RendererErrorListener; readonly fallback?: RenderFallback; }
export type ViewstemSourceProps = Omit<ViewstemViewProps, 'view'> & Pick<ViewOptions, 'inputs'> & {
  readonly source: ViewSource;
  readonly view?: never;
  readonly pending?: Snippet;
  readonly prepareError?: Snippet<[error: PublicError]>;
};
export type ViewstemViewComponentProps = ViewstemSourceProps | (ViewstemViewProps & {
  readonly source?: never;
  readonly inputs?: never;
  readonly pending?: never;
  readonly prepareError?: never;
});
export interface RenderOptions { readonly context?: Map<unknown, unknown>; readonly onError?: RendererErrorListener; readonly fallback?: RenderFallback; }
export interface Renderer extends CoreRenderer<RenderOptions> { bindComponent(id: string, component: ComponentAdapter): void; }
export type RendererOptions = { readonly onError?: RendererErrorListener } & ((RuntimeOptions & { readonly components?: readonly ComponentRegistration[]; readonly runtime?: never }) | ({ readonly runtime: Runtime; readonly components?: never } & { readonly [K in keyof RuntimeOptions]?: never }));
