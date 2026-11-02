export { createRenderer } from './renderer.js';
export { transformError } from './connection.js';
import type { Component } from 'svelte';
import type { ViewstemViewProps } from './types.js';
import ViewstemViewComponent from './ViewstemView.svelte';
// An explicit package-boundary type also resolves in NodeNext consumers, where
// generated .svelte.d.ts files otherwise fall back to Svelte's ambient wildcard.
export const ViewstemView: Component<ViewstemViewProps, { whenRendered(): Promise<void> }> = ViewstemViewComponent;
export type { ComponentAdapterProps, ComponentAdapter, ComponentRegistration, RendererDiagnostic, RendererErrorListener, RenderFallback, ViewstemViewProps, RenderAttachment, MountedView, RenderOptions, Renderer, RendererOptions } from './types.js';
// Shared contracts remain core's types; consumers do not need a second import.
export type {
  ActionCall, ActionSnapshot, ActionSpec, AnyResource, ApplicationResult,
  CelFunction, CelValue, ChildActionRequest, Clock, ComponentContract, ComponentNode,
  ComponentPublicContract, ComponentSpec, DatasourceSpec, DeepReadonly,
  GridConfig, GridPlacement, HttpExecutionPlan, HttpRequest, HttpResponse,
  InitialReport, InputExpressions, JsonValue, ActionHandler,
  CodeActionDefinition, CodeActionSpec, ActionContext, NodeSnapshot,
  PathExpression, Port, PublicError, QueryDefaults, QueryHandle, QueryPort,
  QuerySnapshot, QuerySource, QuerySpec, QueryUse, Reaction, RegisteredResource,
  Registry, RequestExecutor, Resource, ResourceKind, ResourceSpecs,
  ResourceStateDeclaration, Runtime, RuntimeOptions, Schema, StateScope, StateAddress,
  StateDeclaration, StateHandle, StatePort, StateStore, Step, StoreObservation,
  TimerClock, TransformStep, TypeContract, UrlAdapter, UrlConnection,
  ValueExpression, ValuePort, ValueSnapshot, VariableSpec, View,
  ViewSnapshot, ViewSpec, ViewTarget,
} from '@viewstem/core';
