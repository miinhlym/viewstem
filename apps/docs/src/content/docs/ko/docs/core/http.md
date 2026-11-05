---
title: "HTTP 실행기"
description: "명시적인 전송·제한 시간·호스트 권한으로 버전이 있는 HTTP 계획을 실행합니다."
sidebar:
  order: 15
---

명시적인 전송·제한 시간·호스트 권한으로 버전이 있는 HTTP 계획을 실행합니다.

```ts
import { createHttpExecutor } from '@viewstem/core/http';
import type { HttpExecutorOptions, HttpExecutionPlan, HttpResponse, RequestExecutor } from '@viewstem/core/http';
```

## createHttpExecutor(options?)

`(plan: HttpExecutionPlan, context?: { signal?: AbortSignal }) => Promise<HttpResponse>`를 반환합니다. Runtime의 `requestExecutor`로 주입할 수 있습니다.

| HttpExecutorOptions | 타입 / 기본값 | 동작 |
|---|---|---|
| `transport` | `typeof fetch`, 전역 `fetch` | 평가한 URL과 요청 옵션을 받습니다. |
| `requestTimeoutMs` | 양의 안전 정수, 30000 | 권한·비밀값 해석·Login·본 요청 전체에 한 제한 시간을 적용합니다. |
| `caller` | `unknown`, undefined | 권한과 비밀값 해석에 전달하는 신뢰할 수 있는 호스트 신원·문맥입니다. |
| `authorize` | `({ caller, destination }) => Awaitable<boolean>`, 없으면 공개 요청 허용 | 비밀값 사용 전과 query 파라미터 평가 뒤 목적지를 검사합니다. secret/Login 계획에는 필수입니다. |
| `resolveSecret` | `(reference, { caller, destination, signal }) => Awaitable<string>` | 이름으로 참조한 비밀값을 해석합니다. 기본은 `EXECUTION_BLOCKED`이며 신뢰하는 서버에 둡니다. |
| `clock` | `{ now(): number, set(callback, milliseconds): unknown, clear(token): void }` | 제한 시간용 시계입니다. 기본은 performance 시간과 시스템 타이머이며 Runtime의 TimerClock과 메서드 이름이 다릅니다. |

실행 문맥의 선택적 signal은 전체 작업을 취소합니다. 사용자 transport/resolver도 취소 신호를 받아 자신의 작업을 중단해야 합니다. 취소·시간 초과는 각각 `CANCELLED`, `TIMEOUT`으로 거절합니다.

## HttpExecutionPlan

| 필드 | 필수 값 |
|---|---|
| `version` | 리터럴 `1` |
| `requestId` | 요청 식별 문자열 |
| `datasource` | `kind: 'Http'`인 `DatasourceSpec` |
| `request` | method/path와 선택적 덮어쓰기 값을 가진 `HttpRequest` |
| `inputs` | JSON으로 안전하게 전달할 입력의 읽기 전용 레코드 |

`RequestExecutor`는 `(plan, { signal: AbortSignal })`을 받아 `HttpResponse`를 동기 또는 비동기로 반환합니다. 원격 실행을 연결하는 호스트 경계이며 클라이언트가 보낸 계획을 임의 목적지에 접근할 권한으로 취급하면 안 됩니다. Runtime은 지원하는 네이티브 컬렉션을 이 경계 전에 전송 표현으로 변환합니다.

## 응답과 요청 동작

`HttpResponse`는 `status: number`, `headers: Readonly<Record<string, string>>`, `body: JsonValue`입니다. Query source 표현식은 응답 본문을 읽고, Login 토큰 추출은 응답 외피를 읽을 수 있습니다.

기본 실행기는 GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS를 받습니다. `credentials: 'omit'`, `redirect: 'manual'`로 요청합니다. 2xx 외 응답·잘못된 JSON·지원하지 않는 응답 content-type·잘못된 Login 토큰은 `HTTP_ERROR`입니다. JSON 미디어 타입은 JSON으로, `text/*`는 문자열로 파싱하고 HEAD/204/205의 본문은 `null`입니다. 헤더·파라미터 병합, 본문 표현식, Login 필드는 [DSL Datasource](../../dsl/datasources/)에서 설명합니다.

## 예제

```js title="http-executor.mjs"
import { createHttpExecutor } from '@viewstem/core/http';
const execute = createHttpExecutor({
  transport: async () => new Response('{"ok":true}', {
    headers: { 'content-type': 'application/json' },
  }),
});
const response = await execute({
  version: 1, requestId: 'example', inputs: {},
  datasource: { kind: 'Http', baseUrl: 'https://example.test' },
  request: { method: 'GET', path: '/health' },
});
console.log(response.body); // { ok: true }
```

전송을 mock으로 대체하므로 실제 네트워크 요청은 보내지 않습니다. Query에 연결하는 전체 흐름은 [HTTP와 코드 Action 연결하기](../guides/http-and-actions/)에 있습니다.
