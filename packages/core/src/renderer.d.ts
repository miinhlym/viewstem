import type { ComponentBinding, InitialReport, PublicError, Runtime, View, ViewApplication, ViewOptions, ViewSnapshot, ViewSource } from './index.js';

export interface RendererDiagnostic {
  readonly phase: 'prepare' | 'node' | 'query' | 'action' | 'url' | 'render' | 'dispose';
  readonly error: PublicError;
  readonly application?: ViewApplication;
  readonly nodeId?: string;
}
export type RendererErrorListener = (diagnostic: RendererDiagnostic) => void;

/** Shared diagnostics for renderer implementations. */
export function createDiagnostic(phase: RendererDiagnostic['phase'], cause: unknown, details?: {
  application?: ViewApplication;
  nodeId?: string | undefined;
}): RendererDiagnostic;
export function notifyDiagnostic(diagnostic: RendererDiagnostic, ...observers: {
  listener?: RendererErrorListener | undefined;
  getListener?: () => RendererErrorListener | undefined;
  isOpen?: () => boolean;
}[]): void;
export function createRenderError(missing: boolean, details?: {
  componentId?: string | undefined;
  connectorId?: string | undefined;
  instanceId?: string | undefined;
}): PublicError;
export function createPreparationError(message: string): PublicError;

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
export type RenderEmission = (...args: [...Parameters<View['emit']>, current?: () => boolean]) => Promise<unknown>;
export interface RenderProjection {
  readonly generation: number;
  readonly sequence: number;
  readonly snapshot: ViewSnapshot;
  componentBinding(id: string): ComponentBinding | undefined;
  isCodeComponent(id: string): boolean;
}
export function subscribeRenderProjection(view: View, listener: (projection: RenderProjection) => void): () => void;
/** Identify which borrowed displays will close when this Runtime is disposed. */
export function runtimeOwnsView(runtime: Runtime, view: View): boolean;
export interface Renderer<Options extends object = {}, Target extends object = object> {
  readonly runtime: Runtime;
  mount(options: Omit<ViewOptions, 'signal'> & OptionsWithDiagnostics<Options> & {
    readonly target: Target;
    readonly source: ViewSource;
  }): MountedView;
  attach(view: View, target: Target, options?: OptionsWithDiagnostics<Options>): RenderAttachment;
  dispose(): Promise<void>;
}
export interface RendererHostOptions<Options extends object, Target extends object = object> {
  readonly ownsRuntime: boolean;
  readonly onError?: RendererErrorListener;
  /** Return false for an unsupported target, or throw a public error with host-specific details. */
  readonly validateTarget: (target: Target) => boolean;
  /** Clean up framework-owned views after the host has stopped accepting new work. */
  readonly disposeOwned?: () => Promise<void>;
  readonly connect: (view: View, target: Target, options: OptionsWithDiagnostics<Options>,
    onRenderError: (error: unknown, nodeId?: string) => void,
    connection: {
      readonly isOpen: () => boolean;
      readonly emit: RenderEmission;
      readonly reportDisposal: (error: unknown, nodeId?: string) => void;
    }) => {
      dispose(): void | Promise<void>;
      whenRendered(generation: number, sequence: number): void | Promise<void>;
    };
}
export function createRendererHost<Options extends object = {}, Target extends object = object>(
  runtime: Runtime, options: RendererHostOptions<Options, Target>,
): Renderer<Options, Target>;

/** Attach a framework-owned display through the same host as imperative rendering. */
export function attachHostedView<Options extends object, Target extends object>(
  host: Renderer<Options, Target>, view: View, target: Target, options: Options,
  owner: {
    readonly isOpen: () => boolean;
    readonly isRendererOpen: () => boolean;
    readonly getErrorListener: () => RendererErrorListener | undefined;
    readonly closeWithRenderer: boolean;
  },
): RenderAttachment;

/** Capture settings now and resolve a Runtime factory on start. The signal owns the View until disposal. */
export function prepareOwnedView(runtime: Runtime | (() => Runtime), source: ViewSource, options?: Pick<ViewOptions, 'inputs'>): (
  signal: AbortSignal, owner?: { isOpen?: () => boolean; onCreate?: (close: () => Promise<void>) => void },
) => Promise<View>;

/** For connections hosted inside a framework's existing component tree. */
export function createRenderWaiter(view: View, render: (generation: number, sequence: number) => void | Promise<void>, options?: {
  onError?: RendererErrorListener;
  getErrorListener?: () => RendererErrorListener | undefined;
  deliverDiagnostic?: (diagnostic: RendererDiagnostic) => void;
  onClose?: () => void;
  isOpen?: () => boolean;
}): Pick<RenderAttachment, 'whenRendered' | 'whenSettled'> & { emit: View['emit']; dispose(): void };
