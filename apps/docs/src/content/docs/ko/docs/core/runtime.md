---
title: "Runtime"
description: "화면을 그리지 않는 View와 독립적인 Action 호출을 생성하고 소유합니다."
sidebar:
  order: 11
---

화면을 그리지 않는 View와 독립적인 Action 호출을 생성하고 소유합니다.


```ts
import { createRuntime } from '@viewstem/core';
import type { Runtime, RuntimeOptions, ViewSource, ViewOptions, InitialReport } from '@viewstem/core';
```

## createRuntime(options)

`Runtime`을 반환합니다. `options.registry`는 `createRegistry`가 발급한 Registry여야 하며 일반 객체나 복사한 핸들은 사용할 수 없습니다.

| RuntimeOptions 필드 | 타입 / 기본값 | 의미 |
|---|---|---|
| `registry` | `Registry`, 선택 | 검증된 정의를 제공하는 공용 레지스트리입니다. |
| `stateStore` | `StateStore`, 생략하면 새 Store | 호스트 State를 주입합니다. 주입한 Store의 정리는 호출자 책임입니다. |
| `requestExecutor` | `RequestExecutor`, fetch 기반 HTTP 실행기 | 버전이 있는 계획과 AbortSignal을 받아 `HttpResponse`를 반환합니다. |
| `resourceResolver` | `(kind, id, { signal }) => Awaitable<AnyResource \| undefined>`, 없음 | `createView()`와 `replace()`에서 누락된 선언을 조회합니다. 누락이면 `undefined`, 찾으면 요청한 종류와 ID로 반환합니다. |
| `authorize` | 동기 콜백, 없음 | Action 호출이나 View 갱신·교체를 승인합니다. 설정했다면 명시적 `true`만 허용입니다. |
| `functions` | 읽기 전용 `CelFunction[]`, Registry 함수 목록 | 실행에 사용하는 CEL 함수입니다. 등록·실행 환경을 호환되게 유지하세요. |
| `hostCapabilities` | 읽기 전용 이름·값 맵, 빈 맵 | 등록한 코드 Action이 필수로 선언한 기능을 실행 시 제공합니다. |
| `requestTimeoutMs` | 양의 안전 정수, 30000ms | Query/HTTP 요청 제한 시간입니다. 사용자 실행기도 취소를 따라야 합니다. |
| `urlCleanupTimeoutMs` | 양의 안전한 정수, 30000ms | View 교체 중 이전 URL 키 제거의 제한 시간입니다. |
| `clock` | `TimerClock`, 시스템 스케줄러 | Query 타이머용입니다. `now`는 시계와 함께 증가하는 숫자 또는 함수이며 `setTimeout`, `clearTimeout`과 같은 시간 기준을 사용합니다. |

해결한 선언은 검증 후 함께 게시합니다. `updateDefinition()`·`applyResourceSets()`·독립 Action 호출은 각 호출에서 선택한 Registry에서 참조를 찾습니다.

## createView(source, options?)

`await runtime.createView(source, options)`는 준비와 검증 후 View를 반환합니다. 최초 Query 보고는 `view.whenSettled(view.initial)`로 기다립니다. 교체 또는 폐기 시 `CANCELLED`로 거절될 수 있습니다.

`InitialReport`는 `generation: number`와 `queryErrors: { instanceId, query, error: PublicError }[]`를 가집니다. `queryErrors`가 있는 정상 완료는 모든 Query의 성공이 아닙니다. DOM 표시 완료 신호도 아닙니다.

## ViewSource and ViewOptions

| 필드 | 의미 |
|---|---|
| `source` | 인라인 `ViewSpec` 또는 등록된 View의 `{ ref: id }`입니다. |
| `inputs` | 네이티브 값과 발급된 State/Query 핸들의 선택적 읽기 전용 레코드입니다. 기본값은 `{}`이며 이 호스트 경계에서 JSON 표현식을 평가하지 않습니다. |
| `signal` | 동기 커밋 직전까지 준비를 취소하는 선택적 AbortSignal입니다. 커밋된 View는 `view.dispose()`로 닫습니다. |
| `url.adapter` | 명시적인 `UrlAdapter`입니다. |
| `url.bindings` | View 소유 State를 선택하는 `{ state: string, key?: string, history?: 'push' \| 'replace' }` 배열입니다. |
| `url.limits` | 선택적 바이트·항목·키 제한입니다. [URL](../url/)을 참고하세요. |

