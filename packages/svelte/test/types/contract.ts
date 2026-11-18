import type { ComponentContract } from '@viewstem/core';

export const countContract = {
  kind: 'Component',
  id: 'TypedCounter',
  spec: { ports: { count: { kind: 'Value', schema: { type: 'integer' }, required: true } } },
} as const satisfies ComponentContract;
