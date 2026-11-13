---
title: 오류와 폴백
description: Svelte 경계 오류를 정제하고 진단을 관찰하거나 폴백을 표시합니다.
sidebar:
  order: 5
---

## transformError

**시그니처** · `transformError(error: unknown): PublicError`

`@viewstem/svelte`에서 가져옵니다. `ViewstemView`를 직접 호스팅할 때는 [마운트 가이드](../guides/mount-in-svelte/)처럼 Svelte 루트의 `transformError`에 지정하세요. `mount`와 `attach`에서 만든 루트에는 렌더러가 정책을 적용합니다.

던져진 값의 속성, 메시지, 스택을 읽지 않고 고정된 `INTERNAL_ERROR` DTO로 변환합니다. 렌더러 자체의 어댑터 누락 오류는 `REFERENCE_NOT_FOUND`로 유지합니다. 직접 호스팅하는 트리에서 던져진 Proxy를 안전하게 처리하려면 Svelte 루트에 이 변환을 적용해야 합니다. 루트 정책은 앱의 다른 Svelte 컴포넌트에도 적용됩니다. 기존 정책과 결합할 때는 호스트가 통합 방식을 정합니다.

## RendererDiagnostic

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `readonly phase` | `'prepare' \| 'node' \| 'query' \| 'action' \| 'url' \| 'render'` | 오류가 발생한 단계입니다. |
| `readonly error` | `PublicError` | 공개 오류입니다. 렌더링 오류에 Component 참조와 인스턴스 ID가 포함될 수 있습니다. |
| `readonly nodeId?` | `string` | 관련 노드를 식별할 수 있을 때 제공됩니다. |
| `readonly application?` | `ViewApplication` | 관련 적용 핸들이 있을 때 제공됩니다. |

오류 구조는 [PublicError](/ko/docs/core/runtime/#authorization), 노드 관찰값은 [NodeSnapshot](/ko/docs/core/view/#viewsnapshot)을 참고하세요.

## RendererErrorListener

**타입** · `(diagnostic: RendererDiagnostic) => void`

`mount`, `attach`, `ViewstemView`는 렌더러의 `onError`를 먼저 호출하고 화면의 `onError`를 호출합니다. 여러 연결이 같은 View를 표시하더라도 같은 함수는 한 발생을 한 번 받습니다. 새 연결은 현재 활성 노드·Query 오류와 현재 적용의 URL 진단을 기존 관찰자와 같은 발생으로 받습니다. 같은 코드로 실패한 재시도도 새 실행의 진단으로 전달됩니다.

관찰자가 연결을 닫으면 그 연결의 남은 콜백은 호출되지 않습니다. 렌더러를 폐기하면 렌더러 관찰은 끝납니다. 직접 호스팅한 대여 View는 View와 Svelte 연결이 살아 있는 동안 화면 콜백에 계속 전달할 수 있습니다. 콜백의 예외와 Promise 거절은 격리합니다. 정상 취소는 진단을 만들지 않습니다.

## RenderFallback

**타입** · `Snippet<[node: NodeSnapshot, error: PublicError | null]>`

`RenderOptions`나 `ViewstemViewProps`로 폴백 snippet을 전달합니다. 관련 노드와 함께 정제된 렌더링 오류, 노드의 Core 오류, 오류 없는 자리표시자의 `null` 중 하나를 받습니다. 어댑터 경계가 실패하거나 노드에 주소가 없거나 어댑터 없이 표시되는 노드가 준비되지 않았을 때 호출합니다. 주소가 있는 코드형 어댑터는 자체 입력 준비 상태를 처리합니다. snippet을 생략하면 폴백 위치는 비어 있습니다.

<a id="failure-and-recovery"></a>

## 실패와 복구

| 실패 | 확인할 위치 |
| --- | --- |
| 잘못된 옵션·등록·대상 | 해당 설정 호출이 동기 예외를 던집니다. |
| 마운트 중 정의 준비 또는 첫 렌더 실패 | `screen.ready`가 거절되고 대상 예약이 풀립니다. 문제를 고친 뒤 다시 마운트할 수 있습니다. |
| `ViewstemView`의 `source` 준비 실패 | `prepareError`에 공개 오류를 전달하고 `onError`에 `prepare` 진단을 한 번 보냅니다. `whenRendered()`도 그 오류로 거절됩니다. |
| 실행 가능한 최초 Query 실패 | 완료 보고의 `queryErrors`에 기록됩니다. |
| Svelte 구현 누락 또는 어댑터 렌더 실패 | 경계에서 각각 `REFERENCE_NOT_FOUND` 또는 `INTERNAL_ERROR`를 보고합니다. 살아 있는 연결은 폴백을 표시하고 새 투영에서 다시 시도할 수 있습니다. |
| 어댑터 `emit()` 실패 | 호출 Promise가 거절됩니다. Core가 처리한 이벤트의 Action 오류는 `action` 진단에도 전달됩니다. 어댑터의 입력 미준비(`INPUT_NOT_READY`)와 오래된 연결(`CANCELLED`)은 `emit()`의 거절로 처리합니다. |
| 직접 호출한 `view.invokeAction()` 또는 View 변경 실패 | 해당 호출의 Promise가 거절됩니다. |
| 정리 또는 새 적용으로 완료 대기 취소 | 대기 Promise가 `CANCELLED`로 거절됩니다. |

활성 렌더 오류가 있으면 폴백이 표시되어도 `whenRendered()`와 렌더러의 `whenSettled(application)`가 거절될 수 있습니다. 이미 완료된 Core 변경은 적용된 상태로 유지됩니다.
