---
title: "Runtime"
description: "화면을 그리지 않는 View와 독립적인 Action 호출을 생성하고 소유합니다."
sidebar:
  order: 11
---

화면을 그리지 않는 View와 독립적인 Action 호출을 생성하고 소유합니다.


```ts
import { createRuntime } from '@viewstem/core';
import type { Runtime, RuntimeOptions, ViewTarget, InitialReport } from '@viewstem/core';
```

## createRuntime(options)

`Runtime`을 반환합니다. `options.registry`는 `createRegistry`가 발급한 Registry여야 하며 일반 객체나 복사한 핸들은 사용할 수 없습니다.

| RuntimeOptions 필드 | 타입 / 기본값 | 의미 |
|---|---|---|
| `registry` | `Registry`, 필수 | 검증된 정의를 제공하는 공용 레지스트리입니다. |
| `stateStore` | `StateStore`, 생략하면 새 Store | 호스트 State를 주입합니다. 주입한 Store의 정리는 호출자 책임입니다. |
| `requestExecutor` | `RequestExecutor`, fetch 기반 HTTP 실행기 | 버전이 있는 계획과 AbortSignal을 받아 `HttpResponse`를 반환합니다. |
| `resourceResolver` | `(kind, id) => Awaitable<AnyResource>`, 없음 | View 준비 중 없는 참조를 해결합니다. 요청한 종류·ID를 반환해야 하며 해결한 정의는 배치로 등록합니다. |
| `authorize` | 동기 콜백, 없음 | Action 호출이나 View 갱신·교체를 승인합니다. 설정했다면 명시적 `true`만 허용입니다. |
| `functions` | 읽기 전용 `CelFunction[]`, Registry 함수 목록 | 실행에 사용하는 CEL 함수입니다. 등록·실행 환경을 호환되게 유지하세요. |
| `requestTimeoutMs` | 양의 안전 정수, 30000ms | Query/HTTP 요청 제한 시간입니다. 사용자 실행기도 취소를 따라야 합니다. |
| `clock` | `TimerClock`, 시스템 스케줄러 | Query 스케줄링용 `now` 숫자 또는 함수, `setTimeout(callback, milliseconds)`, `clearTimeout(token)`입니다. 앱 State용 시계와 다릅니다. |

## createView(target)

`await runtime.createView(target)`은 `{ view, initialComplete }`를 반환합니다. 준비·검증 실패는 이 호출을 거절합니다. 별도 `initialComplete: Promise<InitialReport>`는 처음 실행 가능한 Query들이 개별 실패를 포함해 확정될 때까지 기다립니다. gate나 입력 미준비는 완료를 막지 않습니다. 폐기하거나 새 적용으로 대체하면 `CANCELLED`로 거절될 수 있습니다.

`InitialReport`는 `generation: number`와 `queryErrors: { instanceId, query, error: PublicError }[]`를 가집니다. `queryErrors`가 있는 정상 완료는 모든 Query의 성공이 아닙니다. DOM 표시 완료 신호도 아닙니다.

## ViewTarget

| 필드 | 의미 |
|---|---|
| `viewRef` 또는 `view` | 등록된 View ID와 인라인 `ViewSpec` 중 정확히 하나입니다. 인라인에는 리소스 외피를 넣지 않습니다. |
| `inputs` | 네이티브 값과 발급된 State/Query 핸들의 선택적 읽기 전용 레코드입니다. 기본값은 `{}`이며 이 호스트 경계에서 JSON 표현식을 평가하지 않습니다. |
| `url.adapter` | 명시적인 `UrlAdapter`입니다. |
| `url.bindings` | View 소유 State를 선택하는 `{ state: string, key?: string, history?: 'push' \| 'replace' }` 배열입니다. |
| `url.limits` | 선택적 바이트·항목·키 제한입니다. [URL](../url/)을 참고하세요. |

첫 URL 연결은 전달받은 URL 상태를 복원합니다. 이후 교체에서는 이전 소유 키를 제거한 뒤 새 State를 연결하며, 남아 있는 옛 URL 값을 새 초기값 위에 다시 덮지 않습니다. View URL 편의 연결과 같은 StateStore의 별도 활성 연결을 함께 사용하지 마세요.

## invokeAction(request)

`runtime.invokeAction({ owner, actionRef?, action?, inputs? }): Promise<unknown>`는 이 런타임이 소유하는 살아 있는 `View`와 Action 참조·인라인 spec 중 하나를 받습니다. `inputs`는 기본 `{}`입니다. 선언된 출력으로 완료하고 void Action이면 `undefined`를 반환하며, 실패 시 공개 오류로 거절합니다. 없거나 다른 런타임 소유이거나 폐기된 owner는 `CANCELLED`입니다.

이 호출은 독립적인 View 소유 실행입니다. 실행 중 코드 Action의 하위 호출이어야 한다면 `ActionContext.invokeAction()`을 사용하세요.

## 조회와 폐기

- `runtime.registry`, `runtime.stateStore`: 공개 핸들의 읽기 전용 참조입니다.
- `listResources(kind?)`: 분리된 리소스 선언 목록이며 `ResourceKind`로 제한할 수 있습니다.
- `exportResource(kind, id)`: 한 리소스의 분리된 선언입니다. 실행 중 State나 구현 함수는 추출하지 않습니다.
- `dispose(): void`: 모든 View와 소유 작업을 정리합니다. 내부에서 만든 Store는 폐기하고 주입한 Store는 호출자가 정리합니다. 반복 호출해도 안전합니다.

<a id="authorization"></a>
## 권한과 진단

`authorize`는 `{ operation: 'update', owner: View, definition: ViewSpec }` 또는 `{ operation: 'invoke', owner: unknown, definition: unknown }`를 받습니다. update의 owner는 공개 View입니다. invoke의 owner는 수명을 비교하는 불투명 식별값이며 실행 가능한 View가 아닙니다. 코드 Action 구현 함수는 콜백에 노출하지 않습니다. 콜백이 없으면 호스트 권한 정책을 적용하지 않으므로 필요한 앱에서 명시하세요. 리소스를 조회했다고 실행 권한을 얻는 것은 아닙니다.

`PublicError`의 필수 필드는 문자열 `code`, `message`이고 선택 필드는 `resource: { kind, id }`, `instanceId`, `location`, `input`, 중첩 `cause`입니다. 일반 읽기 전용 객체일 수 있으므로 `instanceof Error`를 전제하지 마세요. 주요 코드는 `INVALID_DEFINITION`, `REFERENCE_NOT_FOUND`, `TYPE_MISMATCH`, `EXECUTION_BLOCKED`, `CANCELLED`, `TIMEOUT`, `HTTP_ERROR`입니다. Query 오류는 스냅샷에서도 확인하며 렌더링 실패는 [Svelte 진단 API](../../svelte/errors/)에서 다룹니다.

[View 실행하고 관찰하기](../guides/runtime/)로 시작하고, 변경·관찰 메서드는 [View](../view/)에서 확인하세요.
