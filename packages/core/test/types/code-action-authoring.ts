import { defineCodeAction } from '@viewstem/core';

export const count = defineCodeAction({
  definition: { kind: 'Action', id: 'count', spec: {
    ports: { text: { kind: 'Value', required: true, schema: { type: 'string' } } },
    output: { schema: { type: 'integer' } },
  } },
});
export const format = defineCodeAction<{ value: string }, number>({
  definition: { kind: 'Action', id: 'format', spec: {
    ports: { value: { kind: 'Value', required: true, typeRef: 'Text' } },
    output: { typeRef: 'Count' },
  } },
  requires: ['storage'],
});
export const countAction = count.implement(({ inputs }) => inputs.text.length);
export const formatAction = format.implement(async ({ inputs }) => inputs.value.length);
