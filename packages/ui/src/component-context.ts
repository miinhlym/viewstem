import type { NodeSnapshot } from '@viewstem/core';
import type { Send } from './behaviors.js';

type Inputs = NodeSnapshot['inputs'];
const entries = new WeakMap<HTMLElement, { inputs: () => Inputs; send: Send }>();

export function bindComponent(element: HTMLElement, inputs: () => Inputs, send: Send) {
  entries.set(element, { inputs, send });
}

export function readInputs(element: HTMLElement | null): Inputs {
  return (element && entries.get(element)?.inputs()) || {};
}

export function emitFrom(element: HTMLElement, event: string, payload: unknown): void {
  entries.get(element)?.send(event, payload);
}
