import type { Component, Snippet } from 'svelte';
import type { ComponentContract, ComponentInputs, NodeSnapshot, PublicError, Runtime, RuntimeOptions, View, ViewOptions, ViewSource } from '@viewstem/core';
import type { ComponentConnector, ComponentMountContext } from '@viewstem/dom';
import type { Renderer as CoreRenderer, RendererDiagnostic, MountedView, RenderAttachment } from '@viewstem/core/renderer';
type AdapterNode<C extends ComponentContract> = ComponentContract extends C ? NodeSnapshot
  : Omit<NodeSnapshot, 'status' | 'inputs'> & (
    | { readonly status: 'ready'; readonly inputs: ComponentInputs<C> }
    | { readonly status: Exclude<NodeSnapshot['status'], 'ready'>; readonly inputs: Partial<ComponentInputs<C>> }
  );
interface AdapterProps<Node> {
  readonly inputs: NodeSnapshot['inputs'];
  readonly node: Node;
  readonly emit: ComponentMountContext['emit'];
  readonly renderSlot: Snippet<[name: string]>;
  readonly provideSlot: ComponentMountContext['provideSlot'];
}
export type ComponentAdapterProps<C extends ComponentContract = ComponentContract> = AdapterProps<AdapterNode<C>>;
export type ComponentAdapter<C extends ComponentContract = ComponentContract> = Component<ComponentAdapterProps<C>>;
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
export type Renderer = CoreRenderer<RenderOptions, HTMLElement>;
export type RendererOptions = { readonly onError?: RendererErrorListener; readonly connectors?: readonly ComponentConnector[] } & ((RuntimeOptions & { readonly runtime?: never }) | ({ readonly runtime: Runtime } & { readonly [K in keyof RuntimeOptions]?: never }));
