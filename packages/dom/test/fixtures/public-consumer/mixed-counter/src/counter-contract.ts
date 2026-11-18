import type { ComponentContract } from '@viewstem/core';

export const integer = { type: 'integer' } as const;
export const counterContract = {
  kind: 'Component',
  id: 'demo.Counter',
  spec: { ports: { count: { kind: 'Value', required: true, schema: integer } } },
} as const satisfies ComponentContract;
