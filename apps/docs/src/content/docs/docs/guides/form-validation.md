---
title: Validate form input
description: Keep an editable name in State and derive its validation message as the user types.
sidebar:
  order: 1
---

Show a message when a required name is empty or contains only whitespace. Complete the [Quick Start](../../quickstart/), keep `<div id="viewstem"></div>` in `index.html`, and replace `src/main.js` with the example below. Run `npm run dev` and open the URL printed by Vite.

## Connect the input and validation message

```js title="src/main.js"
import { createRenderer } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const string = { type: 'string' };
const name = { '@path': '/states/name' };

const target = document.querySelector('#viewstem');
const renderer = createRenderer();
const source = {
  states: {
    name: { kind: 'State', schema: string, initial: '' },
    nameMessage: {
      kind: 'Derived',
      schema: string,
      variable: {
        ports: { name: { kind: 'Value', schema: string, required: true } },
        expression: 'name.trim() == "" ? "Enter a name." : ""',
      },
      inputs: { name },
    },
  },
  render: {
    id: 'name-field',
    componentRef: 'shadcn.Field.Field',
    slots: {
      default: [
        {
          id: 'label',
          componentRef: 'shadcn.Field.Label',
          inputs: { for: 'project-name', text: 'Project name' },
        },
        {
          id: 'name-input',
          componentRef: 'shadcn.Input',
          inputs: {
            id: 'project-name',
            value: name,
            required: true,
            'aria-describedby': 'name-message',
          },
          on: {
            input: {
              action: {
                ports: {
                  target: { kind: 'State', schema: string, required: true },
                  next: { kind: 'Value', schema: string, required: true },
                },
                steps: [{
                  kind: 'SetState',
                  target: { '@path': '/ports/target' },
                  value: { '@path': '/ports/next' },
                }],
              },
              inputs: { target: name, next: { '@path': '/event/value' } },
            },
          },
        },
        {
          id: 'validation',
          componentRef: 'shadcn.Field.Description',
          inputs: {
            id: 'name-message',
            text: { '@path': '/states/nameMessage' },
            'aria-live': 'polite',
          },
        },
      ],
    },
  },
};
const screen = renderer.mount({ target, source });
await screen.ready;
```

1. **Store the edit.** The text box reads `/states/name`. Its `input` event passes the edited text from `/event/value` to the Action. The `target` State port connects to the writable cell, so `SetState` updates the same value the text box reads.
2. **Recalculate the message.** `nameMessage` reads the new name through a Value port. The CEL expression checks the trimmed text and returns a message or an empty string. The text box keeps the original text.
3. **Describe the input.** `for` and `id` connect the visible label to the text box. The field description reads `/states/nameMessage` and stays mounted so it can announce changes through its live region.

## Try it

The empty text box starts with **Enter a name.** Type **Onboarding** and the message clears. Delete the text or replace it with spaces and the message returns.

See [State and Derived declarations](../../dsl/state-and-ports/#state-declarations) to add another computed field, or [Action steps](../../dsl/actions/#steps) to enforce the validation rule in a submission Action.
