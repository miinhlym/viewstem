---
title: Show settings with a switch
description: Use a switch event to update State and show an optional section.
sidebar:
  order: 4
---

Show the weekly digest options when email notifications are enabled. Start with the workspace setup and `<div id="viewstem"></div>` from the [Quickstart](../../quickstart/), then replace its client entry with this code.

```js
import { createRegistry, createRuntime } from '@viewstem/core';
import { attach, registerShadcn } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const registry = createRegistry();
registerShadcn(registry);
const runtime = createRuntime({ registry });

const boolean = { type: 'boolean' };
const enabled = { '@path': '/states/emailEnabled' };
const target = document.querySelector('#viewstem');
const mounted = await runtime.createView({
  view: {
    states: {
      emailEnabled: { kind: 'State', schema: boolean, initial: false },
    },
    render: {
      id: 'preferences',
      componentRef: 'shadcn.Field.Group',
      slots: {
        default: [
          {
            id: 'email-label',
            componentRef: 'shadcn.Field.Label',
            inputs: { for: 'email-switch', text: 'Email notifications' },
          },
          {
            id: 'email',
            componentRef: 'shadcn.Switch',
            inputs: { id: 'email-switch', checked: enabled },
            on: {
              checkedChange: {
                id: 'update-email',
                action: {
                  ports: {
                    enabled: { kind: 'State', schema: boolean, required: true },
                    next: { kind: 'Value', schema: boolean, required: true },
                  },
                  steps: [{
                    kind: 'SetState',
                    target: { '@path': '/ports/enabled' },
                    value: { '@path': '/ports/next' },
                  }],
                },
                inputs: { enabled, next: { '@path': '/event/value' } },
              },
            },
          },
          {
            id: 'digest',
            componentRef: 'shadcn.Typography',
            when: enabled,
            inputs: { as: 'p', text: 'Weekly digest: every Monday' },
          },
        ],
      },
    },
  },
});
const attachment = attach(mounted.view, target);
await mounted.initialComplete;
```

Turn **Email notifications** on. The `checkedChange` event passes the new value to the Action. `SetState` writes it, and `when` shows **Weekly digest: every Monday**. Turn the switch off and the digest details disappear.

See the [Action contract](../../dsl/actions/) for State ports and `SetState`.
