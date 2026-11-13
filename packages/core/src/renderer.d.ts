import type { InitialReport, PublicError, Runtime, View, ViewApplication, ViewOptions, ViewSource } from './index.js';

export interface RendererDiagnostic {
  readonly phase: 'prepare' | 'node' | 'query' | 'action' | 'url' | 'render';
  readonly error: PublicError;
  readonly application?: ViewApplication;
  readonly nodeId?: string;
}
export type RendererErrorListener = (diagnostic: RendererDiagnostic) => void;

export interface RenderAttachment {
  whenRendered(): Promise<void>;
  whenSettled(application: ViewApplication): Promise<InitialReport>;
  detach(): Promise<void>;
}
export interface MountedView extends Omit<RenderAttachment, 'detach'> {
  readonly ready: Promise<View>;
  unmount(): Promise<void>;
}

type OptionsWithDiagnostics<Options> = Options & { readonly onError?: RendererErrorListener };
export interface Renderer<Options extends object = {}> {
  readonly runtime: Runtime;
  mount(options: Omit<ViewOptions, 'signal'> & OptionsWithDiagnostics<Options> & {
    readonly target: HTMLElement;
    readonly source: ViewSource;
  }): MountedView;
  attach(view: View, target: HTMLElement, options?: OptionsWithDiagnostics<Options>): RenderAttachment;
  dispose(): Promise<void>;
}
export interface RendererHostOptions<Options extends object> {
  readonly ownsRuntime: boolean;
  readonly onError?: RendererErrorListener;
  readonly validateTarget: (target: HTMLElement) => boolean;
  /** Clean up framework-owned views after the host has stopped accepting new work. */
  readonly disposeOwned?: () => Promise<void>;
  readonly connect: (view: View, target: HTMLElement, options: OptionsWithDiagnostics<Options>,
    onRenderError: (error: unknown, nodeId?: string) => void) => {
      dispose(): void | Promise<void>;
      whenRendered(): void | Promise<void>;
    };
}
export function createRendererHost<Options extends object = {}>(
  runtime: Runtime, options: RendererHostOptions<Options>,
): Renderer<Options>;

/** Capture creation settings for a framework-owned View before starting it. Its signal owns the View until disposal. */
export function prepareOwnedView(runtime: Runtime, source: ViewSource, options?: Pick<ViewOptions, 'inputs'>): (
  signal: AbortSignal, owner?: { isOpen?: () => boolean; onCreate?: (close: () => Promise<void>) => void },
) => Promise<View>;

/** For connections hosted inside a framework's existing component tree. */
export function createRenderWaiter(view: View, render: () => void | Promise<void>, options?: {
  onError?: RendererErrorListener;
  getErrorListener?: () => RendererErrorListener | undefined;
  onClose?: () => void;
}): Pick<RenderAttachment, 'whenRendered' | 'whenSettled'> & { dispose(): void };