첫 URL 연결은 전달받은 URL 상태를 복원합니다. 이후 교체에서는 이전 소유 키를 제거한 뒤 새 State를 연결하며, 남아 있는 옛 URL 값을 새 초기값 위에 다시 덮지 않습니다. View URL 편의 연결과 같은 StateStore의 별도 활성 연결을 함께 사용하지 마세요.

## invokeAction(request)

`runtime.invokeAction({ actionRef?, action?, inputs?, signal? }): Promise<unknown>`는 View를 생성하지 않고 독립 Action을 시작합니다. 호출 시작 시점의 Registry 구성을 사용합니다. 요청은 Action 참조와 인라인 spec 중 하나를 받습니다. `inputs`의 기본값은 `{}`입니다. 선언한 출력으로 완료하고, void Action이면 `undefined`를 반환합니다. 실패하면 공개 오류로 거절합니다.

`view.invokeAction(request)`는 같은 요청 형식을 받고 View의 수명과 리소스 구성에서 실행합니다. 실행 중인 코드 Action에 속하는 하위 호출에는 `ActionContext.invokeAction()`을 사용합니다.

호출과 그 하위 호출을 취소하려면 요청에 `AbortSignal`을 전달합니다. 서버에서는 수신한 요청의 신호를 전달할 수 있습니다.

```ts
await runtime.invokeAction({ actionRef: 'saveDraft', inputs, signal: request.signal });
```

이미 취소된 신호를 전달하면 권한 검사 전에 `CANCELLED`로 거절됩니다. 실행 중 취소하면 호출은 `CANCELLED`로 거절되고 다른 독립 호출은 계속 진행됩니다. 런타임은 늦은 결과를 버리고 이미 발생한 효과를 보존합니다.

## 조회와 폐기

- `runtime.registry`, `runtime.stateStore`: 공개 핸들의 읽기 전용 참조입니다.
- `runtime.registry.list(filter?)`: 분리된 리소스 선언 목록이며 `ResourceKind`로 제한할 수 있습니다.
- `runtime.registry.exportResource(kind, id)`: 한 리소스의 분리된 선언입니다. 실행 중 State나 구현 함수는 추출하지 않습니다.
- `dispose(): Promise<void>`는 모든 View와 소유 작업의 실행을 막고 실제 정리 완료 또는 오류를 반환합니다. 주입한 Store는 호출자가 정리합니다. 반복 호출은 같은 Promise를 돌려줍니다.

<a id="authorization"></a>
## 권한과 진단

`authorize`는 View 변경에 `{ operation: 'update', owner, definition }`을, Action 호출에 `{ operation: 'invoke', owner, definition, resource }`를 받습니다. update의 owner는 공개 View입니다. invoke의 owner는 실행 수명을 식별하고 `definition`은 Action spec을 담습니다. 읽기 전용 `resource`는 실행에 사용한 Registry 스냅샷의 `{ kind: 'Action', id }`이며 인라인 Action이면 `null`입니다. 하위 호출마다 자기 실행 대상을 전달합니다.

다음 정책은 등록된 `saveDraft` Action 호출을 허용합니다.

```ts
const runtime = createRuntime({
  authorize: context => context.operation === 'invoke' && context.resource?.id === 'saveDraft',
});
```

`PublicError`의 필수 필드는 문자열 `code`, `message`이고 선택 필드는 `resource: { kind, id }`, `instanceId`, `location`, `input`, 중첩 `cause`입니다. 일반 읽기 전용 객체일 수 있으므로 `instanceof Error`를 전제하지 마세요. 주요 코드는 `INVALID_DEFINITION`, `REFERENCE_NOT_FOUND`, `TYPE_MISMATCH`, `EXECUTION_BLOCKED`, `CANCELLED`, `TIMEOUT`, `HTTP_ERROR`입니다. Query 오류는 스냅샷에서도 확인하며 렌더링 실패는 [Svelte 진단 API](../../svelte/errors/)에서 다룹니다.

[View 실행하고 관찰하기](../guides/runtime/)로 시작하고, 변경·관찰 메서드는 [View](../view/)에서 확인하세요.
