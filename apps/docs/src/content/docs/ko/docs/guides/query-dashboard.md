---
title: 조회 대시보드 만들기
description: 기간 선택을 Query에 연결하고 조회 결과와 실행 상태를 표시합니다.
sidebar:
  order: 2
---

최근 7일 또는 30일의 방문 횟수를 표시합니다. [시작 가이드](../../quickstart/)를 완료한 뒤 `index.html`의 `<div id="viewstem"></div>`를 유지하고 `src/main.js`를 아래 코드로 교체하세요. `npm run dev`를 실행하고 Vite가 출력하는 URL을 여세요. 모의 HTTP 응답을 사용하므로 API 서버 없이 실행할 수 있습니다.

## 기간을 Query에 연결하기

```js title="src/main.js"
import { createHttpExecutor } from '@viewstem/core/http';
import { createRenderer } from '@viewstem/ui';
import '@viewstem/ui/styles.css';

const requestExecutor = createHttpExecutor({
  transport: async (url) => {
    const period = new URL(url).searchParams.get('period');
    await new Promise(resolve => setTimeout(resolve, 600));
    if (period === 'unavailable') {
      return Response.json({ message: '조회 불가' }, { status: 503 });
    }
    const summary = period === 'week' ? '최근 7일 방문 12회' : '최근 30일 방문 46회';
    return Response.json({ summary });
  },
});

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
  ['week', '최근 7일'],
  ['month', '최근 30일'],
  ['unavailable', '요청 실패 재현'],
];

const target = document.querySelector('#viewstem');
const renderer = createRenderer({ requestExecutor });
const source = {
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
            text: { '@call': 'concat', args: ['조회 상태: ', path('/queries/report/status')] },
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
          inputs: { text: '마지막으로 성공한 결과를 표시합니다.' },
        },
      ],
    },
  },
};
const screen = renderer.mount({ target, source });
await screen.ready;
```

1. **기간을 바꿉니다.** 각 버튼은 같은 `SetState` Action에 서로 다른 값을 전달합니다. `path`는 Viewstem의 `@path` 식을 만드는 함수입니다. Query 사용 선언은 `/states/period`에서 선택된 기간을 읽어 Query의 `period` 포트에 전달합니다.
2. **요청을 실행합니다.** Query는 마운트할 때와 기간 입력이 바뀔 때 실행됩니다. HTTP 소스는 `/ports/period`를 URL 매개변수에 넣습니다. 요청 실행기는 네트워크 요청 대신 예제의 `transport`를 호출하고, Query 변환은 응답에서 `summary`를 읽습니다.
3. **결과를 표시합니다.** 카드는 `report` Query 스냅샷의 `status`, `data`, `stale`을 읽습니다. 결과는 첫 성공 응답 이후에 표시됩니다. 다음 요청이 실패하면 카드에 이전 결과가 남고, 마지막으로 성공한 결과라는 안내가 표시됩니다.

## 실행 결과 확인하기

**최근 7일 방문 12회**가 표시될 때까지 기다리세요. **최근 30일**을 누르면 상태가 `running`에서 `success`로 바뀌면서 **최근 30일 방문 46회**가 표시됩니다. **요청 실패 재현**을 누르면 `error`와 **마지막으로 성공한 결과를 표시합니다.**라는 안내가 나타나고 30일 방문 횟수는 화면에 남습니다. **최근 7일**을 다시 선택하면 새 결과를 가져옵니다.

관찰할 수 있는 전체 필드는 [Query 스냅샷](../../dsl/queries/#querysnapshot)을, 실제 API에 연결하는 옵션은 [HTTP 실행기](../../core/http/#createhttpexecutoroptions)를 참고하세요.
