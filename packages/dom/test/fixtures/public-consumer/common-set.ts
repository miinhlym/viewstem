import { defineCodeAction, defineResourceSet } from '@viewstem/core';

export const answer = defineCodeAction({
  definition: { kind: 'Action', id: 'answer', spec: { output: { schema: { type: 'integer' } } } },
});
export const count = defineCodeAction<{ text: string }, number>({
  definition: { kind: 'Action', id: 'count', spec: {
    ports: { text: { kind: 'Value', required: true, typeRef: 'ConsumerText' } },
    output: { typeRef: 'ConsumerCount' },
  } },
});
export const commonSet = defineResourceSet({ id: 'consumer-core', version: '1',
  resources: [
    { kind: 'Type', id: 'ConsumerText', spec: { schema: { type: 'string' } } },
    { kind: 'Type', id: 'ConsumerCount', spec: { schema: { type: 'integer' } } },
  ],
  actions: [
    answer.implement(() => 42),
    count.implement(({ inputs }) => inputs.text.length),
    { definition: { kind: 'Action', id: 'navigate', spec: {} }, requires: ['routing'], implementation() { throw Error('missing routing was not checked'); } },
  ],
});
