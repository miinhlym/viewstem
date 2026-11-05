---
title: Build a query-driven dashboard
description: Connect a period selector to a Query and display its result and status.
sidebar:
  order: 2
---

Show an activity count for the last 7 or 30 days. Complete the [Quick Start](../../quickstart/), keep `<div id="viewstem"></div>` in `index.html`, and replace `src/main.js` with the example below. Run `npm run dev` and open the URL printed by Vite. The example uses simulated HTTP responses, so it runs without an API server.

## Connect the period to a Query

```js title="src/main.js"
import { createHttpExecutor } from '@viewstem/core/http';
import { createRenderer } from '@viewstem/svelte';
import { registerComponents } from '@viewstem/svelte-ui';
import { button } from '@viewstem/svelte-ui/shadcn/button';
import { card } from '@viewstem/svelte-ui/shadcn/card';
import '@viewstem/svelte-ui/shadcn/styles.css';

const requestExecutor = createHttpExecutor({
  transport: async (url) => {
    const period = new URL(url).searchParams.get('period');
    await new Promise(resolve => setTimeout(resolve, 600));
    if (period === 'unavailable') {
      return Response.json({ message: 'Unavailable' }, { status: 503 });
    }
    const summary = period === 'week' ? 'Last 7 days: 12 visits' : 'Last 30 days: 46 visits';
    return Response.json({ summary });
  },
});

const renderer = createRenderer({ requestExecutor });
registerComponents(renderer, [button, card]);

const path = value => ({ '@path': value });
const string = { type: 'string' };
const period = path('/states/period');
const periodInput = { kind: 'Value', schema: string, required: true };
const setPeriod = {
  ports: {
    target: { kind: 'State', schema: string, required: true },
    next: periodInput,
  },
  steps: [{ kind: 'SetState', target: path('/ports/target'), value: path('/ports/next') }],
};
const choices = [
  ['week', 'Last 7 days'],
  ['month', 'Last 30 days'],
  ['unavailable', 'Simulate a failed request'],
];

const mounted = await renderer.mount({
  target: document.querySelector('#viewstem'),
  view: {
    states: { period: { kind: 'State', schema: string, initial: 'week' } },
    queries: {
      report: {
        inputs: { period },
        query: {
          ports: { period: periodInput },
          sources: {
            activity: {
              datasource: { kind: 'Http', baseUrl: 'https://example.test' },
              request: { method: 'GET', path: '/activity', params: { period: path('/ports/period') } },
            },
          },
          transform: { input: path('/sources/activity/summary') },
        },
      },
    },
    render: {
      id: 'dashboard',
      componentRef: 'shadcn.Card.Root',
      slots: {
        default: [
          {
            id: 'controls',
            componentRef: 'shadcn.Card.Header',
            slots: {
              default: choices.map(([next, text]) => ({
                id: next,
                componentRef: 'shadcn.Button',
                inputs: { text, variant: 'outline' },
                on: { click: { action: setPeriod, inputs: { target: period, next } } },
              })),
            },
          },
          {
            id: 'status',
            componentRef: 'shadcn.Card.Content',
            inputs: {
              role: 'status',
              text: { '@call': 'concat', args: ['Report status: ', path('/queries/report/status')] },
            },
          },
          {
            id: 'result',
            componentRef: 'shadcn.Card.Content',
            inputs: { text: path('/queries/report/data') },
          },
          {
            id: 'stale',
            componentRef: 'shadcn.Card.Content',
            when: path('/queries/report/stale'),
            inputs: { text: 'Showing the last successful result.' },
          },
        ],
      },
    },
  },
});
await mounted.initialComplete;
```

1. **Update the period.** Each button calls the same `SetState` Action with its own value. The `path` helper builds a Viewstem `@path` expression. The Query use reads the selected period from `/states/period` and passes it to the Query’s `period` port.
2. **Run the request.** The Query runs on mount and whenever its period input changes. Its HTTP source reads `/ports/period` into the URL parameter. The executor calls the supplied `transport` instead of the network, and the transform reads `summary` from the response.
3. **Display the outcome.** The card reads `status`, `data`, and `stale` from the `report` Query snapshot. The result is available after the first successful response. If a later request fails, the card marks the retained result as older data.

## Try it

Wait for **Last 7 days: 12 visits**. Select **Last 30 days** and watch the status change from `running` to `success` as **Last 30 days: 46 visits** appears. Choose **Simulate a failed request** to see `error` and **Showing the last successful result.** The 30-day count stays visible. Select **Last 7 days** again to restore a fresh result.

See [Query snapshots](../../dsl/queries/#querysnapshot) for the full set of observation fields, or [HTTP executor](../../core/http/#createhttpexecutoroptions) to connect a real API.
