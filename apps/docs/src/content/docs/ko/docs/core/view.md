---
title: "View와 스냅샷"
description: "View는 State·Query·이벤트 수명을 가진 실행 중 화면 하나입니다. `runtime.createView()`에서 얻으며 렌더러는 이 객체의 스냅샷으로 UI를 만듭니다."
sidebar:
  order: 12
---

View는 State·Query·이벤트 수명을 가진 실행 중 화면 하나입니다. `runtime.createView()`에서 얻으며 렌더러는 이 객체의 스냅샷으로 UI를 만듭니다.

## View 관찰하기

| 메서드 | 시그니처와 동작 |
|---|---|
| `getSnapshot()` | 현재 출력의 불변 `ViewSnapshot`을 반환합니다. |
| `subscribe(listener)` | `(snapshot: ViewSnapshot) => void`를 즉시 호출하고 이후 출력 변경 때 호출합니다. 구독 해제 함수 `() => void`를 반환합니다. |
| `getState(name, instanceId?)` | `StateHandle<unknown>`을 반환합니다. instanceId 생략 시 루트 View, 지정 시 해당 Component 소유자의 로컬 State를 찾습니다. |
| `getQuery(name, instanceId?)` | 같은 소유자 선택 규칙으로 `QueryHandle<unknown>`을 반환합니다. |
| `exportDefinition()` | 분리된 `ViewSpec`을 반환합니다. 현재 State 값·실행 중 작업·함수는 포함하지 않습니다. |

선언 노드의 `id`, 런타임 `address`, 소유자의 `instanceId`, `generation`은 서로 다릅니다. 반복 노드는 같은 선언 ID를 공유할 수 있습니다. 이벤트에는 실제 스냅샷을, State/Query 조회에는 소유자 instanceId를 사용하세요. 선언 이름을 전역 실행 ID로 간주하지 마세요.

<a id="update"></a>
## updateDefinition(spec, options?)

`updateDefinition(spec: ViewSpec, options?): Promise<ViewApplication>`는 JSON 패치가 아닌 완전한 다음 정의를 적용합니다. `inputs`를 생략하면 기존 입력을 유지합니다. `states`는 정의 적용과 함께 이름별 루트 State를 원자적으로 설정합니다. 없는 State나 Derived 대상은 거절합니다.

호환되는 유지 노드는 State와 수명을 보존합니다. 노드를 제거하거나 정체성을 변경하거나 `when`을 false로 만들면 해당 수명이 끝납니다. 유지하는 셀의 State↔Derived 변경은 거절합니다. 현재 수명의 리소스 스냅샷은 유지하며, 바뀐 등록 정의를 주입하려면 replace를 사용합니다.

현재 구현에서 유지되는 Query use는 `updateDefinition`에서 생략한 `refresh`·`intervalMs` 설정도 보존합니다. 생략으로 기본값을 복원하지 마세요. `refresh`는 값을 명시하고, 새 Query 수명과 기본 설정이 필요하면 `replace`를 사용하세요. [Query 설정](../../dsl/queries/)을 참고하세요.

<a id="replace"></a>
## replace(source, options?)

`replace(source: ViewSource, options?): Promise<ViewApplication>`는 대상을 검증하고 최신 레지스트리 정의를 주입한 뒤 초기 State를 가진 새 수명을 시작합니다. 입력의 기본값은 `{}`입니다. 이전 이벤트 대상·소유 Query 작업·하위 Action은 유효하지 않게 됩니다. URL 교체는 이전 소유 키도 제거합니다. 기존 View를 교체할 때 권한 검사를 적용합니다.

두 메서드는 `ViewApplication`을 반환합니다. `view.whenSettled(application)`으로 처음 실행 가능한 Query들의 완료를 기다립니다. 완료가 Query 성공을 보장하지 않으므로 `queryErrors`를 확인하세요. 새 적용이나 폐기는 이전 완료 약속을 취소할 수 있습니다.

