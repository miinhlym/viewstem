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
| `readonly phase` | `'render' \| 'event'` | 렌더링 실패와 어댑터 `emit` 거절을 구분합니다. |
| `readonly error` | `PublicError` | 공개 오류 DTO입니다. 렌더링 진단에는 Component 참조와 인스턴스 ID가 포함될 수 있습니다. |
| `readonly node?` | `NodeSnapshot` | 실패와 관련된 노드가 있을 때 전달합니다. |

오류 구조는 [PublicError](/ko/docs/core/runtime/#authorization), 노드 관찰값은 [NodeSnapshot](/ko/docs/core/view/#viewsnapshot)을 참고하세요.

## RendererErrorListener

**타입** · `(diagnostic: RendererDiagnostic) => void`

렌더러를 만들 때, `mount`나 `attach`를 설정할 때, 또는 `ViewstemView`를 표시할 때 `onError` 콜백을 지정할 수 있습니다. 렌더러와 연결 수준의 콜백이 같은 오류를 관찰할 수 있습니다. 관찰자가 동기적으로 예외를 던져도 렌더링과 이벤트 전달에는 영향이 없습니다.

## RenderFallback

**타입** · `Snippet<[node: NodeSnapshot, error: PublicError | null]>`

`RenderOptions`나 `ViewstemViewProps`로 폴백 snippet을 전달합니다. 관련 노드와 함께 정제된 렌더링 오류, 노드의 Core 오류, 오류 없는 자리표시자의 `null` 중 하나를 받습니다. 어댑터 경계가 실패하거나 노드에 주소가 없거나 어댑터 없이 표시되는 노드가 준비되지 않았을 때 호출합니다. 주소가 있는 코드형 어댑터는 자체 입력 준비 상태를 처리합니다. snippet을 생략하면 폴백 위치는 비어 있습니다.

<a id="failure-and-recovery"></a>

## 실패와 복구

| 실패 | 확인할 위치 |
| --- | --- |
| 잘못된 옵션, 등록, 타깃, View 정의 | 설정 호출에서 예외가 발생하거나 마운트 또는 적용 Promise가 거절됩니다. |
| 실행 가능한 최초 Query 실패 | 최초 완료 보고서의 `queryErrors`에 기록됩니다. |
| 코드형 Component에 등록된 Svelte 구현이 없음 | 렌더링 경계가 `REFERENCE_NOT_FOUND`를 보고합니다. |
| 노드 렌더링 도중 어댑터가 예외를 던짐 | 해당 경계가 정제된 `INTERNAL_ERROR`를 보고하며 폴백을 표시할 수 있습니다. 형제 노드는 렌더링을 유지합니다. Core가 새 렌더링 스냅샷을 내보내면 실패한 경계를 다시 렌더링할 수 있습니다. |
| 어댑터 `emit` 실패 | 원래 이벤트 Promise가 거절됩니다. 연결이 유효하면 `event` 진단도 보고합니다. |
| 정리 또는 이후 세대 적용으로 렌더러 대기가 취소됨 | 해당 대기가 `CANCELLED`로 거절됩니다. |

현재 렌더링에 실패가 남아 있으면 폴백이 보이더라도 `whenRendered()`와 렌더러의 `initialComplete`가 거절될 수 있습니다. 실패 전에 완료된 Core 변경은 적용된 상태로 유지됩니다.
