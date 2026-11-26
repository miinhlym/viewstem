/** @type {import('@viewstem/core').CelFunction<[boolean, string, string]>} */
export const makeNotice = {
  name: 'makeNotice',
  inputs: [{ type: 'boolean' }, { type: 'string' }, { type: 'string' }],
  output: {
    type: 'object',
    properties: { text: { type: 'string' }, variant: { enum: ['default', 'destructive'] } },
    required: ['text', 'variant'],
    additionalProperties: false,
  },
  run: (closed, openText, closedText) => closed
    ? { text: closedText, variant: 'destructive' }
    : { text: openText, variant: 'default' },
};