## emit(target, event, payload)

`Promise<unknown>`를 반환합니다. 대상은 런타임 주소/소유자 ID 문자열, `NodeSnapshot`, 또는 `{ address: string, generation: number }`입니다. 오래된 UI 이벤트를 거절할 수 있도록 스냅샷이나 generation이 포함된 주소를 권장합니다. `event`는 Component 계약의 이벤트 이름이어야 하며 `payload`는 해당 스키마와 맞아야 합니다. DOM 이벤트 객체 대신 선언한 데이터를 전달하세요. 유효하지만 핸들러가 없는 이벤트는 Action 없이 완료합니다. 오래된 대상은 `CANCELLED`, 없는 이벤트는 `REFERENCE_NOT_FOUND`, 잘못된 payload는 `TYPE_MISMATCH`입니다.

## dispose()

구독과 소유 Action·Query 작업을 정리하고 소유 State·URL 연결을 제거하며 이전 이벤트 대상을 무효화합니다. 반복 호출할 수 있습니다. 모든 View가 끝났다면 Runtime 전체를 폐기하세요.

## ViewSnapshot

| 필드 | 타입 / 내용 |
|---|---|
| `generation` | 적용한 정의의 세대 번호입니다. |
| `lifetime?` | 루트 소유자의 수명 식별값입니다. |
| `roots` | 렌더링할 읽기 전용 `NodeSnapshot[]`입니다. |
| `states` | 루트 State 이름 → `ValueSnapshot<unknown>`입니다. |
| `queries` | 루트 Query 이름 → `QuerySnapshot<unknown>`입니다. |
| `actions` | 명시한 이벤트 Action ID → `ActionSnapshot`입니다. 이름 없는 호출은 이름별 항목을 만들지 않습니다. |
| `errors` | 읽기 전용 `PublicError[]` 진단입니다. |

`NodeSnapshot`의 필수 필드는 `id`, `status`, `error`, `inputs`, `children`, `slots`이고 선택 필드는 `instanceId`, `address`, `generation`, `componentRef`입니다. status는 `ready`, `pending`, `error`, `missing`이며 error는 `PublicError | null`입니다. 입력은 깊은 읽기 전용입니다. `slots`는 슬롯 이름별 자식 스냅샷, `children`은 출력 자식 목록입니다. 입력이 일시적으로 준비되지 않아 노드가 대기해도 유지된 수명을 끝내지는 않습니다.

## QueryHandle과 QuerySnapshot

`getSnapshot()`은 `idle | waiting | running | success | error` 상태, 선택적 `data`·`dataInputs`, `error: PublicError | null`, `stale: boolean`, `waitingReason: 'INPUT_NOT_READY' | 'EXECUTION_BLOCKED' | null`을 반환합니다. 데이터는 이전에 성공한 입력 집합의 결과일 수 있으므로 표시할 때 `dataInputs`, `stale`도 확인하세요.

`refresh(signal?): Promise<void>`는 갱신을 허용한 Query를 명시적으로 재실행합니다. `retry(signal?): Promise<void>`는 재시도 가능한 실패 실행에 사용합니다. `QUERY_REFRESH_DISABLED`, `INVALID_RETRY_STATE`, 취소 오류로 거절될 수 있습니다. 메서드는 데이터가 아니라 완료를 반환하므로 다음 스냅샷에서 값을 읽으세요. 핸들은 View나 Query 포트에서 얻으며 직접 만들지 않습니다.

`ActionSnapshot<O>`는 `status: 'idle' | 'running' | 'success' | 'error'`, `running: boolean`, `data`(읽기 전용 결과 또는 `null`, void 계약이면 항상 `null`), `error: PublicError | null`을 가집니다.

[실행 가이드](../guides/runtime/), [Runtime의 완료 신호](../runtime/), [StateHandle](../state-store/#statehandle)을 함께 참고하세요.
