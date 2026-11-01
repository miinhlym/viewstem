import { createStateStore, type View } from '@viewstem/core';

const store = createStateStore();
const result: number = store.transaction(() => 42);
store.transaction(() => { store.createScope(); });
void result;
// @ts-expect-error transactions cannot span asynchronous callbacks.
store.transaction(async () => 42);

declare const view: View;
const node = view.snapshot().roots[0];
if (node) await view.emit(node, 'click', {});
// @ts-expect-error fabricated targets still require a generation.
view.emit({ address: 'address' }, 'click', {});
