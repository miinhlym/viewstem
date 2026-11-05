---
title: "HTTP와 코드 Action 연결하기"
description: "HTTP 실행기를 주입하고 앱 함수를 타입이 있는 Action으로 노출합니다."
sidebar:
  order: 3
---

HTTP 실행기를 주입하고 앱 함수를 타입이 있는 Action으로 노출합니다.

## 일정한 결과를 내는 예제 실행하기

아래 Node 예제는 로컬 mock transport를 사용하므로 실제 네트워크 요청을 보내지 않습니다. Core를 설치한 프로젝트에 `http-action.mjs`로 저장하고 Node로 실행하세요.

```js title="http-action.mjs"
import { createRegistry, createRuntime } from '@viewstem/core';
import { createHttpExecutor } from '@viewstem/core/http';

const registry = createRegistry();
registry.registerComponentContract({ kind: 'Component', id: 'Empty', spec: {} });
registry.registerAction({
  kind: 'Action', id: 'label',
  spec: {
    ports: { name: { kind: 'Value', schema: { type: 'string' }, required: true } },
    output: { schema: { type: 'string' } },
  },
}, ({ inputs }) => `Hello, ${inputs.name}`);
const execute = createHttpExecutor({
  authorize: ({ destination }) => new URL(destination).origin === 'https://api.example.test',
  transport: async () => new Response(JSON.stringify({ title: 'Project' }), {
    headers: { 'content-type': 'application/json' },
  }),
});
const runtime = createRuntime({ registry, requestExecutor: execute });
const { view, initialComplete } = await runtime.createView({ view: {
  queries: { project: { query: {
    sources: { main: {
      datasource: { kind: 'Http', baseUrl: 'https://api.example.test' },
      request: { method: 'GET', path: '/projects/1' },
    } },
    transform: { input: { '@path': '/sources/main/title' } },
  } } },
  render: { id: 'empty', componentRef: 'Empty' },
} });
const report = await initialComplete;
console.log(report.queryErrors.length); // 0
console.log(view.getQuery('project').getSnapshot().data); // Project
console.log(await runtime.invokeAction({ owner: view, actionRef: 'label', inputs: { name: 'Viewstem' } }));
// Hello, Viewstem
runtime.dispose();
```

Query는 응답 본문을 `Project`로 변환합니다. 코드 Action은 준비된 입력을 받아 스키마로 검증되는 문자열을 반환합니다. 코드 Action은 계약과 구현 함수를 별도로 등록하며 선언에 `steps`나 `output.value`를 넣지 않습니다.

## 실제 전송 연결하기

`transport`를 생략하면 `fetch`를 사용합니다. 인증 요청의 비밀값 해석은 신뢰하는 서버에서 수행하고, 목적지를 검사하는 `authorize` 콜백을 명시하세요. 브라우저는 `requestExecutor(plan, { signal })`를 통해 직렬화된 `HttpExecutionPlan`을 서버에 전달할 수 있습니다. 서버에서는 계획과 실제 호출자를 검증해야 합니다. `caller`는 호스트 문맥이며 신뢰하지 않는 브라우저가 자신의 권한을 주장하는 값으로 쓰면 안 됩니다.

## 취소와 오류 처리하기

취소 가능한 작업에는 Action 핸들러의 `signal`을 전달합니다. `context.invokeAction()`은 부모의 취소·재귀 문맥을 상속하는 하위 호출을 만듭니다. 별도 `runtime.invokeAction({ owner: view, ... })`은 해당 View가 소유하는 독립 실행입니다. 취소 뒤 State 쓰기와 Query 갱신은 거절하지만 이미 완료된 외부 효과까지 되돌리지는 않습니다.

초기 Query 실패는 `initialComplete.queryErrors`에서, Action 실패는 `invokeAction`이 반환하는 Promise의 거절에서 확인합니다. 결과 스키마가 맞지 않으면 `TYPE_MISMATCH`, 목적지 권한이 거절되면 `EXECUTION_BLOCKED`입니다.

[Registry의 코드 Action](../../registry/#code-actions), [Runtime](../../runtime/), [HTTP](../../http/)에서 세부 계약을 확인하세요.
