---
title: Render a list with stable keys
description: Repeat one row for each item using its ID.
sidebar:
  order: 3
---

Render a list of projects from one row template. Start with the workspace setup and `<div id="viewstem"></div>` from the [Quickstart](../../quickstart/), then replace its client entry with this code.

```js
import { createRenderer } from '@viewstem/svelte';
import { registerComponents } from '@viewstem/svelte-ui';
import { card } from '@viewstem/svelte-ui/shadcn/card';
import { typography } from '@viewstem/svelte-ui/shadcn/typography';
import '@viewstem/svelte-ui/shadcn/styles.css';

const renderer = createRenderer();
registerComponents(renderer, [card, typography]);

const mounted = await renderer.mount({
  target: document.querySelector('#viewstem'),
  view: {
    render: {
      id: 'projects',
      componentRef: 'shadcn.Card.Root',
      slots: {
        default: [{
          id: 'project-list',
          componentRef: 'shadcn.Card.Content',
          slots: {
            default: [{
              id: 'project',
              componentRef: 'shadcn.Typography',
              repeat: {
                items: [
                  { id: 'onboarding', name: 'Onboarding' },
                  { id: 'billing', name: 'Billing' },
                ],
                as: 'project',
                key: { '@path': '/repeat/project/id' },
              },
              inputs: {
                as: 'p',
                text: { '@path': '/repeat/project/name' },
              },
            }],
          },
        }],
      },
    },
  },
});
await mounted.initialComplete;
```

The card displays **Onboarding** and **Billing**. Add a third object with its own `id` to `items` and reload to see a third row. In a live view, Viewstem uses the stable ID to keep the same row instance when the data order changes. Keep each ID unique within this list.

See the [View composition contract](../../dsl/view-and-component/) for rules on repeated nodes and their keys.
