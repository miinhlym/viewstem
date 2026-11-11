---
title: Render a list with stable keys
description: Repeat one row for each item using its ID.
sidebar:
  order: 3
---

Render a list of projects from one row template. Start with the workspace setup and `<div id="viewstem"></div>` from the [Quickstart](../../quickstart/), then replace its client entry with this code.

```js
import { createRegistry, createRuntime } from '@viewstem/core';
import { attach, registerShadcn } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const registry = createRegistry();
registerShadcn(registry);
const runtime = createRuntime({ registry });

const target = document.querySelector('#viewstem');
const mounted = await runtime.createView({
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
const attachment = attach(mounted.view, target);
await mounted.initialComplete;
```

The card displays **Onboarding** and **Billing**. Add a third object with its own `id` to `items` and reload to see a third row. In a live view, Viewstem uses the stable ID to keep the same row instance when the data order changes. Keep each ID unique within this list.

See the [View composition contract](../../dsl/view-and-component/) for rules on repeated nodes and their keys.
