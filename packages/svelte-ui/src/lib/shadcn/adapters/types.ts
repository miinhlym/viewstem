import type { Component } from 'svelte';
import type { Schema } from '@viewstem/svelte';
export interface Property { schema: Schema; required?: boolean; codec?: string }
export interface Callback { event: string; schema: Schema; codec?: string }
export interface Definition {
  id: string;
  family: string;
  props: Record<string, Property>;
  callbacks: Record<string, Callback>;
  slots: string[];
}
export type NativeComponent = Component<any>;
export const childContext = Symbol('viewstem.shadcn.child');
export const navigationViewportContext = Symbol('viewstem.shadcn.navigationViewport');
export const calendarPlaceholderContext = Symbol('viewstem.shadcn.calendarPlaceholder');
export interface ChildBridge { readonly target: string; readonly props: Record<PropertyKey, unknown> }
