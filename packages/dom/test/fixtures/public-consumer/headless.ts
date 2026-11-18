import { createRuntime } from '@viewstem/core';
import { answer, commonSet, count } from './common-set.js';

const authorized: (string | null)[] = [];
const runtime = createRuntime({ authorize(context) {
  if (context.operation === 'invoke') authorized.push(context.resource?.id ?? null);
  return true;
} });
runtime.registry.registerResourceSet(commonSet);
const initial = await runtime.invokeAction({ actionRef: 'answer' });
const countRequest = { actionRef: 'count', inputs: { text: ' ab ' } };
const originalCount = await runtime.invokeAction(countRequest);
runtime.registry.replaceResource({ action: count.implement(({ inputs }) => inputs.text.trim().length) });
const newCount = await runtime.invokeAction(countRequest);
let routing: unknown;
try { await runtime.invokeAction({ actionRef: 'navigate' }); }
catch (error) { routing = error; }

let finish!: () => void;
const result = new Promise<number>(resolve => { finish = () => resolve(43); });
const started = new Promise<AbortSignal>(resolve => {
  runtime.registry.replaceResource({ action: answer.implement(({ signal }) => {
    resolve(signal);
    return result;
  }) });
});
const controller = new AbortController();
const running = runtime.invokeAction({ actionRef: 'answer', signal: controller.signal }).then(
  () => null, error => error.code,
);
const signal = await started;
controller.abort();
const cancelled = await running;
finish();
console.log(JSON.stringify({
  answer: initial, originalCount, newCount, authorized, cancelled, aborted: signal.aborted, routing, document: typeof document,
}));
runtime.dispose();
